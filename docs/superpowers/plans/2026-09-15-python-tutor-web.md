# Python Tutor Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python-only, step-by-step code execution visualizer: a Flask backend that traces a user's Python program and a React/TypeScript frontend that lets them step through it (variables, call stack, and a heap diagram with reference arrows).

**Architecture:** `backend/` is a small Flask app exposing `POST /api/trace`, which runs the submitted code in a sandboxed subprocess through a `sys.settrace`-based tracer (a Python-3, Python-only port of the tracing/encoding logic in `../OnlinePythonTutor/cgi-bin/pg_logger.py` and `pg_encoder.py`) and returns the full list of execution steps as JSON in one response. `frontend/` is a Vite + React + TypeScript app that fetches that trace once and does all stepping/rendering client-side via a reducer-based store, CodeMirror 6 for the source view, and an SVG overlay for heap reference arrows.

**Tech Stack:** Python 3.10+, Flask 3, pytest (backend). Node.js + npm, React 18, TypeScript, Vite, Vitest + React Testing Library, `@uiw/react-codemirror` (CodeMirror 6 wrapper) (frontend).

**Spec:** `docs/superpowers/specs/2026-09-15-python-tutor-web-design.md`

## Global Constraints

- Python only — no Java/JS/Ruby/C/C++ execution or dispatch logic.
- `../OnlinePythonTutor/` (the reference clone) is read-only reference material — never edit it.
- Two sibling directories in this repo: `backend/` (Flask, Python 3) and `frontend/` (React + TypeScript + Vite).
- One-shot trace flow: `POST /api/trace` returns the complete `steps` array in one response; the frontend steps through it locally afterward with no further backend calls until the next Run.
- Heap values are encoded as tagged arrays carrying a `unique_id` derived from `id()` — e.g. `["LIST", id, ...elements]` — so shared/aliased objects are identifiable across variables. This scheme (from `pg_encoder.py`) is preserved, not reinvented.
- Safety limits are mandatory: a max-executed-steps cap and a wall-clock subprocess timeout, both guarding against infinite loops in user code.
- Frontend state is a single reducer + React context — no Redux or other state library.
- Code editor is CodeMirror 6 (via `@uiw/react-codemirror`); heap reference arrows are hand-drawn SVG (not jsPlumb).
- Visual style is dark-mode-first, monospace for code/values, clean modern dev-tool look, with animated transitions between steps.
- Backend errors (syntax error, runtime exception, timeout, step-limit exceeded) must be surfaced to the user, never silently dropped.

---

## Task 1: Backend scaffold + health check

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app.py`
- Create: `backend/tests/test_app.py`
- Create: `.gitignore` (repo root)

**Interfaces:**
- Produces: a running Flask app object `app` in `backend/app.py`, with `GET /api/health` returning `{"status": "ok"}`. Later tasks add `POST /api/trace` to this same file.

- [ ] **Step 1: Create the backend virtualenv and install base dependencies**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install flask flask-cors pytest
pip freeze > requirements.txt
```

- [ ] **Step 2: Add a root `.gitignore`**

```
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
frontend/node_modules/
frontend/dist/
```

- [ ] **Step 3: Write the failing test for the health check endpoint**

`backend/tests/test_app.py`:

```python
from app import app


def test_health_check_returns_ok():
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_app.py -v
```

Expected: FAIL (`ModuleNotFoundError: No module named 'app'` or similar, since `app.py` doesn't exist yet).

- [ ] **Step 5: Create the Flask app**

`backend/app.py`:

```python
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # local dev tool only — open CORS is fine, no auth/session data involved


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_app.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app.py backend/tests/test_app.py .gitignore
git commit -m "feat(backend): scaffold Flask app with health check endpoint"
```

---

## Task 2: Value encoder (`tracer/encoder.py`)

**Files:**
- Create: `backend/tracer/__init__.py`
- Create: `backend/tracer/encoder.py`
- Create: `backend/tests/test_encoder.py`

**Interfaces:**
- Produces: `class ValueEncoder` with method `encode(self, value, path_ids: set[int] | None = None) -> EncodedValue` (where `EncodedValue` is `None | bool | int | float | str | list`). A fresh `ValueEncoder()` instance keeps small integer ids stable for the life of that instance (one instance is created per trace run in Task 3).

- [ ] **Step 1: Create the `tracer` package**

`backend/tracer/__init__.py`: (empty file)

- [ ] **Step 2: Write failing tests for primitive and list encoding**

`backend/tests/test_encoder.py`:

```python
from tracer.encoder import ValueEncoder


def test_primitives_pass_through_unchanged():
    enc = ValueEncoder()
    assert enc.encode(None) is None
    assert enc.encode(True) is True
    assert enc.encode(False) is False
    assert enc.encode(42) == 42
    assert enc.encode(3.14) == 3.14
    assert enc.encode("hi") == "hi"


def test_list_is_tagged_with_id_and_elements():
    enc = ValueEncoder()
    result = enc.encode([1, 2, 3])
    assert result[0] == "LIST"
    assert isinstance(result[1], int)
    assert result[2:] == [1, 2, 3]
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: FAIL (`ModuleNotFoundError: No module named 'tracer'`)

- [ ] **Step 4: Implement primitive + list encoding**

`backend/tracer/encoder.py`:

```python
PRIMITIVE_TYPES = (type(None), bool, int, float, str)


class ValueEncoder:
    """Encodes Python runtime values into JSON-safe structures.

    Compound values get a small integer id, stable for the life of this
    ValueEncoder instance, so the frontend can detect aliasing and
    shared references between variables (mirrors pg_encoder.py's scheme).
    """

    def __init__(self):
        self._real_to_small_id: dict[int, int] = {}
        self._next_small_id = 1

    def _small_id(self, obj) -> int:
        real_id = id(obj)
        if real_id not in self._real_to_small_id:
            self._real_to_small_id[real_id] = self._next_small_id
            self._next_small_id += 1
        return self._real_to_small_id[real_id]

    def encode(self, value, path_ids=None):
        if path_ids is None:
            path_ids = set()

        if isinstance(value, PRIMITIVE_TYPES):
            return value

        real_id = id(value)
        if real_id in path_ids:
            return ["CIRCULAR_REF", self._small_id(value)]

        next_path = path_ids | {real_id}

        if isinstance(value, list):
            return ["LIST", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]

        raise NotImplementedError(f"encoding not yet implemented for {type(value)}")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: PASS

- [ ] **Step 6: Write failing tests for tuple, set, dict, and shared-reference/circular-reference detection**

Append to `backend/tests/test_encoder.py`:

```python
def test_tuple_encoding():
    enc = ValueEncoder()
    result = enc.encode((1, 2))
    assert result[0] == "TUPLE"
    assert result[2:] == [1, 2]


def test_set_encoding():
    enc = ValueEncoder()
    result = enc.encode({1, 2})
    assert result[0] == "SET"
    assert sorted(result[2:]) == [1, 2]


def test_dict_encoding():
    enc = ValueEncoder()
    result = enc.encode({"a": 1, "b": 2})
    assert result[0] == "DICT"
    assert result[2:] == [["a", 1], ["b", 2]]


def test_shared_reference_keeps_same_id():
    enc = ValueEncoder()
    shared = [1]
    container = enc.encode([shared, shared])
    first_ref_id = container[2][1]
    second_ref_id = container[3][1]
    assert first_ref_id == second_ref_id


def test_circular_reference_is_marked():
    enc = ValueEncoder()
    cyclic = []
    cyclic.append(cyclic)
    result = enc.encode(cyclic)
    assert result[2] == ["CIRCULAR_REF", result[1]]
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: FAIL on the new tests (`NotImplementedError` for tuple/set/dict; shared-reference and circular tests currently pass or fail depending on list support — run to confirm actual failures before proceeding).

- [ ] **Step 8: Implement tuple, set, and dict encoding**

In `backend/tracer/encoder.py`, extend `encode`:

```python
        if isinstance(value, list):
            return ["LIST", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, tuple):
            return ["TUPLE", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, set):
            return ["SET", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, dict):
            return ["DICT", self._small_id(value)] + [
                [self.encode(k, next_path), self.encode(v, next_path)]
                for k, v in value.items()
            ]

        raise NotImplementedError(f"encoding not yet implemented for {type(value)}")
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: PASS (all tests so far)

- [ ] **Step 10: Write failing tests for function and class-instance encoding**

Append to `backend/tests/test_encoder.py`:

```python
def test_function_encoding():
    enc = ValueEncoder()

    def add(a, b):
        return a + b

    result = enc.encode(add)
    assert result[0] == "FUNCTION"
    assert result[1] == "add"
    assert isinstance(result[2], int)


def test_instance_encoding():
    class Point:
        def __init__(self, x, y):
            self.x = x
            self.y = y

    enc = ValueEncoder()
    result = enc.encode(Point(1, 2))
    assert result[0] == "INSTANCE"
    assert result[1] == "Point"
    assert isinstance(result[2], int)
    attrs = dict(result[3:])
    assert attrs == {"x": 1, "y": 2}
```

- [ ] **Step 11: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: FAIL (`NotImplementedError`)

- [ ] **Step 12: Implement function and instance encoding**

In `backend/tracer/encoder.py`, extend `encode` (functions must be checked before the generic `__dict__` branch, since functions also have a `__dict__`):

```python
        if callable(value) and hasattr(value, "__name__"):
            return ["FUNCTION", value.__name__, self._small_id(value)]

        if hasattr(value, "__dict__"):
            class_name = type(value).__name__
            attrs = [
                [k, self.encode(v, next_path)] for k, v in vars(value).items()
            ]
            return ["INSTANCE", class_name, self._small_id(value)] + attrs

        return [type(value).__name__.upper(), self._small_id(value), repr(value)]
```

Remove the now-unreachable `raise NotImplementedError(...)` line — the fallback branch above replaces it.

- [ ] **Step 13: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_encoder.py -v
```

Expected: PASS (all tests)

- [ ] **Step 14: Commit**

```bash
git add backend/tracer/__init__.py backend/tracer/encoder.py backend/tests/test_encoder.py
git commit -m "feat(backend): add value encoder for lists, dicts, instances, and shared/circular references"
```

---

## Task 3: Tracer core (`tracer/tracer.py`)

**Files:**
- Create: `backend/tracer/tracer.py`
- Create: `backend/tests/test_tracer.py`

**Interfaces:**
- Consumes: `ValueEncoder` from `backend/tracer/encoder.py` (Task 2).
- Produces: `class Tracer` with constructor `Tracer(max_steps: int = 1000)`, method `run(self, code: str) -> list[dict]` returning the list of step dicts, and attribute `self.error: str | None` set when the run didn't complete cleanly (syntax error, runtime exception, or step-limit exceeded). Each step dict has shape `{"line": int, "event": "call"|"line"|"return", "stack": [{"funcName": str, "locals": dict}], "stdout": str}`. Consumed by `backend/tracer/runner.py` (Task 4).

- [ ] **Step 1: Write a failing test for simple sequential execution**

`backend/tests/test_tracer.py`:

```python
from tracer.tracer import Tracer


def test_simple_assignments_are_traced_line_by_line():
    tracer = Tracer()
    steps = tracer.run("x = 1\ny = 2\n")

    assert tracer.error is None
    assert len(steps) >= 2
    last_locals = steps[-1]["stack"][0]["locals"]
    assert last_locals["x"] == 1
    assert last_locals["y"] == 2
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_tracer.py -v
```

Expected: FAIL (`ModuleNotFoundError: No module named 'tracer.tracer'`)

- [ ] **Step 3: Implement the tracer core**

`backend/tracer/tracer.py`:

```python
import sys
from io import StringIO

from tracer.encoder import ValueEncoder

IGNORED_NAMES = {
    "__builtins__", "__name__", "__doc__", "__package__",
    "__loader__", "__spec__", "__annotations__",
}


class MaxStepsExceeded(Exception):
    pass


class Tracer:
    """Runs a snippet of Python source and records a step-by-step trace.

    Uses sys.settrace to snapshot the call stack (locals per frame) after
    every executed line, mirroring the approach in pg_logger.py (which
    drove the same idea through bdb.Bdb) but ported directly to sys.settrace
    for a simpler Python 3 implementation.
    """

    def __init__(self, max_steps: int = 1000):
        self.max_steps = max_steps
        self.steps: list[dict] = []
        self.error: str | None = None
        self.encoder = ValueEncoder()
        self._stdout_capture = StringIO()

    def run(self, code: str) -> list[dict]:
        real_stdout = sys.stdout
        sys.stdout = self._stdout_capture

        try:
            compiled = compile(code, "<user_code>", "exec")
        except SyntaxError as e:
            self.error = f"SyntaxError: {e.msg} (line {e.lineno})"
            sys.stdout = real_stdout
            return self.steps

        old_trace = sys.gettrace()
        user_globals = {"__name__": "__main__"}
        try:
            sys.settrace(self._trace_calls)
            try:
                exec(compiled, user_globals)
            except MaxStepsExceeded:
                self.error = (
                    f"Exceeded max step limit ({self.max_steps}); "
                    "possible infinite loop."
                )
            except Exception as e:
                self.error = f"{type(e).__name__}: {e}"
        finally:
            sys.settrace(old_trace)
            sys.stdout = real_stdout

        return self.steps

    def _trace_calls(self, frame, event, arg):
        if frame.f_code.co_filename != "<user_code>":
            return None

        if event in ("call", "line", "return"):
            self._record_step(frame, event)
            if len(self.steps) >= self.max_steps:
                raise MaxStepsExceeded()

        return self._trace_calls

    def _record_step(self, frame, event):
        chain = []
        f = frame
        while f is not None and f.f_code.co_filename == "<user_code>":
            chain.append(f)
            f = f.f_back
        chain.reverse()

        stack = [
            {
                "funcName": fr.f_code.co_name,
                "locals": self._encode_vars(fr.f_locals),
            }
            for fr in chain
        ]

        self.steps.append({
            "line": frame.f_lineno,
            "event": event,
            "stack": stack,
            "stdout": self._stdout_capture.getvalue(),
        })

    def _encode_vars(self, variables: dict) -> dict:
        return {
            k: self.encoder.encode(v)
            for k, v in variables.items()
            if k not in IGNORED_NAMES
        }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_tracer.py -v
```

Expected: PASS

- [ ] **Step 5: Write failing tests for loops, function calls, syntax errors, runtime exceptions, and aliasing**

Append to `backend/tests/test_tracer.py`:

```python
def test_loop_produces_multiple_steps_with_growing_total():
    tracer = Tracer()
    steps = tracer.run("total = 0\nfor i in range(3):\n    total += i\n")

    assert tracer.error is None
    totals = [
        s["stack"][0]["locals"]["total"]
        for s in steps
        if "total" in s["stack"][0]["locals"]
    ]
    assert totals[-1] == 3  # 0 + 1 + 2


def test_function_call_adds_a_frame_to_the_stack():
    code = (
        "def add(a, b):\n"
        "    return a + b\n"
        "result = add(2, 3)\n"
    )
    tracer = Tracer()
    steps = tracer.run(code)

    assert tracer.error is None
    frame_names_seen = {
        frame["funcName"] for step in steps for frame in step["stack"]
    }
    assert "add" in frame_names_seen
    assert "<module>" in frame_names_seen

    inside_add = [s for s in steps if any(f["funcName"] == "add" for f in s["stack"])]
    assert any(len(s["stack"]) == 2 for s in inside_add)


def test_syntax_error_is_reported_with_no_steps():
    tracer = Tracer()
    steps = tracer.run("def f(:\n")

    assert steps == []
    assert tracer.error.startswith("SyntaxError")


def test_runtime_exception_is_reported_with_partial_steps():
    tracer = Tracer()
    steps = tracer.run("x = 1\ny = 1 / 0\n")

    assert len(steps) > 0
    assert "ZeroDivisionError" in tracer.error


def test_aliased_list_mutation_is_visible_through_both_names():
    code = "a = [1, 2]\nb = a\nb.append(3)\n"
    tracer = Tracer()
    steps = tracer.run(code)

    assert tracer.error is None
    last_locals = steps[-1]["stack"][0]["locals"]
    a_val, b_val = last_locals["a"], last_locals["b"]
    assert a_val[1] == b_val[1]  # same small id -> same underlying list
    assert a_val[2:] == [1, 2, 3]
    assert b_val[2:] == [1, 2, 3]


def test_step_limit_stops_an_infinite_loop():
    tracer = Tracer(max_steps=50)
    steps = tracer.run("while True:\n    x = 1\n")

    assert "step limit" in tracer.error
    assert len(steps) <= 51
```

- [ ] **Step 6: Run the tests to verify they fail or pass as expected**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_tracer.py -v
```

Expected: the core implementation from Step 3 should already make most of these pass, since it was written to support exactly this behavior — run this to confirm; investigate and fix `tracer.py` if anything unexpectedly fails before moving on (do not silently accept a failing test here).

- [ ] **Step 7: Commit**

```bash
git add backend/tracer/tracer.py backend/tests/test_tracer.py
git commit -m "feat(backend): add sys.settrace-based tracer for stepwise execution capture"
```

---

## Task 4: Sandboxed runner (`tracer/runner.py`)

**Files:**
- Create: `backend/tracer/runner.py`
- Create: `backend/tests/test_runner.py`

**Interfaces:**
- Consumes: `Tracer` from `backend/tracer/tracer.py` (Task 3).
- Produces: `run_code(code: str, max_steps: int = 1000, timeout_seconds: float = 5.0) -> dict` returning `{"steps": [...], "error": str | None}`. Consumed by `backend/app.py` (Task 5).

- [ ] **Step 1: Write a failing test for the success path**

`backend/tests/test_runner.py`:

```python
from tracer.runner import run_code


def test_run_code_success_returns_steps_and_no_error():
    result = run_code("x = 1\n")

    assert result["error"] is None
    assert len(result["steps"]) > 0
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_runner.py -v
```

Expected: FAIL (`ModuleNotFoundError: No module named 'tracer.runner'`)

- [ ] **Step 3: Implement the subprocess-isolated runner**

`backend/tracer/runner.py`:

```python
import multiprocessing

from tracer.tracer import Tracer

DEFAULT_MAX_STEPS = 1000
DEFAULT_TIMEOUT_SECONDS = 5.0


def _run_in_subprocess(code: str, max_steps: int, result_queue) -> None:
    tracer = Tracer(max_steps=max_steps)
    steps = tracer.run(code)
    result_queue.put({"steps": steps, "error": tracer.error})


def run_code(
    code: str,
    max_steps: int = DEFAULT_MAX_STEPS,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Runs `code` through the Tracer in an isolated subprocess.

    The step limit inside Tracer catches most Python-level infinite loops
    (since each iteration re-triggers a line event), but this wall-clock
    timeout is defense in depth against anything that blocks without
    generating many line events (e.g. a long C-level call).
    """
    ctx = multiprocessing.get_context("spawn")
    result_queue = ctx.Queue()
    process = ctx.Process(
        target=_run_in_subprocess, args=(code, max_steps, result_queue)
    )
    process.start()
    process.join(timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join()
        return {
            "steps": [],
            "error": f"Execution timed out after {timeout_seconds}s (possible infinite loop).",
        }

    if not result_queue.empty():
        return result_queue.get()

    return {"steps": [], "error": "Execution failed unexpectedly (no result produced)."}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_runner.py -v
```

Expected: PASS

- [ ] **Step 5: Write failing tests for the step-limit and timeout paths**

Append to `backend/tests/test_runner.py`:

```python
def test_run_code_hits_step_limit_on_infinite_loop():
    result = run_code("while True:\n    x = 1\n", max_steps=50, timeout_seconds=5.0)

    assert result["error"] is not None
    assert "step limit" in result["error"]


def test_run_code_times_out_on_a_blocking_call():
    code = "import time\ntime.sleep(10)\n"
    result = run_code(code, max_steps=1000, timeout_seconds=1.0)

    assert result["steps"] == []
    assert "timed out" in result["error"]
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_runner.py -v
```

Expected: PASS (the timeout test takes roughly 1-2 seconds to run — that is expected, not a hang)

- [ ] **Step 7: Commit**

```bash
git add backend/tracer/runner.py backend/tests/test_runner.py
git commit -m "feat(backend): sandbox tracer execution in a subprocess with step and timeout guards"
```

---

## Task 5: `/api/trace` endpoint

**Files:**
- Modify: `backend/app.py`
- Modify: `backend/tests/test_app.py`

**Interfaces:**
- Consumes: `run_code` from `backend/tracer/runner.py` (Task 4).
- Produces: `POST /api/trace` on the Flask app, request body `{"code": str}`, response body `{"steps": [...], "error": str | None}` (200) or `{"steps": [], "error": str}` (400 for a malformed request). Consumed by the frontend's `traceCode` API client (Task 7).

- [ ] **Step 1: Write failing tests for the trace endpoint**

Append to `backend/tests/test_app.py`:

```python
def test_trace_endpoint_returns_steps_for_valid_code():
    client = app.test_client()
    response = client.post("/api/trace", json={"code": "x = 1\n"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["error"] is None
    assert len(body["steps"]) > 0


def test_trace_endpoint_surfaces_a_syntax_error_with_200():
    client = app.test_client()
    response = client.post("/api/trace", json={"code": "def f(:\n"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["error"].startswith("SyntaxError")


def test_trace_endpoint_rejects_empty_code_with_400():
    client = app.test_client()
    response = client.post("/api/trace", json={"code": ""})

    assert response.status_code == 400
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_app.py -v
```

Expected: FAIL (404 for `/api/trace`, since the route doesn't exist yet)

- [ ] **Step 3: Implement the endpoint**

In `backend/app.py`, add the import and route:

```python
from flask import Flask, jsonify, request
from flask_cors import CORS

from tracer.runner import run_code

app = Flask(__name__)
CORS(app)  # local dev tool only — open CORS is fine, no auth/session data involved


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/trace")
def trace():
    body = request.get_json(silent=True) or {}
    code = body.get("code", "")
    if not isinstance(code, str) or not code.strip():
        return jsonify({"steps": [], "error": "No code provided."}), 400

    result = run_code(code)
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_app.py -v
```

Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/ -v
```

Expected: all tests across `test_app.py`, `test_encoder.py`, `test_tracer.py`, `test_runner.py` PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_app.py
git commit -m "feat(backend): expose POST /api/trace endpoint"
```

Backend is now feature-complete and independently runnable via `cd backend && source .venv/bin/activate && python app.py`.

---

## Task 6: Frontend scaffold

**Files:**
- Create: `frontend/` (via Vite scaffolding CLI)
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/src/theme.css`

**Interfaces:**
- Produces: a runnable Vite dev server and a Vitest test runner (`npm test`), plus a three-pane layout shell in `App.tsx` with classes `.layout`, `.layout__editor`, `.layout__right`, `.layout__stack`, `.layout__heap` that later tasks fill in.

- [ ] **Step 1: Scaffold the Vite React+TypeScript project**

```bash
cd /Users/aloksharma/Desktop/personal_projects/python-tutor-web
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install test tooling and CodeMirror**

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install @uiw/react-codemirror @codemirror/lang-python @codemirror/view @codemirror/state
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 3: Configure Vitest**

`frontend/vite.config.ts`:

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
})
```

- [ ] **Step 4: Create the test setup file**

`frontend/src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest"

// jsdom does not implement ResizeObserver; the heap-arrow overlay (Task 15)
// uses it to redraw on layout changes, so stub it for all component tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
```

- [ ] **Step 5: Write a failing test for the three-pane layout shell**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the three main panes", () => {
    render(<App />)
    expect(screen.getByTestId("layout-editor")).toBeInTheDocument()
    expect(screen.getByTestId("layout-stack")).toBeInTheDocument()
    expect(screen.getByTestId("layout-heap")).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: FAIL (default Vite template markup doesn't have these test ids)

- [ ] **Step 7: Replace the default App with the layout shell**

`frontend/src/App.tsx`:

```tsx
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
```

Delete the default `frontend/src/App.css` content it came with (or leave it unused — it is not imported anymore since `App.tsx` now imports `./theme.css`).

- [ ] **Step 8: Create the base theme**

`frontend/src/theme.css`:

```css
:root {
  --bg: #1e1e1e;
  --bg-panel: #252526;
  --fg: #d4d4d4;
  --border: #3c3c3c;
  --accent: #4fc1ff;
  --font-mono: "SF Mono", "Fira Code", Consolas, monospace;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-mono);
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  height: 100vh;
  padding: 1rem;
  box-sizing: border-box;
}

.layout__right {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 1rem;
  position: relative;
}

.layout__editor,
.layout__stack,
.layout__heap {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  overflow: auto;
}
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: PASS

- [ ] **Step 10: Verify the dev server runs**

```bash
cd frontend && npm run dev
```

Expected: Vite prints a local URL (e.g. `http://localhost:5173`); open it and confirm three empty bordered panels render. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Vite React+TS project with three-pane layout shell"
```

---

## Task 7: Trace types + API client

**Files:**
- Create: `frontend/src/types/trace.ts`
- Create: `frontend/src/api/traceClient.ts`
- Create: `frontend/src/api/traceClient.test.ts`

**Interfaces:**
- Produces: types `EncodedValue`, `EncodedCompound`, `Frame`, `Step`, `TraceResult`, `RenderValue`, `HeapItem`, `HeapObject` (all in `types/trace.ts`), and `traceCode(code: string): Promise<TraceResult>` (in `api/traceClient.ts`). Consumed by every later frontend task.
- Consumes: `POST /api/trace` from `backend/app.py` (Task 5) at runtime.

- [ ] **Step 1: Define the shared trace types**

`frontend/src/types/trace.ts`:

```typescript
export type EncodedValue = null | boolean | number | string | EncodedCompound
export type EncodedCompound = [string, number, ...unknown[]]

export interface Frame {
  funcName: string
  locals: Record<string, EncodedValue>
}

export interface Step {
  line: number
  event: "call" | "line" | "return"
  stack: Frame[]
  stdout: string
}

export interface TraceResult {
  steps: Step[]
  error: string | null
}

export type RenderValue =
  | { kind: "primitive"; display: string }
  | { kind: "ref"; id: number }
  | { kind: "circular"; id: number }

export interface HeapItem {
  key: string
  value: RenderValue
}

export interface HeapObject {
  id: number
  kind: "LIST" | "TUPLE" | "SET" | "DICT" | "INSTANCE" | "FUNCTION" | "OTHER"
  label: string
  items: HeapItem[]
}
```

- [ ] **Step 2: Write a failing test for the API client**

`frontend/src/api/traceClient.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest"
import { traceCode } from "./traceClient"

describe("traceCode", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [], error: null }),
      }),
    )
  })

  it("POSTs the code to /api/trace and returns the parsed result", async () => {
    const result = await traceCode("x = 1")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/trace"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "x = 1" }),
      }),
    )
    expect(result).toEqual({ steps: [], error: null })
  })

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )

    await expect(traceCode("x = 1")).rejects.toThrow("Trace request failed: 500")
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/api/traceClient.test.ts
```

Expected: FAIL (`traceClient.ts` doesn't exist yet)

- [ ] **Step 4: Implement the API client**

`frontend/src/api/traceClient.ts`:

```typescript
import type { TraceResult } from "../types/trace"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000"

export async function traceCode(code: string): Promise<TraceResult> {
  const response = await fetch(`${API_BASE}/api/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    throw new Error(`Trace request failed: ${response.status}`)
  }

  return (await response.json()) as TraceResult
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/api/traceClient.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/trace.ts frontend/src/api/traceClient.ts frontend/src/api/traceClient.test.ts
git commit -m "feat(frontend): add trace types and API client"
```

---

## Task 8: `decodeValue` utilities

**Files:**
- Create: `frontend/src/utils/decodeValue.ts`
- Create: `frontend/src/utils/decodeValue.test.ts`

**Interfaces:**
- Consumes: `EncodedValue`, `Step`, `RenderValue`, `HeapObject`, `HeapItem` from `frontend/src/types/trace.ts` (Task 7).
- Produces: `toRenderValue(value: EncodedValue): RenderValue` and `collectHeap(step: Step): Map<number, HeapObject>`. Consumed by `ValueCell`, `StackPanel`, `HeapPanel` (Tasks 13-14) and `App.tsx` (Task 17).

- [ ] **Step 1: Write failing tests for `toRenderValue`**

`frontend/src/utils/decodeValue.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { toRenderValue, collectHeap } from "./decodeValue"
import type { Step } from "../types/trace"

describe("toRenderValue", () => {
  it("renders None/True/False/numbers/strings as primitives", () => {
    expect(toRenderValue(null)).toEqual({ kind: "primitive", display: "None" })
    expect(toRenderValue(true)).toEqual({ kind: "primitive", display: "True" })
    expect(toRenderValue(false)).toEqual({ kind: "primitive", display: "False" })
    expect(toRenderValue(42)).toEqual({ kind: "primitive", display: "42" })
    expect(toRenderValue("hi")).toEqual({ kind: "primitive", display: '"hi"' })
  })

  it("renders a compound value as a ref", () => {
    expect(toRenderValue(["LIST", 7, 1, 2])).toEqual({ kind: "ref", id: 7 })
  })

  it("renders a circular reference distinctly", () => {
    expect(toRenderValue(["CIRCULAR_REF", 3])).toEqual({ kind: "circular", id: 3 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/utils/decodeValue.test.ts
```

Expected: FAIL (`decodeValue.ts` doesn't exist yet)

- [ ] **Step 3: Implement `toRenderValue` and the internal `toHeapObject` helper**

`frontend/src/utils/decodeValue.ts`:

```typescript
import type { EncodedValue, Step, RenderValue, HeapObject, HeapItem } from "../types/trace"

function isCompound(value: EncodedValue): value is [string, number, ...unknown[]] {
  return Array.isArray(value)
}

function formatPrimitive(value: null | boolean | number | string): string {
  if (value === null) return "None"
  if (value === true) return "True"
  if (value === false) return "False"
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

export function toRenderValue(value: EncodedValue): RenderValue {
  if (!isCompound(value)) {
    return { kind: "primitive", display: formatPrimitive(value) }
  }
  const [tag, id] = value
  if (tag === "CIRCULAR_REF") {
    return { kind: "circular", id: id as number }
  }
  return { kind: "ref", id: id as number }
}

function toHeapObject(value: [string, number, ...unknown[]]): HeapObject {
  const [tag, id, ...rest] = value

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    const items: HeapItem[] = (rest as EncodedValue[]).map((v, i) => ({
      key: String(i),
      value: toRenderValue(v),
    }))
    return { id, kind: tag, label: tag.toLowerCase(), items }
  }

  if (tag === "DICT") {
    const items: HeapItem[] = (rest as [EncodedValue, EncodedValue][]).map(([k, v]) => ({
      key: formatPrimitive(k as null | boolean | number | string),
      value: toRenderValue(v),
    }))
    return { id, kind: "DICT", label: "dict", items }
  }

  if (tag === "INSTANCE") {
    const [className, ...attrs] = rest as [string, ...[string, EncodedValue][]]
    const items: HeapItem[] = attrs.map(([k, v]) => ({ key: k, value: toRenderValue(v) }))
    return { id, kind: "INSTANCE", label: className, items }
  }

  if (tag === "FUNCTION") {
    const [name] = rest as [string]
    return { id, kind: "FUNCTION", label: `function ${name}`, items: [] }
  }

  return { id, kind: "OTHER", label: String(rest[rest.length - 1] ?? tag), items: [] }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/utils/decodeValue.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing tests for `collectHeap`**

Append to `frontend/src/utils/decodeValue.test.ts`:

```typescript
describe("collectHeap", () => {
  function stepWithLocals(locals: Record<string, unknown>): Step {
    return {
      line: 1,
      event: "line",
      stack: [{ funcName: "<module>", locals: locals as Step["stack"][number]["locals"] }],
      stdout: "",
    }
  }

  it("collects a top-level compound value", () => {
    const step = stepWithLocals({ a: ["LIST", 1, 10, 20] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
    expect(heap.get(1)).toEqual({
      id: 1,
      kind: "LIST",
      label: "list",
      items: [
        { key: "0", value: { kind: "primitive", display: "10" } },
        { key: "1", value: { kind: "primitive", display: "20" } },
      ],
    })
  })

  it("recurses into nested compounds and dedupes shared references", () => {
    const nested = ["LIST", 2, 1]
    const step = stepWithLocals({
      a: ["DICT", 1, [nested, 5]],
      b: nested,
    })
    const heap = collectHeap(step)

    expect(heap.size).toBe(2)
    expect(heap.has(1)).toBe(true)
    expect(heap.has(2)).toBe(true)
  })

  it("does not infinitely recurse into a circular reference", () => {
    const step = stepWithLocals({ a: ["LIST", 1, ["CIRCULAR_REF", 1]] })
    const heap = collectHeap(step)

    expect(heap.size).toBe(1)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/utils/decodeValue.test.ts
```

Expected: FAIL (`collectHeap` is not exported yet)

- [ ] **Step 7: Implement `collectHeap`**

Append to `frontend/src/utils/decodeValue.ts`:

```typescript
function rawChildren(value: [string, number, ...unknown[]]): EncodedValue[] {
  const [tag, , ...rest] = value

  if (tag === "LIST" || tag === "TUPLE" || tag === "SET") {
    return rest as EncodedValue[]
  }
  if (tag === "DICT") {
    return (rest as [EncodedValue, EncodedValue][]).flat()
  }
  if (tag === "INSTANCE") {
    const [, ...attrs] = rest as [string, ...[string, EncodedValue][]]
    return attrs.map(([, v]) => v)
  }
  return []
}

export function collectHeap(step: Step): Map<number, HeapObject> {
  const heap = new Map<number, HeapObject>()

  function visit(value: EncodedValue): void {
    if (!isCompound(value)) return
    const [tag, id] = value
    if (tag === "CIRCULAR_REF" || tag === "FUNCTION") return
    if (heap.has(id as number)) return

    heap.set(id as number, toHeapObject(value as [string, number, ...unknown[]]))
    for (const child of rawChildren(value as [string, number, ...unknown[]])) {
      visit(child)
    }
  }

  for (const frame of step.stack) {
    for (const value of Object.values(frame.locals)) {
      visit(value)
    }
  }

  return heap
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/utils/decodeValue.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/decodeValue.ts frontend/src/utils/decodeValue.test.ts
git commit -m "feat(frontend): decode encoded values into render-ready primitives and a deduped heap map"
```

---

## Task 9: Trace state store

**Files:**
- Create: `frontend/src/state/traceReducer.ts`
- Create: `frontend/src/state/traceReducer.test.ts`
- Create: `frontend/src/state/traceStore.tsx`
- Create: `frontend/src/state/traceStore.test.tsx`

**Interfaces:**
- Consumes: `TraceResult`, `Step` from `frontend/src/types/trace.ts` (Task 7); `traceCode` from `frontend/src/api/traceClient.ts` (Task 7).
- Produces: `traceReducer(state, action): TraceState` (pure, exported for testing); `TraceProvider` component and `useTrace(): { state: TraceState, dispatch, runCode: (code: string) => Promise<void> }` hook. Consumed by every UI component from Task 10 onward.

- [ ] **Step 1: Write failing tests for the reducer**

`frontend/src/state/traceReducer.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { traceReducer, type TraceState } from "./traceReducer"
import type { Step } from "../types/trace"

const STEPS: Step[] = [
  { line: 1, event: "line", stack: [], stdout: "" },
  { line: 2, event: "line", stack: [], stdout: "" },
  { line: 3, event: "line", stack: [], stdout: "" },
]

const initial: TraceState = {
  steps: [],
  error: null,
  currentStepIndex: 0,
  isPlaying: false,
  isLoading: false,
}

const loaded: TraceState = { ...initial, steps: STEPS }

describe("traceReducer", () => {
  it("RUN_START clears previous state and sets isLoading", () => {
    const result = traceReducer(loaded, { type: "RUN_START" })
    expect(result).toEqual({ ...initial, isLoading: true })
  })

  it("RUN_SUCCESS loads steps and resets to the first one", () => {
    const result = traceReducer(
      { ...initial, isLoading: true },
      { type: "RUN_SUCCESS", result: { steps: STEPS, error: null } },
    )
    expect(result.steps).toBe(STEPS)
    expect(result.currentStepIndex).toBe(0)
    expect(result.isLoading).toBe(false)
    expect(result.error).toBeNull()
  })

  it("NEXT and PREV move within bounds", () => {
    let state = { ...loaded, currentStepIndex: 0 }
    state = traceReducer(state, { type: "NEXT" })
    expect(state.currentStepIndex).toBe(1)
    state = traceReducer(state, { type: "PREV" })
    expect(state.currentStepIndex).toBe(0)
    state = traceReducer(state, { type: "PREV" })
    expect(state.currentStepIndex).toBe(0) // clamped, not negative
  })

  it("LAST and FIRST jump to the ends", () => {
    expect(traceReducer(loaded, { type: "LAST" }).currentStepIndex).toBe(2)
    expect(
      traceReducer({ ...loaded, currentStepIndex: 2 }, { type: "FIRST" }).currentStepIndex,
    ).toBe(0)
  })

  it("SCRUB_TO clamps to valid range", () => {
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: 1 }).currentStepIndex).toBe(1)
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: 99 }).currentStepIndex).toBe(2)
    expect(traceReducer(loaded, { type: "SCRUB_TO", index: -5 }).currentStepIndex).toBe(0)
  })

  it("PLAY/PAUSE toggle isPlaying", () => {
    expect(traceReducer(loaded, { type: "PLAY" }).isPlaying).toBe(true)
    expect(traceReducer({ ...loaded, isPlaying: true }, { type: "PAUSE" }).isPlaying).toBe(false)
  })

  it("TICK advances one step and stops playing at the end", () => {
    const midway = { ...loaded, currentStepIndex: 1, isPlaying: true }
    const advanced = traceReducer(midway, { type: "TICK" })
    expect(advanced.currentStepIndex).toBe(2)
    expect(advanced.isPlaying).toBe(true)

    const atEnd = traceReducer(advanced, { type: "TICK" })
    expect(atEnd.currentStepIndex).toBe(2)
    expect(atEnd.isPlaying).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/state/traceReducer.test.ts
```

Expected: FAIL (`traceReducer.ts` doesn't exist yet)

- [ ] **Step 3: Implement the reducer**

`frontend/src/state/traceReducer.ts`:

```typescript
import type { Step, TraceResult } from "../types/trace"

export interface TraceState {
  steps: Step[]
  error: string | null
  currentStepIndex: number
  isPlaying: boolean
  isLoading: boolean
}

export type TraceAction =
  | { type: "RUN_START" }
  | { type: "RUN_SUCCESS"; result: TraceResult }
  | { type: "RUN_ERROR"; message: string }
  | { type: "FIRST" }
  | { type: "PREV" }
  | { type: "NEXT" }
  | { type: "LAST" }
  | { type: "SCRUB_TO"; index: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TICK" }

export const initialTraceState: TraceState = {
  steps: [],
  error: null,
  currentStepIndex: 0,
  isPlaying: false,
  isLoading: false,
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0
  return Math.max(0, Math.min(index, length - 1))
}

export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case "RUN_START":
      return { ...initialTraceState, isLoading: true }
    case "RUN_SUCCESS":
      return {
        ...state,
        isLoading: false,
        steps: action.result.steps,
        error: action.result.error,
        currentStepIndex: 0,
        isPlaying: false,
      }
    case "RUN_ERROR":
      return { ...initialTraceState, error: action.message }
    case "FIRST":
      return { ...state, currentStepIndex: 0, isPlaying: false }
    case "PREV":
      return {
        ...state,
        currentStepIndex: clampIndex(state.currentStepIndex - 1, state.steps.length),
        isPlaying: false,
      }
    case "NEXT":
      return {
        ...state,
        currentStepIndex: clampIndex(state.currentStepIndex + 1, state.steps.length),
        isPlaying: false,
      }
    case "LAST":
      return {
        ...state,
        currentStepIndex: clampIndex(state.steps.length - 1, state.steps.length),
        isPlaying: false,
      }
    case "SCRUB_TO":
      return {
        ...state,
        currentStepIndex: clampIndex(action.index, state.steps.length),
        isPlaying: false,
      }
    case "PLAY":
      return { ...state, isPlaying: true }
    case "PAUSE":
      return { ...state, isPlaying: false }
    case "TICK": {
      const next = state.currentStepIndex + 1
      if (next >= state.steps.length) {
        return { ...state, isPlaying: false }
      }
      return { ...state, currentStepIndex: next }
    }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/state/traceReducer.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement the context/provider around the reducer**

`frontend/src/state/traceStore.tsx`:

```tsx
import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react"
import {
  traceReducer,
  initialTraceState,
  type TraceState,
  type TraceAction,
} from "./traceReducer"
import { traceCode } from "../api/traceClient"

interface TraceContextValue {
  state: TraceState
  dispatch: React.Dispatch<TraceAction>
  runCode: (code: string) => Promise<void>
}

const TraceContext = createContext<TraceContextValue | null>(null)

const STEP_INTERVAL_MS = 700

export function TraceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(traceReducer, initialTraceState)

  useEffect(() => {
    if (!state.isPlaying) return
    const id = setInterval(() => dispatch({ type: "TICK" }), STEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state.isPlaying])

  async function runCode(code: string) {
    dispatch({ type: "RUN_START" })
    try {
      const result = await traceCode(code)
      dispatch({ type: "RUN_SUCCESS", result })
    } catch (err) {
      dispatch({ type: "RUN_ERROR", message: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  return (
    <TraceContext.Provider value={{ state, dispatch, runCode }}>
      {children}
    </TraceContext.Provider>
  )
}

export function useTrace(): TraceContextValue {
  const ctx = useContext(TraceContext)
  if (!ctx) throw new Error("useTrace must be used within a TraceProvider")
  return ctx
}
```

- [ ] **Step 6: Write a failing test that the provider wires runCode through to state**

`frontend/src/state/traceStore.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { TraceProvider, useTrace } from "./traceStore"

function Probe() {
  const { state, runCode } = useTrace()
  return (
    <div>
      <button onClick={() => runCode("x = 1")}>run</button>
      <span>steps: {state.steps.length}</span>
      <span>loading: {String(state.isLoading)}</span>
    </div>
  )
}

describe("TraceProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [{ line: 1, event: "line", stack: [], stdout: "" }], error: null }),
      }),
    )
  })

  it("runCode fetches a trace and loads it into state", async () => {
    render(
      <TraceProvider>
        <Probe />
      </TraceProvider>,
    )
    fireEvent.click(screen.getByText("run"))
    expect(await screen.findByText("steps: 1")).toBeInTheDocument()
    expect(screen.getByText("loading: false")).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/state/traceStore.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/state/traceReducer.ts frontend/src/state/traceReducer.test.ts frontend/src/state/traceStore.tsx frontend/src/state/traceStore.test.tsx
git commit -m "feat(frontend): add trace reducer/context store with play/pause ticking"
```

---

## Task 10: `CodeEditor` component

**Files:**
- Create: `frontend/src/components/CodeEditor.tsx`
- Create: `frontend/src/components/CodeEditor.test.tsx`

**Interfaces:**
- Produces: `CodeEditor({ code, onChange, currentLine }: { code: string; onChange: (code: string) => void; currentLine: number | null })`. Consumed by `EditorPanel` (Task 11).

- [ ] **Step 1: Write a failing smoke test**

`frontend/src/components/CodeEditor.test.tsx`:

```tsx
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CodeEditor } from "./CodeEditor"

describe("CodeEditor", () => {
  it("renders the given code", () => {
    const { container } = render(
      <CodeEditor code="x = 1" onChange={vi.fn()} currentLine={null} />,
    )
    expect(container.textContent).toContain("x = 1")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/components/CodeEditor.test.tsx
```

Expected: FAIL (`CodeEditor.tsx` doesn't exist yet)

- [ ] **Step 3: Implement the code editor with current-line highlighting**

`frontend/src/components/CodeEditor.tsx`:

```tsx
import { useEffect, useMemo, useRef } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
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
  const viewRef = useRef<ReactCodeMirrorRef | null>(null)
  const extensions = useMemo(() => [python(), currentLineField], [])

  useEffect(() => {
    const view = viewRef.current?.view
    if (view && currentLine !== null) {
      view.dispatch({ effects: setCurrentLine.of(currentLine) })
    }
  }, [currentLine])

  return (
    <CodeMirror
      ref={viewRef}
      value={code}
      height="100%"
      theme="dark"
      extensions={extensions}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/components/CodeEditor.test.tsx
```

Expected: PASS. If CodeMirror fails to mount under jsdom with a layout-measurement error, that is a known jsdom limitation — check the `@uiw/react-codemirror` docs for a jsdom-compatible test setup (e.g. mocking `document.createRange` or `getClientRects`) and add the fix to `frontend/src/test/setup.ts` rather than removing the test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CodeEditor.tsx frontend/src/components/CodeEditor.test.tsx
git commit -m "feat(frontend): add CodeMirror 6 editor with current-line highlighting"
```

---

## Task 11: `EditorPanel` component

**Files:**
- Create: `frontend/src/components/EditorPanel.tsx`
- Create: `frontend/src/components/EditorPanel.test.tsx`

**Interfaces:**
- Consumes: `CodeEditor` (Task 10); `useTrace` from `frontend/src/state/traceStore.tsx` (Task 9).
- Produces: `EditorPanel` component (no props — reads/writes trace state via context). Consumed by `App.tsx` (Task 17).

- [ ] **Step 1: Write a failing test for running code and the loading state**

`frontend/src/components/EditorPanel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { TraceProvider } from "../state/traceStore"
import { EditorPanel } from "./EditorPanel"

describe("EditorPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [{ line: 1, event: "line", stack: [], stdout: "" }], error: null }),
      }),
    )
  })

  it("runs the code and shows a loading state while the request is in flight", async () => {
    render(
      <TraceProvider>
        <EditorPanel />
      </TraceProvider>,
    )
    fireEvent.click(screen.getByText("Run"))
    expect(await screen.findByText("Running…")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Run")).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/components/EditorPanel.test.tsx
```

Expected: FAIL (`EditorPanel.tsx` doesn't exist yet)

- [ ] **Step 3: Implement `EditorPanel`**

`frontend/src/components/EditorPanel.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/components/EditorPanel.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EditorPanel.tsx frontend/src/components/EditorPanel.test.tsx
git commit -m "feat(frontend): add EditorPanel wiring the code editor to the Run action"
```

---

## Task 12: `TransportControls` component

**Files:**
- Create: `frontend/src/components/TransportControls.tsx`
- Create: `frontend/src/components/TransportControls.test.tsx`

**Interfaces:**
- Consumes: `useTrace` from `frontend/src/state/traceStore.tsx` (Task 9).
- Produces: `TransportControls` component (no props). Consumed by `App.tsx` (Task 17).

- [ ] **Step 1: Write failing tests for step navigation**

`frontend/src/components/TransportControls.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it } from "vitest"
import { TraceProvider, useTrace } from "../state/traceStore"
import { TransportControls } from "./TransportControls"
import type { Step } from "../types/trace"

const FIXTURE_STEPS: Step[] = [
  { line: 1, event: "line", stack: [], stdout: "" },
  { line: 2, event: "line", stack: [], stdout: "" },
  { line: 3, event: "line", stack: [], stdout: "" },
]

function Seed() {
  const { dispatch } = useTrace()
  useEffect(() => {
    dispatch({ type: "RUN_SUCCESS", result: { steps: FIXTURE_STEPS, error: null } })
  }, [dispatch])
  return null
}

function renderWithSeed() {
  return render(
    <TraceProvider>
      <Seed />
      <TransportControls />
    </TraceProvider>,
  )
}

describe("TransportControls", () => {
  it("shows the current step position", () => {
    renderWithSeed()
    expect(screen.getByText("1 / 3")).toBeInTheDocument()
  })

  it("advances to the next step on click", () => {
    renderWithSeed()
    fireEvent.click(screen.getByText("⏩"))
    expect(screen.getByText("2 / 3")).toBeInTheDocument()
  })

  it("jumps to the last step", () => {
    renderWithSeed()
    fireEvent.click(screen.getByText("⏭"))
    expect(screen.getByText("3 / 3")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/components/TransportControls.test.tsx
```

Expected: FAIL (`TransportControls.tsx` doesn't exist yet)

- [ ] **Step 3: Implement `TransportControls`**

`frontend/src/components/TransportControls.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/components/TransportControls.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TransportControls.tsx frontend/src/components/TransportControls.test.tsx
git commit -m "feat(frontend): add step transport controls"
```

---

## Task 13: `ValueCell` + `StackPanel` components

**Files:**
- Create: `frontend/src/components/ValueCell.tsx`
- Create: `frontend/src/components/StackPanel.tsx`
- Create: `frontend/src/components/StackPanel.test.tsx`

**Interfaces:**
- Consumes: `RenderValue`, `Frame` types (Task 7); `toRenderValue` (Task 8).
- Produces: `ValueCell({ value: RenderValue })` (renders `data-ref-source={id}` for `ref` values — consumed by `HeapArrows` in Task 15) and `StackPanel({ stack: Frame[] })`. Both consumed by `HeapPanel` (Task 14) and `App.tsx` (Task 17).

- [ ] **Step 1: Implement `ValueCell`**

`frontend/src/components/ValueCell.tsx`:

```tsx
import type { RenderValue } from "../types/trace"

export function ValueCell({ value }: { value: RenderValue }) {
  if (value.kind === "primitive") {
    return <span className="value-cell value-cell--primitive">{value.display}</span>
  }
  if (value.kind === "circular") {
    return <span className="value-cell value-cell--circular">↺ #{value.id}</span>
  }
  return (
    <span className="value-cell value-cell--ref" data-ref-source={value.id}>
      ref → #{value.id}
    </span>
  )
}
```

(No dedicated test file for this trivial presentational component — it is exercised through `StackPanel.test.tsx` below and `HeapPanel.test.tsx` in Task 14.)

- [ ] **Step 2: Write failing tests for `StackPanel`**

`frontend/src/components/StackPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StackPanel } from "./StackPanel"
import type { Frame } from "../types/trace"

describe("StackPanel", () => {
  it("shows a message when there is no active frame", () => {
    render(<StackPanel stack={[]} />)
    expect(screen.getByText("No active frame")).toBeInTheDocument()
  })

  it("renders frames innermost-first with primitive and ref values", () => {
    const stack: Frame[] = [
      { funcName: "<module>", locals: { x: 1 } },
      { funcName: "add", locals: { total: ["LIST", 7, 1, 2] } },
    ]
    render(<StackPanel stack={stack} />)

    const titles = screen.getAllByText(/^(<module>|add)$/)
    expect(titles[0]).toHaveTextContent("add")
    expect(titles[1]).toHaveTextContent("<module>")
    expect(screen.getByText("ref → #7")).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/components/StackPanel.test.tsx
```

Expected: FAIL (`StackPanel.tsx` doesn't exist yet)

- [ ] **Step 4: Implement `StackPanel`**

`frontend/src/components/StackPanel.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/components/StackPanel.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ValueCell.tsx frontend/src/components/StackPanel.tsx frontend/src/components/StackPanel.test.tsx
git commit -m "feat(frontend): add ValueCell and StackPanel components"
```

---

## Task 14: `HeapPanel` component

**Files:**
- Create: `frontend/src/components/HeapPanel.tsx`
- Create: `frontend/src/components/HeapPanel.test.tsx`

**Interfaces:**
- Consumes: `HeapObject` type (Task 7); `ValueCell` (Task 13).
- Produces: `HeapPanel({ heap: Map<number, HeapObject> })`, rendering each object with `data-heap-target={id}` on its header (consumed by `HeapArrows` in Task 15). Consumed by `App.tsx` (Task 17).

- [ ] **Step 1: Write failing tests for `HeapPanel`**

`frontend/src/components/HeapPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HeapPanel } from "./HeapPanel"
import type { HeapObject } from "../types/trace"

describe("HeapPanel", () => {
  it("shows a message when the heap is empty", () => {
    render(<HeapPanel heap={new Map()} />)
    expect(screen.getByText("No heap objects")).toBeInTheDocument()
  })

  it("renders a heap object with its id, label, and items", () => {
    const heap = new Map<number, HeapObject>([
      [
        3,
        {
          id: 3,
          kind: "LIST",
          label: "list",
          items: [
            { key: "0", value: { kind: "primitive", display: "1" } },
            { key: "1", value: { kind: "ref", id: 9 } },
          ],
        },
      ],
    ])
    render(<HeapPanel heap={heap} />)

    expect(screen.getByText("#3 list")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("ref → #9")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- src/components/HeapPanel.test.tsx
```

Expected: FAIL (`HeapPanel.tsx` doesn't exist yet)

- [ ] **Step 3: Implement `HeapPanel`**

`frontend/src/components/HeapPanel.tsx`:

```tsx
import type { HeapObject } from "../types/trace"
import { ValueCell } from "./ValueCell"

interface HeapPanelProps {
  heap: Map<number, HeapObject>
}

export function HeapPanel({ heap }: HeapPanelProps) {
  const objects = Array.from(heap.values())

  if (objects.length === 0) {
    return <div className="heap-panel heap-panel--empty">No heap objects</div>
  }

  return (
    <div className="heap-panel">
      {objects.map((obj) => (
        <div className="heap-box" key={obj.id}>
          <div className="heap-box__header" data-heap-target={obj.id}>
            #{obj.id} {obj.label}
          </div>
          {obj.items.length > 0 && (
            <table className="heap-box__items">
              <tbody>
                {obj.items.map((item, i) => (
                  <tr key={`${item.key}-${i}`}>
                    <td className="heap-item-key">{item.key}</td>
                    <td className="heap-item-value">
                      <ValueCell value={item.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npm test -- src/components/HeapPanel.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HeapPanel.tsx frontend/src/components/HeapPanel.test.tsx
git commit -m "feat(frontend): add HeapPanel rendering deduped heap objects"
```

---

## Task 15: Heap reference arrows (`HeapArrows`)

**Files:**
- Create: `frontend/src/components/HeapArrows.tsx`
- Create: `frontend/src/components/HeapArrows.test.tsx`

**Interfaces:**
- Consumes: `data-ref-source` attribute from `ValueCell` (Task 13) and `data-heap-target` attribute from `HeapPanel` (Task 14), both present in the DOM at render time.
- Produces: `HeapArrows({ containerRef: RefObject<HTMLElement>, redrawKey: unknown })`, an absolutely-positioned SVG overlay drawing a line between every matching source/target pair found inside `containerRef`. Consumed by `App.tsx` (Task 17), which passes a ref to the wrapper containing both `StackPanel` and `HeapPanel`.

- [ ] **Step 1: Write a failing test with mocked bounding rects**

`frontend/src/components/HeapArrows.test.tsx`:

```tsx
import { render } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { HeapArrows } from "./HeapArrows"

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <span data-ref-source="3">ref</span>
      <div data-heap-target="3">box</div>
      <HeapArrows containerRef={ref} redrawKey={0} />
    </div>
  )
}

describe("HeapArrows", () => {
  it("draws one line between a ref source and its heap target", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.refSource) {
        return { top: 10, left: 10, right: 30, bottom: 20, width: 20, height: 10 } as DOMRect
      }
      if (this.dataset.heapTarget) {
        return { top: 50, left: 100, right: 150, bottom: 70, width: 50, height: 20 } as DOMRect
      }
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })

    const { container } = render(<Harness />)
    const lines = container.querySelectorAll("line")

    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute("x1")).toBe("30")
    expect(lines[0].getAttribute("y1")).toBe("15")
    expect(lines[0].getAttribute("x2")).toBe("100")
    expect(lines[0].getAttribute("y2")).toBe("60")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/components/HeapArrows.test.tsx
```

Expected: FAIL (`HeapArrows.tsx` doesn't exist yet)

- [ ] **Step 3: Implement `HeapArrows`**

`frontend/src/components/HeapArrows.tsx`:

```tsx
import { useLayoutEffect, useState, type RefObject } from "react"

interface Arrow {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface HeapArrowsProps {
  containerRef: RefObject<HTMLElement>
  redrawKey: unknown
}

export function HeapArrows({ containerRef, redrawKey }: HeapArrowsProps) {
  const [arrows, setArrows] = useState<Arrow[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    function recompute() {
      const containerRect = container!.getBoundingClientRect()
      const sources = Array.from(container!.querySelectorAll<HTMLElement>("[data-ref-source]"))
      const next: Arrow[] = []

      sources.forEach((source, i) => {
        const targetId = source.dataset.refSource
        const target = container!.querySelector<HTMLElement>(`[data-heap-target="${targetId}"]`)
        if (!target) return

        const sourceRect = source.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        next.push({
          id: `${targetId}-${i}`,
          x1: sourceRect.right - containerRect.left,
          y1: sourceRect.top + sourceRect.height / 2 - containerRect.top,
          x2: targetRect.left - containerRect.left,
          y2: targetRect.top + targetRect.height / 2 - containerRect.top,
        })
      })

      setArrows(next)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, redrawKey])

  return (
    <svg className="heap-arrows" aria-hidden="true">
      {arrows.map((arrow) => (
        <line key={arrow.id} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} className="heap-arrow-line" />
      ))}
    </svg>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/components/HeapArrows.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HeapArrows.tsx frontend/src/components/HeapArrows.test.tsx
git commit -m "feat(frontend): draw SVG arrows between variables and their heap objects"
```

---

## Task 16: `ErrorBanner` + full dark theme styling

**Files:**
- Create: `frontend/src/components/ErrorBanner.tsx`
- Create: `frontend/src/components/ErrorBanner.test.tsx`
- Modify: `frontend/src/theme.css`

**Interfaces:**
- Produces: `ErrorBanner({ message: string })`. Consumed by `App.tsx` (Task 17).

- [ ] **Step 1: Write a failing test for `ErrorBanner`**

`frontend/src/components/ErrorBanner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ErrorBanner } from "./ErrorBanner"

describe("ErrorBanner", () => {
  it("renders the error message with an alert role", () => {
    render(<ErrorBanner message="SyntaxError: invalid syntax (line 1)" />)
    expect(screen.getByRole("alert")).toHaveTextContent("SyntaxError: invalid syntax (line 1)")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/components/ErrorBanner.test.tsx
```

Expected: FAIL (`ErrorBanner.tsx` doesn't exist yet)

- [ ] **Step 3: Implement `ErrorBanner`**

`frontend/src/components/ErrorBanner.tsx`:

```tsx
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      {message}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/components/ErrorBanner.test.tsx
```

Expected: PASS

- [ ] **Step 5: Expand the theme with component-level styling and step transitions**

Append to `frontend/src/theme.css`:

```css
.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.5rem;
}

.editor-panel__code {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.editor-panel__run {
  align-self: flex-start;
  background: var(--accent);
  color: #0a0a0a;
  border: none;
  border-radius: 4px;
  padding: 0.4rem 1rem;
  font-family: var(--font-mono);
  cursor: pointer;
}

.editor-panel__run:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.transport-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.transport-controls button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg);
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}

.transport-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.transport-controls input[type="range"] {
  flex: 1;
}

.frame-card,
.heap-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  animation: fadeIn 200ms ease;
}

.frame-card__title,
.heap-box__header {
  font-weight: bold;
  color: var(--accent);
  margin-bottom: 0.25rem;
}

.var-name,
.heap-item-key {
  color: #9cdcfe;
  padding-right: 0.75rem;
}

.value-cell--ref {
  color: var(--accent);
  cursor: default;
}

.value-cell--circular {
  color: #f48771;
}

.error-banner {
  background: rgba(244, 135, 113, 0.15);
  border: 1px solid #f48771;
  color: #f48771;
  border-radius: 4px;
  padding: 0.5rem;
  margin-top: 0.5rem;
}

.cm-current-line {
  background: rgba(79, 193, 255, 0.15);
}

.heap-arrows {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.heap-arrow-line {
  stroke: var(--accent);
  stroke-width: 1.5;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ErrorBanner.tsx frontend/src/components/ErrorBanner.test.tsx frontend/src/theme.css
git commit -m "feat(frontend): add ErrorBanner and complete the dark theme styling pass"
```

---

## Task 17: Final wiring, README, and manual verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `README.md` (repo root)

**Interfaces:**
- Consumes: every component and store built in Tasks 9-16.
- Produces: the fully assembled application.

- [ ] **Step 1: Update the failing-by-design layout test to match the real app**

Replace `frontend/src/App.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the editor, run button, and empty stack/heap panels", () => {
    render(<App />)
    expect(screen.getByText("Run")).toBeInTheDocument()
    expect(screen.getByText("No active frame")).toBeInTheDocument()
    expect(screen.getByText("No heap objects")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: FAIL (`App.tsx` still renders placeholder text, not the real components)

- [ ] **Step 3: Assemble the real application in `App.tsx`**

`frontend/src/App.tsx`:

```tsx
import { useRef } from "react"
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
  const heap = currentStep ? collectHeap(currentStep) : new Map()

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
        <HeapArrows containerRef={rightPaneRef} redrawKey={state.currentStepIndex} />
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: PASS

- [ ] **Step 5: Run the entire frontend test suite**

```bash
cd frontend && npm test
```

Expected: all tests across every `*.test.ts`/`*.test.tsx` file PASS

- [ ] **Step 6: Write the root README with run instructions**

`README.md`:

```markdown
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
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx README.md
git commit -m "feat(frontend): wire the full visualizer together in App.tsx"
```

- [ ] **Step 8: Manual end-to-end verification**

Start both servers as described in the README, open the frontend in a browser, and verify each of these scenarios by typing the code into the editor, clicking Run, and stepping through with the transport controls:

1. `x = 1\ny = 2\nprint(x + y)` — step through and confirm `x`, `y` appear in the stack panel and stdout accumulates.
2. `a = [1, 2]\nb = a\nb.append(3)` — confirm `a` and `b` both show `ref → #<same id>` and the heap panel shows one list box with the arrow overlay pointing from both variables to it.
3. A recursive function (e.g. factorial of 4) — confirm the stack panel shows multiple `<module>`/function frames growing and shrinking as it recurses and returns.
4. Code that raises an exception (e.g. `1 / 0`) — confirm the error banner shows the exception message and the steps leading up to it are still steppable.
5. Code with a syntax error — confirm the error banner shows a `SyntaxError` message immediately with no steps to play.

If any scenario doesn't behave as expected, treat it as a bug against the relevant task's component rather than a new task — fix it in place before considering the plan complete.
