import { randomUUID } from 'node:crypto';

import type { InterceptContext } from './socket.ts';
import {
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  SSH_AGENT_IDENTITIES_ANSWER,
  appendIdentity,
  computeFingerprint,
  decodePublicKeyLine,
  extractMessages,
  readSignRequest,
  writeFailure,
  writeIdentitiesAnswer,
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
 * Body returned by the verification-link endpoint
 */
type VerificationLink = {
  /**
   * URL for a human to open to verify and approve the pending sign request
   */
  url: string;
};

/**
 * Show a verification URL to the human approving a pending sign request
 * @param url - verification URL to display
 * @returns resolves once shown, with a callback to dismiss it once the
 * request has resolved
 */
type DisplayVerification = (url: string) => Promise<() => void> | (() => void);

/**
 * Create signing request interceptor
 * @param fingerprint - key fingerprint to intercept
 * @param apiURL - api url for singing service
 * @param signingKey - public key line (authorized_keys format) to advertise
 * as an available identity, since the upstream agent never actually holds it
 * @param displayVerification - shows the verification URL to the human approving the request
 * @param standalone - true when there's no upstream agent to fall back to;
 * identity listings and non-matching sign requests are answered directly
 * instead of being forwarded (every other message type just fails)
 * @returns signed, or error
 */
function signerIntercept(
  fingerprint: string,
  apiURL: string,
  signingKey: string,
  displayVerification: DisplayVerification,
  standalone: boolean,
) {
  // Store bytes in buffer to concat messages arriving in multiple chunks (per direction)
  let requestBuffered: Buffer = Buffer.alloc(0);
  let responseBuffered: Buffer = Buffer.alloc(0);

  // Decode once so it can be added to every identity listing
  const signingKeyBlob = decodePublicKeyLine(signingKey);

  // Return interceptor
  return async (
    data: Buffer,
    direction: 'request' | 'response',
    context: InterceptContext,
  ): Promise<Buffer | null> => {
    // Inject our identity into identity-listing responses coming back from upstream
    if (direction === 'response') {
      responseBuffered = Buffer.concat([responseBuffered, data]);

      const { messages, remainder } = extractMessages(responseBuffered);
      responseBuffered = remainder;

      const forwarded: Buffer[] = messages.map((message) => {
        const isIdentitiesAnswer =
          message.length > 4 &&
          message.readUInt8(4) === SSH_AGENT_IDENTITIES_ANSWER;

        return isIdentitiesAnswer
          ? appendIdentity(message, signingKeyBlob, fingerprint)
          : message;
      });

      return forwarded.length > 0 ? Buffer.concat(forwarded) : null;
    }

    // Concatonate to buffer
    requestBuffered = Buffer.concat([requestBuffered, data]);

    // Extract compelted messages
    const { messages, remainder } = extractMessages(requestBuffered);

    // Write the remainder of the bytes back to the buffer
    requestBuffered = remainder;

    // Store messages we're going to forward
    const forwarded: Buffer[] = [];

    // Loop through all the completed messages we have now
    for (const message of messages) {
      const type = message.length > 4 ? message.readUInt8(4) : undefined;

      // Sign requests: handle ourselves if it's for our key, otherwise
      // forward when we have an upstream, or fail when we don't
      if (type === SSH_AGENTC_SIGN_REQUEST) {
        const { keyBlob, data: dataToSign } = readSignRequest(
          message.subarray(5),
        );
        const keyFingerprint = computeFingerprint(keyBlob);

        if (keyFingerprint === fingerprint) {
          await remoteSign(
            apiURL,
            fingerprint,
            dataToSign,
            context,
            displayVerification,
          );
        } else if (standalone) {
          context.respond(writeFailure());
        } else {
          forwarded.push(message);
        }

        continue;
      }

      // Identity listing with no upstream: answer with just our own key
      if (type === SSH_AGENTC_REQUEST_IDENTITIES && standalone) {
        context.respond(
          writeIdentitiesAnswer([
            { keyBlob: signingKeyBlob, comment: fingerprint },
          ]),
        );
        continue;
      }

      // Anything else: forward when we have an upstream, or fail when we don't
      if (standalone) {
        context.respond(writeFailure());
        continue;
      }

      forwarded.push(message);
    }

    // Return if there's messages to forward, else return null
    return forwarded.length > 0 ? Buffer.concat(forwarded) : null;
  };
}

/**
 * Hacky way around the race condition verify arrived before sign, retry with backoff
 * TODO: Split sign into 2 parts to properly fix this
 * @param apiURL - api url for signing service
 * @param requestId - ID correlating this call with its /sign request
 * @returns the verification-link response, possibly unsuccessful if every
 * retry was exhausted
 */
async function fetchVerification(
  apiURL: string,
  requestId: string,
): Promise<Response> {
  const VERIFY_RETRY_ATTEMPTS = 5;
  const VERIFY_RETRY_DELAY_MS = 50;

  let response = await fetch(`${apiURL}/verify/${requestId}`);

  for (
    let attempt = 0;
    !response.ok && attempt < VERIFY_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    console.warn(
      `[verify] ${requestId}: attempt ${(attempt + 1).toString()} got ${response.status.toString()}, retrying in ${VERIFY_RETRY_DELAY_MS.toString()}ms`,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, VERIFY_RETRY_DELAY_MS);
    });
    response = await fetch(`${apiURL}/verify/${requestId}`);
  }

  if (!response.ok) {
    console.warn(
      `[verify] ${requestId}: giving up after ${response.status.toString()}`,
    );
  } else {
    console.log(`[verify] ${requestId}: verification link retrieved`);
  }

  return response;
}

/**
 * Request a signature from the remote signing API and respond to the client directly
 * @param apiURL - api url for signing service
 * @param fingerprint - fingerprint of the key to sign with
 * @param dataToSign - raw data the client wants signed
 * @param context - intercept context used to respond directly to the client
 * @param displayVerification - shows the verification URL to the human approving the request
 */
async function remoteSign(
  apiURL: string,
  fingerprint: string,
  dataToSign: Buffer,
  context: InterceptContext,
  displayVerification: DisplayVerification,
): Promise<void> {
  // Make sign request
  const requestId = randomUUID();
  console.log(`[sign] ${requestId}: sending request to ${apiURL}`);
  const request = fetch(`${apiURL}/sign/${requestId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fingerprint,
      data: dataToSign.toString('base64'),
    }),
    signal: AbortSignal.timeout(60_000_000), // wait really long
  });

  // Explicitly add a catch here so that fetch's error throw doesn't break our session
  void request.catch(() => {
    /* empty */
  });

  // Show a verification link/QR code while the sign request is pending
  const verification = await fetchVerification(apiURL, requestId);

  if (!verification.ok) {
    console.warn(
      `[sign] ${requestId}: failing, could not retrieve verification link (${verification.status.toString()})`,
    );
    context.respond(writeFailure());
    return;
  }

  const { url } = (await verification.json()) as VerificationLink;
  console.log(`[sign] ${requestId}: awaiting approval at ${url}`);
  const dismiss = await displayVerification(url);

  // Wait for response, making sure we clear the verification link/QR code
  // even if the sign request itself errors out
  let response: Response;

  try {
    response = await request;
  } catch (error: unknown) {
    console.warn(`[sign] ${requestId}: request errored`, error);
    dismiss();
    context.respond(writeFailure());
    return;
  }

  // Dismiss the verification link/QR code now that we have a result
  dismiss();

  // Respond with failure if the API call didn't succeed
  if (!response.ok) {
    console.warn(
      `[sign] ${requestId}: rejected or expired (${response.status.toString()})`,
    );
    context.respond(writeFailure());
    return;
  }

  // Else return with successful singature
  console.log(`[sign] ${requestId}: approved`);
  const { format, signature } = (await response.json()) as APISignature;
  context.respond(writeSignResponse(format, Buffer.from(signature, 'base64')));
}

export { signerIntercept };
export type { DisplayVerification };
