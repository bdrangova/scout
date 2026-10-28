import type { TestRunDetail } from "@scout/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testRunDetailFixture } from "@/test/fixtures";
import { DataSetupPage } from "./DataSetupPage";
import { rail } from "./rail-query";
import { renderRunPage } from "./render-run-page";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn(), ...toast }),
}));
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

const withSetup: TestRunDetail = {
  ...testRunDetailFixture,
  index: {
    ...testRunDetailFixture.index,
    pages: ["data-setup"],
    overview: [
      {
        type: "key-value",
        title: "Environment",
        items: [{ key: "Build", value: "local" }],
      },
    ],
    dataSetup: {
      steps: [
        {
          label: "D1",
          action: "Seed 3 rows",
          expected: "3 rows",
          observed: "3 rows",
          result: "pass",
        },
        {
          label: "D2",
          action: "Create the owner",
          expected: "owner exists",
          observed: "owner missing",
        },
      ],
      videos: [],
      screenshots: [
        { path: "run:data-setup/d1-seed.png", caption: "D1 seeded" },
        { path: "run:data-setup/overview.png", caption: "Overview" },
      ],
      snapshotPath: "/Users/me/snapshots/run-1.dump",
      notes: "The owner had to be created by hand.",
    },
  },
};

describe("DataSetupPage", () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("lists the steps in the rail and shows the current step as a card", async () => {
    const user = userEvent.setup();
    await renderRunPage(<DataSetupPage />, {}, withSetup, "/t/test/data-setup");
    const steps = within(rail()).getByRole("list", { name: "Setup steps" });
    expect(
      within(steps).getByRole("button", { name: "D1" }),
    ).toHaveAttribute("aria-current", "true");
    expect(within(steps).getByText("Deviation")).toBeInTheDocument();
    expect(within(steps).getByRole("button", { name: "More evidence" })).toBeInTheDocument();
    // Only the current step is a card.
    const d1 = screen.getByRole("article", { name: "Step D1" });
    expect(screen.queryByRole("article", { name: "Step D2" })).toBeNull();
    expect(
      within(d1).getByRole("button", { name: "Show D1 seeded" }),
    ).toBeInTheDocument();
    expect(within(d1).queryByText("Deviation")).not.toBeInTheDocument();

    await user.click(within(steps).getByRole("button", { name: /D2/ }));
    const d2 = screen.getByRole("article", { name: "Step D2" });
    expect(within(d2).getByText("Deviation")).toBeInTheDocument();
    await user.click(within(steps).getByRole("button", { name: "More evidence" }));
    expect(
      within(screen.getByRole("article", { name: "More evidence" })).getByRole(
        "button",
        { name: "Show Overview" },
      ),
    ).toBeInTheDocument();
  });

  it("shows a tile per step in the grid", async () => {
    const user = userEvent.setup();
    await renderRunPage(<DataSetupPage />, {}, withSetup, "/t/test/data-setup");
    await user.click(
      within(
        within(screen.getAllByRole("banner").find((header) => header.dataset.slot === "session-bar")!).getByRole("group", { name: "Review mode" }),
      ).getByRole("link", { name: "Grid" }),
    );
    expect(within(rail()).queryByRole("group", { name: "Review mode" })).not.toBeInTheDocument();
    const grid = screen.getByRole("list", { name: "Setup steps grid" });
    expect(within(grid).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("article")).toBeNull();
    await user.click(within(grid).getByRole("button", { name: "D2" }));
    expect(
      screen.getByRole("article", { name: "Step D2" }),
    ).toBeInTheDocument();
  });

  it("shows the test data table, snapshot path, environment and deviations below the cards", async () => {
    await renderRunPage(<DataSetupPage />, {}, withSetup, "/t/test/data-setup");
    expect(
      within(screen.getByRole("table", { name: "Steps" })).getByText(
        "Seed 3 rows",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/Users/me/snapshots/run-1.dump"),
    ).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
    expect(
      screen.getByText("The owner had to be created by hand."),
    ).toBeInTheDocument();
  });

  it("copies the snapshot path to the clipboard", async () => {
    const user = userEvent.setup();
    await renderRunPage(<DataSetupPage />, {}, withSetup, "/t/test/data-setup");
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy path" }));
    expect(writeText).toHaveBeenCalledWith("/Users/me/snapshots/run-1.dump");
    expect(
      await screen
        .findByText("Path copied", {}, { timeout: 100 })
        .catch(() => null),
    ).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Path copied");
  });

  it("says so when the index has no data setup", async () => {
    await renderRunPage(<DataSetupPage />);
    expect(screen.getByText("No data setup")).toBeInTheDocument();
  });
});
