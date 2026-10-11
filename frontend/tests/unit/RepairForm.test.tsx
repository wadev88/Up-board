import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepairForm } from "@/features/repairs/components/RepairForm";
import { renderWithAuth } from "../renderWithAuth";
import { makeUser } from "../fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/features/repairs/hooks", () => ({ useCreateRepair: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/features/auth/components/AccountNotices", () => ({
  SuspensionNotice: () => null,
  useSuspendedUntil: () => null,
}));
vi.mock("@/components/common/ImageUploader", () => ({
  ImageUploader: ({ onChange }: { onChange: (ids: number[]) => void }) => (
    <button type="button" onClick={() => onChange([1, 2])}>
      mock-add-photos
    </button>
  ),
}));

describe("RepairForm wizard", () => {
  it("marks the current step, moves focus to its heading and ends with a summary", async () => {
    const user = userEvent.setup();
    renderWithAuth(<RepairForm />, makeUser());
    const steps = screen.getByRole("list", { name: "ขั้นตอนการแจ้งซ่อม" });
    expect(within(steps).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");

    await user.click(screen.getByText("mock-add-photos"));
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(within(steps).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "ตำแหน่ง" })).toHaveFocus();

    await user.type(screen.getByRole("textbox", { name: /ตำแหน่ง/ }), "อาคาร ICT ชั้น 2");
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    await user.type(screen.getByRole("textbox", { name: /หัวข้อ/ }), "ไฟดับ");
    const summary = screen.getByTestId("repair-summary");
    expect(summary).toHaveTextContent("2 รูป");
    expect(summary).toHaveTextContent("อาคาร ICT ชั้น 2");
    expect(summary).toHaveTextContent("ไฟดับ");
    expect(screen.getByRole("button", { name: "ส่งเรื่องแจ้งซ่อม" })).toBeInTheDocument();
  });
});
