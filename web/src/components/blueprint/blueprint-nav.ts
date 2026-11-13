import { blueprintDiagramId, type BlueprintDiagramRef, type BlueprintPackage } from '@scout/shared'

/** The packages from the root down to the one whose `dir` is `dir` (empty when there is none). */
export function packageChain(root: BlueprintPackage, dir: string): BlueprintPackage[] {
  if (root.dir === dir) return [root]
  for (const child of root.packages) {
    const below = packageChain(child, dir)
    if (below.length > 0) return [root, ...below]
  }
  return []
}

/** The packages from the root down to the deepest one that holds `path` (the root alone for a file not in the tree). */
export function chainOfFile(root: BlueprintPackage, path: string): BlueprintPackage[] {
  const chain = [root]
  for (let current: BlueprintPackage | undefined = root; current; ) {
    current = current.packages.find((child) => child.allFiles.includes(path))
    if (current) chain.push(current)
  }
  return chain
}

/** The packages that lead to a diagram: the package itself, or for an around-diagram the folders of its file. */
export function chainOfDiagram(root: BlueprintPackage, ref: BlueprintDiagramRef): BlueprintPackage[] {
  return ref.type === 'package' ? packageChain(root, ref.dir) : chainOfFile(root, ref.path)
}

export function packageDiagramId(pkg: BlueprintPackage): string {
  return blueprintDiagramId({ type: 'package', dir: pkg.dir })
}

/** Where Esc goes: a package's parent, the package that holds an around-diagram's file; null at the root. */
export function parentDiagramId(root: BlueprintPackage, ref: BlueprintDiagramRef): string | null {
  const chain = chainOfDiagram(root, ref)
  if (ref.type === 'around') {
    const holder = chain.at(-1)
    return holder ? packageDiagramId(holder) : null
  }
  const parent = chain.at(-2)
  return parent ? packageDiagramId(parent) : null
}
