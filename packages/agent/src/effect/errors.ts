/**
 * Tagged error types for Effect-based agent loop.
 * These provide type-safe, composable error handling.
 */

import { Data } from "effect";

/**
 * LLM streaming failure
 */
export class StreamError extends Data.TaggedError("StreamError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Stream aborted via AbortSignal
 */
export class StreamAbortedError extends Data.TaggedError("StreamAbortedError")<{
	readonly message: string;
}> {}

/**
 * Tool not found in tools array
 */
export class ToolNotFoundError extends Data.TaggedError("ToolNotFoundError")<{
	readonly toolName: string;
}> {}

/**
 * Tool argument validation failed
 */
export class ToolValidationError extends Data.TaggedError("ToolValidationError")<{
	readonly toolName: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Tool execution failed
 */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
	readonly toolName: string;
	readonly toolCallId: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Context transformation failed
 */
export class ContextTransformError extends Data.TaggedError("ContextTransformError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Message conversion failed
 */
export class MessageConversionError extends Data.TaggedError("MessageConversionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * API key resolution failed
 */
export class ApiKeyError extends Data.TaggedError("ApiKeyError")<{
	readonly provider: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Union of all agent loop errors
 */
export type AgentLoopError =
	| StreamError
	| StreamAbortedError
	| ToolNotFoundError
	| ToolValidationError
	| ToolExecutionError
	| ContextTransformError
	| MessageConversionError
	| ApiKeyError;
