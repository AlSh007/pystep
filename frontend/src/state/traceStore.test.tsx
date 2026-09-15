import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { TraceProvider, useTrace } from "./traceStore"

function Probe() {
  const { state, runCode } = useTrace()
  return (
    <div>
      <button onClick={() => runCode("x = 1")}>run</button>
      <span>steps: {state.steps.length}</span>
      <span>loading: {String(state.isLoading)}</span>
    </div>
  )
}

describe("TraceProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [{ line: 1, event: "line", stack: [], stdout: "" }], error: null }),
      }),
    )
  })

  it("runCode fetches a trace and loads it into state", async () => {
    render(
      <TraceProvider>
        <Probe />
      </TraceProvider>,
    )
    fireEvent.click(screen.getByText("run"))
    expect(await screen.findByText("steps: 1")).toBeInTheDocument()
    expect(screen.getByText("loading: false")).toBeInTheDocument()
  })
})
