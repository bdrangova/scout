import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, describe, expect, it, vi } from "vitest";
import { GapsPage } from "./GapsPage";
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
vi.mock("@streamdown/mermaid", () => ({
  mermaid: {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid: () => ({ initialize() {}, render: async () => ({ svg: "" }) }),
  },
}));

const FILES = {
  "bugs/x/x.md": "The banner shows **an error** on an empty result.",
};

describe("GapsPage", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("lists the gaps and the bugs in the rail and shows the first bug as the card in the main area", async () => {
    await renderRunPage(<GapsPage />, FILES, undefined, "/t/test/gaps");
    const side = within(rail());
    expect(
      within(side.getByRole("table", { name: "Known gaps" })).getByText(
        "Export cannot be exercised here",
      ),
    ).toBeInTheDocument();
    expect(
      within(side.getByRole("list", { name: "Bugs" })).getByRole("button", {
        name: /Empty result shows an error/,
      }),
    ).toHaveAttribute("aria-current", "true");
    // The lists are not in the main area any more: only the current card is.
    expect(screen.getAllByRole("table", { name: "Known gaps" })).toHaveLength(1);
    const detail = screen.getByRole("region", {
      name: "Bug Empty result shows an error",
    });
    expect(rail()).not.toContainElement(detail);
    expect(await within(detail).findByText("an error")).toBeInTheDocument();
    expect(within(detail).getByText("DEMO-1")).toBeInTheDocument();
    expect(
      within(detail).getByRole("link", { name: "Empty result" }),
    ).toHaveAttribute("href", expect.stringContaining("/review/s2-fail"));
    expect(
      within(detail).getByRole("button", { name: "Show 1.png" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /^Gap / }),
    ).not.toBeInTheDocument();
  });

  it("puts the Swipe | Grid toggle in the header and shows a card per bug and gap in the grid", async () => {
    const user = userEvent.setup();
    await renderRunPage(<GapsPage />, FILES, undefined, "/t/test/gaps");
    await user.click(
      within(
        within(screen.getByRole("banner")).getByRole("group", { name: "Review mode" }),
      ).getByRole("link", { name: "Grid" }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent("?mode=grid");
    expect(within(rail()).queryByRole("group", { name: "Review mode" })).not.toBeInTheDocument();
    const grid = screen.getByRole("list", { name: "Gaps and bugs grid" });
    expect(within(grid).getAllByRole("button")).toHaveLength(2);
    expect(
      screen.queryByRole("region", { name: /^Bug / }),
    ).not.toBeInTheDocument();
    await user.click(
      within(grid).getByRole("button", {
        name: "Export cannot be exercised here",
      }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent("?mode=swipe");
    expect(
      screen.getByRole("region", { name: "Gap Export cannot be exercised here" }),
    ).toBeInTheDocument();
  });

  it("shows a gap as the card when it is picked in the rail", async () => {
    await renderRunPage(<GapsPage />, FILES, undefined, "/t/test/gaps");
    const user = userEvent.setup();
    await user.click(
      within(rail()).getByRole("button", {
        name: /Export cannot be exercised here/,
      }),
    );
    const detail = screen.getByRole("region", {
      name: "Gap Export cannot be exercised here",
    });
    expect(
      within(detail).getByText("No download target in this environment."),
    ).toBeInTheDocument();
    expect(
      within(detail).getByRole("link", { name: "Export" }),
    ).toBeInTheDocument();
  });

  it("moves between the cards with the next button and the arrow keys", async () => {
    const user = userEvent.setup();
    await renderRunPage(<GapsPage />, FILES, undefined, "/t/test/gaps");
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(
      screen.getByRole("region", { name: "Gap Export cannot be exercised here" }),
    ).toBeInTheDocument();
    expect(
      within(rail()).getByRole("button", {
        name: /Export cannot be exercised here/,
      }),
    ).toHaveAttribute("aria-current", "true");
    await user.keyboard("k");
    expect(
      await screen.findByRole("region", { name: "Bug Empty result shows an error" }),
    ).toBeInTheDocument();
  });

  it("stores Agree and a kinded comment on the bug target", async () => {
    const api = await renderRunPage(<GapsPage />, FILES, undefined, "/t/test/gaps");
    const user = userEvent.setup();
    const detail = await screen.findByRole("region", {
      name: "Bug Empty result shows an error",
    });
    await user.click(within(detail).getByRole("button", { name: "Agree" }));
    await waitFor(() => expect(api.puts.length).toBeGreaterThan(0));
    expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({
      target: { kind: "bug", ref: "x" },
      body: "Agree",
    });
    expect(
      within(detail).getByRole("button", { name: "Agreed" }),
    ).toBeDisabled();

    await user.click(within(detail).getByRole("button", { name: "Incorrect" }));
    await user.click(
      within(detail).getByRole("button", {
        name: "Comment on Empty result shows an error",
      }),
    );
    await user.type(
      within(detail).getByRole("textbox"),
      "Not a bug, the copy is intended",
    );
    await user.click(
      within(detail)
        .getAllByRole("button", { name: "Comment" })
        .at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(api.puts.at(-1)?.review.comments).toHaveLength(2),
    );
    expect(api.puts.at(-1)?.review.comments[1]).toMatchObject({
      target: { kind: "bug", ref: "x" },
      kind: "incorrect",
    });
  });
});
