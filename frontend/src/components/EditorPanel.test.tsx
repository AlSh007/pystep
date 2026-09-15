import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { TraceProvider } from "../state/traceStore"
import { EditorPanel } from "./EditorPanel"

describe("EditorPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [{ line: 1, event: "line", stack: [], stdout: "" }], error: null }),
      }),
    )
  })

  it("runs the code and shows a loading state while the request is in flight", async () => {
    render(
      <TraceProvider>
        <EditorPanel />
      </TraceProvider>,
    )
    fireEvent.click(screen.getByText("Run"))
    expect(await screen.findByText("Running…")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Run")).toBeInTheDocument())
  })
})
