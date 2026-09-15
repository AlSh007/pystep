import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HeapPanel } from "./HeapPanel"
import type { HeapObject } from "../types/trace"

describe("HeapPanel", () => {
  it("shows a message when the heap is empty", () => {
    render(<HeapPanel heap={new Map()} />)
    expect(screen.getByText("No heap objects")).toBeInTheDocument()
  })

  it("renders a heap object with its id, label, and items", () => {
    const heap = new Map<number, HeapObject>([
      [
        3,
        {
          id: 3,
          kind: "LIST",
          label: "list",
          items: [
            { key: "0", value: { kind: "primitive", display: "1" } },
            { key: "1", value: { kind: "ref", id: 9 } },
          ],
        },
      ],
    ])
    render(<HeapPanel heap={heap} />)

    const header = screen.getByText("#3 list")
    expect(header).toBeInTheDocument()

    // Item key "1" and item value display "1" collide as plain text, so we
    // scope assertions to each row rather than using an ambiguous getByText.
    const rows = screen.getAllByRole("row")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("0")
    expect(rows[0]).toHaveTextContent("1")
    expect(rows[1]).toHaveTextContent("1")
    expect(rows[1]).toHaveTextContent("ref → #9")
  })

  it("marks each heap object's header with data-heap-target for the object's id", () => {
    const heap = new Map<number, HeapObject>([
      [
        3,
        {
          id: 3,
          kind: "LIST",
          label: "list",
          items: [],
        },
      ],
      [
        9,
        {
          id: 9,
          kind: "DICT",
          label: "dict",
          items: [],
        },
      ],
    ])
    render(<HeapPanel heap={heap} />)

    expect(screen.getByText("#3 list")).toHaveAttribute("data-heap-target", "3")
    expect(screen.getByText("#9 dict")).toHaveAttribute("data-heap-target", "9")
  })
})
