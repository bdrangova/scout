import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { THEME_SETTINGS, type ThemeSetting } from './theme'
import { useTheme } from './useTheme'

const LABEL: Record<ThemeSetting, string> = { light: 'Light', dark: 'Dark', system: 'System' }
const ICON: Record<ThemeSetting, typeof SunIcon> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon }

interface ThemeToggleProps {
  className?: string
}

/** Light / dark / system chooser; icon-only, each item carries its label for screen readers and tooltips. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  return (
    <Segmented aria-label="Colour theme" className={className} data-slot="theme-toggle">
      {THEME_SETTINGS.map((setting) => {
        const Icon = ICON[setting]
        return (
          <SegmentedItem
            key={setting}
            pressed={theme === setting}
            onClick={() => setTheme(setting)}
            aria-label={LABEL[setting]}
            title={LABEL[setting]}
          >
            <Icon aria-hidden />
          </SegmentedItem>
        )
      })}
    </Segmented>
  )
}
