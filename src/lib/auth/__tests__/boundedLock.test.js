import { describe, expect, it, vi, afterEach } from 'vitest';
import { LOCK_ACQUIRE_TIMEOUT_MS, createBoundedNavigatorLock } from '../boundedLock';

const originalNavigator = globalThis.navigator;

function stubLocks(request) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: { request } },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

describe('createBoundedNavigatorLock', () => {
  it('runs the work under the lock when it can be acquired', async () => {
    stubLocks(async (_name, _opts, cb) => await cb());
    const lock = createBoundedNavigatorLock();
    await expect(lock('lock:auth', -1, async () => 'result')).resolves.toBe('result');
  });

  it('passes the lock name and takes it exclusively', async () => {
    const request = vi.fn(async (_name, _opts, cb) => await cb());
    stubLocks(request);
    await createBoundedNavigatorLock()('lock:sb-auth-token', -1, async () => null);

    expect(request).toHaveBeenCalledWith(
      'lock:sb-auth-token',
      expect.objectContaining({ mode: 'exclusive' }),
      expect.any(Function)
    );
  });

  // The production failure: a lock held by another tab meant the request was
  // never issued and the caller waited forever with nothing in the network log.
  it('runs the work anyway rather than hanging when the lock cannot be acquired', async () => {
    stubLocks((_name, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      })
    );

    const onTimeout = vi.fn();
    const lock = createBoundedNavigatorLock({ timeoutMs: 20, onTimeout });

    await expect(lock('lock:auth', -1, async () => 'ran unlocked')).resolves.toBe('ran unlocked');
    expect(onTimeout).toHaveBeenCalledWith('lock:auth');
  });

  it('runs directly when the Web Locks API is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    await expect(createBoundedNavigatorLock()('lock:auth', -1, async () => 'no api')).resolves.toBe('no api');
  });

  // An error thrown by the work itself must not be mistaken for a lock timeout,
  // or a real failure would be silently retried unlocked.
  it('propagates an error thrown by the work', async () => {
    stubLocks(async (_name, _opts, cb) => await cb());
    const lock = createBoundedNavigatorLock();
    await expect(lock('lock:auth', -1, async () => { throw new Error('query failed'); }))
      .rejects.toThrow('query failed');
  });

  it('does not retry the work after a genuine failure', async () => {
    const fn = vi.fn(async () => { throw new Error('boom'); });
    stubLocks(async (_name, _opts, cb) => await cb());
    await expect(createBoundedNavigatorLock()('lock:auth', -1, fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('defaults to a bound short enough to not read as a freeze', () => {
    expect(LOCK_ACQUIRE_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });
});
