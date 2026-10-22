import { useSearchParams } from "react-router";
import { MODE_PARAM, parseMode } from "@/lib/mode";

/** True when `?mode=grid` is set: the test-run pages have two modes, swipe (the default; `scroll` reads as swipe) and grid. */
export function useRunGrid(): boolean {
  const [params] = useSearchParams();
  return parseMode(params.get(MODE_PARAM)) === "grid";
}
