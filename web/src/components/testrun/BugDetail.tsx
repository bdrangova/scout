import type { Bug, Gap, Scenario } from "@scout/shared";
import { useState } from "react";
import { Link } from "react-router";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Markdown } from "@/components/common/Markdown";
import { Button } from "@/components/ui/button";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { runFileUrl, testRunRoute } from "@/lib/paths";
import { useReview } from "@/state/review-context";
import { EvidenceGallery } from "./EvidenceGallery";
import { RunItemComments } from "./RunItemComments";
import { useRunText } from "./useRunResource";

/** The agreement is a plain comment with this body, so it travels with the rest of the feedback. */
const AGREE_BODY = "Agree";

function ScenarioChips({
  sessionId,
  ids,
  scenarios,
}: {
  sessionId: string;
  ids: readonly string[];
  scenarios: readonly Scenario[];
}) {
  if (ids.length === 0) return null;
  return (
    <ul
      aria-label="Linked scenarios"
      className="m-0 flex list-none flex-wrap gap-1.5 p-0"
    >
      {ids.map((id) => (
        <li key={id}>
          <Link
            to={testRunRoute(sessionId, "review", id)}
            className="inline-flex h-6 items-center rounded-full border-fine border-line bg-paper px-2.5 text-[11.5px] font-bold hover:bg-hover"
          >
            {scenarios.find((scenario) => scenario.id === id)?.title ?? id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface BugDetailProps {
  sessionId: string;
  bug: Bug;
  scenarios: readonly Scenario[];
  /** Where the Jira key links to, when the manifest knows the ticket (or the value is already a URL). */
  jiraUrl: string | undefined;
}

/** The detail panel of a bug: its markdown, screenshots, Jira link, linked scenarios, and the Agree / Comment actions. */
export function BugDetail({
  sessionId,
  bug,
  scenarios,
  jiraUrl,
}: BugDetailProps) {
  const text = useRunText(sessionId, bug.path);
  const { commentsFor, dispatch } = useReview();
  const [focusToken, setFocusToken] = useState(0);
  const target = { kind: "bug" as const, ref: bug.slug };
  const agreed = commentsFor(target).some(
    (comment) => comment.status === "open" && comment.body === AGREE_BODY,
  );
  return (
    <Panel aria-label={`Bug ${bug.title}`} role="region">
      <PanelHeader>
        <Tag tone="err" size="sm">
          Bug
        </Tag>
        <PanelTitle>{bug.title}</PanelTitle>
        {bug.jira !== undefined &&
          (jiraUrl !== undefined ? (
            <a
              className="ml-auto font-mono text-xs font-semibold underline underline-offset-2"
              href={jiraUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {bug.jira}
            </a>
          ) : (
            <Tag size="sm" mono className="ml-auto">
              {bug.jira}
            </Tag>
          ))}
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <AsyncBoundary
          loading={text.loading}
          error={text.error}
          onRetry={text.reload}
          errorLabel="Couldn't load the bug"
        >
          <Markdown variant="untrusted" source={text.data ?? ""} />
        </AsyncBoundary>
        {bug.screenshots.length > 0 && (
          <EvidenceGallery
            sessionId={sessionId}
            items={bug.screenshots.map((path) => ({ path }))}
          />
        )}
        <ScenarioChips
          sessionId={sessionId}
          ids={bug.scenarios}
          scenarios={scenarios}
        />
        <a
          className="w-fit text-xs font-bold underline underline-offset-2"
          href={runFileUrl(sessionId, bug.path)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open bug file
        </a>
        <div className="flex flex-wrap gap-2 border-t-fine border-line pt-3">
          <Button
            size="sm"
            variant="approve"
            aria-pressed={agreed}
            disabled={agreed}
            onClick={() =>
              dispatch({ type: "ADD_COMMENT", target, body: AGREE_BODY })
            }
          >
            {agreed ? "Agreed" : "Agree"}
          </Button>
          <Button size="sm" onClick={() => setFocusToken((count) => count + 1)}>
            Comment
          </Button>
        </div>
        <RunItemComments
          target={target}
          label={`Comment on ${bug.title}`}
          focusToken={focusToken}
        />
      </PanelBody>
    </Panel>
  );
}

export interface GapDetailProps {
  sessionId: string;
  gap: Gap;
  scenarios: readonly Scenario[];
}

/** The detail panel of a known gap: status, the markdown of the index and the scenarios that hit it. */
export function GapDetail({ sessionId, gap, scenarios }: GapDetailProps) {
  return (
    <Panel aria-label={`Gap ${gap.title}`} role="region">
      <PanelHeader>
        <Tag tone="warn" size="sm">
          Gap
        </Tag>
        <PanelTitle>{gap.title}</PanelTitle>
        <Tag size="sm" mono className="ml-auto">
          {gap.status}
        </Tag>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        {gap.markdown !== undefined ? (
          <Markdown variant="untrusted" source={gap.markdown} />
        ) : (
          <p className="m-0 text-[13px] text-ink-muted">No description.</p>
        )}
        <ScenarioChips
          sessionId={sessionId}
          ids={gap.scenarios}
          scenarios={scenarios}
        />
      </PanelBody>
    </Panel>
  );
}
