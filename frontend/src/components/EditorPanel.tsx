import { useState } from "react"
import { CodeEditor } from "./CodeEditor"
import { useTrace } from "../state/traceStore"

const DEFAULT_CODE = "x = 1\ny = 2\nprint(x + y)\n"

export function EditorPanel() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const { state, runCode } = useTrace()
  const currentStep = state.steps[state.currentStepIndex]

  return (
    <div className="editor-panel">
      <div className="editor-panel__code">
        <CodeEditor code={code} onChange={setCode} currentLine={currentStep?.line ?? null} />
      </div>
      <button
        className="editor-panel__run"
        onClick={() => runCode(code)}
        disabled={state.isLoading}
      >
        {state.isLoading ? "Running…" : "Run"}
      </button>
    </div>
  )
}
