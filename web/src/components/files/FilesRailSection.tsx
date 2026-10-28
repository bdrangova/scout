import type { TreeFile } from '@scout/shared'
import { RailSection } from '@/components/layout/RailSlot'
import { FileTree } from './FileTree'
import { useTreeCollapsed } from './useTreeCollapsed'

interface FilesRailSectionProps {
  files: readonly TreeFile[]
  /** The full diff's files when `files` is one scope's list (see `FileTree`). */
  reviewFiles?: readonly TreeFile[]
  currentPath: string | null
  onSelect: (path: string) => void
}

/** The Files page's block in the session rail: the filterable file tree. */
export function FilesRailSection({ files, reviewFiles, currentPath, onSelect }: FilesRailSectionProps) {
  const [collapsed, toggleCollapsed] = useTreeCollapsed()
  return (
    <RailSection>
      <div className="flex min-h-0 flex-1 flex-col px-2.5 pt-3.5 pb-2">
        <FileTree files={files} reviewFiles={reviewFiles} currentPath={currentPath} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>
    </RailSection>
  )
}
