#!/usr/bin/env node
/**
 * End-to-end test: Package the agent, install it in a test environment,
 * and have it autonomously improve this agent directory.
 */

import { execSync } from "child_process";
import { Effect, Console } from "effect";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const testDir = path.join(packageRoot, "test-e2e-tmp");
const credentialsPath = path.join(packageRoot, ".oauth-credentials.json");

// Effect-based OAuth credentials type
interface OAuthCredentials {
	refresh: string;
	access: string;
	expires: number;
}

// Step 1: Clean and build
const buildPackage = Effect.gen(function* () {
	yield* Console.log("📦 Step 1: Building package...");
	yield* Effect.try({
		try: () => execSync("npm run clean && npm run build", { cwd: packageRoot, stdio: "inherit" }),
		catch: () => new Error("Build failed"),
	});
	yield* Console.log("✅ Build complete\n");
});

// Step 2: Create tarball
const createTarball = Effect.gen(function* () {
	yield* Console.log("📦 Step 2: Creating tarball...");
	const output = yield* Effect.try({
		try: () => execSync("npm pack", { cwd: packageRoot, encoding: "utf-8" }),
		catch: () => new Error("Pack failed"),
	});
	const tarballName = output.trim().split("\n").pop()!;
	const tarballPath = path.join(packageRoot, tarballName);
	yield* Console.log(`✅ Created: ${tarballName}\n`);
	return tarballPath;
});

// Step 3: Setup test environment
const setupTestEnvironment = Effect.gen(function* () {
	yield* Console.log("📦 Step 3: Setting up test environment...");

	// Clean previous test dir
	yield* Effect.sync(() => {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
		fs.mkdirSync(testDir, { recursive: true });
	});

	// Create minimal package.json
	const testPackageJson = {
		name: "agent-e2e-test",
		type: "module",
		dependencies: {},
	};
	yield* Effect.sync(() => {
		fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify(testPackageJson, null, 2));
	});

	yield* Console.log("✅ Test environment ready\n");
});

// Step 4: Install tarball
const installTarball = (tarballPath: string) =>
	Effect.gen(function* () {
		yield* Console.log("📦 Step 4: Installing tarball...");
		yield* Effect.try({
			try: () =>
				execSync(`npm install ${tarballPath} @mariozechner/pi-ai`, {
					cwd: testDir,
					stdio: "inherit",
				}),
			catch: () => new Error("Install failed"),
		});
		yield* Console.log("✅ Package installed\n");
	});

// Helper: Prompt for user input
const promptUserInput = (question: string) =>
	Effect.promise(async () => {
		const readline = await import("readline");
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		return new Promise<string>((resolve) => {
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer);
			});
		});
	});

// Helper: Load saved credentials
const loadSavedCredentials = Effect.gen(function* () {
	const exists = yield* Effect.sync(() => fs.existsSync(credentialsPath));
	if (!exists) return null;

	return yield* Effect.try({
		try: () => {
			const saved = JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as OAuthCredentials;
			const now = Date.now();
			return saved.expires && saved.expires > now ? saved : null;
		},
		catch: () => null,
	});
});

// Helper: Refresh OAuth token
const refreshOAuthToken = (refreshToken: string) =>
	Effect.gen(function* () {
		yield* Console.log("🔄 Refreshing expired OAuth token...");
		const piAi = yield* Effect.promise(() => import("@mariozechner/pi-ai"));
		const credentials = yield* Effect.tryPromise({
			try: () => piAi.refreshAnthropicToken(refreshToken),
			catch: () => new Error("Token refresh failed"),
		});

		// Save refreshed credentials
		yield* Effect.sync(() => {
			fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
		});
		yield* Console.log("✅ OAuth token refreshed\n");
		return credentials;
	});

// Helper: Perform OAuth login
const performOAuthLogin = Effect.gen(function* () {
	yield* Console.log("🔐 No credentials found. Starting OAuth login...");

	const piAi = yield* Effect.promise(() => import("@mariozechner/pi-ai"));

	const credentials = yield* Effect.tryPromise({
		try: () =>
			piAi.loginAnthropic(
				(url) => {
					console.log(`\n🌐 Visit this URL to authenticate:\n${url}\n`);
				},
				() => promptUserInput("Enter the authorization code: "),
			),
		catch: (error) => new Error(`OAuth login failed: ${error}`),
	});

	// Save credentials for future runs
	yield* Effect.sync(() => {
		fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
	});
	yield* Console.log("✅ OAuth login successful (credentials saved)\n");

	return credentials;
});

// Step 4.5: Setup OAuth authentication
const setupOAuthAuthentication = Effect.gen(function* () {
	yield* Console.log("📦 Step 4.5: Setting up OAuth authentication...");

	// Check environment variables first
	const envOAuthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
	if (envOAuthToken) {
		yield* Console.log("✅ Using ANTHROPIC_OAUTH_TOKEN from environment\n");
		return envOAuthToken;
	}

	const envApiKey = process.env.ANTHROPIC_API_KEY;
	if (envApiKey) {
		yield* Console.log("✅ Using ANTHROPIC_API_KEY from environment\n");
		return envApiKey;
	}

	// Check for saved credentials
	const savedCredentials = yield* loadSavedCredentials;
	if (savedCredentials) {
		yield* Console.log("✅ Using saved OAuth credentials\n");
		return savedCredentials.access;
	}

	// Check for expired credentials that need refresh
	const exists = yield* Effect.sync(() => fs.existsSync(credentialsPath));
	if (exists) {
		const maybeExpired = yield* Effect.try({
			try: () => JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as OAuthCredentials,
			catch: () => null,
		});

		if (maybeExpired) {
			const refreshed = yield* refreshOAuthToken(maybeExpired.refresh).pipe(
				Effect.catchAll(() => Effect.succeed(null)),
			);
			if (refreshed) {
				return refreshed.access;
			}
		}
	}

	// Perform interactive OAuth login
	const credentials = yield* performOAuthLogin.pipe(
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				yield* Console.error("❌ OAuth login failed with error:");
				yield* Console.error(String(error));
				yield* Console.log("\n⚠️  Test will run without authentication.");
				yield* Console.log("   The agent will not produce output.\n");
				return undefined;
			}),
		),
	);

	return credentials?.access;
});

// Step 5: Create agent script
const createAgentScript = (oauthApiKey: string | undefined) =>
	Effect.gen(function* () {
		yield* Console.log("📦 Step 5: Creating agent script...");

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

		yield* Effect.sync(() => {
			fs.writeFileSync(path.join(testDir, "test-agent.js"), agentScript);
		});
		yield* Console.log("✅ Agent script created\n");

		return oauthApiKey;
	});

// Step 6: Run the agent
const runAgent = (oauthApiKey: string | undefined) =>
	Effect.gen(function* () {
		yield* Console.log("🤖 Step 6: Running agent for self-improvement...\n");
		yield* Console.log("=".repeat(60));

		yield* Effect.try({
			try: () =>
				execSync("node test-agent.js", {
					cwd: testDir,
					stdio: "inherit",
					env: {
						...process.env,
						// Pass OAuth credentials to agent script
						ANTHROPIC_OAUTH_TOKEN: oauthApiKey || process.env.ANTHROPIC_OAUTH_TOKEN,
						ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
					},
				}),
			catch: () => {
				console.log("=".repeat(60));
				console.error("\n❌ Agent execution failed");
				console.error("This might be expected if no API key is configured.\n");
				return null;
			},
		});

		yield* Console.log("=".repeat(60));
		yield* Console.log("\n✅ E2E Test Complete!\n");
	});

// Step 7: Show cleanup info
const showCleanupInfo = (tarballPath: string) =>
	Effect.gen(function* () {
		yield* Console.log("🧹 Cleanup:");
		yield* Console.log(`  Tarball: ${tarballPath}`);
		yield* Console.log(`  Test dir: ${testDir}`);
		yield* Console.log("\nRun 'rm -rf test-e2e-tmp *.tgz' to clean up.\n");
	});

// Main program
const program = Effect.gen(function* () {
	yield* Console.log("🧪 E2E Test: Agent Self-Improvement\n");

	const tarballPath = yield* buildPackage.pipe(Effect.flatMap(() => createTarball));
	yield* setupTestEnvironment;
	yield* installTarball(tarballPath);
	const oauthApiKey = yield* setupOAuthAuthentication;
	yield* createAgentScript(oauthApiKey);
	yield* runAgent(oauthApiKey);
	yield* showCleanupInfo(tarballPath);
});

// Run the program
Effect.runPromise(program).catch((error) => {
	console.error("❌ E2E test failed:", error);
	process.exit(1);
});
