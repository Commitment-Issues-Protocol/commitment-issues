import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import qrcodeTerminal from 'qrcode-terminal';
import { createAgentkitAuth } from "../agent/agentkit-auth.js";
import { signerIntercept } from "../agent/signer.js";
import { SocketProxy } from "../agent/socket.js";
import { API_URL, FINGERPRINT, SIGNING_KEY, SOCKET_PATH, WALLET_KEY_PATH, getAgentWalletPrivateKey, } from "./config.js";
/**
 * Print a verification URL and its QR code together to stdout
 * @param url - URL for a human to open to verify and approve the pending sign request
 * @returns resolves once the QR code and link have been written
 */
const displayVerification = (url) => {
    qrcodeTerminal.generate(url, { small: true });
    process.stdout.write(`Verify this request: ${url}\n`);
    return console.clear;
};
/**
 * Create the ssh-agent proxy socket and run it in the foreground until the
 * process is signalled to stop
 */
function start() {
    const upstreamPath = process.env['SSH_AUTH_SOCK'];
    const standalone = !upstreamPath;
    const privateKey = getAgentWalletPrivateKey();
    if (!privateKey) {
        process.stdout.write(`No wallet private key found at ${WALLET_KEY_PATH}; sign requests won't be attributable to a human-backed agent until you run "commitment-issues create-agent" or "commitment-issues import-key <private-key>"\n`);
    }
    mkdirSync(dirname(SOCKET_PATH), { recursive: true });
    const agentkitAuth = createAgentkitAuth(privateKey);
    const proxy = new SocketProxy(SOCKET_PATH, upstreamPath);
    proxy.intercept = signerIntercept(FINGERPRINT, API_URL, SIGNING_KEY, displayVerification, standalone, agentkitAuth);
    if (standalone) {
        process.stdout.write('No upstream ssh-agent found; running standalone (only the proxied key will be available)\n');
    }
    process.stdout.write(`Session started`);
    process.stdout.write(`ssh-agent proxy listening on ${SOCKET_PATH}\n`);
    process.stdout.write('Run this in another shell to start verified commits:\n');
    process.stdout.write('  eval "$(commitment-issues env)"\n');
    const shutdown = () => {
        proxy.close();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
export { start };
