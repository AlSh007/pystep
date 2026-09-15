import type { HeapObject } from "../types/trace"
import { ValueCell } from "./ValueCell"

interface HeapPanelProps {
  heap: Map<number, HeapObject>
}

export function HeapPanel({ heap }: HeapPanelProps) {
  const objects = Array.from(heap.values())

  if (objects.length === 0) {
    return <div className="heap-panel heap-panel--empty">No heap objects</div>
  }

  return (
    <div className="heap-panel">
      {objects.map((obj) => (
        <div className="heap-box" key={obj.id}>
          <div className="heap-box__header" data-heap-target={obj.id}>
            #{obj.id} {obj.label}
          </div>
          {obj.items.length > 0 && (
            <table className="heap-box__items">
              <tbody>
                {obj.items.map((item, i) => (
                  <tr key={`${item.key}-${i}`}>
                    <td className="heap-item-key">{item.key}</td>
                    <td className="heap-item-value">
                      <ValueCell value={item.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
