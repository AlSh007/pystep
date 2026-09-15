import type { RenderValue } from "../types/trace"

export function ValueCell({ value }: { value: RenderValue }) {
  if (value.kind === "primitive") {
    return <span className="value-cell value-cell--primitive">{value.display}</span>
  }
  if (value.kind === "circular") {
    return <span className="value-cell value-cell--circular">↺ #{value.id}</span>
  }
  return (
    <span className="value-cell value-cell--ref" data-ref-source={value.id}>
      ref → #{value.id}
    </span>
  )
}
