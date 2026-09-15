import type { EncodedValue, Step, RenderValue, HeapObject, HeapItem } from "../types/trace"

function isCompound(value: EncodedValue): value is [string, number, ...unknown[]] {
  return Array.isArray(value)
}

function formatPrimitive(value: null | boolean | number | string): string {
  if (value === null) return "None"
  if (value === true) return "True"
  if (value === false) return "False"
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

export function toRenderValue(value: EncodedValue): RenderValue {
  if (!isCompound(value)) {
    return { kind: "primitive", display: formatPrimitive(value) }
  }
  const [tag, id] = value
  if (tag === "CIRCULAR_REF") {
    return { kind: "circular", id: id as number }
  }
  return { kind: "ref", id: id as number }
}

function toHeapObject(value: [string, number, ...unknown[]]): HeapObject {
  const [tag, id, ...rest] = value

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    const items: HeapItem[] = (rest as EncodedValue[]).map((v, i) => ({
      key: String(i),
      value: toRenderValue(v),
    }))
    return { id, kind: tag, label: tag.toLowerCase(), items }
  }

  if (tag === "DICT") {
    const items: HeapItem[] = (rest as [EncodedValue, EncodedValue][]).map(([k, v]) => ({
      key: formatPrimitive(k as null | boolean | number | string),
      value: toRenderValue(v),
    }))
    return { id, kind: "DICT", label: "dict", items }
  }

  if (tag === "INSTANCE") {
    const [className, ...attrs] = rest as [string, ...[string, EncodedValue][]]
    const items: HeapItem[] = attrs.map(([k, v]) => ({ key: k, value: toRenderValue(v) }))
    return { id, kind: "INSTANCE", label: className, items }
  }

  if (tag === "FUNCTION") {
    const [name] = rest as [string]
    return { id, kind: "FUNCTION", label: `function ${name}`, items: [] }
  }

  return { id, kind: "OTHER", label: String(rest[rest.length - 1] ?? tag), items: [] }
}

function rawChildren(value: [string, number, ...unknown[]]): EncodedValue[] {
  const [tag, , ...rest] = value

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    return rest as EncodedValue[]
  }
  if (tag === "DICT") {
    return (rest as [EncodedValue, EncodedValue][]).flat()
  }
  if (tag === "INSTANCE") {
    const [, ...attrs] = rest as [string, ...[string, EncodedValue][]]
    return attrs.map(([, v]) => v)
  }
  return []
}

export function collectHeap(step: Step): Map<number, HeapObject> {
  const heap = new Map<number, HeapObject>()

  function visit(value: EncodedValue): void {
    if (!isCompound(value)) return
    const [tag, id] = value
    if (tag === "CIRCULAR_REF" || tag === "FUNCTION") return
    if (heap.has(id as number)) return

    heap.set(id as number, toHeapObject(value as [string, number, ...unknown[]]))
    for (const child of rawChildren(value as [string, number, ...unknown[]])) {
      visit(child)
    }
  }

  for (const frame of step.stack) {
    for (const value of Object.values(frame.locals)) {
      visit(value)
    }
  }

  return heap
}
