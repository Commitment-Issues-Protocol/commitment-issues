import { COMMITTER_NAME, SIGNING_KEY, SOCKET_PATH } from './config.ts';

/**
 * Print shell export statements that point SSH_AUTH_SOCK at the proxy
 * socket and configure git (via GIT_CONFIG_* overrides, scoped to
 * processes that inherit this environment) to sign commits with the
 * proxied key and record the committer as {@link COMMITTER_NAME} while
 * leaving the author identity untouched, meant to be eval'd in the current
 * login session (e.g. `eval "$(ssh-agent-proxy env)"`)
 */
function printEnv(): void {
  process.stdout.write(`export SSH_AUTH_SOCK=${SOCKET_PATH}\n`);
  process.stdout.write('export GIT_CONFIG_COUNT=2\n');
  process.stdout.write('export GIT_CONFIG_KEY_0=gpg.format\n');
  process.stdout.write('export GIT_CONFIG_VALUE_0=ssh\n');
  process.stdout.write('export GIT_CONFIG_KEY_1=user.signingkey\n');
  process.stdout.write(
    `export GIT_CONFIG_VALUE_1=${JSON.stringify(`key::${SIGNING_KEY}`)}\n`,
  );
  process.stdout.write(
    `export GIT_COMMITTER_NAME=${JSON.stringify(COMMITTER_NAME)}\n`,
  );
}

export { printEnv };
