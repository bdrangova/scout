import type { WorkingTree } from '@scout/shared'

/**
 * How many files differ between two computations of the tree: files whose fingerprint moved,
 * files that appeared and files that disappeared. Feeds the "N files changed on disk" toast.
 */
export function changedFileCount(previous: WorkingTree, next: WorkingTree): number {
  const before = new Map(previous.files.map((file) => [file.path, file.fingerprint]))
  let changed = 0
  for (const file of next.files) {
    const old = before.get(file.path)
    if (old !== file.fingerprint) changed += 1
    before.delete(file.path)
  }
  return changed + before.size
}
