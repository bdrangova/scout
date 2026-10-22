import { Archive, Check, ChevronLeft, ExternalLink, GitPullRequest, Keyboard, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Kbd } from '@/components/ui/kbd'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { THEME_SETTINGS } from '@/theme/theme'
import { useTheme } from '@/theme/useTheme'
import { HeaderIconButton } from './AppHeader'
import { safePrUrl } from './pr-url'
import { useShellConfig } from './shell-config'
import { useArchiveSession } from './useArchiveSession'

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const

interface BarMenuProps {
  /** Opens the keyboard shortcut help. */
  onHelp: () => void
}

/**
 * The bar's overflow menu: Archive (a toast offers Undo), and below 1024px the Shortcuts and
 * Theme controls that no longer fit in the bar.
 */
export function BarMenu({ onHelp }: BarMenuProps) {
  const { detail } = useSessionContext()
  const { theme, setTheme } = useTheme()
  const config = useShellConfig()
  const { archiving, archive } = useArchiveSession(detail.manifest.id, config.kind === 'test-run' ? '/t' : '/')
  const pr = isTestRunDetail(detail) ? null : (detail.pr ?? null)
  const prHref = pr ? safePrUrl(pr.url) : null
  return (
    <Menu>
      <MenuTrigger render={<HeaderIconButton aria-label="More actions" title="More actions" />}>
        <MoreHorizontal aria-hidden />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem className="min-[521px]:hidden" render={<Link to={config.kind === 'test-run' ? '/t' : '/'} />}>
          <ChevronLeft aria-hidden />
          {config.kind === 'test-run' ? 'Test runs' : 'Sessions'}
        </MenuItem>
        {pr && prHref && (
          <MenuItem className="min-[521px]:hidden" render={<a href={prHref} target="_blank" rel="noopener noreferrer" />}>
            <GitPullRequest aria-hidden />
            PR #{pr.number} on GitHub
            <ExternalLink aria-hidden className="ml-auto" />
          </MenuItem>
        )}
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
        <MenuItem disabled={archiving} onClick={() => void archive()}>
          <Archive aria-hidden />
          {config.kind === 'test-run' ? 'Archive test run' : 'Archive session'}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
