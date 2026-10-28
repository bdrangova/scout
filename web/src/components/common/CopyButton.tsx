import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** A small icon button that copies `value` to the clipboard and shows a check for a moment. `label` names what is copied ("folder path"). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(`Couldn't copy the ${label}`, { description: 'Select it and copy it yourself.' })
    }
  }
  return (
    <Button variant="ghost" size="icon-sm" title={copied ? 'Copied' : `Copy ${label}`} aria-label={`Copy ${label}`} onClick={() => void copy()} className="shrink-0">
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )
}
