/**
 * Example usage of Effect-TS integration.
 * This file demonstrates how to use the AgentEffect class with Effect.
 */

import { getModel } from "@mariozechner/pi-ai";
import { AgentEffect } from "./agent-effect.js";

/**
 * Example 1: Basic usage without Effect (backward compatible)
 */
export async function exampleBasicUsage() {
	const agent = new AgentEffect({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model: getModel("openai", "gpt-4o-mini"),
		},
		// useEffect: false (default)
	});

	// Subscribe to events
	agent.subscribe((event) => {
		console.log("Event:", event.type);
	});

	// Send a prompt
	await agent.prompt("Hello! What's 2+2?");

	// Get the last message
	const lastMessage = agent.state.messages.at(-1);
	console.log("Response:", lastMessage);
}

/**
 * Example 2: Usage with Effect enabled (experimental)
 */
export async function exampleWithEffect() {
	const agent = new AgentEffect({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model: getModel("openai", "gpt-4o-mini"),
		},
		useEffect: true, // Enable Effect-based execution
	});

	// Subscribe to events (same API)
	agent.subscribe((event) => {
		console.log("Event:", event.type);
		if (event.type === "message_end") {
			console.log("Message completed:", event.message);
		}
	});

	// Send a prompt (same API)
	await agent.prompt("Hello! Can you help me with a coding question?");

	console.log("Total messages:", agent.state.messages.length);
}

/**
 * Example 3: Error handling with Effect integration
 */
export async function exampleErrorHandling() {
	const agent = new AgentEffect({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model: getModel("openai", "gpt-4o-mini"),
		},
		useEffect: true,
	});

	try {
		await agent.prompt("Test prompt");
	} catch (error) {
		// Errors are still thrown as regular errors for now
		// Future enhancement: expose Effect-based error handling
		console.error("Error occurred:", error);
	}
}

/**
 * Example 4: Dynamic API key resolution
 */
export async function exampleDynamicApiKey() {
	let apiKeyRefreshCount = 0;

	const agent = new AgentEffect({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model: getModel("openai", "gpt-4o-mini"),
		},
		useEffect: true,
		getApiKey: async (provider) => {
			// Simulates fetching a fresh API key for each request
			apiKeyRefreshCount++;
			console.log(`Fetching API key for ${provider} (call #${apiKeyRefreshCount})`);
			return process.env.OPENAI_API_KEY;
		},
	});

	await agent.prompt("First prompt");
	await agent.prompt("Second prompt");

	console.log("API key was refreshed", apiKeyRefreshCount, "times");
}

/**
 * Example 5: Steering and follow-up messages
 */
export async function exampleSteeringMessages() {
	const agent = new AgentEffect({
		initialState: {
			systemPrompt: "You are a helpful assistant that can use tools.",
			model: getModel("openai", "gpt-4o-mini"),
		},
		useEffect: true,
		steeringMode: "one-at-a-time",
	});

	// Start a long-running task
	const promptPromise = agent.prompt("Please count from 1 to 100");

	// After a short delay, interrupt with a steering message
	setTimeout(() => {
		agent.steer({
			role: "user",
			content: [{ type: "text", text: "Actually, stop at 10 instead" }],
			timestamp: Date.now(),
		});
	}, 100);

	await promptPromise;

	console.log("Final message count:", agent.state.messages.length);
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log("Running Effect integration examples...\n");

	console.log("=== Example 1: Basic Usage ===");
	await exampleBasicUsage();

	console.log("\n=== Example 2: With Effect ===");
	await exampleWithEffect();

	console.log("\n=== Example 3: Error Handling ===");
	await exampleErrorHandling();

	console.log("\n=== Example 4: Dynamic API Key ===");
	await exampleDynamicApiKey();

	console.log("\n=== Example 5: Steering Messages ===");
	await exampleSteeringMessages();
}
