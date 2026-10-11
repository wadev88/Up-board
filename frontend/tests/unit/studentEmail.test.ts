import { describe, expect, it } from "vitest";
import { roleFromEmail } from "@/lib/studentEmail";

describe("role from the @up.ac.th address", () => {
  it("numeric ids are students, names are teachers", () => {
    expect(roleFromEmail("67024841@up.ac.th")).toBe("student");
    expect(roleFromEmail("somchai.j@up.ac.th")).toBe("teacher");
    expect(roleFromEmail("a65@up.ac.th")).toBe("teacher");
  });
});
