import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactList } from "@/features/auth/components/ContactList";

describe("ContactList", () => {
  it("renders nothing when every contact is empty", () => {
    const { container } = render(<ContactList contacts={{ facebook: null, instagram: "  ", line: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the filled-in contacts; URLs become links, plain ids stay text", () => {
    render(<ContactList contacts={{ facebook: "https://facebook.com/club", instagram: null, line: "@upclub" }} />);
    expect(screen.getByRole("link", { name: "https://facebook.com/club" })).toHaveAttribute("href", "https://facebook.com/club");
    expect(screen.getByText("@upclub")).toBeInTheDocument();
    expect(screen.queryByText(/Instagram/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
