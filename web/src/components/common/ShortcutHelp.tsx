import { Eyebrow } from '@/components/common/Eyebrow'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useShellConfig } from '@/components/layout/shell-config'
import { HOTKEY_GROUPS, hotkeyGroupsFor } from '@/lib/keyboard'

interface ShortcutHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Every hotkey, grouped under eyebrow headings as key caps; opened by `?` and by the status bar's keyboard button. */
export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  const config = useShellConfig()
  const groups = config.kind === 'code-review' ? HOTKEY_GROUPS : hotkeyGroupsFor(config.sections.map(config.sectionLabel), config.hotkeys.modes, config.kind === 'test-run')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Off while you type, except <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
              <Eyebrow as="h3">{group.title}</Eyebrow>
              <dl className="m-0 grid grid-cols-[minmax(4.5rem,auto)_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
                {group.entries.map((entry) => (
                  <div key={entry.description} className="contents">
                    <dt className="m-0">
                      <KbdGroup>
                        {entry.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </dt>
                    <dd className="m-0 font-medium text-ink-muted">{entry.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
