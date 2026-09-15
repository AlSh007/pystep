import { render } from "@testing-library/react"
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
})
