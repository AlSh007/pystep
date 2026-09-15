import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StackPanel } from "./StackPanel"
import type { Frame } from "../types/trace"

describe("StackPanel", () => {
  it("shows a message when there is no active frame", () => {
    render(<StackPanel stack={[]} />)
    expect(screen.getByText("No active frame")).toBeInTheDocument()
  })

  it("renders frames innermost-first with primitive and ref values", () => {
    const stack: Frame[] = [
      { funcName: "<module>", locals: { x: 1 } },
      { funcName: "add", locals: { total: ["LIST", 7, 1, 2] } },
    ]
    render(<StackPanel stack={stack} />)

    const titles = screen.getAllByText(/^(<module>|add)$/)
    expect(titles[0]).toHaveTextContent("add")
    expect(titles[1]).toHaveTextContent("<module>")
    expect(screen.getByText("ref → #7")).toBeInTheDocument()
  })
})
