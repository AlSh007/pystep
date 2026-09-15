import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the three main panes", () => {
    render(<App />)
    expect(screen.getByTestId("layout-editor")).toBeInTheDocument()
    expect(screen.getByTestId("layout-stack")).toBeInTheDocument()
    expect(screen.getByTestId("layout-heap")).toBeInTheDocument()
  })
})
