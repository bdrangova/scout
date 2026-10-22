import type { CommentKind, CommentTarget } from "@review-dash/shared";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { CommentBox } from "@/components/common/CommentBox";
import { CommentList } from "@/components/common/CommentList";
import { Tag } from "@/components/ui/tag";
import { draftKey } from "@/lib/comment-drafts";
import { formatDuration } from "@/lib/format";
import { useReview } from "@/state/review-context";
import { useCommentActions } from "@/state/useCommentActions";
import { CommentKindPicker } from "../CommentKindPicker";

export interface ScenarioCommentsProps {
  scenarioId: string;
  title: string;
  /** A reject waits for its comment: the box reads "Comment & Reject". */
  pendingReject: boolean;
  focusToken: number;
  /** Set by "Comment at 0:42"; the next comment carries it as `timestampSec`. */
  pendingTimestamp: number | null;
  onClearTimestamp: () => void;
}

/** The scenario's comments: the open and resolved list, the kind picker and the box (a `scenario` target, the kind stored on the comment). */
export function ScenarioComments({
  scenarioId,
  title,
  pendingReject,
  focusToken,
  pendingTimestamp,
  onClearTimestamp,
}: ScenarioCommentsProps) {
  const { dispatch, commentsFor, draftFor, setDraft } = useReview();
  const actions = useCommentActions();
  const target = useMemo<CommentTarget>(
    () => ({ kind: "scenario", ref: scenarioId }),
    [scenarioId],
  );
  const key = draftKey(target);
  const [kind, setKind] = useState<CommentKind | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <CommentList comments={commentsFor(target)} {...actions} />
      <div className="flex flex-col gap-2">
        <CommentKindPicker value={kind} onChange={setKind} />
        {pendingTimestamp !== null && (
          <Tag tone="info" mono pill className="w-fit gap-1.5 pr-1">
            attached to {formatDuration(pendingTimestamp)}
            <button
              type="button"
              aria-label="Detach timestamp"
              title="Detach timestamp"
              onClick={onClearTimestamp}
              className="inline-flex size-4 items-center justify-center rounded-full hover:bg-hover"
            >
              <X aria-hidden />
            </button>
          </Tag>
        )}
        <CommentBox
          label={pendingReject ? `Why reject ${title}?` : `Comment on ${title}`}
          pendingReject={pendingReject}
          collapsible
          focusToken={focusToken}
          draft={draftFor(key)}
          onDraftChange={(text) => setDraft(key, text)}
          onSubmit={(body) => {
            dispatch({
              type: "ADD_COMMENT",
              target,
              body,
              timestampSec: pendingTimestamp,
              ...(kind !== null && { kind }),
            });
            onClearTimestamp();
            setKind(null);
          }}
          onCancelReject={() => dispatch({ type: "CANCEL_REJECT" })}
        />
      </div>
    </div>
  );
}
