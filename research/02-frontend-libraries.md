# AI Code-Review Dashboard: Front-End Library Research (September 2026)

*Versions, dates and weekly downloads come from the npm registry on 2026-09-25. Star counts come from GitHub on the same day.*

## 1. Diff viewers

All seven libraries support both split and unified views.

| Library | Latest · ★ · dl/wk · license | Input | Highlighting | Comment rows | Large diffs | Size (min+gz) | Pain points |
|---|---|---|---|---|---|---|---|
| **@pierre/diffs** | 1.5.1 (Sep 25 2026) · 6.2k · 2.7M · Apache-2.0 | A patch (`PatchDiff`, `parsePatchFiles`) or old/new contents (`MultiFileDiff`) | Shiki, run in a worker pool | `lineAnnotations` + `renderAnnotation` render React nodes in light DOM; gutter "+" button (`enableGutterUtility`) | `CodeView` virtualizes the whole changeset | ~182 KB (grammars lazy-loaded) | Internals live in Shadow DOM (theme via CSS variables); API changes quickly; scroll-jump bug #1075; one 60k-line file stalled the main thread 0.4–0.8 s |
| **@git-diff-view/react** | 0.1.7 (Jul 2026) · 741 · 55k · MIT | Per-file diff text plus optional contents, or `generateDiffFile()` | lowlight, Shiki or Lezer | `renderWidgetLine`, `extendData`/`renderExtendLine`: the most GitHub-like model | None (issue #21 open since 2024) | ~330 KB (bundles every highlight.js grammar, #58) | Pre-1.0; expanding context needs full contents |
| **react-diff-view** | 3.3.3 (Mar 2026) · 1k · 196k · MIT | Unified diff | refractor 3.x only | `widgets` keyed by `getChangeKey()` | None; its README reports a 2.2 MB diff taking ~26 s to render | ~23 KB | Few releases; you build context expansion yourself |
| **react-diff-viewer-continued** | 4.4.0 (Jul 2026) · 234 · 597k · MIT | Two strings | `highlightLanguage` | None | `infiniteLoading` | ~51 KB | A text-compare widget, not a review surface |
| **diff2html** | 3.4.56 (Jan 2026) · 3.4k · 358k · MIT | Unified diff, output as an HTML string | highlight.js | None | Only size cut-offs | ~13 KB plus highlight.js | Not React; no context expansion |
| **Monaco DiffEditor** (`@monaco-editor/react`) | wrapper 4.7.0 (Feb 2025) · 4.7k; `monaco-editor` 0.57.0 (Sep 2026) · 46.8k | Two strings | VS Code tokenizers | View zones and overlay widgets (imperative DOM) | Per-editor viewport; `hideUnchangedRegions` | Several MB | The AMD/CDN loading path is deprecated (since 0.53), so you must wire ESM workers; one heavy editor per file |
| **@codemirror/merge** (+ `react-codemirror-merge`) | 6.12.2 (Jun 2026) · 7.8k · 1.2M · MIT | Two strings | Lezer | Build your own block decorations | Viewport rendering; `collapseUnchanged` | ~87 KB plus languages | You build the review UX; repos moved off GitHub in April 2026 |

**Recommendation: `@pierre/diffs`.** It is the only option that:
- accepts both of your input shapes;
- renders added files (`oldFile={null}` or a `new file mode` patch);
- anchors React comment threads to a side and line;
- virtualizes many files;
- uses Shiki, which you can reuse for Markdown.

It ships roughly weekly and already powers T3 Code, OpenCode review plugins and Orca. Orca replaced Monaco with it in September 2026, and its migration notes give these guardrails:
- Pin the exact version. Anything before 1.4 rendered blank under StrictMode.
- Load the worker through Vite's `?worker` import of `@pierre/diffs/worker/worker.js`. A bare `new URL()` worker broke Shiki imports in dev.
- Own the worker-pool singleton yourself if StrictMode remounts kill it.
- Memoize `options` and annotation arrays.
- Put giant single files behind a "render anyway" button.

Expanding context from a patch needs the full file contents (`loadDiffFiles`).

**Fallback:** `@git-diff-view/react` + `@git-diff-view/shiki`, adding your own lazy mounting per file.

## 2. Unified-diff parsing

- **`diff` (jsdiff) 9.0.0** (April 2026) is now the best general parser. Its `parsePatch` handles git extended headers (new/deleted file mode, renames, mode changes, hunkless patches, quoted filenames), and it ships its own types. @pierre/diffs already pins this exact version.
- **`parse-diff` 0.12.0** (April 2026, 1.2M/wk) has the simplest output shape: `from/to`, `new/deleted`, `additions/deletions`, and changes typed `add|del|normal`. It suits a file sidebar.
- **`gitdiff-parser`** (last release 2023) matters only because react-diff-view bundles it. **`parse-git-diff`** 0.0.20 is typed but young. **`unidiff`** generates diffs and cannot parse them.

What each viewer consumes:
- @pierre/diffs: a raw patch or file contents.
- @git-diff-view: raw diff text per file.
- react-diff-view: gitdiff-parser output.
- diff2html: a raw diff or its own JSON.
- react-diff-viewer-continued, Monaco and CodeMirror: two full strings. From a patch you'd need `git show base:path` or jsdiff's `applyPatch`.

Let the viewer parse its own input. Use jsdiff only for your own metadata: the file list, counts, and comment anchors (`path + side + line`).

## 3. Markdown + Mermaid

**Recommended: `streamdown` 2.6.0** (Vercel), a drop-in replacement for react-markdown. It includes:
- GFM, with `rehype-sanitize` and `rehype-harden` on by default;
- `mode="static"` for content that isn't streamed;
- `@streamdown/code` for Shiki highlighting;
- `@streamdown/mermaid`, which adds fullscreen, copy, download and pan-zoom controls, runs with `securityLevel: 'strict'`, and accepts a custom error component.

It requires Tailwind: add `@source "../node_modules/streamdown/dist/*.js";` to your CSS. `@streamdown/code` needs shiki ^3.19, so install shiki 3.23.0 at the top level; @pierre/diffs accepts ^3 || ^4 and will share that copy.

**Fallback:** `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, overriding `components.code` to use `react-shiki` (or `rehype-highlight` 7.0.2) and a small Mermaid component. It is safe by default: raw HTML is dropped unless you add `rehype-raw`, and if you do, add `rehype-sanitize` too. Async rehype plugins need `MarkdownHooks`. `markdown-it` outputs HTML strings, and MDX compiles to executable code; neither suits agent output.

Mermaid gotchas:
- **Version.** mermaid 12.0.0 (September 10) made ELK the default layout and changed the default theme and look, so existing diagrams re-layout and recolor. It also requires ES2024 / Safari 17.4+. `@streamdown/mermaid` still depends on ^11.12.2, so stay on 11.17.2. On 12, `layout:'dagre', theme:'default', look:'classic'` restores the old look.
- **Client-only.** Mermaid needs a real DOM; server-side rendering means `rehype-mermaid` + Playwright. In a Vite single-page app this isn't a problem.
- **Lazy-load it.** Call `await import('mermaid')` and `initialize({startOnLoad:false, securityLevel:'strict'})` once, then `render(id, code)` per block. Discard results that arrive after unmount, and show the source when parsing fails.
- **IDs.** Before React 19.2, `useId()` returned `:r1:`, which is not a valid selector.
- **Vite dev server.** Add `mermaid` to `optimizeDeps.include`. Otherwise its first lazy import triggers "504 Outdated Optimize Dep".
- Avoid `rehype-mermaid` inside `MarkdownHooks`: it misplaces diagrams on re-render (react-markdown #902).

## 4. Sandboxed HTML and Claude artifacts

```tsx
<iframe srcDoc={html} referrerPolicy="no-referrer" loading="lazy"
  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads" />
```

- **Never add `allow-same-origin`.** It makes a srcdoc frame same-origin with your app, and the frame can then remove its own sandbox. Without it the frame gets an opaque `null` origin, so `localStorage` throws. Inject an in-memory storage shim.
- **srcdoc inherits your app's CSP.** A `<meta>` CSP inside the frame can only tighten it. If you ever add an app CSP, move to a frame page on a second origin (another port) and send it the HTML via `postMessage`. That is claude.ai's own design (`*.claudeusercontent.com`).
- **External assets.** CDN scripts, CSS, fonts and images load. Module scripts and `crossorigin` requests send `Origin: null`: fine on CDNs that return `Access-Control-Allow-Origin: *`, broken for root-relative paths.
- **Block data exfiltration.** Inject `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'">` first in `<head>`. This blocks fetch, XHR and WebSockets but still lets CDN scripts load.
- **Resizing.** For auto-height, have the frame post its `scrollHeight`. In the parent, check `event.source === iframe.contentWindow`.

**Claude artifact URLs can't be embedded in your app:**
- **`claude.ai/code/artifact/<id>`.** These are private, org-shared (sign-in required) or public pages, and no embed option is documented. claude.ai blocks framing with `frame-ancestors 'self'` (no `X-Frame-Options`), and the inner artifact frame allows only claude.ai origins. Link out instead.
- **Published claude.ai chat artifacts.** These offer "Get embed code" plus an **Allowed domains** list; unlisted hosts render blank. Whether localhost is accepted isn't documented.
- **Practical path: ingest the source.** Claude Code writes the page to a local .html/.md file before publishing, and saves a copy when it reads a shared artifact. Org admins can also pull versions through the Compliance API. Artifacts are built against a CDN allowlist (cdnjs, jsDelivr, unpkg, the Tailwind and jQuery CDNs, Google Fonts), so most should run unchanged in your sandbox.

## 5. Video with timestamped comments

No maintained player ships comment markers:
- **Vidstack** has no point markers (requested in #1660). It is in minimal maintenance while its team, with Media Chrome and Plyr, builds **Video.js v10**; `@videojs/react` 10.0.0-rc.3 was published today.
- **Media Chrome** draws chapters only from a WebVTT track.
- **react-player** 3.4.0 is now a thin wrapper around native media elements.

**Simplest build:**
1. Use a native `<video>` element; mp4 and webm need no library.
2. Use `media-chrome` 4.19.2 for the controls.
3. Add your own marker buttons, absolutely positioned at `left: t/duration*100%`.
4. "Comment here" pauses and stores `currentTime`; clicking a marker or comment seeks to it; `timeupdate` highlights the active comment.

Note that `npm i @vidstack/react` installs 0.6.15; v1 is on the `next` tag.

## 6. Card stack

**Use `motion` 13.4.4** (`motion/react`):
- Make each card a `motion.div` with `drag="x"`, and use `useTransform` for rotation and opacity.
- In `onDragEnd`, commit when `|offset.x| > 120` or `|velocity.x| > 500`.
- Use an `AnimatePresence` exit to fly the card off.
- Have ←/→ call the same `decide()` via `animate()`, and add visible buttons.

Motion 13's only breaking change is explicit `@emotion/is-prop-valid` injection.

- **`embla-carousel-react` 8.6.0** suits the normal carousel mode. shadcn's Carousel wraps it and already handles arrow keys.
- **`swiper` 14.2.0** gives the stack look instantly with `EffectCards` + `Keyboard`, but a swipe only means previous/next.
- **`react-tinder-card`** hasn't been released since November 2023 and caps React at 18. Avoid it.

## 7. UI kit

shadcn/ui on Tailwind v4 is the default for a fast internal tool. The CLI (`shadcn` 4.21.0) scaffolds Vite + Tailwind 4.3 + React 19 projects. Since July 2026 new projects default to Base UI primitives, while Radix stays fully supported. You own the component code, so restyling the comment widgets is trivial, and Streamdown already assumes Tailwind. Mantine 9.6 is the batteries-included alternative without Tailwind, at the cost of a second styling system.

## Recommendations

| Need | Packages |
|---|---|
| App shell | `vite@8.3.1`, `react@19.3.0`, `react-dom@19.3.0`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `shadcn@4.21.0` |
| Diffs | `@pierre/diffs@1.5.1` (exact pin), `shiki@3.23.0`, `diff@9.0.0` |
| Diff fallback | `@git-diff-view/react@0.1.7`, `@git-diff-view/shiki@0.1.7` |
| Markdown | `streamdown@2.6.0`, `@streamdown/code@1.1.1`, `@streamdown/mermaid@1.0.2` (pulls `mermaid@11.17.2`) |
| Markdown fallback | `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `react-shiki@0.11.1`, `mermaid@11.17.2` |
| Agent HTML | No library; a sandboxed `srcdoc` iframe |
| Video | Native `<video>` + `media-chrome@4.19.2` + custom markers |
| Screenshots | `react-zoom-pan-pinch@4.2.0` |
| Cards | `motion@13.4.4`; `embla-carousel-react@8.6.0` via shadcn Carousel |
| Mixed scroll list | `@tanstack/react-virtual@3.14.13` |

## Sources

- **Diffs:** [diffs.com docs](https://diffs.com/docs), [pierre repo](https://github.com/pierrecomputer/pierre), [On rendering diffs](https://pierre.computer/writing/on-rendering-diffs), [Orca migration PR](https://github.com/stablyai/orca/pull/19008), [pierre #1075](https://github.com/pierrecomputer/pierre/issues/1075), [git-diff-view](https://github.com/MrWangJustToDo/git-diff-view) ([#21](https://github.com/MrWangJustToDo/git-diff-view/issues/21), [#58](https://github.com/MrWangJustToDo/git-diff-view/issues/58)), [react-diff-view](https://github.com/otakustay/react-diff-view), [react-diff-viewer-continued](https://github.com/Aeolun/react-diff-viewer-continued), [diff2html](https://github.com/rtfpessoa/diff2html), [monaco-react](https://github.com/suren-atoyan/monaco-react), [Monaco diff options](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IDiffEditorOptions.html), [Monaco changelog](https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md), [@codemirror/merge](https://github.com/codemirror/merge), [CodeMirror decorations](https://codemirror.net/examples/decoration/), [bundlephobia](https://bundlephobia.com)
- **Parsing:** [jsdiff release notes](https://github.com/kpdecker/jsdiff/blob/master/release-notes.md), [parse-diff](https://github.com/sergeyt/parse-diff), [gitdiff-parser](https://github.com/ecomfe/gitdiff-parser), [unidiff](https://github.com/mvoss9000/unidiff), [parse-git-diff](https://github.com/yeonjuan/parse-git-diff)
- **Markdown:** [Streamdown config](https://streamdown.ai/docs/configuration), [Streamdown Mermaid](https://streamdown.ai/docs/mermaid), [streamdown repo](https://github.com/vercel/streamdown), [react-markdown](https://github.com/remarkjs/react-markdown), [react-markdown #902](https://github.com/remarkjs/react-markdown/issues/902), [Mermaid 12 notes](https://newreleases.io/project/github/mermaid-js/mermaid/release/mermaid@12.0.0), [rehype-mermaid](https://github.com/remcohaszing/rehype-mermaid), [React 19.2](https://react.dev/blog/2025/10/01/react-19-2)
- **HTML/artifacts:** [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [srcdoc CSP inheritance](https://github.com/ahmadrosid/nakama/issues/1220), [null-origin CORS](https://github.com/maqsoodjamvi1/lifemarkai/issues/9), [Claude Code artifacts](https://code.claude.com/docs/en/artifacts), [Pluto Security analysis](https://pluto.security/blog/inside-claude-artifacts-how-your-agent-publishes-to-the-web/), [claude.ai frame-ancestors](https://github.com/workadventure/workadventure/pull/6572), [Publish/embed help](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)
- **Video:** [Video.js v10 beta](https://videojs.org/blog/videojs-v10-beta-hello-world-again), [Vidstack status](https://github.com/vidstack/player/discussions/1755), [Vidstack #1660](https://github.com/vidstack/player/issues/1660), [media-time-range](https://www.media-chrome.org/docs/en/components/media-time-range), [react-player](https://github.com/cookpete/react-player)
- **Cards/UI:** [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide), [shadcn carousel](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/carousel.tsx), [Embla v9](https://github.com/davidjerleke/embla-carousel/discussions/1271), [react-tinder-card](https://github.com/3DJakob/react-tinder-card), [shadcn changelog](https://ui.shadcn.com/docs/changelog), [Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [npm registry](https://registry.npmjs.org)
