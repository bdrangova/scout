import { useAsync, type AsyncState } from "@/lib/hooks";
import { runFileUrl, runLogUrl } from "@/lib/paths";

/** What `GET /sessions/:id/run/log/<ref>?from&to` answers: the slice's lines and the file's line count. */
export interface LogSlice {
  path: string;
  from: number;
  to: number;
  total: number;
  lines: string[];
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`${res.status} ${res.statusText || "request failed"}`);
  return res;
}

/** The text of a run file (`alias:path`), e.g. a data JSON. */
export function useRunText(sessionId: string, ref: string): AsyncState<string> {
  const url = runFileUrl(sessionId, ref);
  return useAsync(`run-text:${url}`, async () => (await fetchOk(url)).text());
}

/** Lines `from..to` of a run log. */
export function useLogSlice(
  sessionId: string,
  ref: string,
  from: number,
  to: number,
): AsyncState<LogSlice> {
  const url = runLogUrl(sessionId, ref, from, to);
  return useAsync(
    `run-log:${url}`,
    async () => (await fetchOk(url)).json() as Promise<LogSlice>,
  );
}
