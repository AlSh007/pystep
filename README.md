# Python Tutor Web

A Python-only, step-by-step code execution visualizer. See
`docs/superpowers/specs/2026-09-15-python-tutor-web-design.md` for the
full design.

## Demo

https://github.com/user-attachments/assets/172e148a-6e6a-4bbe-9e18-f496b05c170e

A ~21s walkthrough: run a snippet, step through it, follow references on the heap, and hit the step-limit safety net. (Click the poster to play the video. The video's UI is an illustrative recreation of the app, not a screen capture.)

## Features

- Write Python in a CodeMirror editor and hit Run.
- Step forward/back, jump to first/last, play/pause, or scrub through the trace with a slider and a step counter.
- The current line is highlighted; the stack panel shows frames and their variables.
- The heap panel shows lists, dicts and objects, with arrows for references (including circular ones).
- Errors (including the step limit and timeout below) show in an error banner.

## How it works

The frontend sends your code to the Flask backend (`POST /api/trace`), which runs it in a
subprocess under a `sys.settrace`-based tracer and returns the full execution trace as JSON.
Stepping and rendering then happen entirely client-side until you hit Run again.
There is also a `GET /api/health` endpoint.

## Tech stack

- Backend: Python 3, Flask, flask-cors, pytest
- Frontend: React 19, TypeScript, Vite, CodeMirror, Vitest, Oxlint

## Project structure

    backend/    Flask app (app.py) and tracer/ (tracer, encoder, subprocess runner) + tests
    frontend/   React + Vite app (src/components, state, api, utils)
    docs/       design spec, implementation plan, demo video

## Running locally

Backend (in one terminal, first time only — creates the venv and installs dependencies):

    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

Then (every time):

    cd backend
    source .venv/bin/activate
    python app.py

Frontend (in another terminal, first time only):

    cd frontend
    npm install

Then (every time):

    cd frontend
    npm run dev

Then open the URL Vite prints (typically http://localhost:5173). The backend
listens on port 5000 and only allows CORS from `http://localhost:5173`, so keep
the frontend on that port.

Other frontend scripts: `npm run build` (type-check and production build),
`npm run lint`, `npm run preview`.

### Safety-limit constants

`backend/tracer/runner.py` defines two constants that bound how much
untrusted code execution the backend will tolerate before giving up:

- `DEFAULT_MAX_STEPS` (1000) — the maximum number of traced steps before
  the tracer aborts with a "step limit" error (guards against infinite
  loops that generate line events).
- `DEFAULT_TIMEOUT_SECONDS` (5.0) — the wall-clock timeout on the
  subprocess running the trace (guards against blocking calls that don't
  generate line events, e.g. `time.sleep`).

Change these in `backend/tracer/runner.py` if you need the tracer to
tolerate longer-running or more complex snippets.

## Running tests

    cd backend && source .venv/bin/activate && python -m pytest tests/ -v
    cd frontend && npm test

## Troubleshooting

- **Security note:** the backend executes arbitrary Python code — don't
  leave it running unattended, and don't expose it beyond localhost.
- **Run button does nothing / trace request fails on macOS:** macOS's
  AirPlay Receiver can bind port 5000 on `::1` (IPv6 loopback), which
  intercepts `http://localhost:5000` before it reaches Flask and
  returns `403 Forbidden`. If this happens, either turn off AirPlay
  Receiver (System Settings → General → AirDrop & Handoff), or point
  the frontend at the IPv4 address explicitly by creating
  `frontend/.env.local` with:

      VITE_API_BASE_URL=http://127.0.0.1:5000
