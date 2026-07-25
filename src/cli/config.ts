import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * SHA256 fingerprint (OpenSSH display format) of the key whose sign
 * requests should be redirected to the signing API
 */
const FINGERPRINT = 'SHA256:REPLACE_ME';

/**
 * Base URL of the signing API; requests are POSTed to `${API_URL}/sign`
 */
const API_URL = 'https://notarealdomain';

/**
 * Public key line (as it would appear in an authorized_keys file) to
 * configure as git's SSH commit-signing key
 */
const SIGNING_KEY = 'ssh-ed25519 REPLACE_ME';

/**
 * Committer name to record on commits made through the proxy, leaving the
 * author identity untouched
 */
const COMMITTER_NAME = 'Reviewed By Human';

/**
 * Path the proxy's own unix socket listens on
 */
const SOCKET_PATH = join(homedir(), '.ssh-agent-proxy', 'agent.sock');

export { API_URL, COMMITTER_NAME, FINGERPRINT, SIGNING_KEY, SOCKET_PATH };
