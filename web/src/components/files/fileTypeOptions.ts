import type { TreeFile } from '@scout/shared'
import { FILE_TYPES, fileTypeOf, type FileTypeId } from '@/lib/file-type'
import type { FileTypeOption } from './FileTypeFilter'

/** The lower-case extension of a path including the dot, or `null` for `Makefile`. */
function extensionOf(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? null : name.slice(dot).toLowerCase()
}

/** One option per file type present in `files`, in `FILE_TYPES` order, with the extensions seen and the file count. */
export function fileTypeOptions(files: readonly TreeFile[]): FileTypeOption[] {
  const seen = new Map<FileTypeId, { exts: Set<string>; count: number }>()
  for (const file of files) {
    const type = fileTypeOf(file.path)
    const entry = seen.get(type.id) ?? { exts: new Set<string>(), count: 0 }
    entry.count += 1
    const ext = extensionOf(file.path)
    if (ext !== null) entry.exts.add(ext)
    seen.set(type.id, entry)
  }
  return FILE_TYPES.flatMap((type) => {
    const entry = seen.get(type.id)
    if (!entry) return []
    // Known types list their family's extensions in the palette's order; `other` lists what was actually seen.
    const exts = type.exts.length > 0 ? type.exts.filter((ext) => entry.exts.has(ext)) : [...entry.exts].sort()
    return [{ type, exts, count: entry.count }]
  })
}

/** Narrows `files` to the selected types; a selection with none of the present types filters nothing. */
export function filterByTypes(files: readonly TreeFile[], selected: readonly FileTypeId[]): readonly TreeFile[] {
  if (selected.length === 0) return files
  const wanted = new Set(selected)
  const narrowed = files.filter((file) => wanted.has(fileTypeOf(file.path).id))
  return narrowed.length === 0 && !files.some((file) => wanted.has(fileTypeOf(file.path).id)) ? files : narrowed
}
