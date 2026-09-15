import "./theme.css"

export default function App() {
  return (
    <div className="layout">
      <section className="layout__editor" data-testid="layout-editor">
        Editor placeholder
      </section>
      <div className="layout__right">
        <section className="layout__stack" data-testid="layout-stack">
          Stack placeholder
        </section>
        <section className="layout__heap" data-testid="layout-heap">
          Heap placeholder
        </section>
      </div>
    </div>
  )
}
