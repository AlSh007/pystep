import { useEffect, useState, type RefObject } from "react"

interface Arrow {
  id: string
  targetId: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface HeapArrowsProps {
  containerRef: RefObject<HTMLElement | null>
  redrawKey: unknown
}

function applySelectionClasses(container: HTMLElement, selectedId: string | null) {
  container.querySelectorAll(".is-selected").forEach((el) => el.classList.remove("is-selected"))
  if (selectedId != null) {
    container
      .querySelectorAll(`[data-ref-source="${selectedId}"], [data-heap-target="${selectedId}"]`)
      .forEach((el) => el.classList.add("is-selected"))
  }
}

export function HeapArrows({ containerRef, redrawKey }: HeapArrowsProps) {
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function recompute() {
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const sources = Array.from(container.querySelectorAll<HTMLElement>("[data-ref-source]"))
      const next: Arrow[] = []

      sources.forEach((source, i) => {
        const targetId = source.dataset.refSource ?? ""
        const target = container.querySelector<HTMLElement>(`[data-heap-target="${targetId}"]`)
        if (!target) return

        const sourceRect = source.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        next.push({
          id: `${targetId}-${i}`,
          targetId,
          x1: sourceRect.right - containerRect.left,
          y1: sourceRect.top + sourceRect.height / 2 - containerRect.top,
          x2: targetRect.left - containerRect.left,
          y2: targetRect.top + targetRect.height / 2 - containerRect.top,
        })
      })

      setArrows(next)
    }

    function handleClick(event: MouseEvent) {
      const clicked = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-ref-source], [data-heap-target]",
      )
      const id = clicked?.dataset.refSource ?? clicked?.dataset.heapTarget ?? null
      setSelectedId((prev) => (prev === id ? null : id))
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    // .layout__stack and .layout__heap (the scrollable panels inside this
    // container) both have overflow: auto, and scroll events don't bubble.
    // A capturing-phase listener on the container still receives scroll
    // events fired on any descendant scrollable element, so this catches
    // scrolling in either panel without needing to know their selectors.
    container.addEventListener("scroll", recompute, { capture: true, passive: true })
    container.addEventListener("click", handleClick)
    return () => {
      observer.disconnect()
      container.removeEventListener("scroll", recompute, { capture: true })
      container.removeEventListener("click", handleClick)
    }
  }, [containerRef, redrawKey])

  // Re-applied whenever the selection changes, or whenever the underlying
  // DOM is rebuilt (arrows recomputing is our signal for that, since a step
  // change remounts the stack/heap panels and drops any classes we set).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    applySelectionClasses(container, selectedId)
  }, [containerRef, selectedId, arrows])

  return (
    <svg
      className="heap-arrows"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker
          id="heap-arrow-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="heap-arrow-head" />
        </marker>
        <marker
          id="heap-arrow-head-selected"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="heap-arrow-head heap-arrow-head--selected" />
        </marker>
      </defs>
      {arrows.map((arrow) => {
        const isSelected = arrow.targetId === selectedId
        return (
          <line
            key={arrow.id}
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            className={isSelected ? "heap-arrow-line heap-arrow-line--selected" : "heap-arrow-line"}
            markerEnd={isSelected ? "url(#heap-arrow-head-selected)" : "url(#heap-arrow-head)"}
          />
        )
      })}
    </svg>
  )
}
