import type { PrReviewStatus } from '@scout/shared'
import { Archive, Check, CircleCheck, BookOpen, ChevronLeft, ExternalLink, GitPullRequest, Keyboard, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Kbd } from '@/components/ui/kbd'
import { DeleteSessionDialog } from '@/components/sessions/DeleteSessionDialog'
import { isTestRunDetail } from '@/lib/detail-kind'
import { sessionListRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { THEME_SETTINGS } from '@/theme/theme'
import { useTheme } from '@/theme/useTheme'
import { HeaderIconButton } from './AppHeader'
import { safePrUrl } from './pr-url'
import { useShellConfig } from './shell-config'
import { useArchiveSession } from './useArchiveSession'
import { PrReviewStatusItems } from '@/components/pr/PrReviewStatusMenu'
import { useSetPrReviewStatus } from '@/hooks/useSetPrReviewStatus'

/** The PR review's status items; Approved closes the review and goes back to the list. */
function PrStatusItems({ id, current, listPath }: { id: string; current: PrReviewStatus; listPath: string }) {
  const navigate = useNavigate()
  const { busy, set } = useSetPrReviewStatus(id, () => void navigate(listPath))
  return (
    <>
      <PrReviewStatusItems current={current} busy={busy} onSet={(status) => void set(status)} />
      <MenuSeparator />
    </>
  )
}

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const

interface BarMenuProps {
  /** Opens the keyboard shortcut help. */
  onHelp: () => void
  /** Opens the skills help. */
  onSkills: () => void
}

/**
 * The bar's overflow menu: Mark as done (Development), the review status (PR reviews; Approved closes it), Archive (a toast offers Undo) and
 * Delete (for good, after a confirmation, then back to the list), and below 1024px the Shortcuts and
 * Theme controls that no longer fit in the bar.
 */
export function BarMenu({ onHelp, onSkills }: BarMenuProps) {
  const { detail } = useSessionContext()
  const { theme, setTheme } = useTheme()
  const config = useShellConfig()
  const { archiving, archive } = useArchiveSession(detail.manifest.id, sessionListRoute(config.kind))
  const pr = isTestRunDetail(detail) ? null : (detail.pr ?? null)
  const prHref = pr ? safePrUrl(pr.url) : null
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const noun = config.kind === 'test-run' ? 'test run' : 'session'
  return (
    <>
      <Menu>
        <MenuTrigger render={<HeaderIconButton aria-label="More actions" title="More actions" />}>
          <MoreHorizontal aria-hidden />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem className="min-[521px]:hidden" render={<Link to={sessionListRoute(config.kind)} />}>
            <ChevronLeft aria-hidden />
            {config.kind === 'test-run' ? 'Test runs' : config.kind === 'pr-review' ? 'PR reviews' : 'Sessions'}
          </MenuItem>
          {pr && prHref && (
            <MenuItem className="min-[521px]:hidden" render={<a href={prHref} target="_blank" rel="noopener noreferrer" />}>
              <GitPullRequest aria-hidden />
              PR #{pr.number} on GitHub
              <ExternalLink aria-hidden className="ml-auto" />
            </MenuItem>
          )}
          <MenuItem className="lg:hidden" onClick={onSkills}>
            <BookOpen aria-hidden />
            Skills
          </MenuItem>
          <MenuItem className="lg:hidden" onClick={onHelp}>
            <Keyboard aria-hidden />
            Keyboard shortcuts
            <Kbd className="ml-auto">?</Kbd>
          </MenuItem>
          <MenuGroup className="flex flex-col gap-0.5 lg:hidden">
            <MenuLabel>Theme</MenuLabel>
            {THEME_SETTINGS.map((setting) => (
              <MenuItem key={setting} onClick={() => setTheme(setting)}>
                {THEME_LABEL[setting]}
                {theme === setting && <Check aria-label="Current theme" className="ml-auto" />}
              </MenuItem>
            ))}
          </MenuGroup>
          <MenuSeparator className="lg:hidden" />
          {config.kind === 'code-review' && (
            <MenuItem disabled={archiving} onClick={() => void archive(true)}>
              <CircleCheck aria-hidden />
              Mark as done
            </MenuItem>
          )}
          {config.kind === 'pr-review' && <PrStatusItems id={detail.manifest.id} current={isTestRunDetail(detail) ? 'in-progress' : (detail.prStatus ?? 'in-progress')} listPath={sessionListRoute(config.kind)} />}
          <MenuItem disabled={archiving} onClick={() => void archive()}>
            <Archive aria-hidden />
            {config.kind === 'test-run' ? 'Archive test run' : 'Archive session'}
          </MenuItem>
          <MenuItem disabled={archiving} onClick={() => setDeleting(true)} className="text-red">
            <Trash2 aria-hidden />
            {`Delete ${noun}…`}
          </MenuItem>
        </MenuContent>
      </Menu>
      <DeleteSessionDialog id={detail.manifest.id} title={detail.manifest.title} open={deleting} onOpenChange={setDeleting} onDeleted={() => void navigate(sessionListRoute(config.kind))} />
    </>
  )
}
