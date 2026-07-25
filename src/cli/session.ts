import { spawnSync } from 'node:child_process';

import { buildProxyEnv } from './env.ts';

/**
 * Check whether a command is available on PATH by attempting to run it
 * @param command - command to check
 * @param versionFlag - flag that makes the command print its version and exit
 * @returns true if the command ran successfully
 */
function isAvailable(command: string, versionFlag: string): boolean {
  const result = spawnSync(command, [versionFlag], { stdio: 'ignore' });

  return !result.error && result.status === 0;
}

/**
 * Detect which supported terminal multiplexer is installed, preferring tmux
 * @returns the detected multiplexer, or undefined if neither is available
 */
function detectMultiplexer(): 'tmux' | 'screen' | undefined {
  if (isAvailable('tmux', '-V')) {
    return 'tmux';
  }

  if (isAvailable('screen', '-v')) {
    return 'screen';
  }

  return undefined;
}

/**
 * Quote a value for safe interpolation into a POSIX shell command string
 * @param value - value to quote
 * @returns the single-quoted, shell-escaped value
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

/**
 * Launch a tmux session with the proxy running in one window (inheriting
 * our real environment, so it proxies the real upstream agent) and the
 * given command in another, with the proxied environment applied only to
 * that second window via tmux's per-window `-e` flag
 * @param sessionName - name for the new tmux session
 * @param proxyCommand - argv that runs `commitment-issues start`
 * @param targetCommand - argv for the command the user wants to run
 * @param proxyEnv - environment overrides to apply to the target command's window
 */
function launchTmux(
  sessionName: string,
  proxyCommand: string[],
  targetCommand: string[],
  proxyEnv: Record<string, string>,
): void {
  spawnSync('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-n',
    'proxy',
    ...proxyCommand,
  ]);

  const envFlags = Object.entries(proxyEnv).flatMap(([key, value]) => [
    '-e',
    `${key}=${value}`,
  ]);

  spawnSync('tmux', [
    'new-window',
    '-t',
    sessionName,
    '-n',
    'main',
    ...envFlags,
    ...targetCommand,
  ]);
}

/**
 * Launch a screen session with the proxy running in one window (inheriting
 * our real environment, so it proxies the real upstream agent) and the
 * given command in another, with the proxied environment applied only to
 * that second window (screen has no per-window env flag, so it's exported
 * by a wrapping shell instead)
 * @param sessionName - name for the new screen session
 * @param proxyCommand - argv that runs `commitment-issues start`
 * @param targetCommand - argv for the command the user wants to run
 * @param proxyEnv - environment overrides to apply to the target command's window
 */
function launchScreen(
  sessionName: string,
  proxyCommand: string[],
  targetCommand: string[],
  proxyEnv: Record<string, string>,
): void {
  spawnSync('screen', ['-dmS', sessionName, ...proxyCommand]);

  const exports = Object.entries(proxyEnv)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('; ');
  const exec = targetCommand.map(shellQuote).join(' ');

  spawnSync('screen', [
    '-S',
    sessionName,
    '-X',
    'screen',
    '-t',
    'main',
    'bash',
    '-c',
    `${exports}; exec ${exec}`,
  ]);
  spawnSync('screen', ['-S', sessionName, '-X', 'select', 'main']);
}

/**
 * Open a tmux or screen session with the ssh-agent proxy running in one
 * window and the given command running in another with the proxy's
 * environment applied, so verified commits can be made from the second
 * window while the proxy handles signing in the background
 * @param args - command and arguments to launch alongside the proxy
 */
function session(args: string[]): void {
  const multiplexer = detectMultiplexer();

  if (!multiplexer) {
    process.stderr.write(
      '`session` requires tmux or screen, but neither was found on PATH\n',
    );
    process.exitCode = 1;
    return;
  }

  if (args.length === 0) {
    process.stderr.write(
      'Usage: commitment-issues session <command> [args...]\n',
    );
    process.exitCode = 1;
    return;
  }

  const sessionName = `commitment-issues-${process.pid.toString()}`;
  const proxyCommand = [process.execPath, process.argv[1] ?? '', 'start'];
  const proxyEnv = buildProxyEnv();

  if (multiplexer === 'tmux') {
    launchTmux(sessionName, proxyCommand, args, proxyEnv);
  } else {
    launchScreen(sessionName, proxyCommand, args, proxyEnv);
  }

  const attach =
    multiplexer === 'tmux'
      ? spawnSync('tmux', ['attach-session', '-t', `${sessionName}:main`], {
          stdio: 'inherit',
        })
      : spawnSync('screen', ['-r', sessionName], { stdio: 'inherit' });

  process.exitCode = attach.status ?? 0;
}

export { session };
