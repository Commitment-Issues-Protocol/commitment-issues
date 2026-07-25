import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import qrcodeTerminal from 'qrcode-terminal';

import type { DisplayVerification } from '../agent/signer.ts';
import { signerIntercept } from '../agent/signer.ts';
import { SocketProxy } from '../agent/socket.ts';

import { API_URL, FINGERPRINT, SIGNING_KEY, SOCKET_PATH } from './config.ts';
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
 * Shell snippet that prints a file then blocks until it's removed
 * @param filePath - path to the file to display and wait on
 * @returns the shell command
 */
function catAndWaitScript(filePath: string): string {
  const quoted = shellQuote(filePath);

  return `cat ${quoted}; while [ -f ${quoted} ]; do sleep 0.5; done`;
}

/**
 * Launch a detached tmux session running the given command, with the
 * proxied environment applied via tmux's per-session `-e` flag
 * @param sessionName - name for the new tmux session
 * @param targetCommand - argv for the command the user wants to run
 * @param proxyEnv - environment overrides to apply to that command
 */
function launchTmux(
  sessionName: string,
  targetCommand: string[],
  proxyEnv: Record<string, string>,
): void {
  const envFlags = Object.entries(proxyEnv).flatMap(([key, value]) => [
    '-e',
    `${key}=${value}`,
  ]);

  spawnSync('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-n',
    'main',
    ...envFlags,
    ...targetCommand,
  ]);
}

/**
 * Launch a detached screen session running the given command, with the
 * proxied environment applied by a wrapping shell (screen has no per-window
 * env flag)
 * @param sessionName - name for the new screen session
 * @param targetCommand - argv for the command the user wants to run
 * @param proxyEnv - environment overrides to apply to that command
 */
function launchScreen(
  sessionName: string,
  targetCommand: string[],
  proxyEnv: Record<string, string>,
): void {
  const exports = Object.entries(proxyEnv)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('; ');
  const exec = targetCommand.map(shellQuote).join(' ');

  spawnSync('screen', [
    '-dmS',
    sessionName,
    'bash',
    '-c',
    `${exports}; exec ${exec}`,
  ]);
}

/**
 * Render a verification URL as a QR code
 * @param url - URL to render
 * @returns the rendered QR code text
 */
function renderQrCode(url: string): Promise<string> {
  return new Promise((resolve) => {
    qrcodeTerminal.generate(url, { small: true }, resolve);
  });
}

/**
 * Write verification content to a uniquely named temp file
 * @param content - text to write
 * @returns the path written to
 */
function writeVerificationFile(content: string): string {
  const filePath = join(
    tmpdir(),
    `commitment-issues-verify-${randomUUID()}.txt`,
  );
  writeFileSync(filePath, content);

  return filePath;
}

/**
 * Build a DisplayVerification that pops the QR code and link up as an
 * overlay in the tmux/screen session we launched. Our own process isn't
 * itself running inside that session (it retains control so it can target
 * it directly), so the multiplexer commands target it explicitly by name
 * rather than relying on ambient TMUX/STY detection
 * @param multiplexer - which multiplexer the target session was launched with
 * @param sessionName - name of the launched session to pop content up in
 * @returns a DisplayVerification usable with signerIntercept
 */
function createPopoverDisplay(
  multiplexer: 'tmux' | 'screen',
  sessionName: string,
): DisplayVerification {
  return async (url) => {
    const qr = await renderQrCode(url);
    const filePath = writeVerificationFile(
      `${qr}\nVerify you are human: ${url}\n`,
    );
    const waitScript = catAndWaitScript(filePath);

    if (multiplexer === 'tmux') {
      spawn(
        'tmux',
        [
          'display-popup',
          '-t',
          sessionName,
          '-E',
          '-T',
          ' Checking for human',
          waitScript,
        ],
        { stdio: 'ignore', detached: true },
      ).unref();
    } else {
      spawnSync('screen', [
        '-S',
        sessionName,
        '-X',
        'screen',
        '-t',
        'verify',
        'bash',
        '-c',
        waitScript,
      ]);
      spawnSync('screen', ['-S', sessionName, '-X', 'select', 'verify']);
    }

    return () => {
      rmSync(filePath, { force: true });
    };
  };
}

/**
 * Open a tmux or screen session running the given command with the proxy's
 * environment applied, while running the ssh-agent proxy in this process
 * (rather than as a spawned subprocess) so signing-request QR codes can be
 * popped up directly over the launched session
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

  const upstreamPath = process.env['SSH_AUTH_SOCK'];
  const standalone = !upstreamPath;

  const sessionName = `commitment-issues-${process.pid.toString()}`;

  mkdirSync(dirname(SOCKET_PATH), { recursive: true });

  const proxy = new SocketProxy(SOCKET_PATH, upstreamPath);
  proxy.intercept = signerIntercept(
    FINGERPRINT,
    API_URL,
    SIGNING_KEY,
    createPopoverDisplay(multiplexer, sessionName),
    standalone,
  );

  if (standalone) {
    process.stdout.write(
      'No upstream ssh-agent found; running standalone (only the proxied key will be available)\n',
    );
  }

  const shutdown = (): void => {
    proxy.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const proxyEnv = buildProxyEnv();

  if (multiplexer === 'tmux') {
    launchTmux(sessionName, args, proxyEnv);
  } else {
    launchScreen(sessionName, args, proxyEnv);
  }

  const attach =
    multiplexer === 'tmux'
      ? spawn('tmux', ['attach-session', '-t', `${sessionName}:main`], {
          stdio: 'inherit',
        })
      : spawn('screen', ['-r', sessionName], { stdio: 'inherit' });

  attach.on('exit', (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}

export { session };
