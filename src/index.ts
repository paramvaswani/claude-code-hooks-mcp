#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListTools } from "./tools/list.js";
import { registerAnalyzeTools } from "./tools/analyze.js";

const server = new McpServer({
  name: "claude-code-hooks-mcp-server",
  version: "0.1.0",
});

registerListTools(server);
registerAnalyzeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("claude-code-hooks-mcp-server running via stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
