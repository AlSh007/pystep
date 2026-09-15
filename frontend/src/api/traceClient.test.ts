import { describe, expect, it, vi, beforeEach } from "vitest"
import { traceCode } from "./traceClient"

describe("traceCode", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps: [], error: null }),
      }),
    )
  })

  it("POSTs the code to /api/trace and returns the parsed result", async () => {
    const result = await traceCode("x = 1")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/trace"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "x = 1" }),
      }),
    )
    expect(result).toEqual({ steps: [], error: null })
  })

  it("throws the generic status message when the error body has no error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )

    await expect(traceCode("x = 1")).rejects.toThrow("Trace request failed: 500")
  })

  it("throws the backend's actual error message when the response body provides one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ steps: [], error: "No code provided." }),
      }),
    )

    await expect(traceCode("")).rejects.toThrow("No code provided.")
  })

  it("falls back to the generic message when the error body isn't parseable JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token")
        },
      }),
    )

    await expect(traceCode("x = 1")).rejects.toThrow("Trace request failed: 502")
  })
})
