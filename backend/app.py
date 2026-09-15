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
