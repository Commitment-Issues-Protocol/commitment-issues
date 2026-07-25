import { createHash } from 'node:crypto';

/**
 * SSH agent protocol message type numbers (see OpenSSH's PROTOCOL.agent)
 */
const SSH_AGENT_FAILURE = 5;
const SSH_AGENTC_REQUEST_IDENTITIES = 11;
const SSH_AGENT_IDENTITIES_ANSWER = 12;
const SSH_AGENTC_SIGN_REQUEST = 13;
const SSH_AGENT_SIGN_RESPONSE = 14;

/**
 * Result of reading a length-prefixed field from a buffer
 */
type ReadResult = {
  /**
   * Raw bytes read
   */
  value: Buffer;

  /**
   * Offset immediately following the field that was read
   */
  next: number;
};

/**
 * Read a length-prefixed SSH wire format string starting at offset
 * @param buffer - buffer to read from
 * @param offset - offset to start reading at
 * @returns the string's raw bytes and the offset immediately after it
 */
function readString(buffer: Buffer, offset: number): ReadResult {
  const length = buffer.readUInt32BE(offset);
  const start = offset + 4;
  const end = start + length;

  return { value: buffer.subarray(start, end), next: end };
}

/**
 * Encode a buffer as a length-prefixed SSH wire format string
 * @param value - raw bytes to encode
 * @returns the length-prefixed encoding
 */
function writeString(value: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(value.length, 0);

  return Buffer.concat([length, value]);
}

/**
 * Split accumulated stream data into complete length-prefixed SSH agent
 * protocol messages, holding back any trailing partial message
 * @param buffer - accumulated stream data
 * @returns complete messages (including their length prefix) and any leftover partial bytes
 */
function extractMessages(buffer: Buffer): {
  messages: Buffer[];
  remainder: Buffer;
} {
  const messages: Buffer[] = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 4 + length;

    if (end > buffer.length) {
      break;
    }

    messages.push(buffer.subarray(offset, end));
    offset = end;
  }

  return { messages, remainder: buffer.subarray(offset) };
}

/**
 * Compute the SHA256 fingerprint of an SSH public key blob, in OpenSSH's
 * "SHA256:...." display format
 * @param keyBlob - raw wire-format public key blob
 * @returns the fingerprint string
 */
function computeFingerprint(keyBlob: Buffer): string {
  const digest = createHash('sha256').update(keyBlob).digest('base64');

  return `SHA256:${digest.replace(/=+$/u, '')}`;
}

/**
 * Parsed fields of an SSH_AGENTC_SIGN_REQUEST message body (message type
 * byte already stripped)
 */
type SignRequest = {
  /**
   * Raw wire-format public key blob the client wants a signature from
   */
  keyBlob: Buffer;

  /**
   * Raw data the client wants signed
   */
  data: Buffer;

  /**
   * Client-supplied signature flags
   */
  flags: number;
};

/**
 * Parse an SSH_AGENTC_SIGN_REQUEST message body
 * @param body - message body, with the leading message type byte already stripped
 * @returns the parsed key blob, data to sign, and flags
 */
function readSignRequest(body: Buffer): SignRequest {
  const keyBlob = readString(body, 0);
  const data = readString(body, keyBlob.next);
  const flags = body.readUInt32BE(data.next);

  return { keyBlob: keyBlob.value, data: data.value, flags };
}

/**
 * Build an SSH_AGENT_SIGN_RESPONSE message for the given signature
 * @param format - signature format identifier (e.g. 'rsa-sha2-512', 'ssh-ed25519')
 * @param signature - raw signature bytes
 * @returns the full wire-format response message, including its length prefix
 */
function writeSignResponse(format: string, signature: Buffer): Buffer {
  const signatureBlob = Buffer.concat([
    writeString(Buffer.from(format, 'utf8')),
    writeString(signature),
  ]);
  const body = Buffer.concat([
    Buffer.from([SSH_AGENT_SIGN_RESPONSE]),
    writeString(signatureBlob),
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);

  return Buffer.concat([length, body]);
}

/**
 * Build an SSH_AGENT_FAILURE message
 * @returns the full wire-format failure message, including its length prefix
 */
function writeFailure(): Buffer {
  return Buffer.from([0, 0, 0, 1, SSH_AGENT_FAILURE]);
}

/**
 * Decode the base64 key-material field of an authorized_keys-style public
 * key line (e.g. "ssh-ed25519 AAAA... comment")
 * @param line - public key line
 * @returns the raw wire-format key blob
 */
function decodePublicKeyLine(line: string): Buffer {
  const [, base64] = line.trim().split(/\s+/u);

  return Buffer.from(base64 ?? '', 'base64');
}

/**
 * Append an identity to an SSH_AGENT_IDENTITIES_ANSWER message
 * @param message - full wire-format SSH_AGENT_IDENTITIES_ANSWER message
 * @param keyBlob - raw wire-format public key blob to add
 * @param comment - comment to associate with the added identity
 * @returns a new full wire-format message with the identity appended
 */
function appendIdentity(
  message: Buffer,
  keyBlob: Buffer,
  comment: string,
): Buffer {
  const body = message.subarray(4);
  const count = body.readUInt32BE(1);
  const identities = body.subarray(5);

  const newCount = Buffer.alloc(4);
  newCount.writeUInt32BE(count + 1, 0);

  const addition = Buffer.concat([
    writeString(keyBlob),
    writeString(Buffer.from(comment, 'utf8')),
  ]);

  const newBody = Buffer.concat([
    Buffer.from([SSH_AGENT_IDENTITIES_ANSWER]),
    newCount,
    identities,
    addition,
  ]);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(newBody.length, 0);

  return Buffer.concat([length, newBody]);
}

/**
 * A single identity as listed in an SSH_AGENT_IDENTITIES_ANSWER message
 */
type Identity = {
  /**
   * Raw wire-format public key blob
   */
  keyBlob: Buffer;

  /**
   * Comment associated with the identity
   */
  comment: string;
};

/**
 * Build an SSH_AGENT_IDENTITIES_ANSWER message listing the given identities
 * @param identities - key blob/comment pairs to list
 * @returns the full wire-format message, including its length prefix
 */
function writeIdentitiesAnswer(identities: Identity[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(identities.length, 0);

  const entries = identities.map(({ keyBlob, comment }) =>
    Buffer.concat([
      writeString(keyBlob),
      writeString(Buffer.from(comment, 'utf8')),
    ]),
  );

  const body = Buffer.concat([
    Buffer.from([SSH_AGENT_IDENTITIES_ANSWER]),
    count,
    ...entries,
  ]);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);

  return Buffer.concat([length, body]);
}

export {
  SSH_AGENT_FAILURE,
  SSH_AGENT_IDENTITIES_ANSWER,
  SSH_AGENT_SIGN_RESPONSE,
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  appendIdentity,
  computeFingerprint,
  decodePublicKeyLine,
  extractMessages,
  readSignRequest,
  readString,
  writeFailure,
  writeIdentitiesAnswer,
  writeSignResponse,
  writeString,
};
export type { Identity, SignRequest };
