/* eslint-env node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendError } from '../../stripe/_shared.js';

afterEach(() => vi.unstubAllEnvs());

const fakeRes = () => {
  const res = { headers: {}, statusCode: 0, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s; };
  return res;
};

describe('reportServerError', () => {
  it('is a no-op without a DSN and never throws', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    const { reportServerError } = await import('../observability.js');
    await expect(reportServerError(new Error('x'))).resolves.toBe(false);
    await expect(reportServerError('not even an error')).resolves.toBe(false);
  });
});

describe('sendError', () => {
  it('sends the response before reporting, and only reports 5xx', async () => {
    const order = [];
    const report = vi.fn(async () => { order.push('report'); });

    const res = fakeRes();
    const origEnd = res.end;
    res.end = (s) => { order.push('end'); origEnd(s); };

    const boom = new Error('db exploded');
    await sendError(res, boom, { report });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal error' });
    expect(order).toEqual(['end', 'report']);
    expect(report).toHaveBeenCalledWith(boom, { tags: { status: 500 } });
  });

  it('does not report client errors', async () => {
    const report = vi.fn();
    const res = fakeRes();
    const err = Object.assign(new Error('Missing Authorization header'), { statusCode: 401 });
    await sendError(res, err, { report });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Missing Authorization header' });
    expect(report).not.toHaveBeenCalled();
  });
});
