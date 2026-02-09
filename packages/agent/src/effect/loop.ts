/**
 * Effect-based implementation of the agent loop.
 * This is a rewrite of agent-loop.ts using Effect for better error handling,
 * composability, and resource management.
 */

import type { AssistantMessage, Context, ToolResultMessage } from "@mariozechner/pi-ai";
import { Effect, Ref } from "effect";
import type { AgentContext, AgentMessage, AgentTool, AgentToolResult } from "../types.js";
import { type StreamError, type ToolExecutionError, ToolNotFoundError, type ToolValidationError } from "./errors.js";
import {
	EventEmitter,
	FollowUpQueue,
	MessageTransformer,
	SessionConfig,
	SteeringQueue,
	StreamService,
	ToolExecutor,
} from "./services.js";
import {
	addMessages,
	completeFirstTurn,
	createInitialState,
	type LoopState,
	setPendingSteeringMessages,
	updateMessage,
} from "./state.js";

/**
 * Main entry point for the Effect-based agent loop.
 * Replaces agentLoop and agentLoopContinue from agent-loop.ts.
 */
export const runAgentLoop = (
	initialContext: AgentContext & { model: any },
	initialPrompts: AgentMessage[],
	options?: {
		apiKey?: string;
		signal?: AbortSignal;
		reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
	},
): Effect.Effect<
	AgentMessage[],
	StreamError | ToolNotFoundError | ToolValidationError | ToolExecutionError,
	StreamService | MessageTransformer | ToolExecutor | EventEmitter | SteeringQueue | FollowUpQueue | SessionConfig
> =>
	Effect.gen(function* () {
		const eventEmitter = yield* EventEmitter;
		const steeringQueue = yield* SteeringQueue;

		// Emit agent_start event
		yield* eventEmitter.emit({ type: "agent_start" });
		yield* eventEmitter.emit({ type: "turn_start" });

		// Emit initial prompts
		for (const prompt of initialPrompts) {
			yield* eventEmitter.emit({ type: "message_start", message: prompt });
			yield* eventEmitter.emit({ type: "message_end", message: prompt });
		}

		// Check for steering messages at start
		const pendingMessages = yield* steeringQueue.poll();

		// Create initial state
		const stateRef = yield* Ref.make<LoopState>(
			createInitialState(initialContext.messages, initialPrompts, pendingMessages),
		);

		// Run the outer loop
		yield* runOuterLoop(stateRef, initialContext, options);

		// Get final state and emit agent_end
		const finalState = yield* Ref.get(stateRef);
		yield* eventEmitter.emit({ type: "agent_end", messages: finalState.newMessages });

		return finalState.newMessages;
	});

/**
 * Outer loop: continues when queued follow-up messages arrive after agent would stop
 */
const runOuterLoop = (
	stateRef: Ref.Ref<LoopState>,
	initialContext: AgentContext & { model: any },
	options?: {
		apiKey?: string;
		signal?: AbortSignal;
		reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
	},
): Effect.Effect<
	void,
	StreamError | ToolNotFoundError | ToolValidationError | ToolExecutionError,
	StreamService | MessageTransformer | ToolExecutor | EventEmitter | SteeringQueue | FollowUpQueue | SessionConfig
> =>
	Effect.gen(function* () {
		const followUpQueue = yield* FollowUpQueue;

		while (true) {
			// Run the inner loop
			yield* runInnerLoop(stateRef, initialContext, options);

			// Check for follow-up messages
			const followUpMessages = yield* followUpQueue.poll();
			if (followUpMessages.length > 0) {
				// Set as pending so inner loop processes them
				yield* Ref.update(stateRef, (state) => setPendingSteeringMessages(state, followUpMessages));
				continue;
			}

			// No more messages, exit
			break;
		}
	});

/**
 * Inner loop: process tool calls and steering messages
 */
const runInnerLoop = (
	stateRef: Ref.Ref<LoopState>,
	initialContext: AgentContext & { model: any },
	options?: {
		apiKey?: string;
		signal?: AbortSignal;
		reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
	},
): Effect.Effect<
	void,
	StreamError | ToolNotFoundError | ToolValidationError | ToolExecutionError,
	StreamService | MessageTransformer | ToolExecutor | EventEmitter | SteeringQueue | SessionConfig
> =>
	Effect.gen(function* () {
		const eventEmitter = yield* EventEmitter;
		const steeringQueue = yield* SteeringQueue;

		let hasMoreToolCalls = true;
		let steeringAfterTools: AgentMessage[] | null = null;

		while (true) {
			const state = yield* Ref.get(stateRef);

			if (hasMoreToolCalls || state.pendingSteeringMessages.length > 0) {
				// Emit turn_start if not first turn
				if (!state.isFirstTurn) {
					yield* eventEmitter.emit({ type: "turn_start" });
				} else {
					yield* Ref.update(stateRef, completeFirstTurn);
				}

				// Process pending messages
				if (state.pendingSteeringMessages.length > 0) {
					for (const message of state.pendingSteeringMessages) {
						yield* eventEmitter.emit({ type: "message_start", message });
						yield* eventEmitter.emit({ type: "message_end", message });
					}
					yield* Ref.update(stateRef, (s) => addMessages(s, s.pendingSteeringMessages));
					yield* Ref.update(stateRef, (s) => setPendingSteeringMessages(s, []));
				}

				// Stream assistant response
				const updatedState = yield* Ref.get(stateRef);
				const currentContext = {
					...initialContext,
					messages: updatedState.messages,
				};

				const message = yield* streamAssistantResponse(stateRef, currentContext, options);

				// Add message to state
				yield* Ref.update(stateRef, (s) => addMessages(s, [message]));

				// Check for errors or abort
				if (message.stopReason === "error" || message.stopReason === "aborted") {
					yield* eventEmitter.emit({ type: "turn_end", message, toolResults: [] });
					return;
				}

				// Check for tool calls
				const toolCalls = message.content.filter((c) => c.type === "toolCall");
				hasMoreToolCalls = toolCalls.length > 0;

				const toolResults: ToolResultMessage[] = [];
				if (hasMoreToolCalls) {
					const toolExecution = yield* executeToolCalls(initialContext.tools, message, options?.signal);
					toolResults.push(...toolExecution.toolResults);
					steeringAfterTools = toolExecution.steeringMessages ?? null;

					// Add tool results to state
					yield* Ref.update(stateRef, (s) => addMessages(s, toolResults));
				}

				yield* eventEmitter.emit({ type: "turn_end", message, toolResults });

				// Get steering messages after turn completes
				if (steeringAfterTools && steeringAfterTools.length > 0) {
					yield* Ref.update(stateRef, (s) => setPendingSteeringMessages(s, steeringAfterTools!));
					steeringAfterTools = null;
				} else {
					const steering = yield* steeringQueue.poll();
					yield* Ref.update(stateRef, (s) => setPendingSteeringMessages(s, steering));
				}
			} else {
				// No more work to do
				break;
			}
		}
	});

/**
 * Stream an assistant response from the LLM
 */
const streamAssistantResponse = (
	stateRef: Ref.Ref<LoopState>,
	context: AgentContext & { model: any },
	options?: {
		apiKey?: string;
		signal?: AbortSignal;
		reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
	},
): Effect.Effect<AssistantMessage, StreamError, StreamService | MessageTransformer | EventEmitter | SessionConfig> =>
	Effect.gen(function* () {
		const streamService = yield* StreamService;
		const messageTransformer = yield* MessageTransformer;
		const eventEmitter = yield* EventEmitter;
		const sessionConfig = yield* SessionConfig;

		// Apply context transform
		const transformedMessages = yield* messageTransformer.transformContext(context.messages, options?.signal);

		// Convert to LLM messages
		const llmMessages = yield* messageTransformer.convertToLlm(transformedMessages);

		// Build LLM context
		const llmContext: Context = {
			systemPrompt: context.systemPrompt,
			messages: llmMessages,
			tools: context.tools,
		};

		// Stream from LLM
		const model = (context as any).model;
		const response = yield* Effect.promise(async () => {
			return await streamService.stream(model, llmContext, {
				apiKey: options?.apiKey,
				signal: options?.signal,
				reasoning: options?.reasoning,
				sessionId: sessionConfig.sessionId,
				thinkingBudgets: sessionConfig.thinkingBudgets,
				maxRetryDelayMs: sessionConfig.maxRetryDelayMs,
			});
		});

		let partialMessage: AssistantMessage | null = null;
		let addedPartial = false;
		const state = yield* Ref.get(stateRef);
		const messageIndex = state.messages.length;

		// Process streaming events - must use Effect.promise for async iteration
		return yield* Effect.promise(async () => {
			for await (const event of response) {
				switch (event.type) {
					case "start":
						partialMessage = event.partial;
						addedPartial = true;
						await Effect.runPromise(Ref.update(stateRef, (s) => addMessages(s, [partialMessage!])));
						await Effect.runPromise(eventEmitter.emit({ type: "message_start", message: { ...partialMessage } }));
						break;

					case "text_start":
					case "text_delta":
					case "text_end":
					case "thinking_start":
					case "thinking_delta":
					case "thinking_end":
					case "toolcall_start":
					case "toolcall_delta":
					case "toolcall_end":
						if (partialMessage) {
							partialMessage = event.partial;
							await Effect.runPromise(
								Ref.update(stateRef, (s) => updateMessage(s, messageIndex, partialMessage!)),
							);
							await Effect.runPromise(
								eventEmitter.emit({
									type: "message_update",
									assistantMessageEvent: event,
									message: { ...partialMessage },
								}),
							);
						}
						break;

					case "done":
					case "error": {
						const finalMessage = await response.result();
						if (addedPartial) {
							await Effect.runPromise(Ref.update(stateRef, (s) => updateMessage(s, messageIndex, finalMessage)));
						} else {
							await Effect.runPromise(Ref.update(stateRef, (s) => addMessages(s, [finalMessage])));
							await Effect.runPromise(
								eventEmitter.emit({ type: "message_start", message: { ...finalMessage } }),
							);
						}
						await Effect.runPromise(eventEmitter.emit({ type: "message_end", message: finalMessage }));
						return finalMessage;
					}
				}
			}

			return await response.result();
		});
	});

/**
 * Execute tool calls from an assistant message
 */
const executeToolCalls = (
	tools: AgentTool<any>[] | undefined,
	assistantMessage: AssistantMessage,
	signal?: AbortSignal,
): Effect.Effect<
	{ toolResults: ToolResultMessage[]; steeringMessages?: AgentMessage[] },
	ToolNotFoundError | ToolValidationError | ToolExecutionError,
	ToolExecutor | EventEmitter | SteeringQueue
> =>
	Effect.gen(function* () {
		const toolExecutor = yield* ToolExecutor;
		const eventEmitter = yield* EventEmitter;
		const steeringQueue = yield* SteeringQueue;

		const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
		const results: ToolResultMessage[] = [];
		let steeringMessages: AgentMessage[] | undefined;

		for (let index = 0; index < toolCalls.length; index++) {
			const toolCall = toolCalls[index];
			const tool = tools?.find((t) => t.name === toolCall.name);

			yield* eventEmitter.emit({
				type: "tool_execution_start",
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				args: toolCall.arguments,
			});

			let result: AgentToolResult<any>;
			let isError = false;

			try {
				if (!tool) {
					throw new ToolNotFoundError({ toolName: toolCall.name });
				}

				const validatedArgs = yield* toolExecutor.validateArguments(tool, toolCall as any);

				result = yield* toolExecutor.execute(tool, toolCall.id, validatedArgs, signal, (partialResult) => {
					Effect.runSync(
						eventEmitter.emit({
							type: "tool_execution_update",
							toolCallId: toolCall.id,
							toolName: toolCall.name,
							args: toolCall.arguments,
							partialResult,
						}),
					);
				});
			} catch (e) {
				result = {
					content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
					details: {},
				};
				isError = true;
			}

			yield* eventEmitter.emit({
				type: "tool_execution_end",
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				result,
				isError,
			});

			const toolResultMessage: ToolResultMessage = {
				role: "toolResult",
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				content: result.content,
				details: result.details,
				isError,
				timestamp: Date.now(),
			};

			results.push(toolResultMessage);
			yield* eventEmitter.emit({ type: "message_start", message: toolResultMessage });
			yield* eventEmitter.emit({ type: "message_end", message: toolResultMessage });

			// Check for steering messages - skip remaining tools if user interrupted
			const steering = yield* steeringQueue.poll();
			if (steering.length > 0) {
				steeringMessages = steering;
				const remainingCalls = toolCalls.slice(index + 1);
				for (const skipped of remainingCalls) {
					const skipResult = skipToolCall(skipped);
					results.push(skipResult);
					yield* eventEmitter.emit({ type: "message_start", message: skipResult });
					yield* eventEmitter.emit({ type: "message_end", message: skipResult });
				}
				break;
			}
		}

		return { toolResults: results, steeringMessages };
	});

/**
 * Create a tool result for a skipped tool call
 */
function skipToolCall(toolCall: Extract<AssistantMessage["content"][number], { type: "toolCall" }>): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		content: [{ type: "text", text: "Skipped due to queued user message." }],
		details: {},
		isError: true,
		timestamp: Date.now(),
	};
}
