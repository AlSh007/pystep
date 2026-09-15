import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ErrorBanner } from "./ErrorBanner"

describe("ErrorBanner", () => {
  it("renders the error message with an alert role", () => {
    render(<ErrorBanner message="SyntaxError: invalid syntax (line 1)" />)
    expect(screen.getByRole("alert")).toHaveTextContent("SyntaxError: invalid syntax (line 1)")
  })
})
