/**
 * Streaming utilities to convert between EventStream and Effect.Stream.
 */

import type { AssistantMessage, AssistantMessageEvent } from "@mariozechner/pi-ai";
import { Effect, Queue, Stream } from "effect";
import type { AgentEvent } from "../types.js";

/**
 * Converts an EventStream (from pi-ai) to an Effect.Stream
 * Uses a Queue as a bridge to handle async iteration
 */
export const convertEventStream = <T>(
	eventStream: AsyncIterable<T>,
): Effect.Effect<Stream.Stream<T, never, never>, never, never> =>
	Effect.gen(function* () {
		const queue = yield* Queue.unbounded<T>();

		// Start consuming the event stream in the background
		Effect.runFork(
			Effect.promise(async () => {
				try {
					for await (const event of eventStream) {
						await Effect.runPromise(Queue.offer(queue, event));
					}
				} finally {
					await Effect.runPromise(Queue.shutdown(queue));
				}
			}),
		);

		return Stream.fromQueue(queue);
	});

/**
 * Accumulates partial assistant messages from streaming events
 */
export const accumulatePartialMessage = (
	stream: Stream.Stream<AssistantMessageEvent, never, never>,
): Stream.Stream<AssistantMessage, never, never> =>
	Stream.mapAccum(stream, null as AssistantMessage | null, (partial, event) => {
		switch (event.type) {
			case "start":
				return [event.partial, event.partial];

			case "text_start":
			case "text_delta":
			case "text_end":
			case "thinking_start":
			case "thinking_delta":
			case "thinking_end":
			case "toolcall_start":
			case "toolcall_delta":
			case "toolcall_end":
				return [event.partial, event.partial];

			case "done":
			case "error":
				return [null, partial!];

			default:
				return [partial, partial!];
		}
	});

/**
 * Emits events to an EventStream subscriber
 */
export const emitToEventStream = (emitFn: (event: AgentEvent) => void) => (event: AgentEvent) =>
	Effect.sync(() => emitFn(event));
