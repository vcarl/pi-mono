# Effect-TS Integration

This directory contains an experimental Effect-TS integration for the agent package. Effect provides type-safe error handling, composable retry logic, and better resource management.

## Current Status

**Phase 1: Infrastructure ✅ COMPLETE**
- ✅ Error type system with tagged errors
- ✅ Service layer with dependency injection
- ✅ Interop utilities for pi-ai bridge
- ✅ Streaming utilities
- ✅ State management with immutable Ref
- ✅ Core loop rewrite

**Phase 2: Integration ✅ COMPLETE**
- ✅ `AgentEffect` class with optional Effect usage
- ✅ Full Effect loop implementation working
- ✅ Runtime composition and lifecycle management
- ✅ Comprehensive Effect-specific tests
- ✅ All 25 tests passing

## Usage

### Basic Usage (Backward Compatible)

The `AgentEffect` class is a drop-in replacement for `Agent` with an optional `useEffect` flag:

```typescript
import { AgentEffect } from "@mariozechner/pi-agent-core";

// Without Effect (default, uses original implementation)
const agent = new AgentEffect({
  initialState: {
    systemPrompt: "You are helpful",
    model: getModel("openai", "gpt-4o-mini")
  }
});

// With Effect (experimental)
const effectAgent = new AgentEffect({
  initialState: {
    systemPrompt: "You are helpful",
    model: getModel("openai", "gpt-4o-mini")
  },
  useEffect: true  // Enable Effect-based execution
});

// API is identical
effectAgent.subscribe(event => console.log(event.type));
await effectAgent.prompt("Hello!");
```

### Effect Error Types

The integration provides typed errors for better error handling:

```typescript
import type { AgentLoopError } from "@mariozechner/pi-agent-core";

// AgentLoopError is a union of:
// - StreamError - LLM streaming failures
// - StreamAbortedError - Cancellation via AbortSignal
// - ToolNotFoundError - Tool lookup failures
// - ToolValidationError - Tool argument validation errors
// - ToolExecutionError - Tool execution failures
// - ContextTransformError - Context transformation errors
// - MessageConversionError - Message conversion errors
// - ApiKeyError - API key resolution errors
```

## Architecture

### Services (Dependency Injection)

The Effect integration uses `Effect.Context` for dependency injection:

- `StreamService` - Wraps LLM streaming function
- `ApiKeyService` - Wraps dynamic API key resolution
- `MessageTransformer` - Wraps message conversion and context transformation
- `ToolExecutor` - Wraps tool validation and execution
- `EventEmitter` - Bridges Effect → EventStream emission
- `SessionConfig` - Holds session configuration
- `SteeringQueue` - Provides steering message polling
- `FollowUpQueue` - Provides follow-up message polling

### Immutable State

State is managed using `Ref` for functional updates:

```typescript
interface LoopState {
  messages: AgentMessage[]
  newMessages: AgentMessage[]
  pendingSteeringMessages: AgentMessage[]
  isFirstTurn: boolean
}
```

### Error Handling

Tagged errors provide type-safe error handling:

```typescript
Effect.gen(function* () {
  const result = yield* runAgentLoop(context, prompts)
  return result
}).pipe(
  Effect.catchTag("StreamError", (error) => {
    console.error("Stream failed:", error.message)
    return Effect.succeed([])
  }),
  Effect.catchTag("ToolNotFoundError", (error) => {
    console.error("Tool not found:", error.toolName)
    return Effect.succeed([])
  })
)
```

## Roadmap

### Near-term (Phase 2 completion)
- [ ] Complete Effect loop implementation
- [ ] Remove fallback to original implementation
- [ ] Add Effect-specific unit tests
- [ ] Add comprehensive integration tests

### Future Enhancements (Phase 3)
- [ ] Add retry logic with `Effect.retry` and exponential backoff
- [ ] Add timeout support with `Effect.timeout`
- [ ] Expose pure Effect API for Effect-native usage
- [ ] Migrate `proxy.ts` to use Effect
- [ ] Add telemetry with `Effect.Telemetry`
- [ ] Performance benchmarking vs original implementation

## Contributing

The Effect integration is experimental. To contribute:

1. Keep `Agent` class unchanged for backward compatibility
2. All Effect code lives in `src/effect/` directory
3. `AgentEffect` should maintain same public API as `Agent`
4. Add tests for new Effect-specific features

## Migration Guide

For existing users, there are two migration paths:

### Path 1: No Changes (Recommended for now)

Continue using `Agent` class. No changes needed.

### Path 2: Opt-in to Effect (Experimental)

Replace `Agent` with `AgentEffect` and set `useEffect: true`:

```typescript
// Before
import { Agent } from "@mariozechner/pi-agent-core";
const agent = new Agent(options);

// After
import { AgentEffect } from "@mariozechner/pi-agent-core";
const agent = new AgentEffect({ ...options, useEffect: true });
```

Public API remains identical.

## License

Same as parent package (MIT)
