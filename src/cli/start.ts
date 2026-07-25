import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import qrcodeTerminal from 'qrcode-terminal';

import type { DisplayVerification } from '../agent/signer.ts';
import { signerIntercept } from '../agent/signer.ts';
import { SocketProxy } from '../agent/socket.ts';

import { API_URL, FINGERPRINT, SIGNING_KEY, SOCKET_PATH } from './config.ts';

/**
 * Print a verification URL and its QR code together to stdout
 * @param url - URL for a human to open to verify and approve the pending sign request
 * @returns resolves once the QR code and link have been written
 */
const displayVerification: DisplayVerification = (url) =>
  new Promise((resolve) => {
    qrcodeTerminal.generate(url, { small: true }, (qr) => {
      process.stdout.write(`${qr}\nVerify this request: ${url}\n`);
      resolve(() => {
        console.clear();
      });
    });
  });

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
  proxy.intercept = signerIntercept(
    FINGERPRINT,
    API_URL,
    SIGNING_KEY,
    displayVerification,
  );

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
