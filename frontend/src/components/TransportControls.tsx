import { useTrace } from "../state/traceStore"

export function TransportControls() {
  const { state, dispatch } = useTrace()
  const total = state.steps.length

  return (
    <div className="transport-controls">
      <button onClick={() => dispatch({ type: "FIRST" })} disabled={total === 0}>⏮</button>
      <button onClick={() => dispatch({ type: "PREV" })} disabled={total === 0}>⏪</button>
      <button
        onClick={() => dispatch({ type: state.isPlaying ? "PAUSE" : "PLAY" })}
        disabled={total === 0}
      >
        {state.isPlaying ? "⏸" : "▶️"}
      </button>
      <button onClick={() => dispatch({ type: "NEXT" })} disabled={total === 0}>⏩</button>
      <button onClick={() => dispatch({ type: "LAST" })} disabled={total === 0}>⏭</button>
      <input
        type="range"
        min={0}
        max={Math.max(total - 1, 0)}
        value={state.currentStepIndex}
        disabled={total === 0}
        onChange={(e) => dispatch({ type: "SCRUB_TO", index: Number(e.target.value) })}
      />
      <span className="transport-controls__counter">
        {total === 0 ? "0 / 0" : `${state.currentStepIndex + 1} / ${total}`}
      </span>
    </div>
  )
}
