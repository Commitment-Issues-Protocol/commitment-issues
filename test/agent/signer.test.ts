import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { DisplayVerification } from '../../src/agent/signer.ts';
import { signerIntercept } from '../../src/agent/signer.ts';
import type { InterceptContext } from '../../src/agent/socket.ts';
import {
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  SSH_AGENT_IDENTITIES_ANSWER,
  SSH_AGENT_SIGN_RESPONSE,
  computeFingerprint,
  readString,
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

/**
 * Build a full SSH_AGENT_IDENTITIES_ANSWER message
 * @param identities - key blob/comment pairs to list
 * @returns the full wire-format message, including its length prefix
 */
function identitiesAnswer(
  identities: { keyBlob: Buffer; comment: string }[],
): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(identities.length, 0);

  const entries = identities.map(({ keyBlob, comment }) =>
    Buffer.concat([
      writeString(keyBlob),
      writeString(Buffer.from(comment, 'utf8')),
    ]),
  );

  return frame(
    Buffer.concat([
      Buffer.from([SSH_AGENT_IDENTITIES_ANSWER]),
      count,
      ...entries,
    ]),
  );
}

/**
 * Parse an SSH_AGENT_IDENTITIES_ANSWER message into its key blobs
 * @param message - full wire-format SSH_AGENT_IDENTITIES_ANSWER message
 * @returns the key blob of each listed identity, in order
 */
function parseIdentityKeyBlobs(message: Buffer): Buffer[] {
  const count = message.readUInt32BE(5);
  const keyBlobs: Buffer[] = [];
  let offset = 9;

  for (let index = 0; index < count; index += 1) {
    const keyBlob = readString(message, offset);
    const comment = readString(message, keyBlob.next);

    keyBlobs.push(keyBlob.value);
    offset = comment.next;
  }

  return keyBlobs;
}

/**
 * Create a DisplayVerification stub that records the URLs it's called with
 * @returns the stub and the array of URLs it's been called with
 */
function createRecordingDisplayVerification(): {
  displayVerification: DisplayVerification;
  urls: string[];
} {
  const urls: string[] = [];

  return {
    displayVerification: (url) => {
      urls.push(url);
      return () => {
        /* empty */
      };
    },
    urls,
  };
}

const noopDisplayVerification: DisplayVerification = () => () => {
  /* empty */
};

const targetKeyBlob = Buffer.from('the-target-key');
const targetFingerprint = computeFingerprint(targetKeyBlob);
const targetSigningKeyLine = `ssh-ed25519 ${targetKeyBlob.toString('base64')}`;
const otherKeyBlob = Buffer.from('some-other-key');

void describe('agent/signer', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  void it('passes non-identities-answer response messages through unchanged', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
    );
    const { context, responses } = createRecordingContext();
    const message = frame(Buffer.from([SSH_AGENT_SIGN_RESPONSE]));

    const result = await intercept(message, 'response', context);

    assert.deepEqual(result, message);
    assert.equal(responses.length, 0);
  });

  void it('injects the signing key into identity-listing responses', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
    );
    const { context } = createRecordingContext();
    const message = identitiesAnswer([
      { keyBlob: otherKeyBlob, comment: 'existing-key' },
    ]);

    const result = await intercept(message, 'response', context);

    assert.notEqual(result, null);
    const keyBlobs = parseIdentityKeyBlobs(result ?? Buffer.alloc(0));
    assert.equal(keyBlobs.length, 2);
    assert.deepEqual(keyBlobs, [otherKeyBlob, targetKeyBlob]);
  });

  void it('buffers an identities-answer response split across multiple chunks', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
    );
    const { context } = createRecordingContext();
    const message = identitiesAnswer([]);
    const split = Math.floor(message.length / 2);

    const first = await intercept(
      message.subarray(0, split),
      'response',
      context,
    );
    assert.equal(first, null);

    const second = await intercept(
      message.subarray(split),
      'response',
      context,
    );
    assert.notEqual(second, null);
    assert.deepEqual(parseIdentityKeyBlobs(second ?? Buffer.alloc(0)), [
      targetKeyBlob,
    ]);
  });

  void it('forwards non-sign-request messages unchanged', async () => {
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
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
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
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
      // Verification-link GET request; no body to capture
      if (init?.method !== 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ url: 'https://notarealdomain/v/1' }), {
            status: 200,
          }),
        );
      }

      capturedUrl = input;
      capturedBody = JSON.parse(init.body as string);

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

    const { displayVerification, urls } = createRecordingDisplayVerification();
    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      displayVerification,
      false,
    );
    const { context, responses } = createRecordingContext();
    const dataToSign = Buffer.from('data-to-sign');
    const message = signRequest(targetKeyBlob, dataToSign);

    const result = await intercept(message, 'request', context);

    assert.equal(result, null);
    assert.match(
      capturedUrl ?? '',
      /^https:\/\/notarealdomain\/sign\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    assert.deepEqual(capturedBody, {
      fingerprint: targetFingerprint,
      data: dataToSign.toString('base64'),
    });
    assert.deepEqual(urls, ['https://notarealdomain/v/1']);

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
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
    );
    const { context, responses } = createRecordingContext();
    const message = signRequest(targetKeyBlob, Buffer.from('data'));

    const result = await intercept(message, 'request', context);

    assert.equal(result, null);
    assert.equal(responses.length, 1);
    assert.deepEqual(responses[0], writeFailure());
  });

  void it('buffers a message split across multiple chunks', async () => {
    globalThis.fetch = ((_input: string, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST'
              ? {
                  format: 'ssh-ed25519',
                  signature: Buffer.from('sig').toString('base64'),
                }
              : { url: 'https://notarealdomain/v/1' },
          ),
          { status: 200 },
        ),
      )) as typeof fetch;

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
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
    globalThis.fetch = ((_input: string, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST'
              ? {
                  format: 'ssh-ed25519',
                  signature: Buffer.from('sig').toString('base64'),
                }
              : { url: 'https://notarealdomain/v/1' },
          ),
          { status: 200 },
        ),
      )) as typeof fetch;

    const intercept = signerIntercept(
      targetFingerprint,
      'https://notarealdomain',
      targetSigningKeyLine,
      noopDisplayVerification,
      false,
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

  void describe('standalone mode', () => {
    void it('answers identity listings with only the proxied key', async () => {
      const intercept = signerIntercept(
        targetFingerprint,
        'https://notarealdomain',
        targetSigningKeyLine,
        noopDisplayVerification,
        true,
      );
      const { context, responses } = createRecordingContext();
      const message = frame(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES]));

      const result = await intercept(message, 'request', context);

      assert.equal(result, null);
      assert.equal(responses.length, 1);
      const keyBlobs = parseIdentityKeyBlobs(responses[0] ?? Buffer.alloc(0));
      assert.deepEqual(keyBlobs, [targetKeyBlob]);
    });

    void it('fails sign requests for non-matching keys instead of forwarding them', async () => {
      const intercept = signerIntercept(
        targetFingerprint,
        'https://notarealdomain',
        targetSigningKeyLine,
        noopDisplayVerification,
        true,
      );
      const { context, responses } = createRecordingContext();
      const message = signRequest(otherKeyBlob, Buffer.from('data'));

      const result = await intercept(message, 'request', context);

      assert.equal(result, null);
      assert.equal(responses.length, 1);
      assert.deepEqual(responses[0], writeFailure());
    });

    void it('fails any other message type instead of forwarding it', async () => {
      const intercept = signerIntercept(
        targetFingerprint,
        'https://notarealdomain',
        targetSigningKeyLine,
        noopDisplayVerification,
        true,
      );
      const { context, responses } = createRecordingContext();
      const message = frame(Buffer.from([99]));

      const result = await intercept(message, 'request', context);

      assert.equal(result, null);
      assert.equal(responses.length, 1);
      assert.deepEqual(responses[0], writeFailure());
    });

    void it('still redirects a matching sign request to the HTTP API', async () => {
      globalThis.fetch = ((_input: string, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              init?.method === 'POST'
                ? {
                    format: 'ssh-ed25519',
                    signature: Buffer.from('sig').toString('base64'),
                  }
                : { url: 'https://notarealdomain/v/1' },
            ),
            { status: 200 },
          ),
        )) as typeof fetch;

      const intercept = signerIntercept(
        targetFingerprint,
        'https://notarealdomain',
        targetSigningKeyLine,
        noopDisplayVerification,
        true,
      );
      const { context, responses } = createRecordingContext();
      const message = signRequest(targetKeyBlob, Buffer.from('data'));

      const result = await intercept(message, 'request', context);

      assert.equal(result, null);
      assert.equal(responses.length, 1);
      assert.deepEqual(
        responses[0],
        writeSignResponse('ssh-ed25519', Buffer.from('sig')),
      );
    });
  });
});
