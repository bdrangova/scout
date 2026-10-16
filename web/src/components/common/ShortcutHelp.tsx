import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { HOTKEY_GROUPS } from '@/lib/keyboard'

interface ShortcutHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Every hotkey, grouped; opened by `?` and by the header's help link. */
export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Off while you type, except ⌘ Enter.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {HOTKEY_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title} className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.title}</h3>
              <dl className="grid grid-cols-[minmax(5rem,auto)_1fr] items-center gap-x-4 gap-y-2 text-sm">
                {group.entries.map((entry) => (
                  <div key={entry.description} className="contents">
                    <dt>
                      <KbdGroup>
                        {entry.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </dt>
                    <dd className="text-muted-foreground">{entry.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
