import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSrcDoc, SandboxedHtml } from './SandboxedHtml'

const CSP = `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'">`

describe('buildSrcDoc', () => {
  it('injects the CSP meta, the storage shim and the height reporter at the top of an existing head', () => {
    const doc = buildSrcDoc('<!doctype html><html><head><title>x</title></head><body>hi</body></html>')
    const headAt = doc.indexOf('<head>') + '<head>'.length
    expect(doc.slice(headAt).startsWith(CSP)).toBe(true)
    expect(doc.indexOf(CSP)).toBeLessThan(doc.indexOf('<title>'))
    expect(doc).toContain("shim('localStorage'); shim('sessionStorage')")
    expect(doc).toContain('ResizeObserver')
    expect(doc).toContain("parent.postMessage({ type: 'scout:height', height: height }, '*')")
  })

  it('creates a head when the document has none', () => {
    expect(buildSrcDoc('<html><body>hi</body></html>')).toMatch(new RegExp(`^<html><head>${CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<script>`))
    const fragment = buildSrcDoc('<p>just a fragment</p>')
    expect(fragment.startsWith(`<!doctype html><html><head>${CSP}`)).toBe(true)
    expect(fragment).toContain('<body><p>just a fragment</p></body>')
  })
})

describe('SandboxedHtml', () => {
  it('renders a sandboxed srcdoc iframe without allow-same-origin and an open-in-new-tab button', () => {
    render(<SandboxedHtml html="<p>report</p>" title="Test report" />)
    const frame = screen.getByTitle('Test report')
    expect(frame.tagName).toBe('IFRAME')
    const sandbox = frame.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.getAttribute('srcdoc')).toContain(CSP)
    expect(frame.getAttribute('srcdoc')).toContain('<p>report</p>')
    expect(frame).toHaveStyle({ height: '160px' })
    expect(screen.getByRole('button', { name: 'Open in new tab' })).toBeInTheDocument()
  })
})
