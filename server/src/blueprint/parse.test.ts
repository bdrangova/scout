import { describe, expect, it } from 'vitest'
import { isAnalyzablePath, parseModule } from './parse.ts'

const names = (text: string, file = 'a.ts') => parseModule(file, text).declarations.map((d) => `${d.name}@${d.start}-${d.end}`)

describe('parseModule imports', () => {
  it('reads static imports with their local bindings, export-from, require and dynamic import', () => {
    const { imports } = parseModule(
      'a.js',
      [
        "import Base, { a as b, c } from './base'",
        "import * as ns from '../ns'",
        "import './side'",
        "export { x } from './x'",
        "export * from './star'",
        "const { p, q: r } = require('./cjs')",
        "const single = require('./single')",
        "const lazy = await import('./lazy')",
        "import('./bare')",
        "require(dynamicName)",
        "import eq = require('./eq')",
      ].join('\n'),
    )
    expect(imports).toEqual([
      { specifier: './base', bindings: ['Base', 'b', 'c'] },
      { specifier: '../ns', bindings: ['ns'] },
      { specifier: './side', bindings: [] },
      { specifier: './x', bindings: [] },
      { specifier: './star', bindings: [] },
      { specifier: './cjs', bindings: ['p', 'r'] },
      { specifier: './single', bindings: ['single'] },
      { specifier: './lazy', bindings: ['lazy'] },
      { specifier: './bare', bindings: [] },
      { specifier: './eq', bindings: ['eq'] },
    ])
  })
})

describe('parseModule extends', () => {
  it('records the identifier a class extends, also through a namespace', () => {
    const { extends: refs } = parseModule('a.js', "class A extends Base {}\nclass B extends Mod.Page {}\nclass C {}\nclass D extends mixin(Base) {}")
    expect(refs).toEqual([
      { className: 'A', base: 'Base' },
      { className: 'B', base: 'Mod' },
    ])
  })
})

describe('parseModule declarations', () => {
  it('lists the members of a JS class component with line ranges', () => {
    const src = ['class Page extends Base {', '  constructor(props) {', '    super(props)', '  }', '  render() {', '    return null', '  }', '  get title() { return 1 }', '  handle = () => {', '  }', '  plain = 5', '}'].join('\n')
    expect(names(src, 'page.js')).toEqual(['class Page@1-12', 'constructor()@2-4', 'render()@5-7', 'get title()@8-8', 'handle()@9-10'])
    const decls = parseModule('page.js', src).declarations
    expect(decls[1]).toMatchObject({ key: 'class Page/constructor()', parent: 'class Page', isClass: false })
    expect(decls[0]).toMatchObject({ key: 'class Page', parent: null, isClass: true })
  })

  it('lists TSX function components, arrow consts and memo / forwardRef wrappers', () => {
    const src = [
      'export function Card() {',
      '  return <div />',
      '}',
      'export const Row = () => <span />',
      'export const Memo = React.memo(function Memo() { return null })',
      'export const Ref = forwardRef<HTMLDivElement, Props>((props, ref) => <div ref={ref} />)',
      'const value = 3',
      'const typed = (() => 1) as () => number',
    ].join('\n')
    expect(names(src, 'card.tsx')).toEqual(['Card()@1-3', 'Row()@4-4', 'Memo()@5-5', 'Ref()@6-6', 'typed()@8-8'])
  })

  it('lists types, interfaces and enums and numbers repeated names', () => {
    const src = ['export type Foo = { a: 1 }', 'interface Bar {}', 'export enum Color { Red }', 'function f(a: string): void', 'function f(a: number): void', 'function f(a: any) {}'].join('\n')
    const decls = parseModule('t.ts', src).declarations
    expect(decls.map((d) => d.name)).toEqual(['type Foo', 'interface Bar', 'enum Color', 'f()', 'f()', 'f()'])
    expect(decls.slice(3).map((d) => d.key)).toEqual(['f()', 'f()#2', 'f()#3'])
  })

  it('survives a syntax error', () => {
    expect(() => parseModule('broken.ts', 'export function ( {')).not.toThrow()
  })
})

describe('isAnalyzablePath', () => {
  it('accepts the JS family only', () => {
    expect(['a.ts', 'a.TSX', 'a.mjs', 'a.cts', 'a.jsx'].every(isAnalyzablePath)).toBe(true)
    expect(['a.json', 'a.css', 'Makefile', 'a.d.txt'].some(isAnalyzablePath)).toBe(false)
  })
})
