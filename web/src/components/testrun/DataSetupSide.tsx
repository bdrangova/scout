import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/Markdown";
import { Button } from "@/components/ui/button";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";

export interface SnapshotPanelProps {
  path: string;
}

/** The snapshot path on the reviewer's machine, with a button that copies it. */
export function SnapshotPanel({ path }: SnapshotPanelProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy the path");
    }
  }
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Snapshot path</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        <code className="font-mono text-xs break-all">{path}</code>
        <div>
          <Button size="sm" onClick={() => void copy()}>
            <Copy aria-hidden />
            Copy path
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function EnvironmentPanel({
  items,
}: {
  items: readonly { key: string; value: string }[];
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Environment</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {items.map((item) => (
            <div key={item.key} className="contents">
              <dt className="font-bold text-ink-muted">{item.key}</dt>
              <dd className="m-0 font-mono text-xs">{item.value}</dd>
            </div>
          ))}
        </dl>
      </PanelBody>
    </Panel>
  );
}

export function NotesPanel({ markdown }: { markdown: string }) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Deviations</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <Markdown variant="untrusted" source={markdown} />
      </PanelBody>
    </Panel>
  );
}
