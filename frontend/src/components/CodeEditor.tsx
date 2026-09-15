import { useCallback, useEffect, useMemo, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { Decoration, EditorView } from "@codemirror/view"
import { StateField, StateEffect } from "@codemirror/state"

const setCurrentLine = StateEffect.define<number>()

const currentLineField = StateField.define({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCurrentLine)) {
        const lineNumber = effect.value
        if (lineNumber <= 0 || lineNumber > tr.state.doc.lines) {
          return Decoration.none
        }
        const line = tr.state.doc.line(lineNumber)
        return Decoration.set([Decoration.line({ class: "cm-current-line" }).range(line.from)])
      }
    }
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

interface CodeEditorProps {
  code: string
  onChange: (code: string) => void
  currentLine: number | null
}

export function CodeEditor({ code, onChange, currentLine }: CodeEditorProps) {
  const [view, setView] = useState<EditorView | null>(null)
  const extensions = useMemo(() => [python(), currentLineField], [])

  // CodeMirror creates its EditorView asynchronously (internally, after its
  // container ref is attached), so we can't rely on a ref being populated by
  // the time this component's own effects run. onCreateEditor fires exactly
  // once the view exists, which lets this effect react to both the view
  // becoming available and currentLine changing thereafter.
  const handleCreateEditor = useCallback((createdView: EditorView) => {
    setView(createdView)
  }, [])

  // currentLine can go back to null (e.g. RUN_START/RUN_ERROR reset it), and
  // that must still clear any stale highlight left over from a previous run.
  // Passing 0 in that case relies on currentLineField's existing guard
  // (lineNumber <= 0 => Decoration.none) to clear the decoration.
  useEffect(() => {
    if (view) {
      view.dispatch({ effects: setCurrentLine.of(currentLine ?? 0) })
    }
  }, [view, currentLine])

  return (
    <CodeMirror
      value={code}
      height="100%"
      theme="dark"
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={handleCreateEditor}
    />
  )
}
