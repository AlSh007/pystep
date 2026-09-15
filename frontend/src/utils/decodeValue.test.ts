import { describe, expect, it } from "vitest"
import { toRenderValue, collectHeap } from "./decodeValue"
import type { Step } from "../types/trace"

describe("toRenderValue", () => {
  it("renders None/True/False/numbers/strings as primitives", () => {
    expect(toRenderValue(null)).toEqual({ kind: "primitive", display: "None" })
    expect(toRenderValue(true)).toEqual({ kind: "primitive", display: "True" })
    expect(toRenderValue(false)).toEqual({ kind: "primitive", display: "False" })
    expect(toRenderValue(42)).toEqual({ kind: "primitive", display: "42" })
    expect(toRenderValue("hi")).toEqual({ kind: "primitive", display: '"hi"' })
  })

  it("renders a compound value as a ref", () => {
    expect(toRenderValue(["LIST", 7, 1, 2])).toEqual({ kind: "ref", id: 7 })
  })

  it("renders a circular reference distinctly", () => {
    expect(toRenderValue(["CIRCULAR_REF", 3])).toEqual({ kind: "circular", id: 3 })
  })

  it("renders a function reference with its numeric id", () => {
    expect(toRenderValue(["FUNCTION", "add", 9])).toEqual({ kind: "ref", id: 9 })
  })
})

describe("collectHeap", () => {
  function stepWithLocals(locals: Record<string, unknown>): Step {
    return {
      line: 1,
      event: "line",
      stack: [{ funcName: "<module>", locals: locals as Step["stack"][number]["locals"] }],
      stdout: "",
    }
  }

  it("collects a top-level compound value", () => {
    const step = stepWithLocals({ a: ["LIST", 1, 10, 20] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
    expect(heap.get(1)).toEqual({
      id: 1,
      kind: "LIST",
      label: "list",
      items: [
        { key: "0", value: { kind: "primitive", display: "10" } },
        { key: "1", value: { kind: "primitive", display: "20" } },
      ],
    })
  })

  it("recurses into nested compounds and dedupes shared references", () => {
    const nested = ["LIST", 2, 1]
    const step = stepWithLocals({
      a: ["DICT", 1, [nested, 5]],
      b: nested,
    })
    const heap = collectHeap(step)

    expect(heap.size).toBe(2)
    expect(heap.has(1)).toBe(true)
    expect(heap.has(2)).toBe(true)
  })

  it("does not infinitely recurse into a circular reference", () => {
    const step = stepWithLocals({ a: ["LIST", 1, ["CIRCULAR_REF", 1]] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
  })

  it("collects an instance with the correct numeric id and class name label", () => {
    const step = stepWithLocals({ d: ["INSTANCE", "Dog", 5, ["name", "Rex"]] })
    const heap = collectHeap(step)

    expect(heap.has(5)).toBe(true)
    expect(heap.get(5)).toEqual({
      id: 5,
      kind: "INSTANCE",
      label: "Dog",
      items: [{ key: "name", value: { kind: "primitive", display: '"Rex"' } }],
    })
  })

  it("does not collapse two distinct instances of the same class", () => {
    const step = stepWithLocals({
      a: ["INSTANCE", "Dog", 5, ["name", "Rex"]],
      b: ["INSTANCE", "Dog", 7, ["name", "Fido"]],
    })
    const heap = collectHeap(step)

    expect(heap.size).toBe(2)
    expect(heap.has(5)).toBe(true)
    expect(heap.has(7)).toBe(true)
  })

  it("adds a function reference to the heap map", () => {
    const step = stepWithLocals({ f: ["FUNCTION", "factorial", 1] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
    expect(heap.get(1)).toEqual({
      id: 1,
      kind: "FUNCTION",
      label: "function factorial",
      items: [],
    })
  })
})
