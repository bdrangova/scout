import { githubImageRelayPath, isGithubImageUrl } from '@scout/shared'
import type { ComponentProps, ReactNode } from 'react'
import { useRef } from 'react'
import type { LinkSafetyModalProps } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseUrl } from './untrusted-markdown'

function BlockedImage({ src, alt }: { src?: string; alt?: string }) {
  const host = parseUrl(src)?.host ?? 'invalid address'
  return (
    <span data-blocked-image className="inline-block rounded-sm border border-line px-1.5 text-ink-muted">
      image blocked: {host}
      {alt ? ` (${alt})` : ''}
    </span>
  )
}

export function SafeImage({ src, alt }: Pick<ComponentProps<'img'>, 'src' | 'alt'>) {
  const url = typeof src === 'string' ? src : undefined
  if (!isGithubImageUrl(url)) return <BlockedImage src={url} alt={alt} />
  // Through the server's relay: it fetches signed in to GitHub, so private-repo attachments load too.
  return <img src={githubImageRelayPath(url)} alt={alt ?? ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="max-w-full rounded-sm" />
}

export function LinkSafetyDialog({ isOpen, onClose, onConfirm, url }: LinkSafetyModalProps): ReactNode {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent role="alertdialog" initialFocus={cancelRef} showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="pr-0">
          <DialogTitle>Open external link?</DialogTitle>
          <DialogDescription>From a GitHub comment. Check the destination first.</DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[13px] text-ink">{url}</p>
        <DialogFooter>
          <DialogClose ref={cancelRef} render={<Button />}>
            Cancel
          </DialogClose>
          <Button
            variant="primary"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
