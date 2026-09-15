import "@testing-library/jest-dom/vitest"

// jsdom does not implement ResizeObserver; the heap-arrow overlay (Task 15)
// uses it to redraw on layout changes, so stub it for all component tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
