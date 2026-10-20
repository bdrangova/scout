export type FileTypeId = 'ts' | 'js' | 'react' | 'yaml' | 'json' | 'css' | 'other'

export interface FileType {
  id: FileTypeId
  label: string
  /** Lower-case extensions including the dot; `other` has none. */
  exts: readonly string[]
}

/** The accent families of the design (`.ft-*`), in display order. */
export const FILE_TYPES: readonly FileType[] = [
  { id: 'ts', label: 'TypeScript', exts: ['.ts', '.mts', '.cts'] },
  { id: 'js', label: 'JavaScript', exts: ['.js', '.mjs', '.cjs'] },
  { id: 'react', label: 'React', exts: ['.tsx', '.jsx'] },
  { id: 'yaml', label: 'YAML', exts: ['.yml', '.yaml'] },
  { id: 'json', label: 'JSON', exts: ['.json', '.jsonc'] },
  { id: 'css', label: 'Styles', exts: ['.css', '.scss', '.less'] },
  { id: 'other', label: 'Other', exts: [] },
]

const BY_ID = new Map(FILE_TYPES.map((type) => [type.id, type]))
const BY_EXT = new Map(FILE_TYPES.flatMap((type) => type.exts.map((ext) => [ext, type] as const)))
const OTHER = BY_ID.get('other') as FileType

/** Classifies a path by its last extension; `Foo.test.ts` is `ts`, `Makefile` is `other`. */
export function fileTypeOf(path: string): FileType {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return OTHER
  return BY_EXT.get(name.slice(dot).toLowerCase()) ?? OTHER
}

/** The `ft-*` class that sets `--ft` so `bg-ft` / `text-ft` / `border-ft` take the type's colour. */
export function fileTypeClass(id: FileTypeId): string {
  return `ft-${id}`
}
