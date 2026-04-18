import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VALID_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
] as const;

export type HookEvent = (typeof VALID_EVENTS)[number];

export type HookCommand = {
  type: "command";
  command: string;
  timeout?: number;
};

export type MatcherEntry = {
  matcher?: string;
  hooks: HookCommand[];
};

export type HooksConfig = Partial<Record<HookEvent, MatcherEntry[]>>;

export type ClaudeSettings = {
  hooks?: HooksConfig;
  [key: string]: unknown;
};

export function settingsPath(): string {
  return (
    process.env.CLAUDE_SETTINGS_PATH ??
    join(homedir(), ".claude", "settings.json")
  );
}

export function backupPath(): string {
  return settingsPath() + ".bak";
}

export function readSettings(): ClaudeSettings {
  const p = settingsPath();
  if (!existsSync(p)) return {};
  const text = readFileSync(p, "utf8");
  return JSON.parse(text);
}

export function writeSettings(s: ClaudeSettings): void {
  const p = settingsPath();
  writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
}

export function backup(): string {
  const src = settingsPath();
  const dst = backupPath();
  if (!existsSync(src)) throw new Error(`no settings file at ${src}`);
  copyFileSync(src, dst);
  return dst;
}

export function restoreFromBackup(): void {
  const src = backupPath();
  const dst = settingsPath();
  if (!existsSync(src)) throw new Error(`no backup file at ${src}`);
  copyFileSync(src, dst);
}
