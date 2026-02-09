/**
 * Effect.Context services for dependency injection.
 * Each service encapsulates a capability needed by the agent loop.
 */

import type { Context, Message, Model, ThinkingBudgets } from "@mariozechner/pi-ai";
import { Effect, Context as EffectContext, Layer } from "effect";
import type { AgentEvent, AgentMessage, AgentTool, AgentToolUpdateCallback, StreamFn } from "../types.js";

/**
 * Service for streaming LLM responses
 */
export interface StreamService {
	readonly stream: (
		model: Model<any>,
		context: Context,
		options: {
			apiKey?: string;
			signal?: AbortSignal;
			reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
			sessionId?: string;
			thinkingBudgets?: ThinkingBudgets;
			maxRetryDelayMs?: number;
		},
	) => ReturnType<StreamFn>;
}

export const StreamService = EffectContext.GenericTag<StreamService>("@agent/StreamService");

export const makeStreamService = (streamFn: StreamFn): Layer.Layer<StreamService> =>
	Layer.succeed(
		StreamService,
		StreamService.of({
			stream: async (model, context, options) => {
				return await streamFn(model, context, options);
			},
		}),
	);

/**
 * Service for resolving API keys dynamically
 */
export interface ApiKeyService {
	readonly getApiKey: (provider: string) => Effect.Effect<string | undefined, never, never>;
}

export const ApiKeyService = EffectContext.GenericTag<ApiKeyService>("@agent/ApiKeyService");

export const makeApiKeyService = (
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined,
): Layer.Layer<ApiKeyService> =>
	Layer.succeed(
		ApiKeyService,
		ApiKeyService.of({
			getApiKey: (provider) =>
				Effect.promise(async () => {
					if (!getApiKey) return undefined;
					return await getApiKey(provider);
				}),
		}),
	);

/**
 * Service for message transformation and conversion
 */
export interface MessageTransformer {
	readonly convertToLlm: (messages: AgentMessage[]) => Effect.Effect<Message[], never, never>;
	readonly transformContext: (
		messages: AgentMessage[],
		signal?: AbortSignal,
	) => Effect.Effect<AgentMessage[], never, never>;
}

export const MessageTransformer = EffectContext.GenericTag<MessageTransformer>("@agent/MessageTransformer");

export const makeMessageTransformer = (
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>,
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>,
): Layer.Layer<MessageTransformer> =>
	Layer.succeed(
		MessageTransformer,
		MessageTransformer.of({
			convertToLlm: (messages) => Effect.promise(async () => await convertToLlm(messages)),
			transformContext: (messages, signal) =>
				Effect.promise(async () => {
					if (!transformContext) return messages;
					return await transformContext(messages, signal);
				}),
		}),
	);

/**
 * Service for executing tools
 */
export interface ToolExecutor {
	readonly validateArguments: (tool: AgentTool<any>, toolCall: any) => Effect.Effect<any, never, never>;
	readonly execute: (
		tool: AgentTool<any>,
		toolCallId: string,
		validatedArgs: any,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback,
	) => Effect.Effect<any, never, never>;
}

export const ToolExecutor = EffectContext.GenericTag<ToolExecutor>("@agent/ToolExecutor");

export const makeToolExecutor = (): Layer.Layer<ToolExecutor> =>
	Layer.succeed(
		ToolExecutor,
		ToolExecutor.of({
			validateArguments: (tool, toolCall) =>
				Effect.promise(async () => {
					const { validateToolArguments } = await import("@mariozechner/pi-ai");
					return validateToolArguments(tool, toolCall);
				}),
			execute: (tool, toolCallId, validatedArgs, signal, onUpdate) =>
				Effect.promise(async () => {
					return await tool.execute(toolCallId, validatedArgs, signal, onUpdate);
				}),
		}),
	);

/**
 * Service for emitting events to EventStream
 */
export interface EventEmitter {
	readonly emit: (event: AgentEvent) => Effect.Effect<void, never, never>;
}

export const EventEmitter = EffectContext.GenericTag<EventEmitter>("@agent/EventEmitter");

export const makeEventEmitter = (emitFn: (event: AgentEvent) => void): Layer.Layer<EventEmitter> =>
	Layer.succeed(
		EventEmitter,
		EventEmitter.of({
			emit: (event) => Effect.sync(() => emitFn(event)),
		}),
	);

/**
 * Service for session configuration
 */
export interface SessionConfig {
	readonly sessionId?: string;
	readonly thinkingBudgets?: ThinkingBudgets;
	readonly maxRetryDelayMs?: number;
}

export const SessionConfig = EffectContext.GenericTag<SessionConfig>("@agent/SessionConfig");

export const makeSessionConfig = (config: SessionConfig): Layer.Layer<SessionConfig> =>
	Layer.succeed(SessionConfig, SessionConfig.of(config));

/**
 * Service for steering message queue
 */
export interface SteeringQueue {
	readonly poll: () => Effect.Effect<AgentMessage[], never, never>;
}

export const SteeringQueue = EffectContext.GenericTag<SteeringQueue>("@agent/SteeringQueue");

export const makeSteeringQueue = (pollFn: () => Promise<AgentMessage[]> | AgentMessage[]): Layer.Layer<SteeringQueue> =>
	Layer.succeed(
		SteeringQueue,
		SteeringQueue.of({
			poll: () => Effect.promise(async () => await pollFn()),
		}),
	);

/**
 * Service for follow-up message queue
 */
export interface FollowUpQueue {
	readonly poll: () => Effect.Effect<AgentMessage[], never, never>;
}

export const FollowUpQueue = EffectContext.GenericTag<FollowUpQueue>("@agent/FollowUpQueue");

export const makeFollowUpQueue = (pollFn: () => Promise<AgentMessage[]> | AgentMessage[]): Layer.Layer<FollowUpQueue> =>
	Layer.succeed(
		FollowUpQueue,
		FollowUpQueue.of({
			poll: () => Effect.promise(async () => await pollFn()),
		}),
	);

/**
 * Resource management utilities for proper cleanup
 */

/**
 * Wraps an Effect with automatic cleanup using Scope.
 * This ensures resources are properly released even if the effect fails.
 *
 * @example
 * ```typescript
 * const program = withManagedResources(
 *   Effect.gen(function* () {
 *     const resource = yield* acquireResource
 *     yield* Effect.addFinalizer(() => Effect.sync(() => resource.close()))
 *     return yield* useResource(resource)
 *   })
 * )
 * ```
 */
export const withManagedResources = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
	Effect.scoped(
		Effect.gen(function* () {
			return yield* effect;
		}),
	);

/**
 * Creates a managed service with automatic cleanup.
 * The cleanup function is called when the scope closes.
 */
export const makeManagedService = <T>(
	acquire: Effect.Effect<T, never, never>,
	cleanup: (service: T) => Effect.Effect<void, never, never>,
): Effect.Effect<T, never, import("effect").Scope.Scope> =>
	Effect.gen(function* () {
		const service = yield* acquire;
		yield* Effect.addFinalizer(() => cleanup(service));
		return service;
	});
