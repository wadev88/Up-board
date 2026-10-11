import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { parsePositiveId } from "@/lib/utils";
import { FacultyFeed } from "@/features/posts/components/FacultyFeed";
import { renderWithAuth } from "../renderWithAuth";
import { makeUser } from "../fixtures";

const params = vi.hoisted(() => ({ current: { id: "abc" } as Record<string, string> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/faculty/x",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => params.current,
}));

describe("parsePositiveId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["007", 7],
  ])("accepts %s", (raw, expected) => {
    expect(parsePositiveId(raw)).toBe(expected);
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", "", " 1", "99999999999999999999"])("rejects %j", (raw) => {
    expect(parsePositiveId(raw)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parsePositiveId(undefined)).toBeNull();
    expect(parsePositiveId(["1"])).toBeNull();
  });
});

describe("FacultyFeed id guard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      const body = u.includes("/faculties")
        ? [{ id: 10, code: "ICT", name_th: "คณะ ICT", name_en: "ICT" }]
        : u.includes("/categories")
          ? []
          : { items: [], total: 0, page: 1, page_size: 20 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a not-found state for an invalid id and never requests posts", async () => {
    params.current = { id: "abc" };
    renderWithAuth(<FacultyFeed />, makeUser());
    expect(await screen.findByText("ไม่พบคณะนี้")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /โพสต์ทั้งหมด/ })).toHaveAttribute("href", "/posts");
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes("/posts"))).toBe(false);
    expect(urls.some((u) => u.includes("NaN"))).toBe(false);
  });

  it("requests posts filtered by a valid faculty id", async () => {
    params.current = { id: "10" };
    renderWithAuth(<FacultyFeed />, makeUser());
    expect(await screen.findByRole("heading", { name: "คณะ ICT" })).toBeInTheDocument();
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((u) => u.includes("/posts?") && u.includes("faculty_id=10"))).toBe(true);
    });
  });
});
