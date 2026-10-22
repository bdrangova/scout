import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testRunDetailFixture } from "@/test/fixtures";
import { RunStatsHeader } from "./RunStatsHeader";

describe("RunStatsHeader", () => {
  it("counts the scenarios by status and always shows pass, fail, gap and n/a", () => {
    render(<RunStatsHeader scenarios={testRunDetailFixture.scenarios} />);
    const stats = screen.getByRole("group", { name: "Run results" });
    const stat = (name: string) =>
      stats.querySelector(`[data-stat="${name}"]`)?.textContent;
    expect(stat("total")).toBe("3");
    expect(stat("pass")).toBe("1");
    expect(stat("fail")).toBe("1");
    expect(stat("gap")).toBe("1");
    expect(stat("na")).toBe("0");
    expect(stats.querySelector('[data-stat="blocked"]')).toBeNull();
  });

  it("adds planned, uncertain and blocked only when a scenario has them", () => {
    render(
      <RunStatsHeader
        scenarios={[
          { status: "blocked" },
          { status: "planned" },
          { status: "planned" },
        ]}
      />,
    );
    const stats = screen.getByRole("group", { name: "Run results" });
    expect(within(stats).getByText("Blocked")).toBeInTheDocument();
    expect(within(stats).getByText("Planned")).toBeInTheDocument();
    expect(within(stats).queryByText("Uncertain")).not.toBeInTheDocument();
  });
});
