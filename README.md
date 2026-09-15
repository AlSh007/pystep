# Python Tutor Web

A Python-only, step-by-step code execution visualizer. See
`docs/superpowers/specs/2026-09-15-python-tutor-web-design.md` for the
full design.

## Running locally

Backend (in one terminal):

    cd backend
    source .venv/bin/activate
    python app.py

Frontend (in another terminal):

    cd frontend
    npm run dev

Then open the URL Vite prints (typically http://localhost:5173).

## Running tests

    cd backend && source .venv/bin/activate && python -m pytest tests/ -v
    cd frontend && npm test
