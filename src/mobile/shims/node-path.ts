// Enough of node:path (POSIX style) for the shared code.
export const sep = '/'
const parts = (p: string) => p.split(/[\\/]/)

export function normalize(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of parts(p)) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return (abs ? '/' : '') + out.join('/')
}
export const join = (...ps: string[]) => normalize(ps.filter(Boolean).join('/'))
export const resolve = (...ps: string[]) => normalize(ps.filter(Boolean).join('/'))
export const basename = (p: string, ext?: string) => {
  const b = parts(p).filter(Boolean).pop() ?? ''
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b
}
export const dirname = (p: string) => {
  const ps = parts(p)
  ps.pop()
  return ps.join('/') || '.'
}
export const extname = (p: string) => {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}
export const relative = (from: string, to: string) => (to.startsWith(from) ? to.slice(from.length).replace(/^\/+/, '') : to)
export const posix = { sep, normalize, join, resolve, basename, dirname, extname, relative }
export default { sep, normalize, join, resolve, basename, dirname, extname, relative, posix }
