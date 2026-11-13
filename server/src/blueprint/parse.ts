import path from 'node:path'
import ts from 'typescript'

/** A module specifier a file loads, with the local names it is bound to (`import a, { b as c }` gives `a`, `c`). */
export interface ImportRef {
  specifier: string
  bindings: string[]
}

/** A declaration with its 1-based line range. Class members point at their class through `parent`. */
export interface Declaration {
  /** Identity inside the file: `class A/run()` for a member, `run()` at top level (a repeated name gets `#2`, `#3`, ...). */
  key: string
  /** What the reviewer sees: `run()`, `class A`, `type T`, `interface I`, `enum E`. */
  name: string
  start: number
  end: number
  /** `key` of the owning class, null for a top-level declaration. */
  parent: string | null
  /** True for a class (its members are the declarations with this `key` as `parent`). */
  isClass: boolean
}

/** A `class X extends Y`: `base` is the leftmost identifier of `Y` (`Mod` for `Mod.Y`). */
export interface ExtendsRef {
  className: string
  base: string
}

export interface ParsedModule {
  imports: ImportRef[]
  extends: ExtendsRef[]
  declarations: Declaration[]
}

export const ANALYZED_EXTENSIONS: ReadonlySet<string> = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'])

export function isAnalyzablePath(filePath: string): boolean {
  return ANALYZED_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())
}

function scriptKind(filePath: string): ts.ScriptKind {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS
    default:
      return ts.ScriptKind.JS
  }
}

const WRAPPERS: ReadonlySet<string> = new Set(['memo', 'forwardRef'])

/** Strips parentheses, `as` / `satisfies` / `!`, and `memo(...)` / `forwardRef(...)` wrappers; returns the function inside, if any. */
function callableOf(node: ts.Expression | undefined): ts.ArrowFunction | ts.FunctionExpression | null {
  let current = node
  while (current !== undefined) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression
    } else if (ts.isCallExpression(current)) {
      const callee = current.expression
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
      if (name === null || !WRAPPERS.has(name)) return null
      current = current.arguments[0]
    } else {
      return null
    }
  }
  return null
}

function stringLiteralOf(node: ts.Node | undefined): string | null {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null
}

/** Local names a `require()` / `import()` result is assigned to (`const a = ...`, `const { b, c: d } = ...`, `const e = (await ...).f`). */
function callBindings(call: ts.CallExpression): string[] {
  let node: ts.Node = call
  while (node.parent && (ts.isAwaitExpression(node.parent) || ts.isParenthesizedExpression(node.parent) || ts.isPropertyAccessExpression(node.parent) || ts.isNonNullExpression(node.parent) || ts.isAsExpression(node.parent))) {
    node = node.parent
  }
  const declaration = node.parent
  if (!declaration || !ts.isVariableDeclaration(declaration) || declaration.initializer !== node) return []
  const out: string[] = []
  const collect = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) out.push(name.text)
    else for (const element of name.elements) if (ts.isBindingElement(element)) collect(element.name)
  }
  collect(declaration.name)
  return out
}

function importClauseBindings(clause: ts.ImportClause | undefined): string[] {
  if (!clause) return []
  const out: string[] = []
  if (clause.name) out.push(clause.name.text)
  const named = clause.namedBindings
  if (named) {
    if (ts.isNamespaceImport(named)) out.push(named.name.text)
    else for (const element of named.elements) out.push(element.name.text)
  }
  return out
}

function leftmostIdentifier(expression: ts.Expression): string | null {
  let current = expression
  while (ts.isPropertyAccessExpression(current)) current = current.expression
  return ts.isIdentifier(current) ? current.text : null
}

function memberName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return name.getText()
}

/** The declarations of one module, in source order. */
function collectDeclarations(sf: ts.SourceFile): Declaration[] {
  const out: Declaration[] = []
  const seen = new Map<string, number>()
  const line = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1
  const add = (node: ts.Node, name: string, parent: string | null, isClass: boolean): string => {
    const base = parent === null ? name : `${parent}/${name}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const key = n === 1 ? base : `${base}#${n}`
    out.push({ key, name, start: line(node.getStart(sf)), end: line(node.getEnd()), parent, isClass })
    return key
  }

  const addClass = (node: ts.ClassDeclaration, name: string): void => {
    const key = add(node, `class ${name}`, null, true)
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member)) add(member, 'constructor()', key, false)
      else if (ts.isMethodDeclaration(member)) add(member, `${memberName(member.name)}()`, key, false)
      else if (ts.isGetAccessorDeclaration(member)) add(member, `get ${memberName(member.name)}()`, key, false)
      else if (ts.isSetAccessorDeclaration(member)) add(member, `set ${memberName(member.name)}()`, key, false)
      else if (ts.isPropertyDeclaration(member) && callableOf(member.initializer)) add(member, `${memberName(member.name)}()`, key, false)
    }
  }

  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) add(statement, `${statement.name.text}()`, null, false)
    else if (ts.isClassDeclaration(statement) && statement.name) addClass(statement, statement.name.text)
    else if (ts.isTypeAliasDeclaration(statement)) add(statement, `type ${statement.name.text}`, null, false)
    else if (ts.isInterfaceDeclaration(statement)) add(statement, `interface ${statement.name.text}`, null, false)
    else if (ts.isEnumDeclaration(statement)) add(statement, `enum ${statement.name.text}`, null, false)
    else if (ts.isVariableStatement(statement)) {
      const list = statement.declarationList.declarations
      for (const declaration of list) {
        if (ts.isIdentifier(declaration.name) && callableOf(declaration.initializer)) add(list.length === 1 ? statement : declaration, `${declaration.name.text}()`, null, false)
      }
    }
  }
  return out
}

/** Parses one JS/TS file (syntax only, no type information). Never throws: the compiler API recovers from syntax errors. */
export function parseModule(filePath: string, text: string): ParsedModule {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(filePath))
  const imports: ImportRef[] = []
  const extendsRefs: ExtendsRef[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier = stringLiteralOf(node.moduleSpecifier)
      if (specifier !== null) imports.push({ specifier, bindings: importClauseBindings(node.importClause) })
    } else if (ts.isExportDeclaration(node)) {
      const specifier = stringLiteralOf(node.moduleSpecifier)
      if (specifier !== null) imports.push({ specifier, bindings: [] })
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      const specifier = ts.isExternalModuleReference(reference) ? stringLiteralOf(reference.expression) : null
      if (specifier !== null) imports.push({ specifier, bindings: [node.name.text] })
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      const specifier = stringLiteralOf(node.arguments[0])
      const callee = node.expression
      const isLoad = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')
      if (specifier !== null && isLoad) imports.push({ specifier, bindings: callBindings(node) })
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
      const parent = heritage?.types[0]
      const base = parent ? leftmostIdentifier(parent.expression) : null
      if (base !== null) extendsRefs.push({ className: node.name?.text ?? '', base })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return { imports, extends: extendsRefs, declarations: collectDeclarations(sf) }
}
