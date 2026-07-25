import type { InterceptContext } from './socket.ts';
import {
  SSH_AGENTC_SIGN_REQUEST,
  computeFingerprint,
  extractMessages,
  readSignRequest,
  writeFailure,
  writeSignResponse,
} from './ssh-agent-protocol.ts';

/**
 * Body returned by the signing API on success
 */
type APISignature = {
  /**
   * Signature format identifier (e.g. 'ssh-ed25519')
   */
  format: string;

  /**
   * Base64-encoded raw signature bytes
   */
  signature: string;
};

/**
 * Create signing request interceptor
 * @param fingerprint - key fingerprint to intercept
 * @param apiURL - api url for singing service
 * @returns signed, or error
 */
function signerIntercept(fingerprint: string, apiURL: string) {
  // Store bytes in buffer to concat messages arriving in multiple chunks
  let buffered: Buffer = Buffer.alloc(0);

  // Return interceptor
  return async (
    data: Buffer,
    direction: 'request' | 'response',
    context: InterceptContext,
  ): Promise<Buffer | null> => {
    // No-op for responses from upstream socket target
    if (direction === 'response') {
      return data;
    }

    // Concatonate to buffer
    buffered = Buffer.concat([buffered, data]);

    // Extract compelted messages
    const { messages, remainder } = extractMessages(buffered);

    // Write the remainder of the bytes back to the buffer
    buffered = remainder;

    // Store messages we're going to forward
    const forwarded: Buffer[] = [];

    // Loop through all the completed messages we have now
    for (const message of messages) {
      // Check if is sign request
      const isSignRequest =
        message.length > 4 && message.readUInt8(4) === SSH_AGENTC_SIGN_REQUEST;

      // Push to forwarded messages if is not and continue
      if (!isSignRequest) {
        forwarded.push(message);
        continue;
      }

      // Else, read sign request
      const { keyBlob, data: dataToSign } = readSignRequest(
        message.subarray(5),
      );

      // If sign request is not for the key fingerprint we're after, push to forward and continue
      const keyFingerprint = computeFingerprint(keyBlob);
      if (keyFingerprint !== fingerprint) {
        forwarded.push(message);
        continue;
      }

      // This is a sign request for the key we're interested in, redirect
      await remoteSign(apiURL, fingerprint, dataToSign, context);
    }

    // Return if there's messages to forward, else return null
    return forwarded.length > 0 ? Buffer.concat(forwarded) : null;
  };
}

/**
 * Request a signature from the remote signing API and respond to the client directly
 * @param apiURL - api url for signing service
 * @param fingerprint - fingerprint of the key to sign with
 * @param dataToSign - raw data the client wants signed
 * @param context - intercept context used to respond directly to the client
 */
async function remoteSign(
  apiURL: string,
  fingerprint: string,
  dataToSign: Buffer,
  context: InterceptContext,
): Promise<void> {
  const response = await fetch(`${apiURL}/sign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fingerprint,
      data: dataToSign.toString('base64'),
    }),
  });

  // Respond with failure if the API call didn't succeed
  if (!response.ok) {
    context.respond(writeFailure());
    return;
  }

  // Else return with successful singature
  const { format, signature } = (await response.json()) as APISignature;
  context.respond(writeSignResponse(format, Buffer.from(signature, 'base64')));
}

export { signerIntercept };
