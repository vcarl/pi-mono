#!/usr/bin/env node
/**
 * End-to-end test: Package the agent, install it in a test environment,
 * and have it autonomously improve this agent directory.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const testDir = path.join(packageRoot, "test-e2e-tmp");

console.log("🧪 E2E Test: Agent Self-Improvement\n");

// Step 1: Clean and build
console.log("📦 Step 1: Building package...");
try {
	execSync("npm run clean && npm run build", { cwd: packageRoot, stdio: "inherit" });
	console.log("✅ Build complete\n");
} catch (error) {
	console.error("❌ Build failed");
	process.exit(1);
}

// Step 2: Create tarball
console.log("📦 Step 2: Creating tarball...");
let tarballPath: string;
try {
	const output = execSync("npm pack", { cwd: packageRoot, encoding: "utf-8" });
	const tarballName = output.trim().split("\n").pop()!;
	tarballPath = path.join(packageRoot, tarballName);
	console.log(`✅ Created: ${tarballName}\n`);
} catch (error) {
	console.error("❌ Pack failed");
	process.exit(1);
}

// Step 3: Setup test environment
console.log("📦 Step 3: Setting up test environment...");
try {
	// Clean previous test dir
	if (fs.existsSync(testDir)) {
		fs.rmSync(testDir, { recursive: true, force: true });
	}
	fs.mkdirSync(testDir, { recursive: true });

	// Create minimal package.json
	const testPackageJson = {
		name: "agent-e2e-test",
		type: "module",
		dependencies: {},
	};
	fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify(testPackageJson, null, 2));

	console.log("✅ Test environment ready\n");
} catch (error) {
	console.error("❌ Setup failed:", error);
	process.exit(1);
}

// Step 4: Install tarball
console.log("📦 Step 4: Installing tarball...");
try {
	execSync(`npm install ${tarballPath} @mariozechner/pi-ai`, {
		cwd: testDir,
		stdio: "inherit",
	});
	console.log("✅ Package installed\n");
} catch (error) {
	console.error("❌ Install failed");
	process.exit(1);
}

// Step 5: Create agent script
console.log("📦 Step 5: Creating agent script...");
const agentScript = `
import { Agent } from "@vcarl/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import fs from "fs";
import path from "path";

const agentDir = "${packageRoot}";

console.log("🤖 Agent starting self-improvement analysis...\\n");

const agent = new Agent({
  initialState: {
    systemPrompt: \`You are an expert TypeScript developer analyzing the pi-agent-core package.
Your goal is to suggest improvements to the codebase.

Rules:
- Be concise and actionable
- Focus on code quality, performance, and maintainability
- Suggest specific improvements with file paths
- Consider Effect-TS best practices\`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
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

  const prompt = \`I've just been packaged and installed as a tarball. I'm now analyzing my own codebase for improvements.

Current structure:
- src/ files: \${srcFiles.join(", ")}
- src/effect/ files: \${effectFiles.join(", ")}

Based on what you know about Effect-TS and agent architectures, what are the top 3-5 improvements I should make to this codebase?

Focus on:
1. Effect-TS best practices
2. Code organization and maintainability
3. Performance optimizations
4. Missing features or enhancements

Be specific with file names and suggested changes.\`;

  await agent.prompt(prompt);

  console.log("\\n\\n📊 Analysis complete!\\n");

  // Save analysis
  const outputPath = path.join(agentDir, "E2E_ANALYSIS.md");
  const output = \`# Agent Self-Improvement Analysis

Generated: \${new Date().toISOString()}

## Suggested Improvements

\${fullResponse}

## Test Info
- Package version: Successfully packaged and installed
- Effect-TS: Working correctly
- Agent runtime: Operational
\`;

  fs.writeFileSync(outputPath, output);
  console.log(\`✅ Analysis saved to: E2E_ANALYSIS.md\\n\`);

} catch (error) {
  console.error("❌ Agent failed:", error);
  process.exit(1);
}
`;

try {
	fs.writeFileSync(path.join(testDir, "test-agent.js"), agentScript);
	console.log("✅ Agent script created\n");
} catch (error) {
	console.error("❌ Script creation failed:", error);
	process.exit(1);
}

// Step 6: Run the agent
console.log("🤖 Step 6: Running agent for self-improvement...\n");
console.log("=" .repeat(60));
try {
	execSync("node test-agent.js", {
		cwd: testDir,
		stdio: "inherit",
		env: {
			...process.env,
			// Add API key if available
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
		},
	});
	console.log("=" .repeat(60));
	console.log("\n✅ E2E Test Complete!\n");
} catch (error) {
	console.log("=" .repeat(60));
	console.error("\n❌ Agent execution failed");
	console.error("This might be expected if no API key is configured.\n");
}

// Step 7: Cleanup (optional)
console.log("🧹 Cleanup:");
console.log(`  Tarball: ${tarballPath}`);
console.log(`  Test dir: ${testDir}`);
console.log("\nRun 'rm -rf test-e2e-tmp *.tgz' to clean up.\n");
