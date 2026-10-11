import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ApiError } from "@/services/apiClient";
import { UserEditSheet, deleteErrorMessage } from "@/features/admin/components/UserEditSheet";
import { renderWithAuth } from "../renderWithAuth";
import { makeUser } from "../fixtures";

const deleteUser = vi.fn();

// Radix Switch measures itself; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("@/features/admin/api", () => ({
  adminApi: { deleteUser: (id: number) => deleteUser(id), updateUser: vi.fn(), faculties: () => Promise.resolve([]) },
}));
vi.mock("@/features/auth/hooks", () => ({
  useFaculties: () => ({ data: [] }),
}));
vi.mock("@/features/auth/components/FacultyProgramFields", () => ({
  FacultyProgramFields: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const admin = makeUser({ id: 1, role: "admin" });
const target = makeUser({ id: 7, display_name: "สมหญิง", email: "65000007@up.ac.th" });

function open(user = target, onOpenChange = vi.fn()) {
  renderWithAuth(<UserEditSheet user={user} onOpenChange={onOpenChange} />, admin);
  return onOpenChange;
}

describe("UserEditSheet danger zone", () => {
  beforeEach(() => {
    deleteUser.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("asks for confirmation, explains the consequences and then deletes", async () => {
    deleteUser.mockResolvedValue(undefined);
    const onOpenChange = open();
    await userEvent.click(await screen.findByRole("button", { name: "ลบบัญชี" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("เข้าสู่ระบบไม่ได้");
    expect(dialog).toHaveTextContent("โพสต์ทั้งหมดของบัญชีนี้จะถูกลบไปด้วย");
    expect(dialog).toHaveTextContent("สมัครใหม่ด้วยอีเมลเดิมได้ในภายหลัง");
    expect(dialog).toHaveTextContent("ไม่มีข้อมูลเก่า");
    expect(dialog).toHaveTextContent("ไม่สามารถย้อนกลับได้");
    expect(deleteUser).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "ลบบัญชี" }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(7));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancel closes the dialog without deleting", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "ลบบัญชี" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("shows the API reason in a toast on 409", async () => {
    deleteUser.mockRejectedValue(
      new ApiError(409, "TECHNICIAN_HAS_ACTIVE_REPAIRS", "ช่างคนนี้ยังมีงานซ่อมที่ยังไม่เสร็จ 1 รายการ"),
    );
    const onOpenChange = open();
    await userEvent.click(await screen.findByRole("button", { name: "ลบบัญชี" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "ลบบัญชี" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("ช่างคนนี้ยังมีงานซ่อมที่ยังไม่เสร็จ 1 รายการ"),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("disables the delete button on the own row of the admin", async () => {
    open(makeUser({ id: 1, role: "admin", display_name: "ผู้ดูแล" }));
    expect(await screen.findByRole("button", { name: "ลบบัญชี" })).toBeDisabled();
    expect(screen.getByText("ไม่สามารถลบบัญชีของตัวเองได้")).toBeInTheDocument();
  });

  it("maps errors to messages", () => {
    const forbidden = new ApiError(403, "FORBIDDEN", "x");
    expect(deleteErrorMessage(forbidden)).toBe(forbidden.userMessage);
    expect(deleteErrorMessage(new Error("boom"))).toContain("ลบบัญชีไม่สำเร็จ");
  });
});
