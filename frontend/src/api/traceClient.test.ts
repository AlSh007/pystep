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

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )

    await expect(traceCode("x = 1")).rejects.toThrow("Trace request failed: 500")
  })
})
