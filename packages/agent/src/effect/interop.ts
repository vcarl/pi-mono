/**
 * Interop utilities to bridge pi-ai functions with Effect.
 * These functions convert promise-based pi-ai APIs to Effect-based APIs.
 */

import type { Context, Model, ThinkingBudgets } from "@mariozechner/pi-ai";
import { Effect } from "effect";
import type { StreamFn } from "../types.js";
import { StreamAbortedError, StreamError } from "./errors.js";

/**
 * Wraps streamSimple to return an Effect that handles errors
 */
export const wrapStreamSimple = (
	streamFn: StreamFn,
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
): Effect.Effect<Awaited<ReturnType<StreamFn>>, StreamError, never> =>
	Effect.tryPromise({
		try: async () => await streamFn(model, context, options),
		catch: (error) =>
			new StreamError({
				message: error instanceof Error ? error.message : String(error),
				cause: error,
			}),
	});

/**
 * Creates an Effect that fails when AbortSignal fires
 */
export const fromAbortSignal = (signal?: AbortSignal): Effect.Effect<never, StreamAbortedError, never> =>
	Effect.async<never, StreamAbortedError>((resume) => {
		if (!signal) return;

		if (signal.aborted) {
			resume(Effect.fail(new StreamAbortedError({ message: "Request was aborted" })));
			return;
		}

		const handler = () => {
			resume(Effect.fail(new StreamAbortedError({ message: "Request was aborted" })));
		};

		signal.addEventListener("abort", handler, { once: true });

		return Effect.sync(() => {
			signal.removeEventListener("abort", handler);
		});
	});

/**
 * Races an Effect with an abort signal
 */
export const withAbortSignal = <A, E, R>(
	effect: Effect.Effect<A, E, R>,
	signal?: AbortSignal,
): Effect.Effect<A, E | StreamAbortedError, R> => {
	if (!signal) return effect;
	return Effect.race(effect, fromAbortSignal(signal));
};

/**
 * Wraps tool validation to return an Effect
 */
export const wrapValidateToolArguments = <T>(
	validateFn: (tool: T, toolCall: any) => any,
	tool: T,
	toolCall: any,
): Effect.Effect<any, never, never> =>
	Effect.sync(() => {
		try {
			return validateFn(tool, toolCall);
		} catch {
			return {};
		}
	});

/**
 * Wraps tool execution to return an Effect with interruption support
 */
export const wrapToolExecute = <T>(
	executeFn: (
		toolCallId: string,
		params: any,
		signal?: AbortSignal,
		onUpdate?: (partialResult: any) => void,
	) => Promise<T>,
	toolCallId: string,
	params: any,
	signal?: AbortSignal,
	onUpdate?: (partialResult: any) => void,
): Effect.Effect<T, never, never> =>
	Effect.promise(async () => {
		try {
			return await executeFn(toolCallId, params, signal, onUpdate);
		} catch {
			return {
				content: [{ type: "text" as const, text: "Tool execution failed" }],
				details: {},
			} as T;
		}
	});
