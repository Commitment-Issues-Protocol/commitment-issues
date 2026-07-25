import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SSH_AGENT_IDENTITIES_ANSWER,
  SSH_AGENT_SIGN_RESPONSE,
  appendIdentity,
  computeFingerprint,
  decodePublicKeyLine,
  extractMessages,
  readSignRequest,
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

void describe('agent/ssh-agent-protocol', () => {
  void describe('readString/writeString', () => {
    void it('round-trips a buffer through the wire format', () => {
      const value = Buffer.from('hello');
      const encoded = writeString(value);
      const { value: decoded, next } = readString(encoded, 0);

      assert.equal(decoded.toString(), 'hello');
      assert.equal(next, encoded.length);
    });

    void it('reads starting from a non-zero offset', () => {
      const prefix = Buffer.from([9, 9, 9]);
      const encoded = Buffer.concat([
        prefix,
        writeString(Buffer.from('world')),
      ]);

      const { value, next } = readString(encoded, prefix.length);

      assert.equal(value.toString(), 'world');
      assert.equal(next, encoded.length);
    });
  });

  void describe('extractMessages', () => {
    void it('extracts a single complete message', () => {
      const message = frame(Buffer.from([1, 2, 3]));

      const { messages, remainder } = extractMessages(message);

      assert.equal(messages.length, 1);
      assert.deepEqual(messages[0], message);
      assert.equal(remainder.length, 0);
    });

    void it('holds back a partial trailing message', () => {
      const message = frame(Buffer.from([1, 2, 3]));
      const partial = message.subarray(0, message.length - 1);

      const { messages, remainder } = extractMessages(partial);

      assert.equal(messages.length, 0);
      assert.deepEqual(remainder, partial);
    });

    void it('extracts multiple messages from one chunk', () => {
      const first = frame(Buffer.from([1]));
      const second = frame(Buffer.from([2]));

      const { messages, remainder } = extractMessages(
        Buffer.concat([first, second]),
      );

      assert.equal(messages.length, 2);
      assert.deepEqual(messages[0], first);
      assert.deepEqual(messages[1], second);
      assert.equal(remainder.length, 0);
    });

    void it('extracts complete messages and holds back a trailing partial one', () => {
      const first = frame(Buffer.from([1]));
      const second = frame(Buffer.from([2]));
      const partialSecond = second.subarray(0, second.length - 1);

      const { messages, remainder } = extractMessages(
        Buffer.concat([first, partialSecond]),
      );

      assert.equal(messages.length, 1);
      assert.deepEqual(messages[0], first);
      assert.deepEqual(remainder, partialSecond);
    });
  });

  void describe('computeFingerprint', () => {
    void it('matches a known SHA256 fingerprint', () => {
      const fingerprint = computeFingerprint(Buffer.from('test-key-blob'));

      assert.equal(
        fingerprint,
        'SHA256:iEZvLITdY6TpCwvn/eJMyikX/aM5Vi/Rp9dutn3tFtw',
      );
    });

    void it('never contains base64 padding', () => {
      const fingerprint = computeFingerprint(Buffer.from('a'));

      assert.ok(!fingerprint.includes('='));
    });
  });

  void describe('readSignRequest', () => {
    void it('parses key blob, data, and flags', () => {
      const keyBlob = Buffer.from('key-blob');
      const data = Buffer.from('data-to-sign');
      const flags = Buffer.alloc(4);
      flags.writeUInt32BE(2, 0);

      const body = Buffer.concat([
        writeString(keyBlob),
        writeString(data),
        flags,
      ]);

      const parsed = readSignRequest(body);

      assert.deepEqual(parsed.keyBlob, keyBlob);
      assert.deepEqual(parsed.data, data);
      assert.equal(parsed.flags, 2);
    });
  });

  void describe('writeSignResponse', () => {
    void it('builds a well-formed sign response message', () => {
      const message = writeSignResponse('ssh-ed25519', Buffer.from('sig'));
      const length = message.readUInt32BE(0);

      assert.equal(length, message.length - 4);
      assert.equal(message.readUInt8(4), SSH_AGENT_SIGN_RESPONSE);
    });
  });

  void describe('writeFailure', () => {
    void it('builds a well-formed failure message', () => {
      const message = writeFailure();

      assert.equal(message.length, 5);
      assert.equal(message.readUInt32BE(0), 1);
    });
  });

  void describe('decodePublicKeyLine', () => {
    void it('decodes the base64 field of an authorized_keys-style line', () => {
      const keyBlob = Buffer.from('a-key-blob');
      const line = `ssh-ed25519 ${keyBlob.toString('base64')} a comment`;

      assert.deepEqual(decodePublicKeyLine(line), keyBlob);
    });

    void it('decodes a line with no trailing comment', () => {
      const keyBlob = Buffer.from('another-key-blob');
      const line = `ssh-ed25519 ${keyBlob.toString('base64')}`;

      assert.deepEqual(decodePublicKeyLine(line), keyBlob);
    });
  });

  void describe('appendIdentity', () => {
    void it('adds an identity to a message with none listed yet', () => {
      const keyBlob = Buffer.from('new-key-blob');
      const message = identitiesAnswer([]);

      const result = appendIdentity(message, keyBlob, 'a comment');

      assert.equal(result.readUInt32BE(0), result.length - 4);
      assert.equal(result.readUInt8(4), SSH_AGENT_IDENTITIES_ANSWER);
      assert.equal(result.readUInt32BE(5), 1);

      const { value: resultKeyBlob, next } = readString(result, 9);
      const { value: comment } = readString(result, next);

      assert.deepEqual(resultKeyBlob, keyBlob);
      assert.equal(comment.toString(), 'a comment');
    });

    void it('preserves existing identities and appends the new one after them', () => {
      const existingKeyBlob = Buffer.from('existing-key-blob');
      const newKeyBlob = Buffer.from('new-key-blob');
      const message = identitiesAnswer([
        { keyBlob: existingKeyBlob, comment: 'existing comment' },
      ]);

      const result = appendIdentity(message, newKeyBlob, 'new comment');

      assert.equal(result.readUInt32BE(5), 2);

      const first = readString(result, 9);
      const firstComment = readString(result, first.next);
      const second = readString(result, firstComment.next);
      const secondComment = readString(result, second.next);

      assert.deepEqual(first.value, existingKeyBlob);
      assert.equal(firstComment.value.toString(), 'existing comment');
      assert.deepEqual(second.value, newKeyBlob);
      assert.equal(secondComment.value.toString(), 'new comment');
      assert.equal(secondComment.next, result.length);
    });
  });
});
