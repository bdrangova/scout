import type { Panel } from "@scout/shared";
import { EvidenceGallery } from "../EvidenceGallery";
import { LogExcerpt } from "../LogExcerpt";
import { RunVideo } from "../RunVideo";
import { useSessionContext } from "@/lib/session-context";

type Of<T extends Panel["type"]> = Extract<Panel, { type: T }>;

export function GalleryPanel({ panel }: { panel: Of<"gallery"> }) {
  const { sessionId } = useSessionContext();
  return <EvidenceGallery sessionId={sessionId} items={panel.items} />;
}

export function VideoPanel({ panel }: { panel: Of<"video"> }) {
  const { sessionId } = useSessionContext();
  return (
    <RunVideo
      sessionId={sessionId}
      path={panel.path}
      caption={panel.caption}
      chapters={panel.chapters}
    />
  );
}

export function LogPanel({ panel }: { panel: Of<"log"> }) {
  const { sessionId } = useSessionContext();
  return (
    <LogExcerpt
      sessionId={sessionId}
      path={panel.path}
      from={panel.from}
      to={panel.to}
      label={panel.label}
    />
  );
}
