import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SessionContext } from "@/lib/session-context";
import { SESSION_ID, testRunDetailFixture } from "@/test/fixtures";
import { OverviewPage } from "./OverviewPage";

vi.mock("@streamdown/mermaid", () => ({
  mermaid: {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid: () => ({ initialize() {}, render: async () => ({ svg: "" }) }),
  },
}));

function renderOverview(detail = testRunDetailFixture) {
  return render(
    <MemoryRouter>
      <SessionContext.Provider
        value={{ sessionId: SESSION_ID, detail, reload: () => {} }}
      >
        <OverviewPage />
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe("OverviewPage", () => {
  it("shows the stats header and the index panels", async () => {
    renderOverview();
    expect(
      within(screen.getByRole("group", { name: "Run results" })).getByText(
        "Scenarios",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/One scenario passed/)).toBeInTheDocument();
    expect(screen.queryByText(/index has/)).not.toBeInTheDocument();
  });

  it("renders an unsupported panel as a placeholder next to the others", () => {
    const index = {
      ...testRunDetailFixture.index,
      overview: [
        ...testRunDetailFixture.index.overview,
        {
          type: "unsupported" as const,
          originalType: "sparkline",
          reason: "unknown-type" as const,
          original: {},
        },
      ],
    };
    renderOverview({ ...testRunDetailFixture, index });
    expect(screen.getByText("sparkline")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
  });

  it("folds the index warnings and missing files into one compact notice", () => {
    renderOverview({
      ...testRunDetailFixture,
      warnings: ["panel 2 has an unknown type"],
      missing: ["run:scenarios/s1-pass/data/out.json"],
    });
    expect(
      screen.getByText("The index has 1 warning and 1 missing file"),
    ).toBeInTheDocument();
    expect(screen.getByText("panel 2 has an unknown type")).toBeInTheDocument();
    expect(
      screen.getByText("run:scenarios/s1-pass/data/out.json"),
    ).toBeInTheDocument();
  });

  it("says so when the index chose no panels", () => {
    renderOverview({
      ...testRunDetailFixture,
      index: { ...testRunDetailFixture.index, overview: [] },
    });
    expect(screen.getByText("No overview panels")).toBeInTheDocument();
  });
});
