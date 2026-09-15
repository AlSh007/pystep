from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # local dev tool only — open CORS is fine, no auth/session data involved


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
