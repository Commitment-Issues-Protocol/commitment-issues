#!/usr/bin/env node
import { printEnv } from './cli/env.ts';
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
  default:
    process.stderr.write(
      'Usage: commitment-issues <start|env|session <command> [args...]>\n',
    );
    process.exitCode = 1;
}
