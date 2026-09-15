import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CodeEditor } from "./CodeEditor"

describe("CodeEditor", () => {
  it("renders the given code", () => {
    const { container } = render(
      <CodeEditor code="x = 1" onChange={vi.fn()} currentLine={null} />,
    )
    expect(container.textContent).toContain("x = 1")
  })
})
