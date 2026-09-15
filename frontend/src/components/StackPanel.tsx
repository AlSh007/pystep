import type { Frame } from "../types/trace"
import { toRenderValue } from "../utils/decodeValue"
import { ValueCell } from "./ValueCell"

interface StackPanelProps {
  stack: Frame[]
}

export function StackPanel({ stack }: StackPanelProps) {
  if (stack.length === 0) {
    return <div className="stack-panel stack-panel--empty">No active frame</div>
  }

  return (
    <div className="stack-panel">
      {[...stack].reverse().map((frame, i) => (
        <div className="frame-card" key={`${frame.funcName}-${i}`}>
          <div className="frame-card__title">{frame.funcName}</div>
          <table className="frame-card__vars">
            <tbody>
              {Object.entries(frame.locals).map(([name, value]) => (
                <tr key={name}>
                  <td className="var-name">{name}</td>
                  <td className="var-value">
                    <ValueCell value={toRenderValue(value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
