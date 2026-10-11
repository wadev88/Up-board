import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/services/apiClient";
import { GoogleCallback } from "@/features/auth/components/GoogleCallback";
import { PasswordConfirmDialog } from "@/features/auth/components/PasswordConfirmDialog";
import { renderWithAuth } from "../renderWithAuth";

const replace = vi.fn();
const exchange = vi.fn();
const discard = vi.fn().mockResolvedValue(undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("code=abc"),
}));
vi.mock("@/services/googleSignIn", () => ({
  exchangeCodeForSupabaseToken: vi.fn().mockResolvedValue("sb-token"),
  discardSupabaseSession: (token: string) => discard(token),
  takeNextPath: () => "/dashboard",
}));
vi.mock("@/features/auth/api", () => ({
  authApi: { exchangeSupabase: (token: string, password?: string) => exchange(token, password) },
}));

const needPassword = () => new ApiError(403, "PASSWORD_CONFIRMATION_REQUIRED", "confirm");

describe("PasswordConfirmDialog", () => {
  it("asks for the registration password and shows the error the caller returns", async () => {
    const onSubmit = vi.fn().mockResolvedValue("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่");
    const onCancel = vi.fn();
    renderWithAuth(<PasswordConfirmDialog open onSubmit={onSubmit} onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("ใส่รหัสผ่านที่ตั้งไว้ตอนสมัครเพื่อยืนยันอีเมล");
    await userEvent.type(screen.getByLabelText("รหัสผ่านที่ตั้งไว้ตอนสมัคร"), "wrong-pass1");
    await userEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(onSubmit).toHaveBeenCalledWith("wrong-pass1");
    expect(await screen.findByText("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("GoogleCallback with PASSWORD_CONFIRMATION_REQUIRED", () => {
  beforeEach(() => {
    replace.mockReset();
    exchange.mockReset();
    discard.mockClear();
  });

  it("keeps the Supabase token, retries with the password and signs in", async () => {
    exchange.mockRejectedValueOnce(needPassword()).mockRejectedValueOnce(needPassword());
    renderWithAuth(<GoogleCallback />);
    const input = await screen.findByLabelText("รหัสผ่านที่ตั้งไว้ตอนสมัคร");
    expect(discard).not.toHaveBeenCalled(); // token is still needed for the retry

    await userEvent.type(input, "wrong-pass1");
    await userEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(await screen.findByText("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่")).toBeInTheDocument();
    expect(exchange).toHaveBeenLastCalledWith("sb-token", "wrong-pass1");

    exchange.mockResolvedValueOnce({ access_token: "a", expires_in: 900, user: { id: 1 } });
    await userEvent.type(screen.getByLabelText("รหัสผ่านที่ตั้งไว้ตอนสมัคร"), "Secret123");
    await userEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(exchange).toHaveBeenLastCalledWith("sb-token", "Secret123");
    expect(discard).toHaveBeenCalledWith("sb-token");
  });

  it("cancel drops the Supabase session and goes back to the login page", async () => {
    exchange.mockRejectedValueOnce(needPassword());
    renderWithAuth(<GoogleCallback />);
    await screen.findByLabelText("รหัสผ่านที่ตั้งไว้ตอนสมัคร");
    await userEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(discard).toHaveBeenCalledWith("sb-token");
  });
});
