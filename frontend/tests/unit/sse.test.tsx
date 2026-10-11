import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext, type AuthContextValue } from "@/features/auth/context";
import { useSSE } from "@/hooks/useSSE";
import { acquireEventStream, resetSharedEventStream } from "@/services/sse";
import { makeUser } from "../fixtures";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

let ticketCounter = 0;
const fetchMock = vi.fn();
const ticketCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/stream/ticket")).length;
const openStreams = () => FakeEventSource.instances.filter((s) => !s.closed);

/** let pending promises (ticket fetch → EventSource) and 0ms timers settle */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

beforeEach(() => {
  ticketCounter = 0;
  FakeEventSource.instances = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    ticketCounter += 1;
    return new Response(JSON.stringify({ ticket: `t${ticketCounter}`, expires_in: 60 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  resetSharedEventStream();
  vi.unstubAllGlobals();
});

describe("acquireEventStream", () => {
  it("re-acquiring right after a release (StrictMode remount) re-uses one connection and one ticket", async () => {
    const release1 = acquireEventStream("1", {});
    release1(); // StrictMode cleanup
    const release2 = acquireEventStream("1", {}); // StrictMode re-run
    await flush();
    expect(ticketCalls()).toBe(1);
    expect(openStreams()).toHaveLength(1);
    expect(openStreams()[0].url).toContain("ticket=t1");
    release2();
  });

  it("closes the connection once the last holder releases it", async () => {
    const release = acquireEventStream("1", {});
    await flush();
    expect(openStreams()).toHaveLength(1);
    release();
    await flush();
    expect(openStreams()).toHaveLength(0);
  });

  it("opens a new connection for a different user", async () => {
    acquireEventStream("1", {});
    await flush();
    acquireEventStream("2", {});
    await flush();
    expect(ticketCalls()).toBe(2);
    expect(openStreams()).toHaveLength(1);
    expect(openStreams()[0].url).toContain("ticket=t2");
  });
});

function Probe() {
  useSSE();
  return null;
}

function renderWithUser(ui: React.ReactElement, status: AuthContextValue["status"] = "authenticated") {
  const user = makeUser();
  const value: AuthContextValue = {
    status,
    user,
    login: async () => user,
    signInWithTokens: () => user,
    logout: async () => {},
    setUser: () => {},
  };
  const qc = new QueryClient();
  const wrap = (v: AuthContextValue) => (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={v}>{ui}</AuthContext.Provider>
    </QueryClientProvider>
  );
  const result = render(wrap(value));
  return { ...result, rerenderWith: (patch: Partial<AuthContextValue>) => result.rerender(wrap({ ...value, ...patch })) };
}

describe("useSSE", () => {
  it("requests exactly one ticket under React StrictMode", async () => {
    renderWithUser(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    await flush();
    expect(ticketCalls()).toBe(1);
    expect(openStreams()).toHaveLength(1);
  });

  it("does not reconnect when the user object is refreshed (same id)", async () => {
    const { rerenderWith } = renderWithUser(<Probe />);
    await flush();
    rerenderWith({ user: makeUser({ display_name: "ชื่อใหม่" }) });
    await flush();
    expect(ticketCalls()).toBe(1);
    expect(openStreams()).toHaveLength(1);
  });

  it("does not connect while signed out", async () => {
    renderWithUser(<Probe />, "unauthenticated");
    await flush();
    expect(ticketCalls()).toBe(0);
  });
});
