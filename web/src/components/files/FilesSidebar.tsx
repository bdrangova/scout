import type { TreeFile } from '@review-dash/shared'
import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { FileTree } from './FileTree'
import type { SidebarOpenState } from './useSidebarOpen'

export interface FilesSidebarProps {
  files: readonly TreeFile[]
  /** The full diff's files when `files` is one scope's list (see `FileTree`). */
  reviewFiles?: readonly TreeFile[]
  currentPath: string | null
  onSelect: (path: string) => void
  sidebar: SidebarOpenState
}

/** Sticky under the session header (which is 6.25rem tall, see `ScrollList`). */
const BELOW_HEADER = 'sticky top-[6.25rem] h-[calc(100dvh-6.25rem)]'

/**
 * The file tree beside the content: a `w-72` column on wide screens, an overlay drawer on narrow
 * ones. When hidden, `SidebarToggle` in the timeline row brings it back.
 */
export function FilesSidebar({ files, reviewFiles, currentPath, onSelect, sidebar }: FilesSidebarProps) {
  const { desktop, open, toggle, close } = sidebar
  if (!open) return null

  const panel = (
    <aside
      aria-label="Files sidebar"
      className={cn(
        'flex w-72 shrink-0 flex-col border-r bg-card',
        desktop ? BELOW_HEADER : 'absolute inset-y-0 left-0 shadow-xl',
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Files</span>
        <span className="text-xs text-muted-foreground tabular-nums">{files.length}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Hide files sidebar" title="Hide files sidebar (B)" onClick={toggle} className="ml-auto">
          <PanelLeftClose aria-hidden />
        </Button>
      </div>
      <FileTree
        files={files}
        reviewFiles={reviewFiles}
        currentPath={currentPath}
        onSelect={(path) => {
          onSelect(path)
          if (!desktop) close()
        }}
      />
    </aside>
  )

  if (desktop) return panel

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Close files sidebar" onClick={close} className="absolute inset-0 bg-foreground/30" />
      {panel}
    </div>
  )
}

/** The icon button that shows the sidebar (or opens the drawer) while it is hidden; sits at the left of the timeline row. */
export function SidebarToggle({ sidebar }: { sidebar: SidebarOpenState }) {
  if (sidebar.desktop && sidebar.open) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Show files sidebar" aria-expanded={sidebar.open} onClick={sidebar.toggle} className="shrink-0 self-start" />}
      >
        <PanelLeft aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Files
        <Kbd>B</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
