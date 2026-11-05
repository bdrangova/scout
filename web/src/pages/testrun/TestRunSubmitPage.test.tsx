import type { SendResponse, TestRunDetail } from "@scout/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ShellConfigProvider } from "@/components/layout/ShellConfigProvider";
import { SessionContext } from "@/lib/session-context";
import { ReviewProvider } from "@/state/ReviewProvider";
import {
  commentFixture,
  reviewFixture,
  reviewResponseFixture,
  SESSION_ID,
  testRunDetailFixture,
} from "@/test/fixtures";
import { mockReviewApi } from "@/test/mock-api";
import { stubEventSource } from "@/test/mock-event-source";
import { TestRunSubmitPage } from "./TestRunSubmitPage";

vi.mock("sonner", () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const SENT_AT = "2026-10-21T12:00:00.000Z";
const [FIRST, SECOND] = testRunDetailFixture.scenarios;
if (!FIRST || !SECOND) throw new Error("fixture too small");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const emptyRunDetail: TestRunDetail = {
  ...testRunDetailFixture,
  scenarios: [],
};
const desktopDetail: TestRunDetail = {
  ...testRunDetailFixture,
  manifest: {
    ...testRunDetailFixture.manifest,
    agent: { ...testRunDetailFixture.manifest.agent, entrypoint: "desktop" },
  },
};

function renderSubmit(
  response = reviewResponseFixture(),
  detail: TestRunDetail = testRunDetailFixture,
  sendBody?: () => Response,
) {
  stubEventSource();
  const api = mockReviewApi(response);
  const posts: { url: string; body: unknown }[] = [];
  const base = api.fetchMock.getMockImplementation();
  api.fetchMock.mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? "GET";
    if (method === "GET" && /\/runs$/.test(url)) return json(200, []);
    if (method === "POST") {
      posts.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (/\/review\/send$/.test(url))
        return sendBody?.() ?? json(400, { error: "nothing to send" });
    }
    return base ? base(input, init) : json(404, { error: "unmocked" });
  });
  render(
    <MemoryRouter initialEntries={[`/t/${SESSION_ID}/submit`]}>
      <Routes>
        <Route
          path="/t/:id"
          element={
            <SessionContext.Provider
              value={{ sessionId: SESSION_ID, detail, reload: () => {} }}
            >
              <ShellConfigProvider kind="test-run">
                <ReviewProvider>
                  <Outlet />
                </ReviewProvider>
              </ShellConfigProvider>
            </SessionContext.Provider>
          }
        >
          <Route path="submit" element={<TestRunSubmitPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return { ...api, posts };
}

afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("TestRunSubmitPage", () => {
  it("offers Accept and Changes requested (no Reject) and shows the run summary instead of a PR description", async () => {
    renderSubmit();
    const decision = await screen.findByRole("radiogroup", {
      name: "Decision",
    });
    expect(
      within(decision)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("data-decision")),
    ).toEqual(["approve", "request-changes"]);
    expect(
      within(decision).getByRole("radio", { name: /Accept/ }),
    ).toBeInTheDocument();
    expect(
      within(decision).getByRole("radio", { name: /Changes requested/ }),
    ).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Run summary" });
    expect(
      within(summary).getByText(
        "One scenario passed, one failed (bug x) and one could not be tested.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "PR description" }),
    ).not.toBeInTheDocument();
  });

  it("blocks the send when the run has no scenarios", async () => {
    renderSubmit(reviewResponseFixture(), emptyRunDetail);
    expect(
      await screen.findByText("No scenarios to review"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit to/ })).toBeDisabled();
  });

  it("pre-selects Changes requested for a rejected scenario and lists the open comments by section", async () => {
    renderSubmit(
      reviewResponseFixture(
        reviewFixture({
          files: {
            [SECOND.id]: {
              verdict: "rejected",
              fingerprint: SECOND.fingerprint,
              viewed: true,
            },
          },
          comments: [
            commentFixture(
              "c1",
              { kind: "scenario", ref: SECOND.id },
              "The banner is wrong.",
              { kind: "incorrect" },
            ),
            commentFixture(
              "c2",
              { kind: "bug", ref: "x" },
              "Needs a Jira link.",
            ),
          ],
          nextCommentId: 3,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: /Changes requested/ }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByTestId("send-summary")).toHaveTextContent(
      "Send 2 comments + Changes requested to the current session · 2 scenarios not reviewed",
    );
    const comments = screen.getByRole("region", { name: "Open comments" });
    expect(
      within(comments).getByRole("heading", { name: "Scenarios" }),
    ).toBeInTheDocument();
    expect(
      within(comments).getByRole("heading", { name: "Bugs" }),
    ).toBeInTheDocument();
    expect(
      within(comments).getByRole("link", { name: "Empty result" }),
    ).toHaveAttribute("href", `/t/${SESSION_ID}/review/s2-fail`);
    expect(
      within(comments).getByRole("link", {
        name: "Empty result shows an error",
      }),
    ).toHaveAttribute("href", `/t/${SESSION_ID}/gaps`);
  });

  it("pre-selects Accept when every scenario is approved and nothing is open", async () => {
    const files = Object.fromEntries(
      testRunDetailFixture.scenarios.map((scenario) => [
        scenario.id,
        {
          verdict: "approved" as const,
          fingerprint: scenario.fingerprint,
          viewed: true,
        },
      ]),
    );
    renderSubmit(reviewResponseFixture(reviewFixture({ files })));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Accept/ })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(screen.getByTestId("send-summary")).toHaveTextContent(
      "Send no comments + Accept to the current session",
    );
  });

  it("sends, and a Desktop session gets the scout-apply-test-review link on the checkout", async () => {
    const sent = {
      schemaVersion: 2,
      kind: "test-run",
      sessionId: SESSION_ID,
      sentAt: SENT_AT,
    } as unknown as SendResponse["sent"];
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const api = renderSubmit(
      reviewResponseFixture(
        reviewFixture({
          overall: { ...reviewFixture().overall, decision: "request-changes" },
        }),
      ),
      desktopDetail,
      () =>
        json(200, {
          sent,
        } satisfies SendResponse),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit to current session" }),
    );
    await waitFor(() =>
      expect(
        api.posts.find((post) => post.url.endsWith("/review/send"))?.body,
      ).toEqual({ decision: "request-changes" }),
    );
    expect(
      await screen.findByRole("region", { name: "Feedback pending" }),
    ).toHaveTextContent(`/scout-apply-test-review ${SESSION_ID}`);
    expect(writeText).toHaveBeenCalledWith(`/scout-apply-test-review ${SESSION_ID}`);
  });
});
