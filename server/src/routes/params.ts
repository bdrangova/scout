/** Express 5 gives `*path` wildcards as decoded segments; rebuild the slash-joined path. */
export function wildcardPath(param: string | string[] | undefined): string {
  if (param === undefined) return ''
  return Array.isArray(param) ? param.join('/') : param
}

export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
