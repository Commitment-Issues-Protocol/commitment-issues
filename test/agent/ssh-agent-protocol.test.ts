import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SSH_AGENT_SIGN_RESPONSE,
  computeFingerprint,
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
});
