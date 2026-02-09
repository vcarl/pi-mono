/**
 * Centralized Layer configuration for the agent system.
 * This module combines all service layers into reusable compositions.
 */

import { Layer } from "effect";
import type { AgentEvent, AgentMessage, StreamFn } from "../types.js";
import {
	type ApiKeyService,
	type EventEmitter,
	type FollowUpQueue,
	type MessageTransformer,
	makeApiKeyService,
	makeEventEmitter,
	makeFollowUpQueue,
	makeMessageTransformer,
	makeSessionConfig,
	makeSteeringQueue,
	makeStreamService,
	makeToolExecutor,
	type SessionConfig,
	type SteeringQueue,
	type StreamService,
	type ToolExecutor,
} from "./services.js";

/**
 * Options for creating the main agent layer
 */
export interface AgentLayerOptions {
	/** Stream function for LLM calls */
	streamFn: StreamFn;

	/** Optional API key resolver */
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;

	/** Message to LLM converter */
	convertToLlm: (messages: AgentMessage[]) => any[] | Promise<any[]>;

	/** Optional context transformer */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;

	/** Event emitter callback */
	emitEvent: (event: AgentEvent) => void;

	/** Steering queue poller */
	pollSteering: () => AgentMessage[] | Promise<AgentMessage[]>;

	/** Follow-up queue poller */
	pollFollowUp: () => AgentMessage[] | Promise<AgentMessage[]>;

	/** Session configuration */
	sessionConfig?: {
		sessionId?: string;
		thinkingBudgets?: any;
		maxRetryDelayMs?: number;
	};
}

/**
 * Creates the complete agent layer stack from options.
 * This is the main entry point for setting up all dependencies.
 */
export const makeAgentLayer = (
	options: AgentLayerOptions,
): Layer.Layer<
	| StreamService
	| ApiKeyService
	| MessageTransformer
	| ToolExecutor
	| EventEmitter
	| SteeringQueue
	| FollowUpQueue
	| SessionConfig
> =>
	Layer.mergeAll(
		makeStreamService(options.streamFn),
		makeApiKeyService(options.getApiKey),
		makeMessageTransformer(options.convertToLlm, options.transformContext),
		makeToolExecutor(),
		makeEventEmitter(options.emitEvent),
		makeSteeringQueue(options.pollSteering),
		makeFollowUpQueue(options.pollFollowUp),
		makeSessionConfig(options.sessionConfig ?? {}),
	);

/**
 * Minimal layer for testing - includes only essential services
 */
export const makeTestLayer = (
	streamFn: StreamFn,
	convertToLlm: (messages: AgentMessage[]) => any[],
): Layer.Layer<
	StreamService | MessageTransformer | ToolExecutor | EventEmitter | SteeringQueue | FollowUpQueue | SessionConfig
> =>
	Layer.mergeAll(
		makeStreamService(streamFn),
		makeMessageTransformer(convertToLlm),
		makeToolExecutor(),
		makeEventEmitter(() => {}), // No-op emitter for tests
		makeSteeringQueue(() => []), // No steering in tests
		makeFollowUpQueue(() => []), // No follow-up in tests
		makeSessionConfig({}),
	);
