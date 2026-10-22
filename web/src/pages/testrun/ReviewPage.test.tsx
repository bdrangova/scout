import type { TestRunDetail } from "@review-dash/shared";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellConfigProvider } from "@/components/layout/ShellConfigProvider";
import { SessionShell } from "@/components/layout/SessionShell";
import { SessionContext } from "@/lib/session-context";
import {
  fp,
  reviewFixture,
  reviewResponseFixture,
  SESSION_ID,
  testRunDetailFixture,
  withChangedScenario,
} from "@/test/fixtures";
import { mockReviewApi } from "@/test/mock-api";
import { stubEventSource } from "@/test/mock-event-source";
import { stubRunResources } from "@/test/run-fetch";
import { ReviewProvider } from "@/state/ReviewProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ReviewPage } from "./ReviewPage";
import { rail } from "./rail-query";
import { Where } from "./run-page-parts";

vi.mock("sonner", async () => (await import("@/test/mock-sonner")).sonnerModuleMock());
vi.mock("@streamdown/mermaid", () => ({
  mermaid: {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid: () => ({ initialize() {}, render: async () => ({ svg: "" }) }),
  },
}));
vi.mock("media-chrome/react", () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
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

/** The page in the real test-run shell (bar, rail, hotkeys), StrictMode on like the dev build. */
function renderReview(
  path: string,
  detail: TestRunDetail = testRunDetailFixture,
  review = reviewResponseFixture(),
) {
  stubEventSource();
  const api = mockReviewApi(review);
  stubRunResources({
    "run/scenarios/s1-pass/data/out.json": '{"rows":3,"ok":true}',
  });
  render(
    <StrictMode>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/t/:id"
              element={
                <SessionContext.Provider
                  value={{ sessionId: SESSION_ID, detail, reload: () => {} }}
                >
                  <ShellConfigProvider kind="test-run">
                    <ReviewProvider>
                      <SessionShell />
                    </ReviewProvider>
                  </ShellConfigProvider>
                </SessionContext.Provider>
              }
            >
              <Route path="review" element={<ReviewPage />} />
              <Route path="review/:scenarioId" element={<ReviewPage />} />
              <Route path="submit" element={<h2>Submit page</h2>} />
            </Route>
          </Routes>
          <Where />
        </MemoryRouter>
      </ThemeProvider>
    </StrictMode>,
  );
  return api;
}

const BASE = `/t/${SESSION_ID}/review`;
const scenario = (name: string) => screen.getByRole("article", { name });
function composer(scope: HTMLElement): HTMLElement {
  const box = scope.querySelector<HTMLElement>('[data-slot="comment-box"]');
  if (!box) throw new Error("comment box is not open");
  return box;
}
const sidebar = () =>
  within(rail()).getByRole("navigation", { name: "Scenarios" });
const SHOT = "run:scenarios/s1-pass/screenshots/s1-01-a.png";

describe("Test run review", () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("puts the scenario list in the rail, ordered by scenario.order, and shows only the current scenario", async () => {
    const [s1, s2, s3] = testRunDetailFixture.scenarios;
    if (!s1 || !s2 || !s3) throw new Error("fixture too small");
    const detail: TestRunDetail = {
      ...testRunDetailFixture,
      scenarios: [
        { ...s1, order: 2 },
        { ...s2, order: 1 },
        { ...s3, order: 0 },
      ],
    };
    renderReview(BASE, detail);
    await screen.findByRole("article", { name: "Export" });
    expect(
      within(sidebar())
        .getAllByRole("button")
        .map((button) => button.getAttribute("data-scenario")),
    ).toEqual(["s3-gap", "s2-fail", "s1-pass"]);
    expect(
      screen
        .getAllByRole("article")
        .filter((article) => article.hasAttribute("data-scenario"))
        .map((article) => article.getAttribute("data-scenario")),
    ).toEqual(["s3-gap"]);
    // The list is in the rail, not beside the scenario.
    expect(rail()).toContainElement(sidebar());
    expect(
      within(scenario("Export")).queryByRole("navigation", { name: "Scenarios" }),
    ).toBeNull();
  });

  it("highlights the route scenario as current and shows steps, status and layers", async () => {
    renderReview(`${BASE}/s2-fail`);
    await screen.findByRole("article", { name: "Empty result" });
    expect(
      within(sidebar()).getByRole("button", { name: /Empty result/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(sidebar()).getByRole("button", { name: /Happy path/ }),
    ).not.toHaveAttribute("aria-current");
    const failing = scenario("Empty result");
    expect(within(failing).getByText("Fail")).toBeInTheDocument();
    expect(
      within(failing).getByRole("list", { name: "Layers" }),
    ).toHaveTextContent("e2e · Fail");
    expect(
      await within(failing).findByText(/Filter to a value with no matches/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Happy path" })).toBeNull();
  });

  it("shows the steps table above the cards and the collapsible rows below them", async () => {
    renderReview(BASE);
    const happy = await screen.findByRole("article", { name: "Happy path" });
    const steps = within(happy).getByRole("table", { name: "Steps" });
    expect(steps).toHaveTextContent("Open the feature");
    const cards = within(happy).getByRole("region", { name: "Evidence" });
    const rows = within(happy).getByRole("button", { name: /Log excerpts/ });
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(steps.compareDocumentPosition(cards) & before).toBeTruthy();
    expect(cards.compareDocumentPosition(rows) & before).toBeTruthy();
    expect(
      within(happy).getByRole("button", { name: "Approve" }),
    ).toBeInTheDocument();
  });

  it("saves a verdict pinned to the scenario fingerprint", async () => {
    const api = renderReview(BASE);
    const user = userEvent.setup();
    await user.click(
      await within(
        await screen.findByRole("article", { name: "Happy path" }),
      ).findByRole("button", { name: "Approve" }),
    );
    await waitFor(() => expect(api.puts.at(-1)?.review.files["s1-pass"]).toBeDefined());
    const saved = api.puts.at(-1)?.review.files["s1-pass"];
    expect(saved).toEqual({
      verdict: "approved",
      fingerprint: testRunDetailFixture.scenarios[0]?.fingerprint,
      viewed: true,
    });
    expect(
      within(sidebar()).getByRole("img", { name: "Approved" }),
    ).toBeInTheDocument();
  });

  it("flags a scenario that changed since its verdict as updated and drops the verdict", async () => {
    const stored = reviewResponseFixture(
      reviewFixture({
        files: {
          "s1-pass": {
            verdict: "approved",
            fingerprint: fp("scenario:s1-pass:v1"),
            viewed: true,
          },
        },
      }),
    );
    renderReview(
      BASE,
      withChangedScenario(testRunDetailFixture, "s1-pass"),
      stored,
    );
    await screen.findByRole("article", { name: "Happy path" });
    expect(within(sidebar()).getByText("updated")).toBeInTheDocument();
    expect(
      within(scenario("Happy path")).getByText("Updated"),
    ).toBeInTheDocument();
    expect(scenario("Happy path")).toHaveAttribute("data-verdict", "none");
  });

  it("shows no updated flag while the fingerprint still matches", async () => {
    const stored = reviewResponseFixture(
      reviewFixture({
        files: {
          "s1-pass": {
            verdict: "approved",
            fingerprint: fp("scenario:s1-pass:v1"),
            viewed: true,
          },
        },
      }),
    );
    renderReview(BASE, testRunDetailFixture, stored);
    await screen.findByRole("article", { name: "Happy path" });
    expect(screen.queryByText("updated")).not.toBeInTheDocument();
    expect(scenario("Happy path")).toHaveAttribute("data-verdict", "approved");
  });

  async function addScenarioComment(
    user: ReturnType<typeof userEvent.setup>,
    kind: string | null,
  ) {
    const failing = await screen.findByRole("article", {
      name: "Empty result",
    });
    const section = within(
      within(failing).getByRole("region", { name: "Comments on Empty result" }),
    );
    if (kind !== null)
      await user.click(section.getByRole("button", { name: kind }));
    await user.click(
      section.getByRole("button", { name: "Comment on Empty result" }),
    );
    await user.type(section.getByRole("textbox"), "The banner copy is wrong");
    await user.click(
      within(composer(failing.querySelector("section[aria-label^='Comments on']") as HTMLElement)).getByRole("button", { name: "Comment" }),
    );
    return section;
  }

  it("stores the picked kind on a scenario comment", async () => {
    const api = renderReview(`${BASE}/s2-fail`);
    const user = userEvent.setup();
    await addScenarioComment(user, "Incorrect");
    await waitFor(() => expect(api.puts.at(-1)?.review.comments.length ?? 0).toBeGreaterThan(0));
    expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({
      target: { kind: "scenario", ref: "s2-fail" },
      body: "The banner copy is wrong",
      kind: "incorrect",
    });
  });

  it("stores a comment without a kind when none is picked", async () => {
    const api = renderReview(`${BASE}/s2-fail`);
    const user = userEvent.setup();
    await addScenarioComment(user, null);
    await waitFor(() => expect(api.puts.at(-1)?.review.comments.length ?? 0).toBeGreaterThan(0));
    expect(api.puts.at(-1)?.review.comments[0]).not.toHaveProperty("kind");
  });

  it("navigates to review/:scenarioId from the rail and keeps it as the current scenario", async () => {
    const api = renderReview(BASE);
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Happy path" });
    await user.click(within(sidebar()).getByRole("button", { name: /Export/ }));
    expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s3-gap`);
    expect(
      within(sidebar()).getByRole("button", { name: /Export/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      await screen.findByRole("article", { name: "Export" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Happy path" })).toBeNull();
    await waitFor(() =>
      expect(api.puts.at(-1)?.review.ui.currentFile).toBe("s3-gap"),
    );
  });

  it("opens the collapsible rows on demand: log excerpt and linked bug", async () => {
    renderReview(BASE);
    const user = userEvent.setup();
    const happy = await screen.findByRole("article", { name: "Happy path" });
    await user.click(
      within(happy).getByRole("button", { name: /Log excerpts/ }),
    );
    expect(await within(happy).findByText("boot ok")).toBeInTheDocument();
    cleanup();
    renderReview(`${BASE}/s2-fail`);
    const failing = await screen.findByRole("article", {
      name: "Empty result",
    });
    await user.click(
      within(failing).getByRole("button", { name: /Linked gaps and bugs/ }),
    );
    expect(
      within(failing).getByRole("link", {
        name: "Empty result shows an error",
      }),
    ).toBeInTheDocument();
    expect(within(failing).getByText("DEMO-1")).toBeInTheDocument();
  });

  describe("verdict toggle", () => {
    const stored = (verdict: "approved" | "rejected") =>
      reviewResponseFixture(
        reviewFixture({
          files: {
            "s1-pass": {
              verdict,
              fingerprint: fp("scenario:s1-pass:v1"),
              viewed: true,
            },
          },
        }),
      );
    const lastVerdict = (api: ReturnType<typeof renderReview>) =>
      api.puts.at(-1)?.review.files["s1-pass"]?.verdict;

    it("clears the verdict when Approve is clicked on an approved scenario, with an Undo toast", async () => {
      const { toast } = await import("sonner");
      const api = renderReview(`${BASE}/s1-pass`, testRunDetailFixture, stored("approved"));
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      const approve = within(happy).getByRole("button", { name: "Approve" });
      expect(approve).toHaveAttribute("aria-pressed", "true");
      await user.click(approve);
      expect(approve).toHaveAttribute("aria-pressed", "false");
      expect(happy).toHaveAttribute("data-verdict", "none");
      await waitFor(() => expect(lastVerdict(api)).toBe("none"));
      expect(toast).toHaveBeenLastCalledWith("Cleared verdict · Happy path", expect.objectContaining({ id: "verdict-undo" }));
      // Z brings the verdict back.
      fireEvent.keyDown(window, { key: "z" });
      await waitFor(() => expect(lastVerdict(api)).toBe("approved"));
    });

    it("clears a rejection when Reject is clicked again", async () => {
      const api = renderReview(`${BASE}/s1-pass`, testRunDetailFixture, stored("rejected"));
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      const reject = within(happy).getByRole("button", { name: "Reject" });
      expect(reject).toHaveAttribute("aria-pressed", "true");
      await user.click(reject);
      expect(reject).toHaveAttribute("aria-pressed", "false");
      await waitFor(() => expect(lastVerdict(api)).toBe("none"));
    });

    it("A and X clear the verdict they already set", async () => {
      const approved = renderReview(`${BASE}/s1-pass`, testRunDetailFixture, stored("approved"));
      const happy = await screen.findByRole("article", { name: "Happy path" });
      expect(happy).toHaveAttribute("data-verdict", "approved");
      fireEvent.keyDown(window, { key: "a" });
      await waitFor(() => expect(lastVerdict(approved)).toBe("none"));
      expect(happy).toHaveAttribute("data-verdict", "none");
      cleanup();
      const rejected = renderReview(`${BASE}/s1-pass`, testRunDetailFixture, stored("rejected"));
      const again = await screen.findByRole("article", { name: "Happy path" });
      expect(again).toHaveAttribute("data-verdict", "rejected");
      fireEvent.keyDown(window, { key: "x" });
      await waitFor(() => expect(lastVerdict(rejected)).toBe("none"));
    });
  });

  describe("swipe and grid of scenarios", () => {
    it("shows the scenarios as a grid of tiles, the toggle is in the session bar, and a tile opens its scenario in swipe mode", async () => {
      renderReview(BASE);
      const user = userEvent.setup();
      await screen.findByRole("article", { name: "Happy path" });
      // The toggle is in the bar, not in the rail.
      expect(within(rail()).queryByRole("group", { name: "Review mode" })).toBeNull();
      const toggle = within(screen.getByRole("banner")).getByRole("group", { name: "Review mode" });
      expect(within(toggle).getByRole("link", { name: "Swipe" })).toHaveAttribute("aria-current", "true");
      await user.click(within(toggle).getByRole("link", { name: "Grid" }));
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s1-pass?mode=grid`));
      const grid = await screen.findByRole("list", { name: "All scenarios" });
      expect(
        within(grid)
          .getAllByRole("listitem")
          .map((tile) => tile.getAttribute("data-scenario")),
      ).toEqual(["s1-pass", "s2-fail", "s3-gap"]);
      expect(grid.querySelector("[data-current]")).toHaveAttribute("data-scenario", "s1-pass");
      expect(within(grid).getByText("1 video · 1 screenshot · 1 data file")).toBeInTheDocument();
      expect(screen.queryByRole("article", { name: "Happy path" })).toBeNull();

      await user.click(within(grid).getByRole("button", { name: "Export" }));
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s3-gap?mode=swipe`));
      expect(await screen.findByRole("article", { name: "Export" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "All scenarios" })).toBeNull();
    });

    it("Shift+arrows move through a scenario's evidence, plain arrows between scenarios", async () => {
      renderReview(`${BASE}/s1-pass`);
      const happy = await screen.findByRole("article", { name: "Happy path" });
      expect(within(happy).getByRole("article", { name: "Full run" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
      expect(within(happy).getByRole("article", { name: "Rows listed" })).toBeInTheDocument();
      expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s1-pass`);
      fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
      expect(within(happy).getByRole("article", { name: "Full run" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s2-fail`);
      expect(await screen.findByRole("article", { name: "Empty result" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s1-pass`);
    });

    it("picks an evidence item from the thumbnail strip", async () => {
      renderReview(`${BASE}/s1-pass`);
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      const strip = within(happy).getByRole("list", { name: "Evidence thumbnails" });
      await user.click(within(strip).getByRole("button", { name: "Show Output" }));
      expect(within(happy).getByRole("article", { name: "Output" })).toBeInTheDocument();
      expect(within(strip).getByRole("button", { name: "Show Output" })).toHaveAttribute("aria-current", "true");
    });
  });

  describe("evidence cards", () => {
    it("shows the evidence as swipe cards: the video first, then the screenshot and the data file, one at a time", async () => {
      renderReview(BASE);
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      const deck = within(happy).getByRole("region", { name: "Evidence" });
      expect(
        within(deck).getByRole("article", { name: "Full run" }),
      ).toHaveAttribute("data-evidence", "video");
      expect(
        within(deck).queryByRole("article", { name: "Rows listed" }),
      ).toBeNull();
      await user.click(within(deck).getByRole("button", { name: "Next item" }));
      expect(
        within(deck).getByRole("article", { name: "Rows listed" }),
      ).toHaveAttribute("data-evidence", "image");
      await user.click(within(deck).getByRole("button", { name: "Next item" }));
      const data = within(deck).getByRole("article", { name: "Output" });
      expect(await within(data).findByText(/"rows": 3/)).toBeInTheDocument();
      expect(
        within(deck).getByRole("button", { name: "Next item" }),
      ).toBeDisabled();
    });

    it("comments on a single screenshot: its own composer stores a run-file comment with the picked kind", async () => {
      const api = renderReview(BASE);
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      await user.click(
        within(happy).getByRole("button", { name: "Next item" }),
      );
      const card = within(happy).getByRole("article", { name: "Rows listed" });
      await user.click(within(card).getByRole("button", { name: "Incorrect" }));
      await user.click(
        within(card).getByRole("button", { name: "Comment on Rows listed" }),
      );
      await user.type(within(card).getByRole("textbox"), "Row 3 is missing");
      await user.click(
        within(composer(card.closest("article") as HTMLElement)).getByRole(
          "button",
          { name: "Comment" },
        ),
      );
      await waitFor(() => expect(api.puts.at(-1)?.review.comments.length ?? 0).toBeGreaterThan(0));
      expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({
        target: { kind: "run-file", ref: SHOT },
        body: "Row 3 is missing",
        kind: "incorrect",
      });
      // It is listed on the card, not in the scenario's own comments.
      expect(await within(card).findByText("Row 3 is missing")).toBeInTheDocument();
      expect(
        within(
          within(happy).getByRole("region", { name: "Comments on Happy path" }),
        ).queryByText("Row 3 is missing"),
      ).toBeNull();
    });

    it("comments on a data file the same way", async () => {
      const api = renderReview(BASE);
      const user = userEvent.setup();
      const happy = await screen.findByRole("article", { name: "Happy path" });
      const next = () => within(happy).getByRole("button", { name: "Next item" });
      await user.click(next());
      await user.click(next());
      const card = within(happy).getByRole("article", { name: "Output" });
      await user.click(within(card).getByRole("button", { name: "Not clear" }));
      await user.click(
        within(card).getByRole("button", { name: "Comment on Output" }),
      );
      await user.type(within(card).getByRole("textbox"), "What is ok?");
      await user.click(
        within(composer(card.closest("article") as HTMLElement)).getByRole(
          "button",
          { name: "Comment" },
        ),
      );
      await waitFor(() => expect(api.puts.at(-1)?.review.comments.length ?? 0).toBeGreaterThan(0));
      expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({
        target: {
          kind: "run-file",
          ref: "run:scenarios/s1-pass/data/out.json",
        },
        kind: "not-clear",
      });
    });

    it("has no raw screenshot toggle", async () => {
      renderReview(BASE);
      const happy = await screen.findByRole("article", { name: "Happy path" });
      expect(within(happy).queryByText(/raw/i)).toBeNull();
    });
  });

  describe("like the Files page, with scenarios", () => {
    const [S1, S2, S3] = testRunDetailFixture.scenarios;
    if (!S1 || !S2 || !S3) throw new Error("fixture too small");
    const approvedWith = (...scenarios: typeof testRunDetailFixture.scenarios) =>
      Object.fromEntries(
        scenarios.map((entry) => [entry.id, { verdict: "approved" as const, fingerprint: entry.fingerprint, viewed: true }]),
      );

    it("renders the first scenario card with its header, steps, actions and counters", async () => {
      renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      expect(within(card).getByText("Pass")).toBeInTheDocument();
      expect(within(card).getByText("scenario 1 of 3")).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Approve" })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Reject" })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Comment" })).toBeInTheDocument();
      expect(screen.getByText("1 / 3", { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous scenario" })).toBeDisabled();
      expect(document.querySelectorAll('[data-slot="deck-peek"]')).toHaveLength(2);
    });

    it("moves between scenarios with ←, → and J / K, marks them viewed, and the nav buttons step too", async () => {
      const api = renderReview(BASE);
      await screen.findByRole("article", { name: "Happy path" });
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      expect(await screen.findByRole("article", { name: "Empty result" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "k" });
      expect(await screen.findByText("1 / 3", { selector: "p" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "j" });
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Next scenario" }));
      expect(await screen.findByText("3 / 3", { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next scenario" })).toBeDisabled();
      await waitFor(() => expect(api.puts.at(-1)?.review.files["s2-fail"]?.viewed).toBe(true), { timeout: 1500 });
    });

    it("opens the review's current scenario when the URL names none, the URL's scenario otherwise", async () => {
      const stored = reviewFixture({ ui: { mode: "swipe", currentFile: "s2-fail", section: "files" } });
      renderReview(BASE, testRunDetailFixture, reviewResponseFixture(stored));
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s2-fail`));
    });

    it("opens on the next unreviewed scenario when the current one is already approved", async () => {
      const stored = reviewFixture({
        ui: { mode: "swipe", currentFile: "s3-gap", section: "files" },
        files: approvedWith(S1, S3),
      });
      renderReview(BASE, testRunDetailFixture, reviewResponseFixture(stored));
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
    });

    it("a URL that names a scenario wins over the review's current one and updates it", async () => {
      const stored = reviewFixture({ ui: { mode: "swipe", currentFile: "s2-fail", section: "files" } });
      const api = renderReview(`${BASE}/s3-gap`, testRunDetailFixture, reviewResponseFixture(stored));
      expect(await screen.findByText("3 / 3", { selector: "p" })).toBeInTheDocument();
      await waitFor(() => expect(api.puts.at(-1)?.review.ui.currentFile).toBe("s3-gap"), { timeout: 1500 });
    });

    it("approve makes the next scenario current, pins the fingerprint and follows in the URL", async () => {
      const api = renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      await userEvent.setup().click(within(card).getByRole("button", { name: "Approve" }));
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "approved")).toBe(true));
      const saved = api.puts.find((put) => put.review.files["s1-pass"]?.verdict === "approved");
      expect(saved?.review.ui.currentFile).toBe("s2-fail");
      expect(saved?.review.files["s1-pass"]?.fingerprint).toBe(S1.fingerprint);
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s2-fail`));
    });

    it("announces a verdict with one Undo toast that restores the scenario; Z undoes too", async () => {
      const { toast } = await import("sonner");
      const api = renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      await userEvent.setup().click(within(card).getByRole("button", { name: "Approve" }));
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      expect(toast).toHaveBeenLastCalledWith("Approved Happy path", expect.objectContaining({ id: "verdict-undo", action: expect.objectContaining({ label: "Undo" }) }));
      const action = vi.mocked(toast).mock.lastCall?.[1]?.action;
      if (action === undefined || action === null || typeof action !== "object" || !("onClick" in action)) throw new Error("the toast has no Undo action");
      act(() => action.onClick(new MouseEvent("click") as never));
      expect(await screen.findByText("1 / 3", { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Happy path" })).toHaveAttribute("data-verdict", "none");
      await waitFor(() => expect(api.puts.at(-1)?.review.files["s1-pass"]?.verdict ?? "none").toBe("none"));

      fireEvent.keyDown(window, { key: "a" });
      await screen.findByRole("article", { name: "Empty result" });
      fireEvent.keyDown(window, { key: "z", metaKey: false });
      expect(await screen.findByRole("article", { name: "Happy path" })).toHaveAttribute("data-verdict", "none");
      fireEvent.keyDown(window, { key: "z" });
      expect(screen.getByRole("article", { name: "Happy path" })).toBeInTheDocument();
    });

    it("does not fire a verdict for keys typed into a field", async () => {
      renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      const field = document.createElement("textarea");
      document.body.append(field);
      fireEvent.keyDown(field, { key: "a" });
      field.remove();
      expect(card).toHaveAttribute("data-verdict", "none");
    });

    it("X starts a reject: the box is focused, an empty submit is blocked, ⌘+Enter stores the reject and advances", async () => {
      const api = renderReview(BASE);
      await screen.findByRole("article", { name: "Happy path" });
      fireEvent.keyDown(window, { key: "x" });
      const box = await screen.findByRole("textbox", { name: "Why reject Happy path?" });
      await waitFor(() => expect(box).toHaveFocus());
      const submit = screen.getByRole("button", { name: "Comment & Reject" });
      expect(submit).toBeDisabled();
      expect(screen.getByText("Rejecting · add a comment")).toBeInTheDocument();
      await userEvent.setup().type(box, "Wrong total");
      fireEvent.keyDown(box, { key: "Enter", metaKey: true });
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "rejected")).toBe(true));
      const saved = api.puts.find((put) => put.review.files["s1-pass"]?.verdict === "rejected");
      expect(saved?.review.comments[0]).toMatchObject({ target: { kind: "scenario", ref: "s1-pass" }, body: "Wrong total" });
      expect(saved?.review.files["s1-pass"]?.fingerprint).toBe(S1.fingerprint);
    });

    it("Esc cancels a pending reject, and a second X does too", async () => {
      renderReview(BASE);
      await screen.findByRole("article", { name: "Happy path" });
      fireEvent.keyDown(window, { key: "x" });
      const box = await screen.findByRole("textbox", { name: "Why reject Happy path?" });
      fireEvent.keyDown(box, { key: "Escape" });
      expect(await screen.findByRole("textbox", { name: "Comment on Happy path" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "r" });
      await screen.findByRole("textbox", { name: "Why reject Happy path?" });
      fireEvent.keyDown(window, { key: "Escape" });
      expect(await screen.findByRole("textbox", { name: "Comment on Happy path" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "x" });
      await screen.findByRole("textbox", { name: "Why reject Happy path?" });
      fireEvent.keyDown(window, { key: "x" });
      expect(await screen.findByRole("textbox", { name: "Comment on Happy path" })).toBeInTheDocument();
      expect(screen.getByText("1 / 3", { selector: "p" })).toBeInTheDocument();
    });

    it("C opens the card's comment box", async () => {
      renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      fireEvent.keyDown(window, { key: "c" });
      const box = await within(card).findByRole("textbox", { name: "Comment on Happy path" });
      await waitFor(() => expect(box).toHaveFocus());
    });

    it("sends the typed draft with the verdict, and a reject with a draft is final", async () => {
      const api = renderReview(BASE);
      const card = await screen.findByRole("article", { name: "Happy path" });
      const user = userEvent.setup();
      await user.click(within(card).getByRole("button", { name: "Comment on Happy path" }));
      await user.type(within(card).getByRole("textbox", { name: "Comment on Happy path" }), "Looks off");
      expect(within(card).getByText("Your comment is sent with the verdict.")).toBeInTheDocument();
      await user.click(within(card).getByRole("button", { name: "Reject" }));
      expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "rejected")).toBe(true));
      expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({ target: { kind: "scenario", ref: "s1-pass" }, body: "Looks off" });
    });

    it("brings a scenario approved on an older fingerprint back, flagged as updated", async () => {
      const stale = {
        "s1-pass": { verdict: "approved" as const, fingerprint: fp("scenario:s1-pass:v1"), viewed: true },
        "s2-fail": { verdict: "approved" as const, fingerprint: fp("scenario:s2-fail:v1"), viewed: true },
      };
      renderReview(`${BASE}/s1-pass`, withChangedScenario(testRunDetailFixture, "s2-fail"), reviewResponseFixture(reviewFixture({ files: stale })));
      const first = await screen.findByRole("article", { name: "Happy path" });
      expect(first).toHaveAttribute("data-verdict", "approved");
      fireEvent.keyDown(window, { key: "ArrowRight" });
      const second = await screen.findByRole("article", { name: "Empty result" });
      expect(within(second).getByText("Updated")).toBeInTheDocument();
      expect(second).toHaveAttribute("data-verdict", "none");
    });

    describe("when the last scenario gets reviewed", () => {
      const allButFirst = approvedWith(S2, S3);
      const panel = () => screen.findByRole("heading", { level: 2, name: "Review complete" });

      it("shows the end panel with the Submit link over the blurred deck; the verdict keys are off and a step leaves it", async () => {
        const api = renderReview(BASE, testRunDetailFixture, reviewResponseFixture(reviewFixture({ files: allButFirst })));
        const card = await screen.findByRole("article", { name: "Happy path" });
        await userEvent.setup().click(within(card).getByRole("button", { name: "Approve" }));
        expect(await panel()).toBeInTheDocument();
        expect(screen.queryByText("Submit page")).not.toBeInTheDocument();
        const submit = within(screen.getByRole("region", { name: "Review complete" })).getByRole("link", { name: "Submit" });
        expect(submit).toHaveAttribute("href", `/t/${SESSION_ID}/submit`);
        expect(screen.queryByRole("article", { name: "Happy path" })).not.toBeInTheDocument();
        expect(screen.getByRole("article", { name: "Happy path", hidden: true })).toHaveAttribute("data-verdict", "approved");

        fireEvent.keyDown(window, { key: "x" });
        expect(screen.queryByRole("textbox", { name: /Why reject/, hidden: true })).not.toBeInTheDocument();
        fireEvent.keyDown(window, { key: "a" });
        await waitFor(() => expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "approved")).toBe(true));
        expect(api.puts.at(-1)?.review.files["s1-pass"]?.verdict).toBe("approved");

        fireEvent.keyDown(window, { key: "ArrowLeft" });
        await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Review complete" })).not.toBeInTheDocument());
        expect(screen.getByRole("article", { name: "Happy path" })).toBeInTheDocument();
      });

      it("Back returns to the current scenario, and a scenario picked in the rail leaves the panel", async () => {
        renderReview(BASE, testRunDetailFixture, reviewResponseFixture(reviewFixture({ files: allButFirst })));
        const card = await screen.findByRole("article", { name: "Happy path" });
        fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
        await panel();
        fireEvent.click(screen.getByRole("button", { name: "Back to scenarios" }));
        await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Review complete" })).not.toBeInTheDocument());
        expect(screen.getByRole("article", { name: "Happy path" })).toBeInTheDocument();

        // Clear and approve again to reach the end, then pick another scenario from the rail.
        fireEvent.keyDown(window, { key: "a" });
        fireEvent.keyDown(window, { key: "a" });
        await panel();
        fireEvent.click(within(sidebar()).getByRole("button", { name: /Empty result/ }));
        await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Review complete" })).not.toBeInTheDocument());
        expect(await screen.findByText("2 / 3", { selector: "p" })).toBeInTheDocument();
      });

      it("shows the end panel over the grid too", async () => {
        renderReview(`${BASE}?mode=grid`, testRunDetailFixture, reviewResponseFixture(reviewFixture({ files: allButFirst })));
        await screen.findByRole("list", { name: "All scenarios" });
        const tile = screen.getByRole("button", { name: "Happy path" });
        tile.focus();
        fireEvent.keyDown(tile, { key: "a" });
        expect(await panel()).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "All scenarios" })).not.toBeInTheDocument();
        expect(screen.getByRole("list", { name: "All scenarios", hidden: true })).toBeInTheDocument();
      });
    });

    describe("grid mode", () => {
      it("ignores the card keys, approves a focused tile with A, and a tile opens in the last card mode", async () => {
        const api = renderReview(`${BASE}?mode=grid`);
        const grid = await screen.findByRole("list", { name: "All scenarios" });
        expect(grid.children).toHaveLength(3);
        expect(screen.queryByRole("article", { name: "Happy path" })).not.toBeInTheDocument();
        await waitFor(() => expect(api.puts.at(-1)?.review.ui.mode).toBe("grid"), { timeout: 1500 });

        fireEvent.keyDown(window, { key: "ArrowRight" });
        fireEvent.keyDown(window, { key: "a" });
        expect(grid.querySelector("[data-current]")).toHaveAttribute("data-scenario", "s1-pass");
        expect(api.puts.some((put) => put.review.files["s1-pass"]?.verdict === "approved")).toBe(false);

        const tile = screen.getByRole("button", { name: "Empty result" });
        tile.focus();
        fireEvent.keyDown(tile, { key: "a" });
        await waitFor(() => expect(api.puts.some((put) => put.review.files["s2-fail"]?.verdict === "approved")).toBe(true));
        expect(grid.querySelector('[data-scenario="s2-fail"]')).toHaveAttribute("data-verdict", "approved");
        expect(api.puts.find((put) => put.review.files["s2-fail"]?.verdict === "approved")?.review.files["s2-fail"]?.fingerprint).toBe(S2.fingerprint);

        window.localStorage.setItem("review-dash:last-card-mode", "scroll");
        fireEvent.click(screen.getByRole("button", { name: "Export" }));
        expect(await screen.findByRole("article", { name: "Export" })).toBeInTheDocument();
        expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s3-gap?mode=swipe`);
      });

      it("filters the tiles by verdict with counts, and the quick button approves", async () => {
        const stored = reviewFixture({ files: approvedWith(S1) });
        const api = renderReview(`${BASE}?mode=grid`, testRunDetailFixture, reviewResponseFixture(stored));
        const grid = await screen.findByRole("list", { name: "All scenarios" });
        const filters = screen.getByRole("group", { name: "Show scenarios" });
        expect(within(filters).getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
        expect(within(filters).getByRole("button", { name: "Approved 1" })).toBeInTheDocument();
        expect(within(filters).getByRole("button", { name: "Unreviewed 2" })).toBeInTheDocument();
        fireEvent.click(within(filters).getByRole("button", { name: "Approved 1" }));
        expect(grid.children).toHaveLength(1);
        expect(screen.queryByRole("button", { name: "Approve Happy path" })).not.toBeInTheDocument();
        fireEvent.click(within(filters).getByRole("button", { name: "Unreviewed 2" }));
        fireEvent.click(screen.getByRole("button", { name: "Approve Export" }));
        await waitFor(() => expect(api.puts.some((put) => put.review.files["s3-gap"]?.verdict === "approved")).toBe(true));
      });

      it("a scenario with only a comment is commented, not unreviewed", async () => {
        const stored = reviewFixture({
          comments: [{ id: "c1", target: { kind: "scenario", ref: "s2-fail" }, body: "Hm", timestampSec: null, createdAt: "2026-10-21T12:00:00.000Z", updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null }],
          nextCommentId: 2,
        });
        renderReview(`${BASE}?mode=grid`, testRunDetailFixture, reviewResponseFixture(stored));
        const grid = await screen.findByRole("list", { name: "All scenarios" });
        const tile = grid.querySelector('[data-scenario="s2-fail"]') as HTMLElement;
        expect(within(tile).getByText("Commented")).toBeInTheDocument();
        expect(within(tile).getByTitle("1 open comment")).toBeInTheDocument();
        expect(within(screen.getByRole("group", { name: "Show scenarios" })).getByRole("button", { name: "Commented 1" })).toBeInTheDocument();
      });
    });

    describe("the mode param", () => {
      it("keeps the scenario when the toggle switches, reads scroll as swipe, and saves the mode", async () => {
        const api = renderReview(`${BASE}/s2-fail?mode=scroll`);
        await screen.findByRole("article", { name: "Empty result" });
        const toggle = within(screen.getByRole("banner")).getByRole("group", { name: "Review mode" });
        expect(within(toggle).getByRole("link", { name: "Swipe" })).toHaveAttribute("aria-current", "true");
        expect(within(toggle).getByRole("link", { name: "Grid" })).toHaveAttribute("href", `${BASE}/s2-fail?mode=grid`);
        await waitFor(() => expect(api.puts.at(-1)?.review.ui.mode).toBe("swipe"), { timeout: 1500 });
        await userEvent.setup().click(within(toggle).getByRole("link", { name: "Grid" }));
        await screen.findByRole("list", { name: "All scenarios" });
        await waitFor(() => expect(api.puts.at(-1)?.review.ui.mode).toBe("grid"), { timeout: 1500 });
      });

      it("G opens the grid and G again returns to swipe; S flips to swipe", async () => {
        renderReview(`${BASE}/s2-fail`);
        await screen.findByRole("article", { name: "Empty result" });
        fireEvent.keyDown(window, { key: "g" });
        await screen.findByRole("list", { name: "All scenarios" });
        expect(screen.getByTestId("where")).toHaveTextContent(`${BASE}/s2-fail?mode=grid`);
        fireEvent.keyDown(window, { key: "g" });
        expect(await screen.findByRole("article", { name: "Empty result" })).toBeInTheDocument();
        expect(screen.getByTestId("where")).toHaveTextContent("mode=swipe");
        fireEvent.keyDown(window, { key: "g" });
        await screen.findByRole("list", { name: "All scenarios" });
        fireEvent.keyDown(window, { key: "s" });
        expect(await screen.findByRole("article", { name: "Empty result" })).toBeInTheDocument();
      });

      it("has no mode toggle in the bar off the Review page", async () => {
        cleanup();
        stubEventSource();
        renderReview(`/t/${SESSION_ID}/submit`);
        await screen.findByText("Submit page");
        expect(screen.queryByRole("group", { name: "Review mode" })).toBeNull();
      });
    });

    it("an index route with no scenarios shows an empty state", async () => {
      renderReview(BASE, { ...testRunDetailFixture, scenarios: [] });
      expect(await screen.findByText("No scenarios")).toBeInTheDocument();
    });
  });
});
