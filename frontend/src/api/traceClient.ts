import type { TraceResult } from "../types/trace"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000"

export async function traceCode(code: string): Promise<TraceResult> {
  const response = await fetch(`${API_BASE}/api/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    let message = `Trace request failed: ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.error === "string") {
        message = body.error
      }
    } catch {
      // response body wasn't JSON or didn't parse — keep the generic message
    }
    throw new Error(message)
  }

  return (await response.json()) as TraceResult
}
