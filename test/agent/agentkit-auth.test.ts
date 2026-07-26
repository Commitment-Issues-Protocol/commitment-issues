import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';

import { createAgentkitAuth } from '../../src/agent/agentkit-auth.ts';

const privateKey = `0x${'42'.repeat(32)}` as const;

void describe('agent/agentkit-auth', () => {
  void it('produces an agentkit header a resource server can verify back to the wallet address', async () => {
    const resourceUri = 'https://notarealdomain/sign/some-request-id';
    const auth = createAgentkitAuth(privateKey);

    const headers = await auth.headers(resourceUri);
    const header = headers['agentkit'];
    assert.ok(header, 'expected an agentkit header to be produced');

    const payload = parseAgentkitHeader(header);
    const validation = await validateAgentkitMessage(payload, resourceUri);
    assert.equal(
      validation.valid,
      true,
      validation.error ?? 'validation failed',
    );

    const verification = await verifyAgentkitSignature(payload);
    assert.equal(
      verification.valid,
      true,
      verification.error ?? 'verification failed',
    );
    assert.equal(
      verification.address?.toLowerCase(),
      privateKeyToAccount(privateKey).address.toLowerCase(),
    );
  });

  void it('rejects when checked against a different resource URI', async () => {
    const auth = createAgentkitAuth(privateKey);
    const headers = await auth.headers(
      'https://notarealdomain/sign/some-request-id',
    );
    const header = headers['agentkit'];
    assert.ok(header);

    const payload = parseAgentkitHeader(header);
    const validation = await validateAgentkitMessage(
      payload,
      'https://someotherdomain/sign/some-request-id',
    );

    assert.equal(validation.valid, false);
  });
});
