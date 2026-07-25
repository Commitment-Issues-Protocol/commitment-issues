#!/usr/bin/env node
import { printEnv } from './cli/env';
import { start } from './cli/start';

const [, , command] = process.argv;

switch (command) {
  case 'start':
    start();
    break;
  case 'env':
    printEnv();
    break;
  default:
    process.stderr.write('Usage: ssh-agent-proxy <start|env>\n');
    process.exitCode = 1;
}
