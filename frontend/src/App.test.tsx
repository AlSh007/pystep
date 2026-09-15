import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the editor, run button, and empty stack/heap panels", () => {
    render(<App />)
    expect(screen.getByText("Run")).toBeInTheDocument()
    expect(screen.getByText("No active frame")).toBeInTheDocument()
    expect(screen.getByText("No heap objects")).toBeInTheDocument()
  })
})
