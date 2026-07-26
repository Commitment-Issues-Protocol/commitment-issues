import { privateKeyToAccount } from 'viem/accounts';
import { WALLET_KEY_PATH, writeAgentWalletPrivateKey } from "./config.js";
/**
 * Validate a private key and write it to {@link WALLET_KEY_PATH}
 * @param args - CLI arguments after `import-key`; expects a single
 * 0x-prefixed private key
 */
function importKey(args) {
    const [privateKey] = args;
    if (!privateKey) {
        process.stderr.write('Usage: commitment-issues import-key <private-key>\n');
        process.exitCode = 1;
        return;
    }
    let address;
    try {
        address = privateKeyToAccount(privateKey).address;
    }
    catch {
        process.stderr.write('Invalid private key; expected a 0x-prefixed 32-byte EVM private key\n');
        process.exitCode = 1;
        return;
    }
    writeAgentWalletPrivateKey(privateKey);
    process.stdout.write(`Imported wallet ${address} to ${WALLET_KEY_PATH}\n`);
}
export { importKey };
