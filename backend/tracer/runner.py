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
