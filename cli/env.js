import { COMMITTER_EMAIL, COMMITTER_NAME, SIGNING_KEY, SOCKET_PATH, } from "./config.js";
/**
 * Build the environment variables that point SSH_AUTH_SOCK at the proxy
 * socket and configure git (via GIT_CONFIG_* overrides, scoped to
 * processes that inherit this environment) to sign commits with the
 * proxied key and record the committer as {@link COMMITTER_NAME} /
 * {@link COMMITTER_EMAIL}, while leaving the author identity untouched
 * @returns a plain object of environment variable name/value pairs
 */
function buildProxyEnv() {
    return {
        SSH_AUTH_SOCK: SOCKET_PATH,
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'gpg.format',
        GIT_CONFIG_VALUE_0: 'ssh',
        GIT_CONFIG_KEY_1: 'user.signingkey',
        GIT_CONFIG_VALUE_1: `key::${SIGNING_KEY}`,
        GIT_COMMITTER_NAME: COMMITTER_NAME,
        GIT_COMMITTER_EMAIL: COMMITTER_EMAIL,
    };
}
/**
 * Print shell export statements built from {@link buildProxyEnv}, meant to
 * be eval'd in the current login session (e.g. `eval "$(commitment-issues env)"`)
 */
function printEnv() {
    for (const [key, value] of Object.entries(buildProxyEnv())) {
        process.stdout.write(`export ${key}=${JSON.stringify(value)}\n`);
    }
}
export { buildProxyEnv, printEnv };
