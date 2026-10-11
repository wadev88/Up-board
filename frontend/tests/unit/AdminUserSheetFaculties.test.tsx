import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserCreateSheet } from "@/features/admin/components/UserCreateSheet";

const central = { id: 9, code: "CENTRAL", name_th: "ส่วนกลางมหาวิทยาลัย", name_en: null, is_active: true, admin_only: true, programs: [] };
const ict = { id: 1, code: "ICT", name_th: "ไอซีที", name_en: null, is_active: true, programs: [] };

vi.mock("@/features/admin/api", () => ({
  adminApi: { faculties: () => Promise.resolve([central, ict]), createUser: vi.fn() },
}));

describe("admin user sheet", () => {
  it("offers the admin-only faculty", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UserCreateSheet open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "ส่วนกลางมหาวิทยาลัย" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "ไอซีที" })).toBeInTheDocument();
  });
});
