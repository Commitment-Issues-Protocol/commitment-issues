import { randomBytes } from 'node:crypto';

import type { AgentkitExtension, AgentkitSigner } from '@worldcoin/agentkit';
import {
  AGENTKIT,
  buildAgentkitSchema,
  createAgentkitClient,
} from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * CAIP-2 chain the agent wallet asserts itself on. AgentBook lookup always
 * resolves against World Chain regardless of which eip155 chain the header
 * claims, so this only has to be a chain `verifyAgentkitSignature` supports
 */
const AGENT_CHAIN_ID = 'eip155:480';

/**
 * Signature type used for the agent wallet; `eip191` covers a plain EOA
 * private key
 */
const AGENT_SIGNATURE_TYPE = 'eip191';

/** SIWE statement embedded in every signed agentkit header */
const AGENT_STATEMENT = 'Verify your agent is backed by a real human';

/**
 * Builds the `agentkit` header for outgoing requests
 */
type AgentkitAuth = {
  /**
   * @param resourceUri - absolute URL of the endpoint being called; must
   * match what the receiving service checks the header against
   * @returns headers to merge into the request, containing the signed
   * `agentkit` header
   */
  headers: (resourceUri: string) => Promise<Record<string, string>>;
};

/**
 * signing-service checks the `agentkit` header directly against the
 * request rather than issuing an x402 402 challenge first, so there is no
 * server-issued nonce/timestamp for the client to sign against here. Build
 * a self-issued extension instead, matching what the resource server would
 * have generated had it round-tripped one.
 * @param resourceUri - absolute URL of the endpoint being called
 * @returns extension describing the assertion to sign
 */
function buildExtension(resourceUri: string): AgentkitExtension {
  return {
    info: {
      domain: new URL(resourceUri).hostname,
      uri: resourceUri,
      version: '1',
      nonce: randomBytes(16).toString('hex'),
      issuedAt: new Date().toISOString(),
      statement: AGENT_STATEMENT,
    },
    supportedChains: [{ chainId: AGENT_CHAIN_ID, type: AGENT_SIGNATURE_TYPE }],
    schema: buildAgentkitSchema(),
  };
}

/**
 * Build an {@link AgentkitAuth} that signs requests with the given wallet,
 * proving to a resource server that this agent is backed by a human
 * registered in AgentBook
 * @param privateKey - private key of the wallet registered in AgentBook; if
 * omitted (no wallet imported/generated yet), the returned headers() sends
 * no `agentkit` header rather than signing
 * @returns an object exposing the headers to attach to outgoing requests
 */
function createAgentkitAuth(privateKey?: `0x${string}`): AgentkitAuth {
  if (!privateKey) {
    return { headers: () => Promise.resolve({}) };
  }

  const account = privateKeyToAccount(privateKey);
  const signer: AgentkitSigner = {
    address: account.address,
    chainId: AGENT_CHAIN_ID,
    type: AGENT_SIGNATURE_TYPE,
    signMessage: (message) => account.signMessage({ message }),
  };
  const agentkit = createAgentkitClient({ signer });

  return {
    headers: async (resourceUri) => ({
      [AGENTKIT]: await agentkit.createHeader(buildExtension(resourceUri)),
    }),
  };
}

export { createAgentkitAuth };
export type { AgentkitAuth };
