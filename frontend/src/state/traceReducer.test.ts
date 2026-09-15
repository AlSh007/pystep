import { describe, expect, it } from "vitest"
import { traceReducer, type TraceState } from "./traceReducer"
import type { Step } from "../types/trace"

const STEPS: Step[] = [
  { line: 1, event: "line", stack: [], stdout: "" },
  { line: 2, event: "line", stack: [], stdout: "" },
  { line: 3, event: "line", stack: [], stdout: "" },
]

const initial: TraceState = {
  steps: [],
  error: null,
  currentStepIndex: 0,
  isPlaying: false,
  isLoading: false,
}

const loaded: TraceState = { ...initial, steps: STEPS }

describe("traceReducer", () => {
  it("RUN_START clears previous state and sets isLoading", () => {
    const result = traceReducer(loaded, { type: "RUN_START" })
    expect(result).toEqual({ ...initial, isLoading: true })
  })

  it("RUN_SUCCESS loads steps and resets to the first one", () => {
    const result = traceReducer(
      { ...initial, isLoading: true },
      { type: "RUN_SUCCESS", result: { steps: STEPS, error: null } },
    )
    expect(result.steps).toBe(STEPS)
    expect(result.currentStepIndex).toBe(0)
    expect(result.isLoading).toBe(false)
    expect(result.error).toBeNull()
  })

  it("NEXT and PREV move within bounds", () => {
    let state = { ...loaded, currentStepIndex: 0 }
    state = traceReducer(state, { type: "NEXT" })
    expect(state.currentStepIndex).toBe(1)
    state = traceReducer(state, { type: "PREV" })
    expect(state.currentStepIndex).toBe(0)
    state = traceReducer(state, { type: "PREV" })
    expect(state.currentStepIndex).toBe(0) // clamped, not negative
  })

  it("LAST and FIRST jump to the ends", () => {
    expect(traceReducer(loaded, { type: "LAST" }).currentStepIndex).toBe(2)
    expect(
      traceReducer({ ...loaded, currentStepIndex: 2 }, { type: "FIRST" }).currentStepIndex,
    ).toBe(0)
  })

  it("SCRUB_TO clamps to valid range", () => {
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: 1 }).currentStepIndex).toBe(1)
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: 99 }).currentStepIndex).toBe(2)
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: -5 }).currentStepIndex).toBe(0)
  })

  it("PLAY/PAUSE toggle isPlaying", () => {
    expect(traceReducer(loaded, { type: "PLAY" }).isPlaying).toBe(true)
    expect(traceReducer({ ...loaded, isPlaying: true }, { type: "PAUSE" }).isPlaying).toBe(false)
  })

  it("TICK advances one step and stops playing at the end", () => {
    const midway = { ...loaded, currentStepIndex: 1, isPlaying: true }
    const advanced = traceReducer(midway, { type: "TICK" })
    expect(advanced.currentStepIndex).toBe(2)
    expect(advanced.isPlaying).toBe(true)

    const atEnd = traceReducer(advanced, { type: "TICK" })
    expect(atEnd.currentStepIndex).toBe(2)
    expect(atEnd.isPlaying).toBe(false)
  })
})
