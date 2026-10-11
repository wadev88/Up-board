import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Can, ProfileGate, RoleGuard } from "@/features/auth/components/Guards";
import { makePost, makeUser } from "../fixtures";
import { renderWithAuth } from "../renderWithAuth";

describe("RoleGuard", () => {
  it("renders children for an allowed role", () => {
    renderWithAuth(
      <RoleGuard roles={["admin"]}>
        <p>แผงผู้ดูแล</p>
      </RoleGuard>,
      makeUser({ role: "admin" }),
    );
    expect(screen.getByText("แผงผู้ดูแล")).toBeInTheDocument();
  });

  it("shows a 403 state for other roles", () => {
    renderWithAuth(
      <RoleGuard roles={["admin"]}>
        <p>แผงผู้ดูแล</p>
      </RoleGuard>,
      makeUser({ role: "building_staff" }),
    );
    expect(screen.queryByText("แผงผู้ดูแล")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("403");
  });

  it("shows a 403 state when there is no user", () => {
    renderWithAuth(
      <RoleGuard roles={["admin", "building_staff"]}>
        <p>secret</p>
      </RoleGuard>,
      null,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});

describe("Can", () => {
  it("uses post.permissions from the backend (shows)", () => {
    const post = makePost({ permissions: { ...makePost().permissions, can_edit: true } });
    renderWithAuth(
      <Can perm="post:update" post={post}>
        <button>แก้ไข</button>
      </Can>,
      makeUser({ role: "student", id: 1 }),
    );
    expect(screen.getByRole("button", { name: "แก้ไข" })).toBeInTheDocument();
  });

  it("uses post.permissions from the backend (hides even for admin)", () => {
    const post = makePost({ permissions: { ...makePost().permissions, can_delete: false } });
    renderWithAuth(
      <Can perm="post:delete" post={post} fallback={<span>ไม่มีสิทธิ์</span>}>
        <button>ลบ</button>
      </Can>,
      makeUser({ role: "admin" }),
    );
    expect(screen.queryByRole("button", { name: "ลบ" })).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีสิทธิ์")).toBeInTheDocument();
  });

  it("falls back to the role matrix without a post", () => {
    const { unmount } = renderWithAuth(
      <Can perm="user:manage">
        <span>จัดการผู้ใช้</span>
      </Can>,
      makeUser({ role: "admin" }),
    );
    expect(screen.getByText("จัดการผู้ใช้")).toBeInTheDocument();
    unmount();
    renderWithAuth(
      <Can perm="user:manage">
        <span>จัดการผู้ใช้</span>
      </Can>,
      makeUser({ role: "student" }),
    );
    expect(screen.queryByText("จัดการผู้ใช้")).not.toBeInTheDocument();
  });
});

describe("ProfileGate", () => {
  it("renders the app once the role is chosen", () => {
    renderWithAuth(
      <ProfileGate>
        <p>แดชบอร์ด</p>
      </ProfileGate>,
      makeUser({ profile_completed: true }),
    );
    expect(screen.getByText("แดชบอร์ด")).toBeInTheDocument();
  });

  it("holds the app back until a self-registered account finishes onboarding", () => {
    renderWithAuth(
      <ProfileGate>
        <p>แดชบอร์ด</p>
      </ProfileGate>,
      makeUser({ profile_completed: false }),
    );
    expect(screen.queryByText("แดชบอร์ด")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "กำลังโหลดเซสชัน" })).toBeInTheDocument();
  });
});
