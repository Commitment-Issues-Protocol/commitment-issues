import { SOCKET_PATH } from './config.ts';

/**
 * Print a shell export statement pointing SSH_AUTH_SOCK at the proxy
 * socket, meant to be eval'd in the current login session (e.g.
 * `eval "$(ssh-agent-proxy env)"`)
 */
function printEnv(): void {
  process.stdout.write(`export SSH_AUTH_SOCK=${SOCKET_PATH}\n`);
}

export { printEnv };
