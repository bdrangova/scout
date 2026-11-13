import type { Blueprint } from '../schemas/blueprint.ts'
import type { BlueprintBoxRef, BlueprintDiagramRef } from './ids.ts'
import { blueprintBoxKey, blueprintDiagramId } from './ids.ts'
import type { BlueprintPackage } from './tree.ts'
import { findBlueprintPackage } from './tree.ts'

/** One box of a diagram: a sub-package or a single file. */
export interface BlueprintBox {
  key: string
  ref: BlueprintBoxRef
  /** Package name or file basename. */
  name: string
  /** Files inside the box (one for a file box), sorted. */
  files: string[]
  /** 0 = leans on nothing else here; -1 = no arrows at all in this diagram. */
  layer: number
  /** Files outside the diagram that import (but do not extend) something in this box. */
  usedByOutside: number
  /** Files outside the diagram that extend something in this box. */
  extendedByOutside: number
  /** Links from this box to changed files outside the diagram. */
  usesOutside: number
}

/** `from` is the dependent box, `to` what it leans on. */
export interface BlueprintArrow {
  from: string
  to: string
  /** Number of file-level links. */
  count: number
  /** True if any of the links is an inheritance link. */
  extends: boolean
}

export interface BlueprintDiagram {
  id: string
  ref: BlueprintDiagramRef
  title: string
  /** In reading order. */
  boxes: BlueprintBox[]
  arrows: BlueprintArrow[]
  /** The key of the box the diagram is drawn around; null for a package diagram. */
  center: string | null
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function fileBox(path: string): BlueprintBox {
  const ref: BlueprintBoxRef = { type: 'file', path }
  return { key: blueprintBoxKey(ref), ref, name: baseName(path), files: [path], layer: -1, usedByOutside: 0, extendedByOutside: 0, usesOutside: 0 }
}

function packageBox(pkg: BlueprintPackage): BlueprintBox {
  const ref: BlueprintBoxRef = { type: 'dir', dir: pkg.dir }
  return { key: blueprintBoxKey(ref), ref, name: pkg.name, files: pkg.allFiles, layer: -1, usedByOutside: 0, extendedByOutside: 0, usesOutside: 0 }
}

function sortPath(box: BlueprintBox): string {
  return box.ref.type === 'dir' ? box.ref.dir : box.ref.path
}

/** Arrows between the boxes (aggregated) and the outside counts on the boxes. `centre` limits arrows to those touching that file. */
function collectLinks(blueprint: Blueprint, boxes: BlueprintBox[], owner: Map<string, string>, centre: string | null): BlueprintArrow[] {
  const byKey = new Map(boxes.map((b) => [b.key, b]))
  const arrows = new Map<string, BlueprintArrow>()
  for (const file of blueprint.files) {
    const from = owner.get(file.path)
    for (const target of file.imports) {
      const to = owner.get(target)
      const inherits = file.extends.includes(target)
      if (from !== undefined && to !== undefined) {
        if (from === to) continue
        if (centre !== null && file.path !== centre && target !== centre) continue
        const id = `${from}>${to}`
        const arrow = arrows.get(id) ?? { from, to, count: 0, extends: false }
        arrow.count++
        arrow.extends ||= inherits
        arrows.set(id, arrow)
      } else if (from !== undefined) {
        const box = byKey.get(from)
        if (box) box.usesOutside++
      } else if (to !== undefined) {
        const box = byKey.get(to)
        if (box && inherits) box.extendedByOutside++
        else if (box) box.usedByOutside++
      }
    }
  }
  return [...arrows.values()]
}

/** Layer per box: 0 = leans on no other box, else 1 + the deepest layer it leans on (edges that close a cycle are ignored); -1 = no arrows. */
function layerOf(boxes: BlueprintBox[], arrows: BlueprintArrow[]): Map<string, number> {
  const leansOn = new Map<string, string[]>(boxes.map((b) => [b.key, []]))
  const linked = new Set<string>()
  for (const a of arrows) {
    leansOn.get(a.from)?.push(a.to)
    linked.add(a.from).add(a.to)
  }
  for (const list of leansOn.values()) list.sort(byText)
  const memo = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (key: string): number => {
    const known = memo.get(key)
    if (known !== undefined) return known
    visiting.add(key)
    let layer = 0
    for (const next of leansOn.get(key) ?? []) if (!visiting.has(next)) layer = Math.max(layer, depth(next) + 1)
    visiting.delete(key)
    memo.set(key, layer)
    return layer
  }
  return new Map(boxes.map((b) => [b.key, linked.has(b.key) ? depth(b.key) : -1]))
}

/** Reading order: layer ascending (unlinked last), within a layer by the mean position of what the box leans on, then by path. */
function readingOrder(boxes: BlueprintBox[], arrows: BlueprintArrow[]): BlueprintBox[] {
  const leansOn = new Map<string, string[]>(boxes.map((b) => [b.key, []]))
  for (const a of arrows) leansOn.get(a.from)?.push(a.to)
  const position = new Map<string, number>()
  const ordered: BlueprintBox[] = []
  const compare = (a: BlueprintBox, b: BlueprintBox): number => byText(sortPath(a), sortPath(b)) || byText(a.key, b.key)
  const maxLayer = Math.max(-1, ...boxes.map((b) => b.layer))
  for (let layer = 0; layer <= maxLayer; layer++) {
    const bary = new Map<string, number>()
    const row = boxes.filter((b) => b.layer === layer)
    for (const box of row) {
      const spots = (leansOn.get(box.key) ?? []).flatMap((k) => position.get(k) ?? [])
      bary.set(box.key, spots.length ? spots.reduce((s, n) => s + n, 0) / spots.length : -1)
    }
    row.sort((a, b) => (bary.get(a.key) ?? -1) - (bary.get(b.key) ?? -1) || compare(a, b))
    row.forEach((box, i) => position.set(box.key, i))
    ordered.push(...row)
  }
  return [...ordered, ...boxes.filter((b) => b.layer < 0).sort(compare)]
}

function sortArrows(arrows: BlueprintArrow[], boxes: BlueprintBox[]): BlueprintArrow[] {
  const index = new Map(boxes.map((b, i) => [b.key, i]))
  const at = (key: string): number => index.get(key) ?? 0
  return [...arrows].sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to))
}

function assemble(
  blueprint: Blueprint,
  ref: BlueprintDiagramRef,
  title: string,
  boxes: BlueprintBox[],
  centre: string | null,
  forcedLayers: Map<string, number> | null,
): BlueprintDiagram {
  const owner = new Map<string, string>()
  for (const box of boxes) for (const file of box.files) owner.set(file, box.key)
  const arrows = collectLinks(blueprint, boxes, owner, centre)
  const layers = forcedLayers ?? layerOf(boxes, arrows)
  for (const box of boxes) box.layer = layers.get(box.key) ?? -1
  const ordered = forcedLayers ? boxes : readingOrder(boxes, arrows)
  return {
    id: blueprintDiagramId(ref),
    ref,
    title,
    boxes: ordered,
    arrows: sortArrows(arrows, ordered),
    center: centre === null ? null : blueprintBoxKey({ type: 'file', path: centre }),
  }
}

function packageDiagram(blueprint: Blueprint, root: BlueprintPackage, dir: string): BlueprintDiagram | null {
  const pkg = findBlueprintPackage(root, dir)
  if (!pkg) return null
  const boxes = [...pkg.packages.map(packageBox), ...pkg.files.map(fileBox)]
  return assemble(blueprint, { type: 'package', dir }, pkg === root ? root.name || 'Whole change' : pkg.name, boxes, null, null)
}

function aroundDiagram(blueprint: Blueprint, path: string): BlueprintDiagram | null {
  const files = new Map(blueprint.files.map((f) => [f.path, f]))
  const centre = files.get(path)
  if (!centre) return null
  const ups = [...new Set(centre.imports)].filter((p) => p !== path && files.has(p)).sort(byText)
  const upSet = new Set(ups)
  const downs = blueprint.files
    .filter((f) => f.path !== path && !upSet.has(f.path) && f.imports.includes(path))
    .map((f) => f.path)
    .sort((a, b) => Number(files.get(b)?.extends.includes(path)) - Number(files.get(a)?.extends.includes(path)) || byText(a, b))
  const boxes = [...ups, path, ...downs].map(fileBox)
  const layers = new Map<string, number>()
  boxes.forEach((box, i) => layers.set(box.key, i < ups.length ? 0 : i === ups.length ? 1 : 2))
  return assemble(blueprint, { type: 'around', path }, `around ${baseName(path)}`, boxes, path, layers)
}

/** The diagram for a package or around a file; null when that package folder or file does not exist. */
export function buildBlueprintDiagram(blueprint: Blueprint, root: BlueprintPackage, ref: BlueprintDiagramRef): BlueprintDiagram | null {
  return ref.type === 'package' ? packageDiagram(blueprint, root, ref.dir) : aroundDiagram(blueprint, ref.path)
}

/** The files to review for a diagram, in reading order: its file boxes, or (with none) every file inside its boxes, box by box. */
export function blueprintDiagramFiles(diagram: BlueprintDiagram): string[] {
  const direct = diagram.boxes.flatMap((b) => (b.ref.type === 'file' ? [b.ref.path] : []))
  return direct.length ? direct : diagram.boxes.flatMap((b) => b.files)
}
