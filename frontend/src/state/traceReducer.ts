import type { Step, TraceResult } from "../types/trace"

export interface TraceState {
  steps: Step[]
  error: string | null
  currentStepIndex: number
  isPlaying: boolean
  isLoading: boolean
}

export type TraceAction =
  | { type: "RUN_START" }
  | { type: "RUN_SUCCESS"; result: TraceResult }
  | { type: "RUN_ERROR"; message: string }
  | { type: "FIRST" }
  | { type: "PREV" }
  | { type: "NEXT" }
  | { type: "LAST" }
  | { type: "SCRUB_TO"; index: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TICK" }

export const initialTraceState: TraceState = {
  steps: [],
  error: null,
  currentStepIndex: 0,
  isPlaying: false,
  isLoading: false,
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0
  return Math.max(0, Math.min(index, length - 1))
}

export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case "RUN_START":
      return { ...initialTraceState, isLoading: true }
    case "RUN_SUCCESS":
      return {
        ...state,
        isLoading: false,
        steps: action.result.steps,
        error: action.result.error,
        currentStepIndex: 0,
        isPlaying: false,
      }
    case "RUN_ERROR":
      return { ...initialTraceState, error: action.message }
    case "FIRST":
      return { ...state, currentStepIndex: 0, isPlaying: false }
    case "PREV":
      return {
        ...state,
        currentStepIndex: clampIndex(state.currentStepIndex - 1, state.steps.length),
        isPlaying: false,
      }
    case "NEXT":
      return {
        ...state,
        currentStepIndex: clampIndex(state.currentStepIndex + 1, state.steps.length),
        isPlaying: false,
      }
    case "LAST":
      return {
        ...state,
        currentStepIndex: clampIndex(state.steps.length - 1, state.steps.length),
        isPlaying: false,
      }
    case "SCRUB_TO":
      return {
        ...state,
        currentStepIndex: clampIndex(action.index, state.steps.length),
        isPlaying: false,
      }
    case "PLAY":
      return { ...state, isPlaying: true }
    case "PAUSE":
      return { ...state, isPlaying: false }
    case "TICK": {
      const next = state.currentStepIndex + 1
      if (next >= state.steps.length) {
        return { ...state, isPlaying: false }
      }
      return { ...state, currentStepIndex: next }
    }
    default:
      return state
  }
}
