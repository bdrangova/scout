import type { EvidenceRef } from "@scout/shared";
import { Tag } from "@/components/ui/tag";
import { isDeviation, type Band } from "./data-setup-bands";
import { EvidenceGallery } from "./EvidenceGallery";
import { RunVideo } from "./RunVideo";

interface MediaProps {
  sessionId: string;
  videos: readonly EvidenceRef[];
  screenshots: readonly EvidenceRef[];
}

function Media({ sessionId, videos, screenshots }: MediaProps) {
  return (
    <>
      {videos.map((video) => (
        <RunVideo
          key={video.path}
          sessionId={sessionId}
          path={video.path}
          caption={video.caption}
        />
      ))}
      {screenshots.length > 0 && (
        <EvidenceGallery sessionId={sessionId} items={screenshots} />
      )}
    </>
  );
}

const CARD =
  "flex flex-col gap-3 rounded-2xl border-fine border-line bg-surface px-5 py-4";

/** The card of a band: header (label, result, a deviation flag), action / expected / observed, then its media. */
export function BandCard({
  sessionId,
  band,
}: {
  sessionId: string;
  band: Band;
}) {
  const { step } = band;
  if (step === null) {
    return (
      <article aria-label="More evidence" className={CARD}>
        <h3 className="m-0 text-[15px] font-bold">{band.label}</h3>
        <Media
          sessionId={sessionId}
          videos={band.videos}
          screenshots={band.screenshots}
        />
      </article>
    );
  }
  return (
    <article aria-label={`Step ${band.label}`} className={CARD}>
      <header className="flex flex-wrap items-center gap-2.5">
        <h3 className="m-0 text-[15px] font-bold">{band.label}</h3>
        {step.result !== undefined && <Tag size="sm">{step.result}</Tag>}
        {isDeviation(step) && (
          <Tag tone="warn" size="sm" data-slot="deviation">
            Deviation
          </Tag>
        )}
      </header>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {(["action", "expected", "observed"] as const).flatMap((key) =>
          step[key] === undefined
            ? []
            : [
                <dt
                  key={`${key}-t`}
                  className="font-bold text-ink-muted capitalize"
                >
                  {key}
                </dt>,
                <dd key={`${key}-d`} className="m-0">
                  {step[key]}
                </dd>,
              ],
        )}
      </dl>
      <Media
        sessionId={sessionId}
        videos={band.videos}
        screenshots={band.screenshots}
      />
    </article>
  );
}
