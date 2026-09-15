from tracer.tracer import Tracer


def test_simple_assignments_are_traced_line_by_line():
    tracer = Tracer()
    steps = tracer.run("x = 1\ny = 2\n")

    assert tracer.error is None
    assert len(steps) >= 2
    last_locals = steps[-1]["stack"][0]["locals"]
    assert last_locals["x"] == 1
    assert last_locals["y"] == 2


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


def test_non_syntax_error_compile_failure_is_caught_and_restores_stdout():
    import sys

    real_stdout = sys.stdout
    tracer = Tracer()
    steps = tracer.run("1" + "+1" * 200000)  # triggers RecursionError during compile

    assert steps == []
    assert tracer.error is not None
    assert sys.stdout is real_stdout


def test_importing_a_stdlib_module_does_not_hang_or_blow_up_the_trace():
    # Regression test: `random` (and any module) has a __dict__, so before
    # the encoder special-cased modules, this line would recurse into the
    # entire module namespace on every step, effectively hanging the tracer.
    import time

    code = "import random\nx = random.randint(1, 10)\n"
    tracer = Tracer(max_steps=1000)

    start = time.time()
    steps = tracer.run(code)
    elapsed = time.time() - start

    assert elapsed < 5, f"tracer took {elapsed}s, likely hung expanding the module"
    assert tracer.error is None
    assert len(steps) > 0
    last_locals = steps[-1]["stack"][0]["locals"]
    assert isinstance(last_locals["x"], int)
    # The module reference itself must be a short string, not expanded.
    assert isinstance(last_locals["random"], str)
    assert last_locals["random"].startswith("<module")


def test_max_steps_exceeded_cannot_be_swallowed_by_users_except_exception():
    # Regression test: MaxStepsExceeded must inherit from BaseException (not
    # Exception) so a user's own `except Exception: pass` inside their loop
    # can't catch it and silently continue running untraced (since
    # sys.settrace has already been torn down by the time the exception
    # would otherwise propagate past the loop).
    code = (
        "i = 0\n"
        "while True:\n"
        "    try:\n"
        "        i += 1\n"
        "    except Exception:\n"
        "        pass\n"
    )
    tracer = Tracer(max_steps=50)
    steps = tracer.run(code)

    assert tracer.error is not None
    assert "step limit" in tracer.error
    assert len(steps) <= 51


def test_system_exit_in_user_code_is_caught_and_reported_not_raised():
    # Regression test: SystemExit (raised by sys.exit()) is a BaseException,
    # not an Exception subclass, so it used to escape Tracer.run() entirely
    # instead of being recorded as tracer.error.
    tracer = Tracer()
    steps = tracer.run("x = 1\nimport sys\nsys.exit(0)\n")

    assert tracer.error is not None
    assert "SystemExit" in tracer.error
    assert len(steps) > 0
