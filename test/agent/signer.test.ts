import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { signerIntercept } from '../../src/agent/signer.ts';
import type { InterceptContext } from '../../src/agent/socket.ts';
import {
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  computeFingerprint,
  writeFailure,
  writeSignResponse,
  writeString,
} from '../../src/agent/ssh-agent-protocol.ts';

/**
 * Build a length-prefixed SSH agent message from a raw body
 * @param body - message body, including the leading type byte
 * @returns the full wire-format message, including its length prefix
 */
function frame(body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);

  return Buffer.concat([length, body]);
}

/**
 * Build a full SSH_AGENTC_SIGN_REQUEST message
 * @param keyBlob - raw wire-format public key blob
 * @param data - data to sign
 * @returns the full wire-format message, including its length prefix
 */
function signRequest(keyBlob: Buffer, data: Buffer): Buffer {
  const flags = Buffer.alloc(4);

  return frame(
    Buffer.concat([
      Buffer.from([SSH_AGENTC_SIGN_REQUEST]),
      writeString(keyBlob),
      writeString(data),
      flags,
    ]),
  );
}

/**
 * Create an InterceptContext that records calls to respond()
 * @returns the context and the array its respond() calls are recorded into
 */
function createRecordingContext(): {
  context: InterceptContext;
  responses: Buffer[];
} {
  const responses: Buffer[] = [];

  return {
    context: {
      respond: (data) => {
        responses.push(data);
      },
    },
    responses,
  };
}

const targetKeyBlob = Buffer.from('the-target-key');
const targetFingerprint = computeFingerprint(targetKeyBlob);
const otherKeyBlob = Buffer.from('some-other-key');

void describe('agent/signer', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  void it('passes response-direction data through unchanged', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const data = Buffer.from('anything');

    const result = await intercept(data, 'response', context);

    assert.deepEqual(result, data);
    assert.equal(responses.length, 0);
  });

  void it('forwards non-sign-request messages unchanged', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const message = frame(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES]));

    const result = await intercept(message, 'request', context);

    assert.deepEqual(result, message);
    assert.equal(responses.length, 0);
  });

  void it('forwards sign requests for non-matching keys unchanged', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const message = signRequest(otherKeyBlob, Buffer.from('data'));

    const result = await intercept(message, 'request', context);

    assert.deepEqual(result, message);
    assert.equal(responses.length, 0);
  });

  void it('redirects a matching sign request to the HTTP API', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: unknown;

    globalThis.fetch = ((input: string, init?: RequestInit) => {
      capturedUrl = input;
      capturedBody = JSON.parse(init?.body as string);

      return Promise.resolve(
        new Response(
          JSON.stringify({
            format: 'ssh-ed25519',
            signature: Buffer.from('sig').toString('base64'),
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const dataToSign = Buffer.from('data-to-sign');
    const message = signRequest(targetKeyBlob, dataToSign);

    const result = await intercept(message, 'request', context);

    assert.equal(result, null);
    assert.equal(capturedUrl, 'https://notarealdomain/sign');
    assert.deepEqual(capturedBody, {
      fingerprint: targetFingerprint,
      data: dataToSign.toString('base64'),
    });

    assert.equal(responses.length, 1);
    assert.deepEqual(
      responses[0],
      writeSignResponse('ssh-ed25519', Buffer.from('sig')),
    );
  });

  void it('responds with a failure message when the API call fails', async () => {
    globalThis.fetch = () => Promise.resolve(new Response('', { status: 500 }));

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const message = signRequest(targetKeyBlob, Buffer.from('data'));

    const result = await intercept(message, 'request', context);

    assert.equal(result, null);
    assert.equal(responses.length, 1);
    assert.deepEqual(responses[0], writeFailure());
  });

  void it('buffers a message split across multiple chunks', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            format: 'ssh-ed25519',
            signature: Buffer.from('sig').toString('base64'),
          }),
          { status: 200 },
        ),
      );

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const message = signRequest(targetKeyBlob, Buffer.from('data-to-sign'));
    const split = Math.floor(message.length / 2);

    const first = await intercept(
      message.subarray(0, split),
      'request',
      context,
    );
    assert.equal(first, null);
    assert.equal(responses.length, 0);

    const second = await intercept(message.subarray(split), 'request', context);
    assert.equal(second, null);
    assert.equal(responses.length, 1);
  });

  void it('redirects a matching request while forwarding a non-matching one in the same chunk', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            format: 'ssh-ed25519',
            signature: Buffer.from('sig').toString('base64'),
          }),
          { status: 200 },
        ),
      );

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
    );
    const { context, responses } = createRecordingContext();
    const matching = signRequest(targetKeyBlob, Buffer.from('data'));
    const other = signRequest(otherKeyBlob, Buffer.from('other-data'));

    const result = await intercept(
      Buffer.concat([matching, other]),
      'request',
      context,
    );

    assert.deepEqual(result, other);
    assert.equal(responses.length, 1);
  });
});
