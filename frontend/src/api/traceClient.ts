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
