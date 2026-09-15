export type EncodedValue = null | boolean | number | string | EncodedCompound
// Index 1 is the numeric small-id for most tags (["LIST", id, ...]), but
// INSTANCE and FUNCTION carry a string field (className / name) there
// instead, with the id at index 2 — see backend/tracer/encoder.py.
export type EncodedCompound = [string, number | string, ...unknown[]]

export interface Frame {
  funcName: string
  locals: Record<string, EncodedValue>
}

export interface Step {
  line: number
  event: "call" | "line" | "return"
  stack: Frame[]
  stdout: string
}

export interface TraceResult {
  steps: Step[]
  error: string | null
}

export type RenderValue =
  | { kind: "primitive"; display: string }
  | { kind: "ref"; id: number }
  | { kind: "circular"; id: number }

export interface HeapItem {
  key: string
  value: RenderValue
}

export interface HeapObject {
  id: number
  kind: "LIST" | "TUPLE" | "SET" | "DICT" | "INSTANCE" | "FUNCTION" | "OTHER"
  label: string
  items: HeapItem[]
}
