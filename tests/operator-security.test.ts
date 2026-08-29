import { describe, expect, it } from 'vitest';
import { createOperatorToken, validateOperatorMutation } from '../src/operator-security.js';

describe('operator mutation protection', () => {
  const expectedOrigin = 'http://127.0.0.1:9300';

  it('accepts a same-origin JSON request with the ephemeral operator token', () => {
    const token = createOperatorToken();
    expect(
      validateOperatorMutation(
        {
          contentType: 'application/json; charset=utf-8',
          origin: expectedOrigin,
          expectedOrigin,
          operatorToken: token
        },
        token
      )
    ).toBeNull();
  });

  it('rejects cross-origin, tokenless, and non-JSON mutations', () => {
    const token = createOperatorToken();
    expect(
      validateOperatorMutation(
        { contentType: 'application/json', origin: 'https://attacker.example', expectedOrigin, operatorToken: token },
        token
      )
    ).toMatchObject({ status: 403 });
    expect(
      validateOperatorMutation({ contentType: 'application/json', expectedOrigin }, token)
    ).toMatchObject({ status: 403 });
    expect(
      validateOperatorMutation({ contentType: 'text/plain', expectedOrigin, operatorToken: token }, token)
    ).toMatchObject({ status: 415 });
  });
});
