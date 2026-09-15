from app import app


def test_health_check_returns_ok():
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


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
