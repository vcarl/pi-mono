/**
 * Immutable state management using Effect.Ref.
 */

import type { AgentMessage } from "../types.js";

/**
 * Immutable loop state
 */
export interface LoopState {
	readonly messages: AgentMessage[];
	readonly newMessages: AgentMessage[];
	readonly pendingSteeringMessages: AgentMessage[];
	readonly isFirstTurn: boolean;
}

/**
 * Creates initial loop state
 */
export const createInitialState = (
	initialMessages: AgentMessage[],
	initialPrompts: AgentMessage[],
	pendingMessages: AgentMessage[],
): LoopState => ({
	messages: [...initialMessages, ...initialPrompts],
	newMessages: [...initialPrompts],
	pendingSteeringMessages: pendingMessages,
	isFirstTurn: true,
});

/**
 * Updates messages in state
 */
export const addMessages = (state: LoopState, messages: AgentMessage[]): LoopState => ({
	...state,
	messages: [...state.messages, ...messages],
	newMessages: [...state.newMessages, ...messages],
});

/**
 * Updates a message at a specific index
 */
export const updateMessage = (state: LoopState, index: number, message: AgentMessage): LoopState => {
	const newMessages = [...state.messages];
	newMessages[index] = message;
	return {
		...state,
		messages: newMessages,
	};
};

/**
 * Sets pending steering messages
 */
export const setPendingSteeringMessages = (state: LoopState, messages: AgentMessage[]): LoopState => ({
	...state,
	pendingSteeringMessages: messages,
});

/**
 * Marks first turn as completed
 */
export const completeFirstTurn = (state: LoopState): LoopState => ({
	...state,
	isFirstTurn: false,
});
