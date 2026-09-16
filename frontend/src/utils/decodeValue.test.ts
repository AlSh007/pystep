import { describe, expect, it } from "vitest"
import { toRenderValue, collectHeap } from "./decodeValue"
import type { Step, TraceResult } from "../types/trace"
import realBackendTrace from "./__fixtures__/realBackendTrace.json"

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

  it("adds a class reference to the heap map, distinct from a function", () => {
    const step = stepWithLocals({ Dog: ["CLASS", "Dog", 1] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
    expect(heap.get(1)).toEqual({
      id: 1,
      kind: "CLASS",
      label: "class Dog",
      items: [],
    })
  })
})

describe("toRenderValue for a class reference", () => {
  it("renders a class reference with its numeric id", () => {
    expect(toRenderValue(["CLASS", "Dog", 1])).toEqual({ kind: "ref", id: 1 })
  })
})

// This fixture is REAL JSON captured directly from `run_code` in
// backend/tracer/runner.py (not a hand-written TypeScript fixture), by
// running the following source through the actual backend encoder:
//
//   class Node:
//       def __init__(self, value):
//           self.value = value
//           self.self_ref = self
//
//   def make_node(v):
//       return Node(v)
//
//   items = [1, 2]
//   mapping = {"a": 1, "b": 2}
//   n = make_node(5)
//   f = make_node
//
// Two of the most serious bugs in this project (INSTANCE/FUNCTION
// id-index confusion, and FUNCTION being excluded from the heap map)
// lived exactly in this backend<->frontend seam, and hand-written
// fixtures didn't catch them. This locks in the real wire shape.
describe("collectHeap against a real backend trace fixture", () => {
  const trace = realBackendTrace as unknown as TraceResult

  it("has no error and at least one step", () => {
    expect(trace.error).toBeNull()
    expect(trace.steps.length).toBeGreaterThan(0)
  })

  it("never throws while collecting the heap for any step", () => {
    for (const step of trace.steps) {
      expect(() => collectHeap(step)).not.toThrow()
    }
  })

  it("the final step's heap contains the list, dict, instance, and function with correct kind/label", () => {
    const finalStep = trace.steps[trace.steps.length - 1]
    const heap = collectHeap(finalStep)

    const byLabel = (label: string) => Array.from(heap.values()).find((o) => o.label === label)

    const list = byLabel("list")
    expect(list).toBeDefined()
    expect(list?.kind).toBe("LIST")
    expect(list?.items.map((i) => i.value)).toEqual([
      { kind: "primitive", display: "1" },
      { kind: "primitive", display: "2" },
    ])

    const dict = byLabel("dict")
    expect(dict).toBeDefined()
    expect(dict?.kind).toBe("DICT")
    expect(dict?.items).toEqual([
      { key: '"a"', value: { kind: "primitive", display: "1" } },
      { key: '"b"', value: { kind: "primitive", display: "2" } },
    ])

    const instance = byLabel("Node")
    expect(instance).toBeDefined()
    expect(instance?.kind).toBe("INSTANCE")
    const instanceAttrKeys = instance?.items.map((i) => i.key)
    expect(instanceAttrKeys).toEqual(["value", "self_ref"])
  })

  it("resolves the `f = make_node` reference to a FUNCTION heap entry (locks in the id-index fix)", () => {
    const finalStep = trace.steps[trace.steps.length - 1]
    const heap = collectHeap(finalStep)
    const locals = finalStep.stack[0].locals

    const fRenderValue = toRenderValue(locals.f)
    expect(fRenderValue.kind).toBe("ref")
    if (fRenderValue.kind !== "ref") throw new Error("expected a ref")

    const fHeapObject = heap.get(fRenderValue.id)
    expect(fHeapObject).toBeDefined()
    expect(fHeapObject?.kind).toBe("FUNCTION")
    expect(fHeapObject?.label).toBe("function make_node")

    // `f` is a plain alias of `make_node` (same underlying function object),
    // so they must resolve to the very same heap id, not two separate ones.
    const makeNodeRenderValue = toRenderValue(locals.make_node)
    expect(makeNodeRenderValue).toEqual(fRenderValue)
  })

  it("the self-referential instance does not cause infinite recursion, and the heap has the exact expected size", () => {
    const finalStep = trace.steps[trace.steps.length - 1]
    const heap = collectHeap(finalStep)

    // Node (class, itself callable -> FUNCTION), make_node (function),
    // items (list), mapping (dict), n (instance) = 5 distinct heap
    // objects. `f` aliases make_node's id, so it adds no new entry.
    expect(heap.size).toBe(5)
  })
})
