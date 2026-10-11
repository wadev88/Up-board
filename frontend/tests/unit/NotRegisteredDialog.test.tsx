import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/services/apiClient";
import { GoogleCallback } from "@/features/auth/components/GoogleCallback";
import { NotRegisteredDialog } from "@/features/auth/components/NotRegisteredDialog";
import { renderWithAuth } from "../renderWithAuth";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("code=abc"),
}));
vi.mock("@/services/googleSignIn", () => ({
  exchangeCodeForSupabaseToken: vi.fn().mockResolvedValue("sb-token"),
  discardSupabaseSession: vi.fn().mockResolvedValue(undefined),
  takeNextPath: () => "/dashboard",
}));
vi.mock("@/features/auth/api", () => ({
  authApi: {
    exchangeSupabase: vi.fn().mockRejectedValue(new ApiError(403, "NOT_REGISTERED", "no account")),
  },
}));

describe("NotRegisteredDialog", () => {
  it("is a modal dialog that links to /register and can be closed", async () => {
    const onOpenChange = vi.fn();
    renderWithAuth(<NotRegisteredDialog open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog", { name: "ยังไม่มีบัญชีในระบบ" });
    expect(dialog).toHaveTextContent("สมัครสมาชิกก่อน");
    expect(screen.getByRole("link", { name: "ไปหน้าสมัครสมาชิก" })).toHaveAttribute("href", "/register");
    await userEvent.click(screen.getAllByRole("button", { name: "ปิด" })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens on the Google callback page when the API says NOT_REGISTERED", async () => {
    renderWithAuth(<GoogleCallback />);
    expect(await screen.findByRole("dialog", { name: "ยังไม่มีบัญชีในระบบ" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "ปิด" })[0]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
