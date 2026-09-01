/* eslint-env node */
import { describe, it, expect } from 'vitest';
import { upsertSubscriptionRow } from '../webhook.js';

/** Minimal stand-in for the supabase-js admin client's upsert chain. */
function stubSupabase(result) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(row, options) {
          calls.push({ table, row, options });
          return Promise.resolve(result);
        },
      };
    },
  };
}

const row = {
  user_id: 'c8bb496f-452c-4a1e-9f0e-000000000000',
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: 'sub_123',
  plan: 'pro',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: '2027-01-01T00:00:00.000Z',
};

describe('upsertSubscriptionRow', () => {
  it('upserts on user_id so repeat events update one row per user', async () => {
    const supabase = stubSupabase({ data: null, error: null });
    await upsertSubscriptionRow(supabase, row);

    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0].table).toBe('subscriptions');
    expect(supabase.calls[0].options).toEqual({ onConflict: 'user_id' });
    expect(supabase.calls[0].row).toEqual(row);
  });

  // The regression this test exists for: supabase-js resolves rather than
  // rejects on a database error. An unchecked call returned normally, the
  // handler replied 200, Stripe stopped retrying, and a paid subscription
  // never granted Pro — with nothing logged anywhere.
  it('throws when the database rejects the write', async () => {
    const supabase = stubSupabase({
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the 'cancel_at_period_end' column of 'subscriptions' in the schema cache",
      },
    });

    await expect(upsertSubscriptionRow(supabase, row)).rejects.toMatchObject({ code: 'PGRST204' });
  });

  it('propagates a permission failure rather than swallowing it', async () => {
    const supabase = stubSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(upsertSubscriptionRow(supabase, row)).rejects.toMatchObject({ code: '42501' });
  });

  it('resolves quietly when the write succeeds', async () => {
    const supabase = stubSupabase({ data: [row], error: null });
    await expect(upsertSubscriptionRow(supabase, row)).resolves.toBeUndefined();
  });
});
