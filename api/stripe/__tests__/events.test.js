import { describe, it, expect } from 'vitest';
import { claimEvent, getInvoiceSubscriptionId, getSubscriptionPeriodEnd, releaseEvent } from '../_events.js';

describe('getSubscriptionPeriodEnd', () => {
  it('reads current_period_end from subscription items (2025-08-27.basil)', () => {
    const sub = { items: { data: [{ current_period_end: 1893456000 }] } };
    expect(getSubscriptionPeriodEnd(sub)).toBe(1893456000);
  });

  it('takes the latest period end when a subscription has several items', () => {
    const sub = {
      items: { data: [{ current_period_end: 1800000000 }, { current_period_end: 1893456000 }] },
    };
    expect(getSubscriptionPeriodEnd(sub)).toBe(1893456000);
  });

  it('falls back to the legacy top-level field', () => {
    expect(getSubscriptionPeriodEnd({ current_period_end: 1893456000 })).toBe(1893456000);
  });

  it('returns null when no period end is present', () => {
    expect(getSubscriptionPeriodEnd({ items: { data: [] } })).toBeNull();
    expect(getSubscriptionPeriodEnd(undefined)).toBeNull();
  });
});

describe('getInvoiceSubscriptionId', () => {
  it('reads the id from invoice.parent.subscription_details', () => {
    const invoice = { parent: { subscription_details: { subscription: 'sub_123' } } };
    expect(getInvoiceSubscriptionId(invoice)).toBe('sub_123');
  });

  it('unwraps an expanded subscription object', () => {
    const invoice = { parent: { subscription_details: { subscription: { id: 'sub_123' } } } };
    expect(getInvoiceSubscriptionId(invoice)).toBe('sub_123');
  });

  it('falls back to the legacy invoice.subscription field', () => {
    expect(getInvoiceSubscriptionId({ subscription: 'sub_123' })).toBe('sub_123');
  });

  it('returns null for one-off invoices with no subscription', () => {
    expect(getInvoiceSubscriptionId({ parent: { subscription_details: null } })).toBeNull();
    expect(getInvoiceSubscriptionId({})).toBeNull();
  });
});

function fakeSupabase({ insertError = null } = {}) {
  const calls = { inserted: [], deleted: [] };
  return {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.inserted.push({ table, row });
          return Promise.resolve({ error: insertError });
        },
        delete() {
          return {
            eq(column, value) {
              calls.deleted.push({ table, column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

describe('claimEvent', () => {
  const event = { id: 'evt_1', type: 'invoice.paid' };

  it('claims an event the first time it is seen', async () => {
    const supabase = fakeSupabase();
    await expect(claimEvent(supabase, event)).resolves.toEqual({ alreadyProcessed: false });
    expect(supabase.calls.inserted).toEqual([
      { table: 'stripe_events', row: { id: 'evt_1', type: 'invoice.paid' } },
    ]);
  });

  it('reports a replay when the id is already recorded', async () => {
    const supabase = fakeSupabase({ insertError: { code: '23505' } });
    await expect(claimEvent(supabase, event)).resolves.toEqual({ alreadyProcessed: true });
  });

  it('rethrows unexpected database errors instead of dropping the event', async () => {
    const supabase = fakeSupabase({ insertError: { code: '08006', message: 'connection failure' } });
    await expect(claimEvent(supabase, event)).rejects.toMatchObject({ code: '08006' });
  });
});

describe('releaseEvent', () => {
  it('deletes the claim so Stripe retries are processed', async () => {
    const supabase = fakeSupabase();
    await releaseEvent(supabase, { id: 'evt_1' });
    expect(supabase.calls.deleted).toEqual([
      { table: 'stripe_events', column: 'id', value: 'evt_1' },
    ]);
  });

  it('never throws, so it cannot mask the original handler error', async () => {
    const exploding = {
      from() {
        throw new Error('db down');
      },
    };
    await expect(releaseEvent(exploding, { id: 'evt_1' })).resolves.toBeUndefined();
  });
});
