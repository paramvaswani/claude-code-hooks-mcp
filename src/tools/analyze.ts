import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readSettings,
  settingsPath,
  VALID_EVENTS,
  type HookEvent,
} from "../settings.js";

type Verdict = "keep" | "tune" | "drop";

type HookRecord = {
  event: HookEvent;
  matcher?: string;
  command: string;
  timeout?: number;
  commandLength: number;
  wordCount: number;
  category: Category;
  complexity: "low" | "medium" | "high";
  verdict: Verdict;
  reasons: string[];
  tuningHints: string[];
};

type Category = "formatter" | "guard" | "notify" | "logger" | "sync" | "custom";

function classifyCommand(cmd: string): Category {
  const c = cmd.toLowerCase();
  if (/prettier|eslint|biome|ruff|black|gofmt|rustfmt/.test(c))
    return "formatter";
  if (/block|deny|forbid|reject|guard|audit|check/.test(c)) return "guard";
  if (/osascript|say |terminal-notifier|notify-send|afplay/.test(c))
    return "notify";
  if (/tee |>>|jsonl|append|log/.test(c) && !/git log/.test(c)) return "logger";
  if (/git (add|commit|push|pull|fetch)|rclone|rsync|vercel/.test(c))
    return "sync";
  return "custom";
}

function complexity(cmd: string): "low" | "medium" | "high" {
  const pipes = (cmd.match(/\|/g) ?? []).length;
  const redirects = (cmd.match(/[<>]/g) ?? []).length;
  const subshells = (cmd.match(/\$\(/g) ?? []).length;
  const length = cmd.length;
  const score = pipes * 2 + redirects + subshells * 3 + Math.floor(length / 80);
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function decide(
  cat: Category,
  comp: "low" | "medium" | "high",
  event: HookEvent,
  timeout: number | undefined,
  cmd: string,
): { verdict: Verdict; reasons: string[]; tuningHints: string[] } {
  const reasons: string[] = [];
  const tuningHints: string[] = [];
  let verdict: Verdict = "keep";

  reasons.push(`category=${cat}`);
  reasons.push(`complexity=${comp}`);

  // branch on event
  if (event === "PreToolUse" && comp === "high") {
    verdict = "tune";
    reasons.push(
      "PreToolUse runs before every matching tool call — high-complexity commands block the agent loop.",
    );
    tuningHints.push(
      "split into a fast guard script and an async logger, or move logging to PostToolUse.",
    );
  }

  // branch on category
  if (cat === "formatter") {
    if (event === "PostToolUse") {
      reasons.push("formatters on PostToolUse are the canonical fit.");
    } else {
      if ((verdict as Verdict) !== "drop") verdict = "tune";
      tuningHints.push(
        `formatter hook on ${event} is unusual — consider PostToolUse.`,
      );
    }
  }

  if (
    cat === "guard" &&
    event !== "PreToolUse" &&
    event !== "UserPromptSubmit"
  ) {
    if ((verdict as Verdict) !== "drop") verdict = "tune";
    tuningHints.push(
      `guard on ${event} is late — PreToolUse blocks before the call runs.`,
    );
  }

  if (cat === "notify" && comp !== "low") {
    verdict = "tune";
    tuningHints.push(
      "notification hooks should be near-instant; trim dependencies or background the command with `&`.",
    );
  }

  if (cat === "logger" && event === "PreToolUse" && comp !== "low") {
    verdict = "drop";
    reasons.push(
      "heavy logger on PreToolUse slows every tool call — log from PostToolUse or a subagent.",
    );
    tuningHints.push("move to PostToolUse and background the write.");
  }

  // branch on timeout
  if (timeout === undefined && (comp === "high" || cat === "sync")) {
    tuningHints.push(
      "set a `timeout` — sync/high-complexity hooks without one can hang the session.",
    );
  }
  if (timeout !== undefined && timeout > 30000) {
    tuningHints.push(
      `timeout=${timeout}ms is aggressive — long hooks should run async if possible.`,
    );
  }

  // branch on command shape
  if (cmd.includes(" sudo ") || cmd.startsWith("sudo ")) {
    verdict = "drop";
    reasons.push("sudo in a hook command is a large footgun.");
  }
  if (/ rm -rf /.test(cmd)) {
    verdict = "drop";
    reasons.push("`rm -rf` inside a hook is high-risk.");
  }

  return { verdict, reasons, tuningHints };
}

type NotifyFn = (message: string, progress: number, total: number) => void;

export function registerAnalyzeTools(server: McpServer) {
  server.tool(
    "claude_hooks_impact_analyze",
    "Composite analyzer for ~/.claude/settings.json hooks. Walks every hook, categorizes by matcher/event/command shape, applies complexity heuristics, and branches each into a keep/tune/drop verdict with tuning hints. Read-only — never mutates settings. Set `streaming: true` with a progressToken to stream per-event progress.",
    {
      eventFilter: z
        .enum(VALID_EVENTS)
        .optional()
        .describe("Only analyze hooks for this event."),
      verdictFilter: z
        .enum(["keep", "tune", "drop"])
        .optional()
        .describe("Only return hooks with this verdict."),
      streaming: z
        .boolean()
        .default(false)
        .describe(
          "Emit MCP progress notifications per-event. Caller must supply a progressToken in _meta to receive them.",
        ),
    },
    async ({ eventFilter, verdictFilter, streaming }, extra) => {
      const progressToken = extra?._meta?.progressToken as
        | string
        | number
        | undefined;
      const shouldStream = streaming && progressToken !== undefined;

      const s = readSettings();
      const hooks = s.hooks ?? {};
      const events = (eventFilter ? [eventFilter] : VALID_EVENTS).filter(
        (ev) => hooks[ev],
      );
      const TOTAL = Math.max(events.length, 1);

      const notify: NotifyFn = (message, progress, total) => {
        if (!shouldStream) return;
        void extra
          .sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: progressToken!,
              progress,
              total,
              message,
            },
          })
          .catch(() => {});
      };

      const records: HookRecord[] = [];
      const byVerdict: Record<Verdict, number> = { keep: 0, tune: 0, drop: 0 };
      const byCategory: Record<Category, number> = {
        formatter: 0,
        guard: 0,
        notify: 0,
        logger: 0,
        sync: 0,
        custom: 0,
      };

      let done = 0;
      for (const event of events) {
        const entries = hooks[event] ?? [];
        notify(`analyzing ${event} (${entries.length} entries)`, done, TOTAL);
        for (const entry of entries) {
          for (const h of entry.hooks ?? []) {
            const cmd = h.command ?? "";
            const cat = classifyCommand(cmd);
            const comp = complexity(cmd);
            const { verdict, reasons, tuningHints } = decide(
              cat,
              comp,
              event,
              h.timeout,
              cmd,
            );
            const rec: HookRecord = {
              event,
              matcher: entry.matcher,
              command: cmd,
              timeout: h.timeout,
              commandLength: cmd.length,
              wordCount: cmd.split(/\s+/).filter(Boolean).length,
              category: cat,
              complexity: comp,
              verdict,
              reasons,
              tuningHints,
            };
            records.push(rec);
            byVerdict[verdict]++;
            byCategory[cat]++;
          }
        }
        done++;
      }
      notify("done", TOTAL, TOTAL);

      const filtered = verdictFilter
        ? records.filter((r) => r.verdict === verdictFilter)
        : records;

      // group actions by verdict for a branching tree view
      const tree = {
        keep: filtered.filter((r) => r.verdict === "keep"),
        tune: filtered.filter((r) => r.verdict === "tune"),
        drop: filtered.filter((r) => r.verdict === "drop"),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                settingsPath: settingsPath(),
                summary: {
                  totalHooks: records.length,
                  byVerdict,
                  byCategory,
                  eventsAnalyzed: events,
                },
                tree,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
