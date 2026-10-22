import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "@/lib/session-context";
import { ReviewProvider } from "@/state/ReviewProvider";
import { reviewResponseFixture, SESSION_ID, testRunDetailFixture } from "@/test/fixtures";
import { mockReviewApi } from "@/test/mock-api";
import { stubRunResources } from "@/test/run-fetch";
import { ScenarioDeck } from "./ScenarioDeck";

vi.mock("sonner", async () => (await import("@/test/mock-sonner")).sonnerModuleMock());

// The drag itself needs layout and real pointers: the mocked frame hands the test its `onDragEnd`.
type DragEnd = (event: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => void;
const frame: { onDragEnd: DragEnd | null } = { onDragEnd: null };
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, onDragEnd, className }: ComponentProps<"div"> & { onDragEnd?: DragEnd }) => {
        frame.onDragEnd = onDragEnd ?? null;
        return <div className={className}>{children}</div>;
      },
    },
  };
});
vi.mock("media-chrome/react", () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    MediaController: passthrough,
    MediaControlBar: passthrough,
    MediaPlayButton: passthrough,
    MediaTimeRange: passthrough,
    MediaTimeDisplay: passthrough,
    MediaMuteButton: passthrough,
    MediaFullscreenButton: passthrough,
  };
});

const scenarios = testRunDetailFixture.scenarios;

function renderDeck() {
  const onNavigate = vi.fn<(id: string) => void>();
  const api = mockReviewApi(reviewResponseFixture());
  stubRunResources();
  render(
    <MemoryRouter>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: testRunDetailFixture, reload: () => {} }}>
        <ReviewProvider>
          <ScenarioDeck scenarios={scenarios} currentId="s1-pass" detail={testRunDetailFixture} sessionId={SESSION_ID} onNavigate={onNavigate} />
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
  return { api, onNavigate };
}

function drag(x: number, velocity = 0) {
  const end = frame.onDragEnd;
  if (!end) throw new Error("the card has no drag handler");
  act(() => end(null, { offset: { x, y: 0 }, velocity: { x: velocity, y: 0 } }));
}

describe("ScenarioDeck", () => {
  beforeEach(() => {
    frame.onDragEnd = null;
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("approves a scenario dragged right past the threshold, pinned to its fingerprint", async () => {
    const { api } = renderDeck();
    await screen.findByRole("article", { name: "Happy path" });
    drag(200);
    await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "approved")).toBe(true));
    expect(api.puts.find((put) => put.review.files["s1-pass"]?.verdict === "approved")?.review.files["s1-pass"]?.fingerprint).toBe(scenarios[0]?.fingerprint);
  });

  it("a fast flick commits below the distance threshold", async () => {
    const { api } = renderDeck();
    await screen.findByRole("article", { name: "Happy path" });
    drag(40, 900);
    await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "approved")).toBe(true));
  });

  it("a short slow drag does nothing", async () => {
    const { api } = renderDeck();
    await screen.findByRole("article", { name: "Happy path" });
    drag(60, 100);
    drag(-60, -100);
    expect(screen.queryByRole("textbox", { name: /Why reject/ })).not.toBeInTheDocument();
    expect(api.puts).toHaveLength(0);
  });

  it("a drag left starts a reject that waits for its comment, and stores nothing until it has one", async () => {
    const { api } = renderDeck();
    const card = await screen.findByRole("article", { name: "Happy path" });
    drag(-200);
    expect(await within(card).findByRole("textbox", { name: "Why reject Happy path?" })).toBeInTheDocument();
    expect(within(card).getByText("Rejecting · add a comment")).toBeInTheDocument();
    expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "rejected")).toBe(false);
    // The draft goes with the next verdict: a second drag left now rejects with it.
    fireEvent.change(within(card).getByRole("textbox", { name: "Why reject Happy path?" }), { target: { value: "Nope" } });
    drag(-200);
    await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "rejected")).toBe(true));
    expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({ body: "Nope", target: { kind: "scenario", ref: "s1-pass" } });
  });

  it("the round buttons step to the neighbours", async () => {
    const { onNavigate } = renderDeck();
    await screen.findByRole("article", { name: "Happy path" });
    expect(screen.getByRole("button", { name: "Previous scenario" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next scenario" }));
    expect(onNavigate).toHaveBeenCalledWith("s2-fail");
  });
});
