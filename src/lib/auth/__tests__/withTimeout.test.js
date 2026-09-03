import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUTH_TIMEOUT_MS, resolveWithTimeout } from '../withTimeout';

const defer = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('resolveWithTimeout', () => {
  it('passes a resolved value straight through', async () => {
    const res = await resolveWithTimeout(Promise.resolve({ session: 'abc' }), { timeoutMs: 50 });
    expect(res).toEqual({ timedOut: false, value: { session: 'abc' } });
  });

  // The production failure: supabase-js holds a Web Lock and getSession()
  // neither resolves nor rejects, so the app's loading state never clears.
  it('resolves with the fallback when the promise never settles', async () => {
    const never = new Promise(() => {});
    const res = await resolveWithTimeout(never, { timeoutMs: 10, fallback: { data: { session: null } } });

    expect(res.timedOut).toBe(true);
    expect(res.value).toEqual({ data: { session: null } });
  });

  it('reports a timeout distinctly from a genuinely absent session', async () => {
    const absent = await resolveWithTimeout(Promise.resolve(null), { timeoutMs: 10 });
    const hung = await resolveWithTimeout(new Promise(() => {}), { timeoutMs: 10 });

    expect(absent.timedOut).toBe(false);
    expect(hung.timedOut).toBe(true);
    // Both carry a null value; only the flag separates them.
    expect(absent.value).toBeNull();
    expect(hung.value).toBeNull();
  });

  it('calls onTimeout exactly once, so a hang is observable', async () => {
    const onTimeout = vi.fn();
    await resolveWithTimeout(new Promise(() => {}), { timeoutMs: 10, onTimeout });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout when the promise settles in time', async () => {
    const onTimeout = vi.fn();
    await resolveWithTimeout(Promise.resolve('ok'), { timeoutMs: 50, onTimeout });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  // A rejection is a real error the caller should handle, not a hang.
  it('still rejects when the promise rejects', async () => {
    const boom = new Error('network down');
    await expect(resolveWithTimeout(Promise.reject(boom), { timeoutMs: 50 })).rejects.toThrow('network down');
  });

  it('clears its timer so a slow-but-successful call leaves nothing pending', async () => {
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    const { promise, resolve } = defer();
    const race = resolveWithTimeout(promise, { timeoutMs: 1000 });
    resolve('done');
    await race;
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('defaults to a bound short enough to not read as broken', () => {
    expect(DEFAULT_AUTH_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });
});
