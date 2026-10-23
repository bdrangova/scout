import { type Mode } from "@review-dash/shared";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  MODE_PARAM,
  modeSearch,
  parseMode,
  toggledCardMode,
  toggledGridMode,
} from "@/lib/mode";
import { sessionFilesRoute } from "@/lib/paths";
import { useSessionContext } from "@/lib/session-context";
import { useHotkeys, type HotkeyHandlers } from "@/lib/useHotkeys";
import { useShellConfig, visibleSectionsOf } from "./shell-config";
import { useSidebar } from "./sidebar-context";

/**
 * Session-wide shortcuts: `B` hides and shows the rail, `1-n` jump to the kind's visible sections
 * (the tabs, in order), `?` toggles the help; `S` (swipe, or swipe/scroll in a code review) and `G` (grid) on the pages with
 * cards. The Review page of a test run binds its own card keys, like the Files page.
 */
export function SessionHotkeys({ onToggleHelp }: { onToggleHelp: () => void }) {
  const { sessionId, detail } = useSessionContext();
  const config = useShellConfig();
  const { toggle: toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const base = `${config.basePath}/${encodeURIComponent(sessionId)}`;
  const filesBase = sessionFilesRoute(sessionId);
  const sections = visibleSectionsOf(config, detail);

  const section = (index: number) => () => {
    const name = sections[index];
    if (name) navigate(`${base}/${name}`);
  };

  const testRun = config.kind === "test-run";
  // A test run's pages with cards: the mode is the page's own `?mode=`.
  const onCardPage = new RegExp(`^${base}/(review|gaps|logs|data-setup)(/|$)`).test(location.pathname);

  function switchMode(pick: (current: Mode) => Mode) {
    if (testRun && !onCardPage) return;
    const next = pick(parseMode(searchParams.get(MODE_PARAM)));
    const pathname = testRun || location.pathname.startsWith(filesBase)
      ? location.pathname
      : filesBase;
    navigate(
      { pathname, search: modeSearch(searchParams, next) },
      { replace: true },
    );
  }

  const handlers: HotkeyHandlers = {
    toggleSidebar,
    section1: section(0),
    section2: section(1),
    section3: section(2),
    section4: section(3),
    section5: section(4),
    section6: section(5),
    altHelp: onToggleHelp,
  };
  if (config.hotkeys.modes) {
    // A test run has no scroll mode: `S` is swipe.
    handlers.toggleMode = () => switchMode(testRun ? () => "swipe" : toggledCardMode);
    // Back from the grid returns to the remembered card mode (a test run has no scroll mode).
    handlers.toggleGrid = () => switchMode(testRun ? (current) => (toggledGridMode(current) === "grid" ? "grid" : "swipe") : toggledGridMode);
  }
  useHotkeys(handlers);
  return null;
}
