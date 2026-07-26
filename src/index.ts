#!/usr/bin/env node
import { createAgent } from './cli/create-agent.ts';
import { printEnv } from './cli/env.ts';
import { importKey } from './cli/import-key.ts';
import { session } from './cli/session.ts';
import { start } from './cli/start.ts';

const [, , command] = process.argv;

switch (command) {
  case 'start':
    start();
    break;
  case 'env':
    printEnv();
    break;
  case 'session':
    session(process.argv.slice(3));
    break;
  case 'import-key':
    importKey(process.argv.slice(3));
    break;
  case 'create-agent':
    createAgent();
    break;
  default:
    process.stderr.write(
      [
        'Usage: commitment-issues <command>',
        '',
        'Commands:',
        '  start                       run the ssh-agent proxy in the foreground',
        '  env                         print export statements to point ssh/git at the proxy',
        '  session <command> [args...] run the proxy and launch <command> in a new tmux/screen session',
        '  import-key <private-key>    save an existing wallet private key for signing agentkit requests',
        '  create-agent                generate a new wallet and register it with AgentBook',
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
}
