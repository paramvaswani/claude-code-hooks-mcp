import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSettings, settingsPath, VALID_EVENTS } from "../settings.js";

export function registerListTools(server: McpServer) {
  server.tool(
    "claude_hooks_list_all",
    "List every hook configured across all events in ~/.claude/settings.json. Returns a flat array with event, matcher, and the command for each.",
    {},
    async () => {
      const s = readSettings();
      const hooks = s.hooks ?? {};
      const out: {
        event: string;
        matcher?: string;
        command: string;
        timeout?: number;
      }[] = [];
      for (const ev of Object.keys(hooks)) {
        for (const entry of hooks[ev as keyof typeof hooks] ?? []) {
          for (const h of entry.hooks) {
            out.push({
              event: ev,
              matcher: entry.matcher,
              command: h.command,
              timeout: h.timeout,
            });
          }
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                settingsPath: settingsPath(),
                totalHooks: out.length,
                hooks: out,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "claude_hooks_for_event",
    "Get hooks scoped to a single event (e.g. PreToolUse, PostToolUse, Stop).",
    {
      event: z.enum(VALID_EVENTS),
    },
    async ({ event }) => {
      const s = readSettings();
      const entries = s.hooks?.[event] ?? [];
      return {
        content: [
          { type: "text", text: JSON.stringify({ event, entries }, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "claude_hooks_list_events",
    "List the valid hook event names that Claude Code recognizes.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ events: VALID_EVENTS }, null, 2),
          },
        ],
      };
    },
  );
}
