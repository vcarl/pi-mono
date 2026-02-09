/**
 * Tests for Effect-TS integration
 */

import { getModel } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { AgentEffect } from "../src/effect/agent-effect.js";
import type { AgentMessage } from "../src/types.js";

describe("Effect Integration", () => {
	it("should work with useEffect: false (original implementation)", { skip: true }, async () => {
		// Skipped: requires real API key for testing
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "You are a helpful assistant. Be concise.",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
			},
			useEffect: false, // Use original implementation
		});

		const events: string[] = [];
		agent.subscribe((event) => {
			events.push(event.type);
		});

		await agent.prompt("What is 2+2? Answer with just the number.");

		expect(events).toContain("agent_start");
		expect(events).toContain("message_start");
		expect(events).toContain("message_end");
		expect(events).toContain("agent_end");
		expect(agent.state.messages.length).toBeGreaterThan(0);
	});

	it("should work with useEffect: true (Effect implementation)", { skip: true }, async () => {
		// Skipped: requires real API key for testing
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "You are a helpful assistant. Be concise.",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
			},
			useEffect: true, // Use Effect implementation
		});

		const events: string[] = [];
		agent.subscribe((event) => {
			events.push(event.type);
		});

		await agent.prompt("What is 3+3? Answer with just the number.");

		expect(events).toContain("agent_start");
		expect(events).toContain("message_start");
		expect(events).toContain("message_end");
		expect(events).toContain("agent_end");
		expect(agent.state.messages.length).toBeGreaterThan(0);
	});

	it("should handle tool calls with Effect", { skip: true }, async () => {
		const calculateTool = {
			name: "calculate",
			label: "Calculate",
			description: "Perform a calculation",
			parameters: {
				type: "object" as const,
				properties: {
					expression: { type: "string" as const },
				},
				required: ["expression"],
			},
			execute: async (_id: string, params: { expression: string }) => {
				const result = eval(params.expression);
				return {
					content: [{ type: "text" as const, text: `Result: ${result}` }],
					details: { result },
				};
			},
		};

		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "You are a helpful assistant with a calculate tool.",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
				tools: [calculateTool],
			},
			useEffect: true,
		});

		await agent.prompt("What is 5 * 7?");

		const messages = agent.state.messages;
		const hasToolCall = messages.some(
			(m: AgentMessage) => m.role === "assistant" && m.content.some((c: any) => c.type === "toolCall"),
		);

		expect(hasToolCall).toBe(true);
	});

	it("should handle errors gracefully with Effect", async () => {
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "You are a helpful assistant.",
				model: {
					...getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
					api: "invalid" as any, // Force an error
				},
			},
			useEffect: true,
		});

		await agent.prompt("Test");

		const lastMessage = agent.state.messages[agent.state.messages.length - 1];
		expect(lastMessage.stopReason).toMatch(/error|aborted/);
		expect(agent.state.error).toBeDefined();
	});

	it("should create AgentEffect instance with Effect enabled", () => {
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "Test",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
			},
			useEffect: true,
		});

		expect(agent).toBeDefined();
		expect(agent.state).toBeDefined();
		expect(agent.state.systemPrompt).toBe("Test");
	});

	it("should create AgentEffect instance with Effect disabled (default)", () => {
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "Test",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
			},
		});

		expect(agent).toBeDefined();
		expect(agent.state).toBeDefined();
		expect(agent.state.systemPrompt).toBe("Test");
	});

	it("should support steering messages with Effect", { skip: true }, async () => {
		const agent = new AgentEffect({
			initialState: {
				systemPrompt: "You are a helpful assistant.",
				model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
			},
			useEffect: true,
			steeringMode: "one-at-a-time",
		});

		const promptPromise = agent.prompt("Count from 1 to 100");

		// Queue a steering message while processing
		setTimeout(() => {
			agent.steer({
				role: "user",
				content: [{ type: "text", text: "Actually, stop at 5" }],
				timestamp: Date.now(),
			});
		}, 100);

		await promptPromise;

		expect(agent.state.messages.length).toBeGreaterThan(0);
	});
});
