import type { TestRunDetail } from "@scout/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, describe, expect, it, vi } from "vitest";
import { testRunDetailFixture } from "@/test/fixtures";
import { LogsPage } from "./LogsPage";
import { rail } from "./rail-query";
import { renderRunPage } from "./render-run-page";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

const LINES = 2000;
const LOG = Array.from({ length: LINES }, (_, index) =>
  index === 1499 ? "error: boom at line 1500" : `line ${index + 1} ok`,
).join("\n");
const FILES = { "run/logs/run.log": LOG };

const viewer = () => screen.getByRole("region", { name: "Run log lines" });
const rowNumbers = () =>
  [...viewer().querySelectorAll<HTMLElement>("[data-line]")].map((row) =>
    Number(row.dataset["line"]),
  );

describe("LogsPage", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("lists the logs in the rail with the scenarios that link to them", async () => {
    await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    const list = within(rail()).getByRole("list", { name: "Logs" });
    expect(
      within(list).getByRole("button", { name: /Run log/ }),
    ).toHaveAttribute("aria-current", "true");
    const chips = within(
      within(rail()).getByRole("list", { name: "Scenarios linked to Run log" }),
    );
    expect(chips.getByRole("link", { name: "Happy path" })).toBeInTheDocument();
    expect(
      chips.getByRole("link", { name: "Empty result" }),
    ).toBeInTheDocument();
  });

  it("renders only a window of a large log and marks the lines scenarios link to", async () => {
    await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    await screen.findByText("line 1 ok");
    const rows = rowNumbers();
    expect(rows.length).toBeLessThan(LINES / 2);
    expect(rows[0]).toBe(1);
    const linked = viewer().querySelector('[data-line="3"]');
    expect(linked).toHaveAttribute("data-linked", "s1-pass");
    expect(
      within(linked as HTMLElement).getByRole("img", {
        name: "Linked to Happy path",
      }),
    ).toBeInTheDocument();
    expect(viewer().querySelector('[data-line="10"]')).not.toHaveAttribute(
      "data-linked",
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      expect.stringContaining("/run/file/run/logs/run.log"),
    );
  });

  it("keeps Find and Failures in the rail, not in the viewer's header", async () => {
    await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    await screen.findByText("line 1 ok");
    const side = within(rail());
    expect(side.getByRole("button", { name: "Failures" })).toBeInTheDocument();
    expect(side.getByRole("searchbox", { name: "Find in log" })).toBeInTheDocument();
    expect(side.queryByRole("group", { name: "Review mode" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("group", { name: "Review mode" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Logs" })).queryByRole("button", {
        name: "Failures",
      }),
    ).not.toBeInTheDocument();
  });

  it("scrolls to the next failure and finds text from the rail", async () => {
    const user = userEvent.setup();
    await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    await screen.findByText("line 1 ok");
    await user.click(within(rail()).getByRole("button", { name: "Failures" }));
    expect(
      await screen.findByText("error: boom at line 1500"),
    ).toBeInTheDocument();
    expect(viewer().querySelector('[data-line="1500"]')).toHaveAttribute(
      "data-current",
      "true",
    );
    expect(within(rail()).getByRole("status")).toHaveTextContent("1 / 1");

    await user.type(
      within(rail()).getByRole("searchbox", { name: "Find in log" }),
      "line 3 ok",
    );
    expect(viewer().querySelector('[data-line="3"]')).toHaveAttribute(
      "data-current",
      "true",
    );
    expect(within(rail()).getByRole("status")).toHaveTextContent("1 / 1");
  });

  it("shows a tile per log in the grid and opens its card from the tile", async () => {
    const user = userEvent.setup();
    await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    await user.click(
      within(
        within(screen.getByRole("banner")).getByRole("group", { name: "Review mode" }),
      ).getByRole("link", { name: "Grid" }),
    );
    const grid = screen.getByRole("list", { name: "Logs grid" });
    expect(screen.queryByRole("region", { name: "Run log lines" })).toBeNull();
    await user.click(within(grid).getByRole("button", { name: "Run log" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?mode=swipe");
    expect(await screen.findByText("line 1 ok")).toBeInTheDocument();
  });

  it("stores a log comment anchored to the clicked line", async () => {
    const user = userEvent.setup();
    const api = await renderRunPage(<LogsPage />, FILES, undefined, "/t/test/logs");
    await screen.findByText("line 1 ok");
    fireEvent.scroll(viewer(), { target: { scrollTop: 0 } });
    await user.click(screen.getByRole("button", { name: "Comment on line 7" }));
    await user.click(screen.getByRole("button", { name: "Not clear" }));
    await user.type(screen.getByRole("textbox"), "Why was this retried?");
    await user.click(
      within(
        document.querySelector('[data-slot="comment-box"]') as HTMLElement,
      ).getByRole("button", { name: "Comment" }),
    );
    await waitFor(() => expect(api.puts.length).toBeGreaterThan(0));
    expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({
      target: {
        kind: "log",
        ref: "run:logs/run.log",
        anchor: { side: "new", line: 7 },
      },
      body: "Why was this retried?",
      kind: "not-clear",
    });
    expect(
      await screen.findByRole("button", { name: "Comment on line 7" }),
    ).toBeInTheDocument();
  });

  it("says so when the run has no logs", async () => {
    const detail: TestRunDetail = {
      ...testRunDetailFixture,
      index: { ...testRunDetailFixture.index, logs: [] },
    };
    await renderRunPage(<LogsPage />, FILES, detail);
    expect(screen.getByText("No logs")).toBeInTheDocument();
  });
});
