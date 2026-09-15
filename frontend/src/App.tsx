import { useMemo, useRef } from "react"
import { TraceProvider, useTrace } from "./state/traceStore"
import { EditorPanel } from "./components/EditorPanel"
import { TransportControls } from "./components/TransportControls"
import { StackPanel } from "./components/StackPanel"
import { HeapPanel } from "./components/HeapPanel"
import { HeapArrows } from "./components/HeapArrows"
import { ErrorBanner } from "./components/ErrorBanner"
import { collectHeap } from "./utils/decodeValue"
import "./theme.css"

function Visualizer() {
  const { state } = useTrace()
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const currentStep = state.steps[state.currentStepIndex]
  const heap = useMemo(() => (currentStep ? collectHeap(currentStep) : new Map()), [currentStep])

  return (
    <div className="layout">
      <section className="layout__editor" data-testid="layout-editor">
        <EditorPanel />
        <TransportControls />
        {state.error && <ErrorBanner message={state.error} />}
      </section>
      <div className="layout__right" ref={rightPaneRef}>
        <section className="layout__stack" data-testid="layout-stack" key={`stack-${state.currentStepIndex}`}>
          <StackPanel stack={currentStep?.stack ?? []} />
        </section>
        <section className="layout__heap" data-testid="layout-heap" key={`heap-${state.currentStepIndex}`}>
          <HeapPanel heap={heap} />
        </section>
        <HeapArrows
          containerRef={rightPaneRef}
          redrawKey={`${state.steps.length}-${state.currentStepIndex}`}
        />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <TraceProvider>
      <Visualizer />
    </TraceProvider>
  )
}
