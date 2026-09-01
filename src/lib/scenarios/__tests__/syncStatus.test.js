import { describe, it, expect } from 'vitest';
import { CLOUD_SYNC_REASONS, describeCloudSyncError } from '../syncStatus';

describe('describeCloudSyncError', () => {
  it('reports nothing when there is no error', () => {
    expect(describeCloudSyncError(null)).toBeNull();
    expect(describeCloudSyncError(undefined)).toBeNull();
  });

  // The production failure this whole module exists for: `scenarios` was
  // missing `summary_data`, so every write 400'd while the UI looked fine.
  it('identifies the schema drift that broke production', () => {
    const described = describeCloudSyncError({
      code: 'PGRST204',
      message: "Could not find the 'summary_data' column of 'scenarios' in the schema cache",
    });

    expect(described.reason).toBe(CLOUD_SYNC_REASONS.SCHEMA_DRIFT);
    expect(described.code).toBe('PGRST204');
  });

  it('treats the Postgres undefined-column code the same way', () => {
    expect(describeCloudSyncError({ code: '42703' }).reason).toBe(CLOUD_SYNC_REASONS.SCHEMA_DRIFT);
  });

  it('distinguishes a missing table from a missing column', () => {
    expect(describeCloudSyncError({ code: '42P01' }).reason).toBe(CLOUD_SYNC_REASONS.MISSING_TABLE);
  });

  it('flags permission failures and suggests re-authenticating', () => {
    const described = describeCloudSyncError({ code: '42501' });
    expect(described.reason).toBe(CLOUD_SYNC_REASONS.PERMISSION);
    expect(described.detail).toMatch(/sign(ing)? out/i);
  });

  it('explains the non-UUID identifier case and how to escape it', () => {
    const described = describeCloudSyncError({ code: '22P02' });
    expect(described.reason).toBe(CLOUD_SYNC_REASONS.BAD_IDENTIFIER);
    expect(described.detail).toMatch(/new scenario/i);
  });

  it('recognises a transport failure with no database code', () => {
    expect(describeCloudSyncError(new TypeError('Failed to fetch')).reason).toBe(
      CLOUD_SYNC_REASONS.OFFLINE
    );
  });

  it('falls back to a generic description for an unrecognised code', () => {
    const described = describeCloudSyncError({ code: 'XX999', message: 'internal error' });
    expect(described.reason).toBe(CLOUD_SYNC_REASONS.UNKNOWN);
    expect(described.code).toBe('XX999');
  });

  it('always states that the change did not reach the account', () => {
    const codes = ['PGRST204', '42P01', '42501', '22P02', 'XX999'];
    for (const code of codes) {
      expect(describeCloudSyncError({ code }).detail).toMatch(/not saved to your account|not appear on other devices/i);
    }
  });
});
