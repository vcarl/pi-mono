
import { Agent } from "@vcarl/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import fs from "fs";
import path from "path";

const agentDir = "/Users/vcarl/workspace/pi-mono/packages/agent";

console.log("🤖 Agent starting self-improvement analysis...\n");

const agent = new Agent({
  initialState: {
    systemPrompt: `You are an expert TypeScript developer analyzing the pi-agent-core package.
Your goal is to suggest improvements to the codebase.

Rules:
- Be concise and actionable
- Focus on code quality, performance, and maintainability
- Suggest specific improvements with file paths
- Consider Effect-TS best practices`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
  // Add getApiKey for OAuth token refresh
  getApiKey: async (provider) => {
    if (provider === "anthropic") {
      // Use OAuth if credentials are provided via env
      if (process.env.ANTHROPIC_OAUTH_TOKEN) {
        return process.env.ANTHROPIC_OAUTH_TOKEN;
      }
      if (process.env.ANTHROPIC_API_KEY) {
        return process.env.ANTHROPIC_API_KEY;
      }
    }
    return undefined;
  },
});

let fullResponse = "";

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
    fullResponse += event.assistantMessageEvent.delta;
  }
});

try {
  // Read key files for context
  const srcFiles = fs.readdirSync(path.join(agentDir, "src"));
  const effectFiles = fs.readdirSync(path.join(agentDir, "src/effect"));

  const prompt = `I've just been packaged and installed as a tarball. I'm now analyzing my own codebase for improvements.

Current structure:
- src/ files: ${srcFiles.join(", ")}
- src/effect/ files: ${effectFiles.join(", ")}

Based on what you know about Effect-TS and agent architectures, what are the top 3-5 improvements I should make to this codebase?

Focus on:
1. Effect-TS best practices
2. Code organization and maintainability
3. Performance optimizations
4. Missing features or enhancements

Be specific with file names and suggested changes.`;

  await agent.prompt(prompt);

  console.log("\n\n📊 Analysis complete!\n");

  // Save analysis
  const outputPath = path.join(agentDir, "E2E_ANALYSIS.md");
  const output = `# Agent Self-Improvement Analysis

Generated: ${new Date().toISOString()}

## Suggested Improvements

${fullResponse}

## Test Info
- Package version: Successfully packaged and installed
- Effect-TS: Working correctly
- Agent runtime: Operational
`;

  fs.writeFileSync(outputPath, output);
  console.log(`✅ Analysis saved to: E2E_ANALYSIS.md\n`);

} catch (error) {
  console.error("❌ Agent failed:", error);
  process.exit(1);
}
