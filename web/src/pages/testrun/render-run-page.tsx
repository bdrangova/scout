import type { TestRunDetail } from "@review-dash/shared";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { MemoryRouter } from "react-router";
import { SessionBar } from "@/components/layout/SessionBar";
import { ShellConfigProvider } from "@/components/layout/ShellConfigProvider";
import { SidebarProvider } from "@/components/layout/SidebarProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { RailSlotProvider } from "@/components/layout/RailSlot";
import { SessionContext } from "@/lib/session-context";
import { ReviewProvider } from "@/state/ReviewProvider";
import {
  reviewResponseFixture,
  SESSION_ID,
  testRunDetailFixture,
} from "@/test/fixtures";
import { mockReviewApi } from "@/test/mock-api";
import { stubRunResources } from "@/test/run-fetch";
import { Rail, Where } from "./run-page-parts";

/** Test helper: the page inside the session context, the rail slot beside it and a real review provider on a mocked API (`puts` records the saves). */
export async function renderRunPage(
  page: ReactNode,
  files: Record<string, string> = {},
  detail: TestRunDetail = testRunDetailFixture,
  initialPath = `/t/${SESSION_ID}/x`,
) {
  const api = mockReviewApi(reviewResponseFixture());
  stubRunResources(files);
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SessionContext.Provider
        value={{ sessionId: SESSION_ID, detail, reload: () => {} }}
      >
        <ReviewProvider>
          <ThemeProvider>
            <ShellConfigProvider kind="test-run">
              <SidebarProvider>
                <RailSlotProvider>
                  <SessionBar onHelp={() => {}} />
                  <Rail />
                  <main>{page}</main>
                  <Where />
                </RailSlotProvider>
              </SidebarProvider>
            </ShellConfigProvider>
          </ThemeProvider>
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.queryByText("Loading review…")).not.toBeInTheDocument(),
  );
  return api;
}
