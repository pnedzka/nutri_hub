import { describe, expect, it } from 'vitest';
import { serverAuthProblem } from './auth';

describe('serverAuthProblem', () => {
  it('blames the hub key when the gateway rejects it', () => {
    expect(serverAuthProblem({ status: 401, message: 'Invalid API key' })).toBe('key');
    expect(serverAuthProblem({ status: 401, code: 'UNAUTHORIZED_INVALID_API_KEY' })).toBe('key');
  });

  it('reports Auth not answering', () => {
    expect(serverAuthProblem({ status: 0, message: 'fetch failed' })).toBe('unavailable');
    expect(serverAuthProblem({ message: 'fetch failed' })).toBe('unavailable');
    expect(serverAuthProblem({ status: 503 })).toBe('unavailable');
  });

  it('leaves an expired or revoked session to the person', () => {
    expect(serverAuthProblem({ status: 403, code: 'bad_jwt' })).toBeNull();
    expect(serverAuthProblem({ status: 403, code: 'session_not_found' })).toBeNull();
    expect(serverAuthProblem({ status: 404, code: 'user_not_found' })).toBeNull();
    expect(serverAuthProblem({ status: 401, message: 'JWT expired' })).toBeNull();
  });
});
