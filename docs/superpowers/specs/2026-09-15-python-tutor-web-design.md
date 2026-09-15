# Python Tutor Web — Design Spec

Date: 2026-09-15
Status: Approved by user, ready for implementation planning

## 1. Goal

Rebuild the Python Tutor frontend as a modern, intuitive, Python-only
step-by-step code visualizer. The reference implementation is the
`hcientist/OnlinePythonTutor` clone at
`../OnlinePythonTutor` (relative to this repo) — a 2010-2011-era
multi-language (Python/Java/JS/Ruby/C/C++) tool built on jQuery 1.3.2,
jsPlumb, and a Python-2 CGI backend. We are building a Python-only
successor, not modifying that codebase in place.

Out of scope: any language other than Python; preserving CGI
deployment; preserving the original's UI/visual style; teacher
mode / question banks / tutorials features present in the original.

## 2. Architecture

Two sibling directories under `personal_projects/`:

- `OnlinePythonTutor/` — reference clone, read-only, not modified.
- `python-tutor-web/` — this new project, its own git repo:
  - `backend/` — Flask app, Python 3
  - `frontend/` — React + TypeScript + Vite

Flow: the frontend sends the user's Python source to a single backend
endpoint, gets back a complete execution trace as JSON, and then does
all stepping/rendering client-side (no further backend calls needed
until the user hits "Run" again on new/edited code).

```
[Browser: code editor] --POST /api/trace {code}--> [Flask backend]
                                                        |
                                            runs code through adapted
                                            pg_logger tracer (bdb-based,
                                            sys.settrace under the hood)
                                                        |
[Browser: step player] <--JSON {steps:[...]}------------+
```

## 3. Backend (`backend/`)

- Flask app with one endpoint: `POST /api/trace`
  - Request body: `{ "code": "<python source>" }`
  - Response: `{ "steps": [Step, ...], "error": string | null }`
- Tracer: a Python-3 port of `cgi-bin/pg_logger.py` +
  `cgi-bin/pg_encoder.py` from the reference clone, stripped of the
  multi-language dispatch that lives in `web_exec.py` (we only ever run
  Python). Porting notes carried over from reading the original:
  - Original subclasses `bdb.Bdb` and drives execution via
    `sys.settrace`, capturing a snapshot (globals, locals per frame,
    current line, stdout so far) after every executed line — this
    core mechanism is sound and reusable in Python 3, only the
    Python-2-isms (`cStringIO`, `dict.iteritems()`, `long`, `print`
    statement) need updating.
  - Compound values (`list`, `tuple`, `set`, `dict`, class instances,
    classes) are encoded as tagged arrays carrying a `unique_id`
    derived from `id()`, e.g. `['LIST', unique_id, elt1, ...]`,
    `['INSTANCE', class_name, unique_id, [attr, value], ...]`, with a
    `['CIRCULAR_REF', unique_id]` marker for cycles. This is exactly
    the identity-tracking primitive the heap panel needs to draw
    shared/aliased-reference arrows, so we keep the scheme, just
    renaming tags/shape as convenient for the TypeScript side.
  - Existing safety limits are kept and modernized: max executed lines
    (`MAX_EXECUTED_LINES`, was 200, we'll default higher — e.g. 1000 —
    since we no longer draw a static list of all frames but step
    through them) plus a wall-clock timeout (~5s) running the traced
    code in a subprocess, since `bdb` tracing alone doesn't bound
    infinite loops that don't grow the line count fast enough or that
    hang in C code.
- `Step` shape (draft, may be refined during implementation):
  ```ts
  type Step = {
    line: number
    event: "step" | "call" | "return" | "exception"
    stack: Frame[]        // innermost last, like a real call stack
    stdout: string         // cumulative stdout up to this step
  }
  type Frame = {
    funcName: string
    locals: Record<string, EncodedValue>
    globals: Record<string, EncodedValue>
  }
  ```
  `EncodedValue` reuses the tagged-array heap encoding described above.

## 4. Frontend (`frontend/`)

- React + TypeScript + Vite. CodeMirror 6 for the source editor
  (syntax highlighting, current-line highlight, read-only during
  playback).
- Layout (three panes):
  - Left: code editor + Run button + step transport controls
    (⏮ first, ⏪ prev, ▶️/⏸ play/pause, ⏩ next, ⏭ last, plus a step
    slider/scrubber).
  - Top-right: call stack / variables panel — one card per active
    frame, innermost on top, showing locals as name/value rows.
  - Bottom-right: heap panel — one box per compound object (list,
    dict, tuple, set, instance), with SVG-drawn arrows from
    variables/containers to the objects they reference (replacing
    jsPlumb), so aliasing and mutation are visible.
- State: a single React context/reducer holding
  `{ steps: Step[], currentStepIndex: number, isPlaying: boolean }`.
  No Redux — the state shape is small and fully owned by one
  component tree.
- Interaction: stepping (prev/next/scrubber) re-renders the
  variables/heap panels from `steps[currentStepIndex]` with animated
  transitions (fade/slide on value change, arrows redraw) rather than
  hard cuts, and highlights the current source line.
- Visual style: clean modern dev-tool look — dark-mode-first palette,
  monospace font for code/values, subtle borders/shadows instead of
  the original's boxy skeuomorphic style.
- Error handling: if `/api/trace` returns an `error` (syntax error,
  timeout, exceeded max steps), show it inline near the editor instead
  of attempting to render an empty/partial trace.

## 5. Testing

- Backend: unit tests for the tracer against a fixed set of Python
  snippets (assignments, loops, function calls/recursion, mutable
  aliasing, exceptions) asserting the resulting `steps` JSON matches
  expected shape/values. Adapt relevant cases from
  `OnlinePythonTutor/test-programs/`.
- Backend: a test asserting the timeout/step-limit guard actually
  stops an infinite loop and returns a clean `error`.
- Frontend: component tests (Vitest + React Testing Library) for the
  step player (transport controls advance/rewind correctly) and for
  rendering a known `Step` into the variables/heap panels.
- Manual: run a handful of representative programs end-to-end in the
  browser (simple arithmetic, list/dict mutation and aliasing, a
  recursive function, an unhandled exception) before calling the
  rebuild done.
