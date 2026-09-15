import time

from tracer.runner import run_code


def test_run_code_success_returns_steps_and_no_error():
    result = run_code("x = 1\n")

    assert result["error"] is None
    assert len(result["steps"]) > 0


def test_run_code_hits_step_limit_on_infinite_loop():
    result = run_code("while True:\n    x = 1\n", max_steps=50, timeout_seconds=5.0)

    assert result["error"] is not None
    assert "step limit" in result["error"]


def test_run_code_times_out_on_a_blocking_call():
    code = "import time\ntime.sleep(10)\n"
    result = run_code(code, max_steps=1000, timeout_seconds=1.0)

    assert result["steps"] == []
    assert "timed out" in result["error"]


def test_run_code_handles_a_large_trace_without_false_timeout():
    # Regression test: a trace payload big enough to exceed the OS pipe buffer
    # used to deadlock the child's queue feeder thread, which kept the child
    # "alive" from the parent's perspective for the entire timeout window and
    # caused the parent to terminate() it and discard a real, valid result.
    code = "x = []\nfor i in range(2000):\n    x.append(i)\n"
    result = run_code(code, max_steps=1000, timeout_seconds=3.0)

    assert result["error"] is not None
    assert "step limit" in result["error"]
    assert len(result["steps"]) > 0  # real steps were preserved, not discarded


def test_run_code_does_not_hang_on_importing_a_stdlib_module():
    # Regression test for the module-expansion hang: this used to blow past
    # the timeout entirely because the encoder recursed into `random`'s full
    # namespace on every recorded step.
    code = "import random\nx = random.randint(1, 10)\n"

    start = time.time()
    result = run_code(code, max_steps=1000, timeout_seconds=5.0)
    elapsed = time.time() - start

    assert elapsed < 5.0, f"run_code took {elapsed}s, expected a fast, non-timeout completion"
    assert result["error"] is None
    assert len(result["steps"]) > 0


def test_run_code_reports_system_exit_quickly_instead_of_timing_out():
    # Regression test: sys.exit() raises SystemExit (a BaseException, not an
    # Exception), which used to escape Tracer.run() and crash the subprocess
    # before it ever called result_queue.put(...). The parent would then
    # wait out the entire timeout and report a misleading "timed out"
    # message instead of the real SystemExit cause.
    code = "x = 1\nimport sys\nsys.exit(0)\n"

    start = time.time()
    result = run_code(code, max_steps=1000, timeout_seconds=3.0)
    elapsed = time.time() - start

    assert elapsed < 3.0, f"run_code took {elapsed}s, expected a fast completion, not a timeout"
    assert result["error"] is not None
    assert "SystemExit" in result["error"]
    assert "timed out" not in result["error"]
