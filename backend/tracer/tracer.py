import sys
from io import StringIO

from tracer.encoder import ValueEncoder

IGNORED_NAMES = {
    "__builtins__", "__name__", "__doc__", "__package__",
    "__loader__", "__spec__", "__annotations__",
}


class MaxStepsExceeded(BaseException):
    # Deliberately inherits from BaseException, not Exception: user code
    # that does `except Exception:` (or a bare `except:` on Exception-like
    # patterns) must NOT be able to swallow the step-limit signal and
    # silently continue looping untraced once sys.settrace has already
    # been disabled by that point.
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
            try:
                compiled = compile(code, "<user_code>", "exec")
            except SyntaxError as e:
                self.error = f"SyntaxError: {e.msg} (line {e.lineno})"
                return self.steps
            except Exception as e:
                self.error = f"{type(e).__name__}: {e}"
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
                except BaseException as e:
                    # Catches SystemExit, KeyboardInterrupt, and any other
                    # BaseException the user's code raises (e.g. sys.exit()),
                    # none of which are Exception subclasses. Without this,
                    # such an exception would escape run() entirely, and in
                    # the subprocess runner that means the child process dies
                    # without ever posting a result to the queue.
                    self.error = f"{type(e).__name__}: {e}"
            finally:
                sys.settrace(old_trace)
        finally:
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
