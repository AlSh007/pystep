export type EncodedValue = null | boolean | number | string | EncodedCompound
export type EncodedCompound = [string, number, ...unknown[]]

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
