import type { BlueprintGroupingType } from '@scout/shared'
import { Check, Copy, Layers } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { blueprintGroupsCommand } from '@/lib/blueprint'
import { useCopyCommand } from './useCopyCommand'

const WORDS: Record<BlueprintGroupingType, string> = { feature: 'feature', layer: 'layer', priority: 'review priority' }

/** A view the agent has not grouped yet: what it costs, and the command that asks for it (copied on the button, never on its own). */
export function BlueprintGroupsEmpty({ sessionId, type }: { sessionId: string; type: BlueprintGroupingType }) {
  const command = blueprintGroupsCommand(sessionId, type)
  const { copied, failed, copy } = useCopyCommand(command)
  return (
    <div className="px-8 py-12">
      <EmptyState
        icon={Layers}
        title={`Not grouped by ${WORDS[type]} yet`}
        description="Scout's agent can group the changed files for you. It reads the change to do so, which uses tokens."
        action={
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex max-w-full items-center gap-2 rounded-md border-fine border-line bg-paper-2 py-1 pr-1 pl-3">
              <code className="min-w-0 truncate font-mono text-xs">{command}</code>
              <Button size="sm" onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="m-0 text-xs text-ink-muted">Run it in this session's Claude Code; this page updates when it is done.</p>
            {failed && <Notice tone="err">Could not copy; select the command and copy it yourself.</Notice>}
          </div>
        }
      />
    </div>
  )
}
