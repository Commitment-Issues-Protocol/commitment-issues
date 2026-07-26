# Commitment Issues SSH-Agent

SSH Agent for using Commitment Issues

## Install

`tmux` is a pre-requisite, while GNU `screen` works it is a considerably worse experience.

```
npm install -g github:Commitment-Issues-Protocol/commitment-issues#build
```

This provides the `commitment-issues` command.

## Usage

For most cases, `commitment-issues session <your ai tool>` is what you want, e.g. `commitment-issues session claude` to start a session with claude.

Full list of commands:

- `commitment-issues start` — run the ssh-agent proxy in the foreground.
- `commitment-issues env` — print `export` statements to point `ssh`/`git` at the proxy; use as `eval "$(commitment-issues env)"`.
- `commitment-issues session <command> [args...]` — run the proxy and launch `<command>` in a new tmux/screen session with its environment already applied.
