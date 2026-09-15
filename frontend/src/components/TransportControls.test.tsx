import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it, afterEach } from "vitest"
import { TraceProvider, useTrace } from "../state/traceStore"
import { TransportControls } from "./TransportControls"
import type { Step } from "../types/trace"

const FIXTURE_STEPS: Step[] = [
  { line: 1, event: "line", stack: [], stdout: "" },
  { line: 2, event: "line", stack: [], stdout: "" },
  { line: 3, event: "line", stack: [], stdout: "" },
]

function Seed() {
  const { dispatch } = useTrace()
  useEffect(() => {
    dispatch({ type: "RUN_SUCCESS", result: { steps: FIXTURE_STEPS, error: null } })
  }, [dispatch])
  return null
}

function renderWithSeed() {
  return render(
    <TraceProvider>
      <Seed />
      <TransportControls />
    </TraceProvider>,
  )
}

describe("TransportControls", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows the current step position", () => {
    renderWithSeed()
    expect(screen.getByText("1 / 3")).toBeInTheDocument()
  })

  it("advances to the next step on click", () => {
    renderWithSeed()
    fireEvent.click(screen.getByText("⏩"))
    expect(screen.getByText("2 / 3")).toBeInTheDocument()
  })

  it("jumps to the last step", () => {
    renderWithSeed()
    fireEvent.click(screen.getByText("⏭"))
    expect(screen.getByText("3 / 3")).toBeInTheDocument()
  })
})
