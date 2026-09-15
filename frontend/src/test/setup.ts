import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"

// This project doesn't set `test.globals: true` in vite.config.ts, so
// @testing-library/react's own auto-cleanup (which only registers itself
// when a global `afterEach` exists) never fires. Without this, multiple
// `render()` calls within one test file leave prior renders' DOM mounted,
// making `screen.getByText`-style queries ambiguous or wrong across tests.
afterEach(() => {
  cleanup()
})

// jsdom does not implement ResizeObserver; the heap-arrow overlay (Task 15)
// uses it to redraw on layout changes, so stub it for all component tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom has no layout engine, so Range.prototype.getBoundingClientRect and
// getClientRects are simply unimplemented (undefined). CodeMirror 6's view
// layer (used by CodeEditor, Task 10) calls these during every measure pass
// to position the cursor/selection layers, which throws
// "getClientRects is not a function" and prevents the editor from mounting
// under jsdom. Stub both with zero-sized rects so CodeMirror can measure
// without crashing; this is the standard workaround for testing
// CodeMirror/ProseMirror-based editors under jsdom.
if (typeof Range !== "undefined") {
  const zeroRect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return this
    },
  }
  Range.prototype.getBoundingClientRect = () => zeroRect
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList
}
