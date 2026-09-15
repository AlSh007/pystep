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
