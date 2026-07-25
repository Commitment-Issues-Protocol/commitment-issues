#!/usr/bin/env node
import { printEnv } from './cli/env.ts';
import { start } from './cli/start.ts';

const [, , command] = process.argv;

switch (command) {
  case 'start':
    start();
    break;
  case 'env':
    printEnv();
    break;
  default:
    process.stderr.write('Usage: commitment-issues <start|env>\n');
    process.exitCode = 1;
}
