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

## Troubleshooting

- **Run button does nothing / trace request fails on macOS:** macOS's
  AirPlay Receiver can bind port 5000 on `::1` (IPv6 loopback), which
  intercepts `http://localhost:5000` before it reaches Flask and
  returns `403 Forbidden`. If this happens, either turn off AirPlay
  Receiver (System Settings → General → AirDrop & Handoff), or point
  the frontend at the IPv4 address explicitly by creating
  `frontend/.env.local` with:

      VITE_API_BASE_URL=http://127.0.0.1:5000
