import { ContentCard } from "@/components/common/ContentCard";
import { Markdown } from "@/components/common/Markdown";
import { EXTRA_KIND } from "@/components/spec/item-kinds";
import { apiGet } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { runFilePath, runFileUrl, splitPath } from "@/lib/paths";

export interface RunMarkdownCardProps {
  sessionId: string;
  /** Index ref of the file, `alias:rel/path.md`. */
  fileRef: string;
  title: string;
  className?: string;
}

/** A markdown file of the run (the test plan), fetched and rendered like an extra: kind tag, title, file name, fold chevron. */
export function RunMarkdownCard({ sessionId, fileRef, title, className }: RunMarkdownCardProps) {
  const state = useAsync(`run-file:${sessionId}:${fileRef}`, () => apiGet<string>(runFilePath(sessionId, fileRef)));
  const name = splitPath(fileRef.replace(/^[^:/]+:/, "")).name;
  return (
    <ContentCard
      label={title}
      kind={EXTRA_KIND.markdown}
      title={title}
      collapseLabel={title}
      className={className}
      actions={
        <a
          className="font-mono text-xs font-medium text-ink-muted hover:underline"
          href={runFileUrl(sessionId, fileRef)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the raw file"
        >
          {name}
        </a>
      }
      content={{ content: state.data, loading: state.loading, error: state.error, reload: state.reload }}
    >
      {(text) => <Markdown source={text} tallDiagrams />}
    </ContentCard>
  );
}
