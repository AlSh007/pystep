import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CodeEditor } from "./CodeEditor"

const MULTI_LINE_CODE = ["line1", "line2", "line3", "line4", "line5"].join("\n")

// The .cm-current-line class is applied by Decoration.line to the DOM node
// for the whole highlighted line, alongside CodeMirror's own .cm-line class.
function getHighlightedLineText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".cm-current-line")).map(
    (el) => el.textContent ?? "",
  )
}

describe("CodeEditor", () => {
  it("renders the given code", () => {
    const { container } = render(
      <CodeEditor code="x = 1" onChange={vi.fn()} currentLine={null} />,
    )
    expect(container.textContent).toContain("x = 1")
  })

  it("highlights the given currentLine on mount", () => {
    const { container } = render(
      <CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={2} />,
    )
    expect(getHighlightedLineText(container)).toEqual(["line2"])
  })

  it("moves the highlight to the new line on re-render", () => {
    const { container, rerender } = render(
      <CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={2} />,
    )
    expect(getHighlightedLineText(container)).toEqual(["line2"])

    rerender(<CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={4} />)
    expect(getHighlightedLineText(container)).toEqual(["line4"])
  })

  it("clears the highlight when currentLine goes back to null", () => {
    const { container, rerender } = render(
      <CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={3} />,
    )
    expect(getHighlightedLineText(container)).toEqual(["line3"])

    rerender(<CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={null} />)
    expect(getHighlightedLineText(container)).toEqual([])
  })

  it("does not highlight anything for an out-of-range currentLine", () => {
    const { container } = render(
      <CodeEditor code={MULTI_LINE_CODE} onChange={vi.fn()} currentLine={999} />,
    )
    expect(getHighlightedLineText(container)).toEqual([])
  })
})
