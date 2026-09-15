import type { EncodedValue, EncodedCompound, Step, RenderValue, HeapObject, HeapItem } from "../types/trace"

function isCompound(value: EncodedValue): value is EncodedCompound {
  return Array.isArray(value)
}

function formatPrimitive(value: null | boolean | number | string): string {
  if (value === null) return "None"
  if (value === true) return "True"
  if (value === false) return "False"
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

// The backend encoder (backend/tracer/encoder.py) puts the numeric small-id
// at index 1 for most compound tags (["LIST", id, ...items]), but INSTANCE
// and FUNCTION carry an extra string field (className / name) before the id:
//   ["INSTANCE", className, id, [attr, val], ...]
//   ["FUNCTION", name, id]
// This helper centralizes that distinction so no call site has to assume
// index 1 is always the id.
function getCompoundId(value: EncodedCompound): number {
  const tag = value[0]
  if (tag === "INSTANCE" || tag === "FUNCTION") {
    return value[2] as number
  }
  return value[1] as number
}

export function toRenderValue(value: EncodedValue): RenderValue {
  if (!isCompound(value)) {
    return { kind: "primitive", display: formatPrimitive(value) }
  }
  const tag = value[0]
  const id = getCompoundId(value)
  if (tag === "CIRCULAR_REF") {
    return { kind: "circular", id }
  }
  return { kind: "ref", id }
}

function toHeapObject(value: EncodedCompound): HeapObject {
  const tag = value[0]
  const id = getCompoundId(value)

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    const rest = value.slice(2) as EncodedValue[]
    const items: HeapItem[] = rest.map((v, i) => ({
      key: String(i),
      value: toRenderValue(v),
    }))
    return { id, kind: tag, label: tag.toLowerCase(), items }
  }

  if (tag === "DICT") {
    const rest = value.slice(2) as [EncodedValue, EncodedValue][]
    const items: HeapItem[] = rest.map(([k, v]) => ({
      key: formatPrimitive(k as null | boolean | number | string),
      value: toRenderValue(v),
    }))
    return { id, kind: "DICT", label: "dict", items }
  }

  if (tag === "INSTANCE") {
    const className = value[1] as string
    const attrs = value.slice(3) as [string, EncodedValue][]
    const items: HeapItem[] = attrs.map(([k, v]) => ({ key: k, value: toRenderValue(v) }))
    return { id, kind: "INSTANCE", label: className, items }
  }

  if (tag === "FUNCTION") {
    const name = value[1] as string
    return { id, kind: "FUNCTION", label: `function ${name}`, items: [] }
  }

  const rest = value.slice(2)
  return { id, kind: "OTHER", label: String(rest[rest.length - 1] ?? tag), items: [] }
}

function rawChildren(value: EncodedCompound): EncodedValue[] {
  const tag = value[0]

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    return value.slice(2) as EncodedValue[]
  }
  if (tag === "DICT") {
    return (value.slice(2) as [EncodedValue, EncodedValue][]).flat()
  }
  if (tag === "INSTANCE") {
    const attrs = value.slice(3) as [string, EncodedValue][]
    return attrs.map(([, v]) => v)
  }
  return []
}

export function collectHeap(step: Step): Map<number, HeapObject> {
  const heap = new Map<number, HeapObject>()

  function visit(value: EncodedValue): void {
    if (!isCompound(value)) return
    const tag = value[0]
    if (tag === "CIRCULAR_REF" || tag === "FUNCTION") return
    const id = getCompoundId(value)
    if (heap.has(id)) return

    heap.set(id, toHeapObject(value))
    for (const child of rawChildren(value)) {
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
