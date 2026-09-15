import { fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { HeapArrows } from "./HeapArrows"

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <span data-ref-source="3">ref</span>
      <div data-heap-target="3">box</div>
      <HeapArrows containerRef={ref} redrawKey={0} />
    </div>
  )
}

describe("HeapArrows", () => {
  it("draws one line between a ref source and its heap target", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.refSource) {
        return { top: 10, left: 10, right: 30, bottom: 20, width: 20, height: 10 } as DOMRect
      }
      if (this.dataset.heapTarget) {
        return { top: 50, left: 100, right: 150, bottom: 70, width: 50, height: 20 } as DOMRect
      }
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })

    const { container } = render(<Harness />)
    const lines = container.querySelectorAll("line")

    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute("x1")).toBe("30")
    expect(lines[0].getAttribute("y1")).toBe("15")
    expect(lines[0].getAttribute("x2")).toBe("100")
    expect(lines[0].getAttribute("y2")).toBe("60")
  })

  it("recomputes arrow coordinates when a nested scrollable panel scrolls", () => {
    let sourceRect = { top: 10, left: 10, right: 30, bottom: 20, width: 20, height: 10 } as DOMRect
    const targetRect = { top: 50, left: 100, right: 150, bottom: 70, width: 50, height: 20 } as DOMRect

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.refSource) return sourceRect
      if (this.dataset.heapTarget) return targetRect
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })

    function ScrollHarness() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <div ref={ref} style={{ position: "relative" }}>
          <div data-testid="scrollable-panel" style={{ overflow: "auto" }}>
            <span data-ref-source="3">ref</span>
          </div>
          <div data-heap-target="3">box</div>
          <HeapArrows containerRef={ref} redrawKey={0} />
        </div>
      )
    }

    const { container, getByTestId } = render(<ScrollHarness />)
    const lines = container.querySelectorAll("line")
    expect(lines[0].getAttribute("x1")).toBe("30")

    // Simulate the source having moved because the nested panel scrolled.
    sourceRect = { top: 200, left: 210, right: 230, bottom: 210, width: 20, height: 10 } as DOMRect

    const scrollable = getByTestId("scrollable-panel")
    fireEvent.scroll(scrollable)

    const updatedLines = container.querySelectorAll("line")
    expect(updatedLines[0].getAttribute("x1")).toBe("230")
    expect(updatedLines[0].getAttribute("y1")).toBe("205")
  })
})
