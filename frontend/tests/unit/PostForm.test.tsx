import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildUpdatePostBody, postToFormValues } from "@/features/posts/formBody";
import { PostForm } from "@/features/posts/components/PostForm";
import { renderWithAuth } from "../renderWithAuth";
import { makePost, makeUser } from "../fixtures";

const mutateAsync = vi.fn();

vi.mock("@/features/posts/hooks", () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn() }),
  useUpdatePost: () => ({ mutateAsync }),
}));

const postWithImages = makePost({
  attachments: [
    { id: 11, url: "/files/a.jpg", mime_type: "image/jpeg", size_bytes: 1000, kind: "image" },
    { id: 12, url: "/files/b.jpg", mime_type: "image/jpeg", size_bytes: 1000, kind: "image" },
  ],
  permissions: { can_edit: true, can_delete: true, can_pin: false, can_update_status: false, can_assign: false, can_set_priority: false, can_report: false },
});

describe("buildUpdatePostBody", () => {
  const initial = postToFormValues(postWithImages);

  it("returns an empty body when nothing changed", () => {
    expect(buildUpdatePostBody(initial, { ...initial })).toEqual({});
  });

  it("sends only the changed fields", () => {
    expect(buildUpdatePostBody(initial, { ...initial, title: "หัวข้อใหม่", priority: "high" })).toEqual({
      title: "หัวข้อใหม่",
      priority: "high",
    });
  });

  it("sends attachment_ids only when the images changed", () => {
    expect(buildUpdatePostBody(initial, { ...initial, attachment_ids: [11, 12] })).toEqual({});
    expect(buildUpdatePostBody(initial, { ...initial, attachment_ids: [12] })).toEqual({ attachment_ids: [12] });
    expect(buildUpdatePostBody(initial, { ...initial, attachment_ids: [12, 11] })).toEqual({ attachment_ids: [12, 11] });
  });

  it("never sends event fields for repairs / lost & found", () => {
    const body = buildUpdatePostBody(initial, { ...initial, event_venue: "ห้อง 1" }, { isSpecialType: true });
    expect(body).toEqual({});
  });
});

describe("PostForm (edit)", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockImplementation(async (body: object) => ({ ...postWithImages, ...body }));
  });

  it("PATCHes only the dirty fields — no attachment_ids when images are untouched", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PostForm post={postWithImages} />, makeUser({ id: 7, role: "teacher" }));

    const title = screen.getByLabelText(/หัวข้อ/);
    await user.clear(title);
    await user.type(title, "ประกาศปิดห้องสมุด (แก้ไข)");
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ title: "ประกาศปิดห้องสมุด (แก้ไข)" });
  });

  it("does not call the API when nothing changed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PostForm post={postWithImages} />, makeUser({ id: 7, role: "teacher" }));
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeEnabled());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("marks required controls with aria-required", () => {
    // only building staff / admin choose a priority
    renderWithAuth(<PostForm post={postWithImages} />, makeUser({ id: 7, role: "building_staff" }));
    expect(screen.getByLabelText(/หัวข้อ/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/ความสำคัญ/)).not.toHaveAttribute("aria-required");
  });
});

describe("PostForm (create): priority control", () => {
  it.each(["student", "teacher", "technician", "student_club"] as const)("%s sees no priority selector", (role) => {
    renderWithAuth(<PostForm type="general" />, makeUser({ id: 8, role }));
    expect(screen.queryByLabelText(/ความสำคัญ/)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument(); // the type is never asked again
  });

  it.each(["building_staff", "admin"] as const)("%s can choose a priority", (role) => {
    renderWithAuth(<PostForm type="general" />, makeUser({ id: 8, role }));
    expect(screen.getByLabelText(/ความสำคัญ/)).toBeInTheDocument();
  });
});
