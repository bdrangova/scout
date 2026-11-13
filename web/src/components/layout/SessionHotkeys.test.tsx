import type { SessionDetail } from "@scout/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { SessionContext } from "@/lib/session-context";
import { ReviewProvider } from "@/state/ReviewProvider";
import {
  reviewResponseFixture,
  SESSION_ID,
  sessionDetailFixture,
  testRunDetailFixture,
} from "@/test/fixtures";
import { mockReviewApi } from "@/test/mock-api";
import { ShellConfigProvider } from "./ShellConfigProvider";
import { SessionHotkeys } from "./SessionHotkeys";
import { SidebarProvider } from "./SidebarProvider";

function Where() {
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-testid="where">{pathname}</output>
      <output data-testid="search">{search}</output>
    </>
  );
}

/** The Review page's hotkeys read the review, so a test run is rendered inside a real provider (on a mocked API). */
async function renderHotkeys(
  kind: "code-review" | "test-run",
  path: string,
  pages: ("gaps" | "data-setup" | "logs")[] = [],
  codeReviewDetail: SessionDetail = sessionDetailFixture,
) {
  const detail =
    kind === "test-run"
      ? {
          ...testRunDetailFixture,
          index: { ...testRunDetailFixture.index, pages },
        }
      : codeReviewDetail;
  mockReviewApi(reviewResponseFixture());
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider
        value={{ sessionId: SESSION_ID, detail, reload: () => {} }}
      >
        <ShellConfigProvider kind={kind}>
          <ReviewProvider>
            <SidebarProvider>
              <Routes>
                <Route
                  path="*"
                  element={
                    <>
                      <SessionHotkeys onToggleHelp={() => {}} />
                      <Where />
                    </>
                  }
                />
              </Routes>
            </SidebarProvider>
          </ReviewProvider>
        </ShellConfigProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
  await screen.findByTestId("where");
}

const where = () => screen.getByTestId("where").textContent;

describe("SessionHotkeys", () => {
  it("jumps to the code review sections by number", async () => {
    await renderHotkeys("code-review", `/s/${SESSION_ID}/spec`);
    fireEvent.keyDown(window, { key: "5" });
    expect(where()).toBe(`/s/${SESSION_ID}/files`);
  });

  it("follows the visible test-run tabs, under /t", async () => {
    await renderHotkeys("test-run", `/t/${SESSION_ID}/overview`);
    fireEvent.keyDown(window, { key: "2" });
    expect(where()).toBe(`/t/${SESSION_ID}/review`);
    fireEvent.keyDown(window, { key: "3" });
    expect(where()).toBe(`/t/${SESSION_ID}/submit`);
  });

  it("counts the optional pages in when the index lists them", async () => {
    await renderHotkeys("test-run", `/t/${SESSION_ID}/overview`, [
      "gaps",
      "data-setup",
      "logs",
    ]);
    fireEvent.keyDown(window, { key: "6" });
    expect(where()).toBe(`/t/${SESSION_ID}/submit`);
    fireEvent.keyDown(window, { key: "4" });
    expect(where()).toBe(`/t/${SESSION_ID}/data-setup`);
  });

  it("has no swipe/grid keys on a test run", async () => {
    await renderHotkeys("test-run", `/t/${SESSION_ID}/overview`);
    fireEvent.keyDown(window, { key: "g" });
    expect(where()).toBe(`/t/${SESSION_ID}/overview`);
  });

  it("G and S switch the Review page's mode on a test run, and G back from the grid goes to swipe", async () => {
    await renderHotkeys("test-run", `/t/${SESSION_ID}/review/s2-fail?mode=scroll`);
    const search = () => screen.getByTestId("search").textContent;
    fireEvent.keyDown(window, { key: "g" });
    expect(search()).toBe("?mode=grid");
    fireEvent.keyDown(window, { key: "g" });
    expect(search()).toBe("?mode=swipe");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(search()).toBe("?mode=swipe");
    expect(where()).toBe(`/t/${SESSION_ID}/review/s2-fail`);
  });

  it("G flips Spec between grid and scroll on its own page, and S returns to scroll", async () => {
    await renderHotkeys("code-review", `/s/${SESSION_ID}/spec`);
    const search = () => screen.getByTestId("search").textContent;
    fireEvent.keyDown(window, { key: "g" });
    expect(where()).toBe(`/s/${SESSION_ID}/spec`);
    expect(search()).toBe("?mode=grid");
    fireEvent.keyDown(window, { key: "g" });
    expect(search()).toBe("?mode=scroll");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(search()).toBe("?mode=scroll");
    expect(where()).toBe(`/s/${SESSION_ID}/spec`);
  });

  it("G flips Extras, but on its Journal view S and G leave the extras modes alone", async () => {
    const withJournal = { ...sessionDetailFixture, journalCount: 2 };
    await renderHotkeys("code-review", `/s/${SESSION_ID}/extras`, [], withJournal);
    fireEvent.keyDown(window, { key: "g" });
    expect(screen.getByTestId("where").textContent).toBe(`/s/${SESSION_ID}/extras`);
    expect(screen.getByTestId("search").textContent).toBe("?mode=grid");
    cleanup();
    await renderHotkeys("code-review", `/s/${SESSION_ID}/extras?tab=journal`, [], withJournal);
    fireEvent.keyDown(window, { key: "g" });
    expect(screen.getByTestId("where").textContent).not.toBe(`/s/${SESSION_ID}/extras`);
  });

  it("keys 1-6 jump to Spec, Extras, Evidence, Blueprint, Files, Submit", async () => {
    await renderHotkeys("code-review", `/s/${SESSION_ID}/spec`);
    for (const [key, section] of [["4", "blueprint"], ["5", "files"], ["6", "submit"], ["2", "extras"]] as const) {
      fireEvent.keyDown(window, { key });
      expect(where()).toBe(`/s/${SESSION_ID}/${section}`);
    }
  });
});
