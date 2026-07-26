import { spawnSync } from 'node:child_process';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { WALLET_KEY_PATH, writeAgentWalletPrivateKey } from './config.ts';

/**
 * Generate a new EVM wallet, save its private key to {@link WALLET_KEY_PATH},
 * and register the resulting address in AgentBook via `agentkit-cli`
 */
function createAgent(): void {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;

  writeAgentWalletPrivateKey(privateKey);

  process.stdout.write(
    `Generated wallet ${address}, saved to ${WALLET_KEY_PATH}\n`,
  );
  process.stdout.write('Registering with AgentBook...\n');

  const result = spawnSync(
    'npx',
    ['@worldcoin/agentkit-cli', 'register', address],
    { stdio: 'inherit' },
  );

  if (result.error || result.status !== 0) {
    process.stderr.write(
      `Registration failed; you can retry with: npx @worldcoin/agentkit-cli register ${address}\n`,
    );
    process.exitCode = 1;
  }
}

export { createAgent };
