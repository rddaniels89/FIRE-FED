/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import { resolveUsableCustomerId } from '../_shared.js';

const stripeWith = (retrieveImpl) => ({ customers: { retrieve: vi.fn(retrieveImpl) } });

describe('resolveUsableCustomerId', () => {
  it('keeps a customer that still resolves', async () => {
    const stripe = stripeWith(async (id) => ({ id, deleted: false }));
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: 'cus_live123' })).resolves.toBe('cus_live123');
  });

  it('returns null when nothing is stored yet', async () => {
    const stripe = stripeWith(async () => ({}));
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: null })).resolves.toBeNull();
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: '   ' })).resolves.toBeNull();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  // The production failure: the customer was deleted in the dashboard, so
  // checkout threw "No such customer" and the dead id was read straight back
  // from the database on every retry — a permanent block on purchasing.
  it('discards a customer Stripe no longer has', async () => {
    const stripe = stripeWith(async () => {
      const err = new Error("No such customer: 'cus_gone'");
      err.code = 'resource_missing';
      err.statusCode = 404;
      throw err;
    });
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: 'cus_gone' })).resolves.toBeNull();
  });

  it('discards a customer Stripe reports as deleted', async () => {
    const stripe = stripeWith(async (id) => ({ id, deleted: true }));
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: 'cus_deleted' })).resolves.toBeNull();
  });

  // Minting a new customer on a transient failure would orphan the real one
  // along with its payment methods and billing history.
  it('rethrows failures that are not a missing customer', async () => {
    const authErr = Object.assign(new Error('Invalid API Key'), {
      code: 'api_key_invalid',
      statusCode: 401,
    });
    const stripe = stripeWith(async () => {
      throw authErr;
    });

    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: 'cus_x' })).rejects.toThrow('Invalid API Key');
  });

  it('rethrows a network failure rather than treating it as missing', async () => {
    const stripe = stripeWith(async () => {
      throw new Error('socket hang up');
    });
    await expect(resolveUsableCustomerId({ stripe, storedCustomerId: 'cus_x' })).rejects.toThrow('socket hang up');
  });
});
