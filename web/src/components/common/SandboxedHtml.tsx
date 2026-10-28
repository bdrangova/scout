import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The permissions the agent's HTML runs with. `allow-same-origin` is deliberately absent. */
export const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'
export const HEIGHT_MESSAGE = 'scout:height'
const MIN_HEIGHT = 160

/** Tightens the inherited CSP: no fetch/XHR/WebSocket, no form posts. CDN scripts and styles still load. */
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'">`

/**
 * Runs before the document's own scripts: an in-memory `localStorage`/`sessionStorage` (the
 * opaque origin throws on access) and a height reporter the host listens for.
 */
const BOOTSTRAP_SCRIPT = `<script>(function(){
  function shim(name){
    try { void window[name].length; return } catch (e) {}
    var map = new Map();
    var store = {
      getItem: function(k){ return map.has(String(k)) ? map.get(String(k)) : null },
      setItem: function(k, v){ map.set(String(k), String(v)) },
      removeItem: function(k){ map.delete(String(k)) },
      clear: function(){ map.clear() },
      key: function(i){ var keys = Array.from(map.keys()); return i < keys.length ? keys[i] : null },
      get length(){ return map.size }
    };
    try { Object.defineProperty(window, name, { value: store, configurable: true }) } catch (e) {}
  }
  shim('localStorage'); shim('sessionStorage');
  var last = -1;
  function report(){
    var doc = document.documentElement, body = document.body;
    var height = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0);
    if (height === last) return;
    last = height;
    parent.postMessage({ type: '${HEIGHT_MESSAGE}', height: height }, '*');
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(report).observe(document.documentElement);
  }
  document.addEventListener('DOMContentLoaded', report);
  window.addEventListener('load', report);
  report();
})()</script>`

const INJECTION = CSP_META + BOOTSTRAP_SCRIPT

/** The `srcdoc` for an agent-written page: the CSP meta and bootstrap script first in `<head>`. */
// eslint-disable-next-line react-refresh/only-export-components -- exported for the unit test
export function buildSrcDoc(html: string): string {
  const head = /<head\b[^>]*>/i.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return html.slice(0, at) + INJECTION + html.slice(at)
  }
  const htmlTag = /<html\b[^>]*>/i.exec(html)
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length
    return `${html.slice(0, at)}<head>${INJECTION}</head>${html.slice(at)}`
  }
  return `<!doctype html><html><head>${INJECTION}</head><body>${html}</body></html>`
}

function openInNewTab(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export interface SandboxedHtmlProps {
  html: string
  /** Accessible name of the frame. */
  title: string
  /** The frame grows with its content up to this height, then scrolls internally. */
  maxHeight?: number
  className?: string
}

export function SandboxedHtml({ html, title, maxHeight = 1200, className }: SandboxedHtmlProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(MIN_HEIGHT)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current
      if (!frame || event.source !== frame.contentWindow) return
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const { type, height: reported } = data as { type?: unknown; height?: unknown }
      if (type !== HEIGHT_MESSAGE || typeof reported !== 'number' || !Number.isFinite(reported)) return
      setHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, Math.ceil(reported))))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [maxHeight])

  // `bg-paper` shows through a transparent page in the light theme; in the dark theme the colour-scheme
  // mismatch makes the browser paint the page's own (light) canvas instead, so agent HTML stays readable.
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={buildSrcDoc(html)}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        style={{ height }}
        className="w-full rounded-xl border-fine border-line bg-paper"
      />
      <div className="flex justify-end">
        <Button size="icon-sm" aria-label="Open in new tab" title="Open in new tab" onClick={() => openInNewTab(html)}>
          <ExternalLink aria-hidden />
        </Button>
      </div>
    </div>
  )
}
