import type { Panel } from "@review-dash/shared";
import { GalleryPanel, LogPanel, VideoPanel } from "./media-panels";
import { PanelFrame } from "./PanelFrame";
import { ScenarioListPanel } from "./ScenarioListPanel";
import {
  KeyValuePanel,
  LinksPanel,
  MarkdownPanel,
  StatsPanel,
  TablePanel,
} from "./text-panels";
import { UnsupportedPanel } from "./UnsupportedPanel";

function PanelBody({ panel }: { panel: Panel }) {
  switch (panel.type) {
    case "markdown":
      return <MarkdownPanel panel={panel} />;
    case "stats":
      return <StatsPanel panel={panel} />;
    case "table":
      return <TablePanel panel={panel} />;
    case "key-value":
      return <KeyValuePanel panel={panel} />;
    case "gallery":
      return <GalleryPanel panel={panel} />;
    case "video":
      return <VideoPanel panel={panel} />;
    case "log":
      return <LogPanel panel={panel} />;
    case "links":
      return <LinksPanel panel={panel} />;
    case "scenario-list":
      return <ScenarioListPanel panel={panel} />;
    case "unsupported":
      return <UnsupportedPanel panel={panel} />;
  }
}

/** The registry: renders one overview panel by its `type` inside its card (title, span); an unknown or malformed one becomes the `UnsupportedPanel` placeholder. */
export function PanelView({ panel }: { panel: Panel }) {
  const title = panel.type === "unsupported" ? undefined : panel.title;
  const span = panel.type === "unsupported" ? undefined : panel.span;
  return (
    <PanelFrame type={panel.type} title={title} span={span}>
      <PanelBody panel={panel} />
    </PanelFrame>
  );
}
