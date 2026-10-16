import { SECTIONS, type Mode } from '@review-dash/shared'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { MODE_PARAM, modeSearch, parseMode, toggledCardMode, toggledGridMode } from '@/lib/mode'
import { sessionRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { useHotkeys } from '@/lib/useHotkeys'

/**
 * Session-wide shortcuts: `S` toggles swipe/scroll, `G` toggles the grid and the mode it was
 * opened from, `1–5` jump to the sections, `?` toggles the help.
 */
export function SessionHotkeys({ onToggleHelp }: { onToggleHelp: () => void }) {
  const { sessionId } = useSessionContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const base = `/s/${encodeURIComponent(sessionId)}`
  const filesBase = sessionRoute(sessionId)

  const section = (index: number) => () => {
    const name = SECTIONS[index]
    if (name) navigate(`${base}/${name}`)
  }

  function switchMode(pick: (current: Mode) => Mode) {
    const next = pick(parseMode(searchParams.get(MODE_PARAM)))
    const pathname = location.pathname.startsWith(filesBase) ? location.pathname : filesBase
    navigate({ pathname, search: modeSearch(searchParams, next) }, { replace: true })
  }

  useHotkeys({
    toggleMode: () => switchMode(toggledCardMode),
    toggleGrid: () => switchMode(toggledGridMode),
    section1: section(0),
    section2: section(1),
    section3: section(2),
    section4: section(3),
    section5: section(4),
    help: onToggleHelp,
  })

  return null
}
