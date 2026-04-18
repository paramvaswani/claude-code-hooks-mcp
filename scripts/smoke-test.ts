#!/usr/bin/env tsx
import { readSettings, settingsPath, VALID_EVENTS } from "../src/settings.js";

function main() {
  const path = settingsPath();
  console.log(`reading ${path}...`);
  const s = readSettings();
  const hooks = s.hooks ?? {};
  console.log(
    `events configured: ${Object.keys(hooks).join(", ") || "(none)"}`,
  );
  let total = 0;
  for (const ev of Object.keys(hooks)) {
    for (const entry of hooks[ev as keyof typeof hooks] ?? []) {
      total += entry.hooks.length;
    }
  }
  console.log(`total hooks: ${total}`);
  console.log(`valid event names: ${VALID_EVENTS.join(", ")}`);
}

main();
