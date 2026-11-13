import { describe, expect, it } from 'vitest'
import { BLUEPRINT_MAX_MEMBERS } from '@scout/shared'
import { changedLinesOf, diffMembers } from './members.ts'
import { parseModule } from './parse.ts'

const decls = (text: string) => parseModule('a.js', text).declarations
const patch = (hunk: string) => `diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n${hunk}`

describe('changedLinesOf', () => {
  it('numbers added lines on the new side and deleted lines on the old side', () => {
    expect(changedLinesOf(patch('@@ -2,3 +2,3 @@\n keep\n-gone\n+new\n tail\n'))).toEqual({ added: [3], deleted: [3] })
    expect(changedLinesOf(undefined)).toEqual({ added: [], deleted: [] })
  })
})

describe('diffMembers', () => {
  const base = ['function a() {', '  return 1', '}', 'function b() {', '  return 2', '}', 'function gone() {}'].join('\n')
  const next = ['function a() {', '  return 11', '}', 'function b() {', '  return 2', '}', 'function fresh() {}'].join('\n')

  it('marks added, removed and changed declarations in order', () => {
    const changed = changedLinesOf(patch('@@ -1,7 +1,7 @@\n function a() {\n-  return 1\n+  return 11\n }\n function b() {\n   return 2\n }\n-function gone() {}\n+function fresh() {}\n'))
    expect(diffMembers(decls(next), decls(base), changed)).toEqual([
      { name: 'a()', change: 'changed', side: 'new', line: 1 },
      { name: 'fresh()', change: 'added', side: 'new', line: 7 },
      { name: 'gone()', change: 'removed', side: 'old', line: 7 },
    ])
  })

  it('places a removed declaration by its old line', () => {
    const old = 'function a() {}\nfunction b() {}\nfunction c() {}'
    const now = 'function a() {}\nfunction c() {}'
    expect(diffMembers(decls(now), decls(old), changedLinesOf(patch('@@ -1,3 +1,2 @@\n function a() {}\n-function b() {}\n function c() {}\n')))).toEqual([{ name: 'b()', change: 'removed', side: 'old', line: 2 }])
  })

  it('reports a deleted line inside a function as that function changed', () => {
    const old = 'function a() {\n  one()\n  two()\n}'
    const now = 'function a() {\n  one()\n}'
    expect(diffMembers(decls(now), decls(old), changedLinesOf(patch('@@ -1,4 +1,3 @@\n function a() {\n   one()\n-  two()\n }\n')))).toEqual([{ name: 'a()', change: 'changed', side: 'new', line: 1 }])
  })

  describe('classes', () => {
    const old = ['class A {', '  x() {', '    return 1', '  }', '}'].join('\n')

    it('does not report the class when only a member changed', () => {
      const now = old.replace('return 1', 'return 2')
      expect(diffMembers(decls(now), decls(old), changedLinesOf(patch('@@ -2,3 +2,3 @@\n   x() {\n-    return 1\n+    return 2\n   }\n')))).toEqual([{ name: 'x()', change: 'changed', side: 'new', line: 2 }])
    })

    it('reports the class when a line outside its members changed, and a new member as added', () => {
      const now = ['class A extends B {', '  x() {', '    return 1', '  }', '  y() {}', '}'].join('\n')
      expect(diffMembers(decls(now), decls(old), changedLinesOf(patch('@@ -1,5 +1,6 @@\n-class A {\n+class A extends B {\n   x() {\n     return 1\n   }\n+  y() {}\n }\n')))).toEqual([
        { name: 'class A', change: 'changed', side: 'new', line: 1 },
        { name: 'y()', change: 'added', side: 'new', line: 5 },
      ])
    })

    it('lists every declaration of a wholly added file as added', () => {
      expect(diffMembers(decls(old), [], { added: [1, 2, 3, 4, 5], deleted: [] }).map((m) => m.change)).toEqual(['added', 'added'])
    })
  })

  it('caps the list', () => {
    const many = Array.from({ length: BLUEPRINT_MAX_MEMBERS + 10 }, (_, i) => `function f${i}() {}`).join('\n')
    expect(diffMembers(decls(many), [], { added: [], deleted: [] })).toHaveLength(BLUEPRINT_MAX_MEMBERS)
  })
})
