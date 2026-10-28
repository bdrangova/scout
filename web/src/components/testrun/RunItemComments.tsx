import type { CommentKind, CommentTarget } from "@scout/shared";
import { useState } from "react";
import { CommentBox } from "@/components/common/CommentBox";
import { CommentList } from "@/components/common/CommentList";
import { draftKey } from "@/lib/comment-drafts";
import { useReview } from "@/state/review-context";
import { useCommentActions } from "@/state/useCommentActions";
import { CommentKindPicker } from "./CommentKindPicker";

export interface RunItemCommentsProps {
  /** A `bug` (`ref` = the slug) or `run-file` (`ref` = a scenario file's `alias:path`) target. */
  target: CommentTarget;
  label: string;
  /** Bump to open the box (the "Comment" action). */
  focusToken?: number;
}

/** The open and resolved comments of a bug or a scenario file, the kind picker and the box; the draft lives in the review's draft store like a scenario's. */
export function RunItemComments({
  target,
  label,
  focusToken = 0,
}: RunItemCommentsProps) {
  const { dispatch, commentsFor, draftFor, setDraft } = useReview();
  const actions = useCommentActions();
  const [kind, setKind] = useState<CommentKind | null>(null);
  const key = draftKey(target);
  return (
    <div className="flex flex-col gap-3">
      <CommentList comments={commentsFor(target)} {...actions} />
      <CommentKindPicker value={kind} onChange={setKind} />
      <CommentBox
        label={label}
        pendingReject={false}
        collapsible
        focusToken={focusToken}
        draft={draftFor(key)}
        onDraftChange={(text) => setDraft(key, text)}
        onSubmit={(body) => {
          dispatch({
            type: "ADD_COMMENT",
            target,
            body,
            ...(kind !== null && { kind }),
          });
          setKind(null);
        }}
        onCancelReject={() => {}}
      />
    </div>
  );
}
