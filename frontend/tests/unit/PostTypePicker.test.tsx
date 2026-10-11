import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePostFab } from "@/components/layout/CreatePostFab";
import { CreatePostScreen } from "@/features/posts/components/CreatePostScreen";
import { creatablePostTypes } from "@/lib/permissions";
import { renderWithAuth } from "../renderWithAuth";
import { makeUser } from "../fixtures";
import type { Role } from "@/types/api";

const push = vi.fn();
const replace = vi.fn();
let search = "";
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/features/posts/components/PostForm", () => ({
  PostForm: ({ type }: { type: string }) => <div data-testid="post-form">{type}</div>,
}));

const EXPECTED: Record<Role, string[]> = {
  student: ["general", "repair", "lost_found"],
  teacher: ["general", "repair", "lost_found"],
  technician: ["general", "repair", "lost_found"],
  student_club: ["general", "repair", "lost_found", "event"],
  building_staff: ["general", "repair", "lost_found", "announcement"],
  admin: ["general", "repair", "lost_found", "announcement", "event"],
};

describe("creatablePostTypes", () => {
  it.each(Object.entries(EXPECTED))("%s", (role, types) => {
    expect([...creatablePostTypes(makeUser({ role: role as Role }))].sort()).toEqual([...types].sort());
  });
});

describe("CreatePostFab + PostTypePicker", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    search = "";
  });

  it("opens the popup immediately, lists only the allowed types and navigates", async () => {
    renderWithAuth(<CreatePostFab />, makeUser({ role: "student" }));
    await userEvent.click(screen.getByTestId("create-post-fab"));
    const dialog = await screen.findByRole("dialog", { name: "สร้างโพสต์" });
    expect(dialog.querySelectorAll('[data-testid^="post-type-"]')).toHaveLength(3);
    expect(screen.queryByTestId("post-type-event")).not.toBeInTheDocument();
    expect(screen.queryByTestId("post-type-announcement")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("post-type-repair"));
    expect(push).toHaveBeenCalledWith("/repairs/new");
  });

  it("routes each type to its creation page", async () => {
    renderWithAuth(<CreatePostFab />, makeUser({ role: "admin" }));
    const routes: Record<string, string> = {
      general: "/posts/new?type=general",
      announcement: "/posts/new?type=announcement",
      event: "/posts/new?type=event",
      repair: "/repairs/new",
      lost_found: "/lost-found/new",
    };
    for (const [type, href] of Object.entries(routes)) {
      await userEvent.click(screen.getByTestId("create-post-fab"));
      await userEvent.click(await screen.findByTestId(`post-type-${type}`));
      expect(push).toHaveBeenLastCalledWith(href);
    }
  });

  it.each(["/repairs", "/repairs/12", "/repairs/new", "/lost-found", "/lost-found/3", "/posts/new"])(
    "is hidden on %s",
    (path) => {
      pathname = path;
      renderWithAuth(<CreatePostFab />, makeUser({ role: "student" }));
      expect(screen.queryByTestId("create-post-fab")).not.toBeInTheDocument();
      pathname = "/dashboard";
    },
  );

  it("stays on the other pages", () => {
    for (const path of ["/dashboard", "/posts", "/calendar", "/notifications"]) {
      pathname = path;
      const { unmount } = renderWithAuth(<CreatePostFab />, makeUser({ role: "student" }));
      expect(screen.getByTestId("create-post-fab")).toBeInTheDocument();
      unmount();
    }
    pathname = "/dashboard";
  });

  it("Esc closes the popup", async () => {
    renderWithAuth(<CreatePostFab />, makeUser({ role: "building_staff" }));
    await userEvent.click(screen.getByTestId("create-post-fab"));
    expect(await screen.findByTestId("post-type-announcement")).toBeInTheDocument();
    expect(screen.queryByTestId("post-type-event")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CreatePostScreen", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
  });

  it("opens the picker when no type is given", async () => {
    search = "";
    renderWithAuth(<CreatePostScreen />, makeUser({ role: "student" }));
    expect(await screen.findByRole("dialog", { name: "สร้างโพสต์" })).toBeInTheDocument();
    expect(screen.queryByTestId("post-form")).not.toBeInTheDocument();
  });

  it("shows the form without asking for the type again", () => {
    search = "type=event";
    renderWithAuth(<CreatePostScreen />, makeUser({ role: "student_club" }));
    expect(screen.getByTestId("post-form")).toHaveTextContent("event");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปลี่ยนประเภท" })).toBeInTheDocument();
  });

  it("does not accept a type the role may not create", async () => {
    search = "type=announcement";
    renderWithAuth(<CreatePostScreen />, makeUser({ role: "student" }));
    expect(screen.queryByTestId("post-form")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("forwards old repair links to the repair route", () => {
    search = "type=repair";
    renderWithAuth(<CreatePostScreen />, makeUser({ role: "student" }));
    expect(replace).toHaveBeenCalledWith("/repairs/new");
  });
});
