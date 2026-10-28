import type { Panel } from "@scout/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "@/lib/session-context";
import { SESSION_ID, testRunDetailFixture } from "@/test/fixtures";
import { stubRunResources } from "@/test/run-fetch";
import { PanelView } from "./registry";

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

function renderPanel(panel: Panel) {
  return render(
    <MemoryRouter>
      <SessionContext.Provider
        value={{
          sessionId: SESSION_ID,
          detail: testRunDetailFixture,
          reload: () => {},
        }}
      >
        <PanelView panel={panel} />
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe("PanelView (panel registry)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders markdown under its title", async () => {
    renderPanel({
      type: "markdown",
      title: "Summary",
      markdown: "All **good**",
    });
    expect(
      screen.getByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("good")).toBeInTheDocument();
  });

  it("renders stats with their tone and hint", () => {
    renderPanel({
      type: "stats",
      items: [
        { label: "Passed", value: 7, tone: "good", hint: "of 9" },
        { label: "Failed", value: "2", tone: "bad" },
      ],
    });
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("7")).toHaveClass("text-st-approved");
    expect(screen.getByText("2")).toHaveClass("text-st-failed");
  });

  it("renders a table with headers and cells", () => {
    renderPanel({
      type: "table",
      columns: ["Layer", "Result"],
      rows: [
        ["api", "pass"],
        ["ui", null],
      ],
    });
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Layer", "Result"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("pass")).toBeInTheDocument();
  });

  it("renders key-value pairs", () => {
    renderPanel({
      type: "key-value",
      items: [{ key: "Build", value: "1.2.3" }],
    });
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
  });

  it("renders a gallery of run files in the image viewer", () => {
    renderPanel({
      type: "gallery",
      items: [
        {
          path: "run:scenarios/s1-pass/screenshots/a.png",
          caption: "Rows listed",
        },
      ],
    });
    expect(
      screen.getByRole("button", { name: "Show Rows listed" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("image-viewer")
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe(
      `/api/sessions/${SESSION_ID}/run/file/run/scenarios/s1-pass/screenshots/a.png`,
    );
  });

  it("renders a video with its chapters", () => {
    renderPanel({
      type: "video",
      path: "run:scenarios/s1-pass/videos/a.mp4",
      caption: "Full run",
      chapters: [{ atSec: 5, label: "Filter applied" }],
    });
    expect(
      screen
        .getByTestId("video-player")
        .querySelector("video")
        ?.getAttribute("src"),
    ).toContain("/run/file/run/scenarios/s1-pass/videos/a.mp4");
    expect(
      screen.getByRole("button", { name: /Filter applied/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Comment at/ }),
    ).not.toBeInTheDocument();
  });

  it("fetches a log excerpt from the log endpoint and numbers its lines", async () => {
    stubRunResources();
    renderPanel({
      type: "log",
      title: "Errors",
      path: "run:logs/run.log",
      from: 5,
      to: 6,
      label: "errors",
    });
    expect(await screen.findByText("error: empty result")).toBeInTheDocument();
    expect(screen.getByText("warn: slow query")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `/api/sessions/${SESSION_ID}/run/log/run/logs/run.log?from=5&to=6`,
    );
  });

  it("renders links to a scenario, a run file and a web page; other schemes stay text", () => {
    renderPanel({
      type: "links",
      items: [
        { label: "Failing scenario", scenario: "s2-fail" },
        { label: "Plan", ref: "plan:plan.md" },
        { label: "Ticket", url: "https://example.atlassian.net/browse/X-1" },
        { label: "Sneaky", url: "javascript:alert(1)" },
      ],
    });
    expect(
      screen.getByRole("link", { name: "Failing scenario" }),
    ).toHaveAttribute("href", `/t/${SESSION_ID}/review/s2-fail`);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      `/api/sessions/${SESSION_ID}/run/file/plan/plan.md`,
    );
    expect(screen.getByRole("link", { name: "Ticket" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(
      screen.queryByRole("link", { name: "Sneaky" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sneaky")).toBeInTheDocument();
  });

  it("lists scenarios with status chips, filtered by status", () => {
    renderPanel({
      type: "scenario-list",
      title: "Failures",
      statuses: ["fail", "gap"],
    });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Empty result",
      "Export",
    ]);
    expect(links[0]).toHaveAttribute("href", `/t/${SESSION_ID}/review/s2-fail`);
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("Gap")).toBeInTheDocument();
    expect(screen.queryByText("Happy path")).not.toBeInTheDocument();
  });

  it("shows the type of an unsupported panel and a muted note", () => {
    renderPanel({
      type: "unsupported",
      originalType: "heatmap",
      reason: "unknown-type",
      original: { type: "heatmap" },
    });
    expect(screen.getByText("heatmap")).toBeInTheDocument();
    expect(
      screen.getByText(/not supported by this dashboard version/i),
    ).toHaveClass("text-ink-muted");
  });

  it("spans two columns when asked", async () => {
    renderPanel({ type: "key-value", title: "Wide", span: 2, items: [] });
    await waitFor(() =>
      expect(screen.getByRole("generic", { name: "Wide" })).toHaveClass(
        "md:col-span-2",
      ),
    );
  });
});
