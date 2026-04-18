# claude-code-hooks-mcp-server

MCP server that lets Claude Code inspect and edit its own hooks in `~/.claude/settings.json`. Meta — Claude managing the rules it runs under.

## Tools (read-only by design)

| Tool                       | What it does                                             |
| -------------------------- | -------------------------------------------------------- |
| `claude_hooks_list_all`    | All hooks across all events, flat                        |
| `claude_hooks_for_event`   | Hooks for one event (PreToolUse, PostToolUse, Stop, ...) |
| `claude_hooks_list_events` | Valid event names Claude Code recognizes                 |

## Why read-only?

Editing `~/.claude/settings.json` from inside a Claude session is self-modification of the agent's own security controls — including the destructive-bash guard hook that exists to keep the agent honest. The MCP intentionally exposes read-only inspection only. To edit hooks: open `~/.claude/settings.json` directly, or use Claude Code's `/hooks` slash command.

A future scope expansion could add edit tools behind an explicit `--unsafe` flag opted in at server-launch time. Not in scope today.

## Setup

```bash
pnpm install
pnpm build
pnpm smoke   # reads your real settings.json, prints a summary
```

Add to `~/.claude.json`:

```jsonc
"mcpServers": {
  "hooks": {
    "command": "node",
    "args": ["/absolute/path/to/claude-code-hooks-mcp/dist/index.js"]
  }
}
```

Restart Claude Code.

Optional override: set `CLAUDE_SETTINGS_PATH` in the MCP env to point at a different settings file (e.g. a project-scoped `.claude/settings.json`).

## Pairs with

- **claude-code-hook-eval** skill — measure each hook's wall-clock saved/spent. Combine: `claude_hooks_list_all` to enumerate, then run the eval against the list, then `claude_hooks_remove` for losers.

## License

MIT.
