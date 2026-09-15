import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react"
import {
  traceReducer,
  initialTraceState,
  type TraceState,
  type TraceAction,
} from "./traceReducer"
import { traceCode } from "../api/traceClient"

interface TraceContextValue {
  state: TraceState
  dispatch: React.Dispatch<TraceAction>
  runCode: (code: string) => Promise<void>
}

const TraceContext = createContext<TraceContextValue | null>(null)

const STEP_INTERVAL_MS = 700

export function TraceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(traceReducer, initialTraceState)

  useEffect(() => {
    if (!state.isPlaying) return
    const id = setInterval(() => dispatch({ type: "TICK" }), STEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state.isPlaying])

  async function runCode(code: string) {
    dispatch({ type: "RUN_START" })
    try {
      const result = await traceCode(code)
      dispatch({ type: "RUN_SUCCESS", result })
    } catch (err) {
      dispatch({ type: "RUN_ERROR", message: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  return (
    <TraceContext.Provider value={{ state, dispatch, runCode }}>
      {children}
    </TraceContext.Provider>
  )
}

export function useTrace(): TraceContextValue {
  const ctx = useContext(TraceContext)
  if (!ctx) throw new Error("useTrace must be used within a TraceProvider")
  return ctx
}
