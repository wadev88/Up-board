import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepairActions } from "@/features/repairs/components/RepairActions";
import { renderWithAuth } from "../renderWithAuth";
import { makePost, makeRepair, makeUser } from "../fixtures";

const mutateAsync = vi.fn();
vi.mock("@/features/repairs/hooks", () => ({
  useUpdateRepairStatus: () => ({ mutateAsync, isPending: false }),
}));

const staff = makeUser({ id: 4, role: "building_staff", faculty: null });
const tech = makeUser({ id: 5, role: "technician", faculty: null, is_technician: true });

function repairPost(status: Parameters<typeof makeRepair>[0], technicianId?: number) {
  const repair = makeRepair(status);
  if (technicianId) repair.technician = { id: technicianId, display_name: "ช่าง" };
  return makePost({
    type: "repair",
    repair,
    permissions: { ...makePost().permissions, can_update_status: technicianId !== undefined },
  });
}

describe("RepairActions", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(makePost({ type: "repair", repair: makeRepair("rejected") }));
  });

  it("reject needs a written reason: confirm stays disabled until one is entered", async () => {
    const user = userEvent.setup();
    renderWithAuth(<RepairActions post={repairPost("pending_review")} />, staff);
    await user.click(screen.getByRole("button", { name: "ปฏิเสธคำร้อง" }));
    const confirm = screen.getByRole("button", { name: "ยืนยันปฏิเสธ" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/เหตุผล/), "  ab  ");
    expect(confirm).toBeDisabled(); // < 3 characters after trimming
    await user.type(screen.getByLabelText(/เหตุผล/), "c ไม่ใช่งานซ่อมของมหาวิทยาลัย");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(mutateAsync.mock.calls[0][0].note).toContain("ไม่ใช่งานซ่อม");
  });

  it("building staff can close or send back a job under review", () => {
    renderWithAuth(<RepairActions post={repairPost("pending_review")} />, staff);
    expect(screen.getByRole("button", { name: "ปิดงาน" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ส่งกลับให้ช่างแก้ไข" })).toBeInTheDocument();
  });

  it("the assigned technician starts an assigned job and sends an in-progress one for review", () => {
    const { unmount } = renderWithAuth(<RepairActions post={repairPost("assigned", tech.id)} />, tech);
    expect(screen.getByRole("button", { name: "เริ่มดำเนินการ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ปฏิเสธคำร้อง" })).not.toBeInTheDocument();
    unmount();
    renderWithAuth(<RepairActions post={repairPost("in_progress", tech.id)} />, tech);
    expect(screen.getByRole("button", { name: "ส่งให้กองอาคารตรวจสอบ" })).toBeInTheDocument();
  });

  it("closed and rejected jobs have no actions", () => {
    renderWithAuth(<RepairActions post={repairPost("closed")} />, staff);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
