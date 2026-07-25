import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { signerIntercept } from '../agent/signer.ts';
import { SocketProxy } from '../agent/socket.ts';

import { API_URL, FINGERPRINT, SOCKET_PATH } from './config.ts';

/**
 * Create the ssh-agent proxy socket and run it in the foreground until the
 * process is signalled to stop
 */
function start(): void {
  const upstreamPath = process.env['SSH_AUTH_SOCK'];

  if (!upstreamPath) {
    process.stderr.write(
      'SSH_AUTH_SOCK is not set; no upstream ssh-agent to proxy\n',
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(SOCKET_PATH), { recursive: true });

  const proxy = new SocketProxy(SOCKET_PATH, upstreamPath);
  proxy.intercept = signerIntercept(FINGERPRINT, API_URL);

  process.stdout.write(`Session started`);
  process.stdout.write(`ssh-agent proxy listening on ${SOCKET_PATH}\n`);
  process.stdout.write(
    'Run this in another shell to start verified commits:\n',
  );
  process.stdout.write('  eval "$(commitment-issues env)"\n');

  const shutdown = (): void => {
    proxy.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { start };
