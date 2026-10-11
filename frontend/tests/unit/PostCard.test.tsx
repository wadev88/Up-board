import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PostCard } from "@/features/posts/components/PostCard";
import { makePost } from "../fixtures";

const NOW = new Date("2026-10-05T06:00:00Z").getTime();

describe("PostCard", () => {
  it("renders the title as a link with an accessible name pointing to the detail page", () => {
    render(<PostCard post={makePost()} now={NOW} />);
    const link = screen.getByRole("link", { name: "ประกาศปิดปรับปรุงห้องสมุด" });
    expect(link).toHaveAttribute("href", "/posts/42");
  });

  it("links repairs and lost & found items to their own routes", () => {
    const { rerender } = render(<PostCard post={makePost({ type: "repair", id: 5 })} now={NOW} />);
    const title = makePost().title;
    expect(screen.getByRole("link", { name: title })).toHaveAttribute("href", "/repairs/5");
    rerender(<PostCard post={makePost({ type: "lost_found", id: 6 })} now={NOW} />);
    expect(screen.getByRole("link", { name: title })).toHaveAttribute("href", "/lost-found/6");
  });

  it("renders category tag and priority badge", () => {
    render(<PostCard post={makePost({ priority: "urgent" })} now={NOW} />);
    expect(screen.getAllByText("โพสต์ทั่วไป").length).toBeGreaterThan(0);
    expect(screen.getByTestId("priority-badge")).toHaveTextContent("ด่วนมาก");
  });

  it("hides the priority badge for normal priority", () => {
    render(<PostCard post={makePost({ priority: "normal" })} now={NOW} />);
    expect(screen.queryByTestId("priority-badge")).not.toBeInTheDocument();
  });

  it("shows the author name and role", () => {
    render(<PostCard post={makePost()} now={NOW} />);
    expect(screen.getByTestId("post-author")).toHaveTextContent("อาจารย์สมศรี");
  });

  it("links the author name to the public profile", () => {
    render(<PostCard post={makePost()} now={NOW} />);
    expect(screen.getByRole("link", { name: "อาจารย์สมศรี" })).toHaveAttribute("href", "/users/7");
  });

  it("hides the author when null (public repair view)", () => {
    render(<PostCard post={makePost({ type: "repair", author: null })} now={NOW} />);
    const author = screen.getByTestId("post-author");
    expect(author).toHaveTextContent("ผู้ใช้ UP Board");
    expect(author).not.toHaveTextContent("อาจารย์สมศรี");
  });

  it("shows the pin badge with remaining time when pinned", () => {
    render(
      <PostCard
        post={makePost({
          is_pinned: true,
          pinned_at: "2026-10-05T00:00:00Z",
          pinned_until: "2026-10-05T18:00:00Z",
        })}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("pin-badge")).toHaveTextContent("ปักหมุดอีก 12 ชม.");
  });

  it("does not show the pin badge when not pinned", () => {
    render(<PostCard post={makePost()} now={NOW} />);
    expect(screen.queryByTestId("pin-badge")).not.toBeInTheDocument();
  });

  it("shows the dashboard countdown chip, and 'หมดเวลาบนหน้าแรก' once expired", () => {
    const { rerender } = render(<PostCard post={makePost()} now={NOW} />);
    expect(screen.getByTestId("countdown-chip")).toHaveTextContent("บนหน้าแรกอีก 18 ชม.");
    rerender(<PostCard post={makePost({ dashboard_expires_at: "2026-10-05T05:00:00Z" })} now={NOW} />);
    expect(screen.getByTestId("countdown-chip")).toHaveTextContent("หมดเวลาบนหน้าแรก");
  });

  it("shows repair status badge and no 24h countdown for repairs", () => {
    render(
      <PostCard
        post={makePost({
          type: "repair",
          repair: {
            location: "อาคาร CE ชั้น 2",
            status: "in_progress",
            is_assigned: true,
            updated_at: "2026-10-05T00:00:00Z",
            latitude: null,
            longitude: null,
            technician: null,
            history: [],
          },
        })}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("กำลังดำเนินการ");
    expect(screen.queryByTestId("countdown-chip")).not.toBeInTheDocument();
    expect(screen.getByText("อาคาร CE ชั้น 2")).toBeInTheDocument();
  });

  it("shows lost & found status badge", () => {
    render(
      <PostCard
        post={makePost({
          type: "lost_found",
          lost_found: { location: "โรงอาหาร", status: "found", occurred_at: null, updated_at: "2026-10-05T00:00:00Z" },
        })}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("พบของ");
  });

  it("renders the first image as a decorative thumbnail", () => {
    const { container } = render(
      <PostCard
        post={makePost({
          attachments: [{ id: 1, url: "http://api.test/api/v1/files/abc", mime_type: "image/png", size_bytes: 1, kind: "image" }],
        })}
        now={NOW}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "http://api.test/api/v1/files/abc");
    expect(img).toHaveAttribute("alt", "");
  });

  it("shows relative creation time", () => {
    const { container } = render(<PostCard post={makePost()} now={NOW} />);
    const time = within(container).getByText("6 ชั่วโมงที่แล้ว");
    expect(time.tagName).toBe("TIME");
  });
});

describe("PostCard — ADR-003 additions", () => {
  const event = (starts: string, ends: string | null) =>
    makePost({
      type: "event",
      event: { starts_at: starts, ends_at: ends, venue: "หอประชุม", priority_level: "university" },
    });

  it("shows a type badge, the event time range, venue and priority level", () => {
    render(<PostCard post={event("2026-10-06T02:00:00Z", "2026-10-06T05:00:00Z")} now={NOW} />);
    expect(screen.getByTestId("type-badge")).toHaveTextContent("กิจกรรม");
    expect(screen.getByText(/09:00 – 12:00/)).toBeInTheDocument(); // Asia/Bangkok
    expect(screen.getByText("หอประชุม")).toBeInTheDocument();
    expect(screen.getByTestId("event-priority-badge")).toHaveTextContent("ระดับมหาวิทยาลัย");
    expect(screen.getByText("กำลังจะมาถึง")).toBeInTheDocument();
  });

  it("marks running and ended events", () => {
    const { rerender } = render(<PostCard post={event("2026-10-05T05:00:00Z", "2026-10-05T07:00:00Z")} now={NOW} />);
    expect(screen.getByText("กำลังจัดอยู่")).toBeInTheDocument();
    rerender(<PostCard post={event("2026-10-05T01:00:00Z", "2026-10-05T02:00:00Z")} now={NOW} />);
    expect(screen.getByText("จบแล้ว")).toBeInTheDocument();
  });

  it("shows history states and hides the feed countdown for expired posts", () => {
    render(<PostCard post={makePost({ lifecycle: "expired" })} now={NOW} />);
    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("หมดเวลาแสดงในฟีด");
    expect(screen.queryByTestId("countdown-chip")).not.toBeInTheDocument();
  });

  it("does not show a pin badge for a scheduled (future) event pin", () => {
    render(
      <PostCard
        post={makePost({ is_pinned: false, pinned_at: "2026-10-07T00:00:00Z", pinned_until: "2026-10-10T00:00:00Z" })}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId("pin-badge")).not.toBeInTheDocument();
  });

  it("long titles wrap instead of breaking the grid", () => {
    render(<PostCard post={makePost({ title: "ก".repeat(150) })} now={NOW} />);
    expect(screen.getByRole("heading").className).toContain("overflow-wrap:anywhere");
  });
});
