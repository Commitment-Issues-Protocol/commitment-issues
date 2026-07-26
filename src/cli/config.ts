import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * SHA256 fingerprint (OpenSSH display format) of the key whose sign
 * requests should be redirected to the signing API
 */
const FINGERPRINT = 'SHA256:ppbGcvQq6Y0bhGq+0Sd9BcBaGZIy3D2C5bSl1EH2OZ4';

/**
 * Base URL of the signing API; requests are POSTed to `${API_URL}/sign`
 */
const API_URL = 'https://api.commitmentissues.xyz';

/**
 * Public key line (as it would appear in an authorized_keys file) to
 * configure as git's SSH commit-signing key
 */
const SIGNING_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN+RPgXXP6WXhg/EIuhsicEyqVXpffCBqSidkVhpSSLc';

/**
 * Committer name to record on commits made through the proxy, leaving the
 * author identity untouched
 */
const COMMITTER_NAME = 'Reviewed By Human';

/**
 * Committer email to record on commits made through the proxy, leaving the
 * author identity untouched
 */
const COMMITTER_EMAIL =
  '309237263+commitment-issues-protocol-author@users.noreply.github.com';

/**
 * Path the proxy's own unix socket listens on
 */
const SOCKET_PATH = join(homedir(), '.commitment-issues', 'agent.sock');

/**
 * Path to the file holding the private key of the EVM wallet registered in
 * AgentBook. Unlike the values above, this is a secret specific to whoever
 * is running the proxy rather than shared protocol config, so it's read
 * from a file on disk instead of hardcoded
 */
const WALLET_KEY_PATH = join(homedir(), '.commitment-issues', 'wallet.key');

/**
 * Read the EVM wallet private key used to prove sign requests come from a
 * human-backed agent, if one has been imported or generated yet
 * @returns the private key, ready to build an AgentkitAuth from, or
 * undefined if {@link WALLET_KEY_PATH} doesn't hold one yet
 */
function getAgentWalletPrivateKey(): `0x${string}` | undefined {
  let key: string;

  try {
    key = readFileSync(WALLET_KEY_PATH, 'utf8').trim();
  } catch {
    return undefined;
  }

  return key ? (key as `0x${string}`) : undefined;
}

/**
 * Save the EVM wallet private key to {@link WALLET_KEY_PATH}, creating the
 * parent directory if needed and restricting the file to the current user
 * @param privateKey - private key to save
 */
function writeAgentWalletPrivateKey(privateKey: `0x${string}`): void {
  mkdirSync(dirname(WALLET_KEY_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(WALLET_KEY_PATH, `${privateKey}\n`, { mode: 0o600 });
}

export {
  API_URL,
  COMMITTER_EMAIL,
  COMMITTER_NAME,
  FINGERPRINT,
  getAgentWalletPrivateKey,
  SIGNING_KEY,
  SOCKET_PATH,
  WALLET_KEY_PATH,
  writeAgentWalletPrivateKey,
};
