/* Shared state, helpers and the diff drawer for the review explorations. */
(function () {
  const D = window.SCOUT_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

  const SLICES = {
    shell: { n: 1, name: "Shell header area", short: "Shell", see: "Nothing visible yet. The shell gains a header area that pages can fill, and editors opened in side panels get their own frame.", c: "var(--c-shell)" },
    topbar: { n: 2, name: "Top bar + breadcrumbs", short: "Top bar", ticket: "QI-14448", see: "The old company header and nav bar are replaced by the top bar: sidebar opener, breadcrumb, project tabs, search.", c: "var(--c-topbar)" },
    title: { n: 3, name: "Title bars", short: "Title bars", ticket: "QI-14449", see: "Every page's own title bar is replaced by one shared title bar, with status badge, back link and page buttons.", c: "var(--c-title)" },
    polish: { n: 4, name: "Per-page polish", short: "Polish", see: "Breadcrumb names and parents on special pages, sideways-scrolling tabs in narrow windows, the Equipment Fit header.", c: "var(--c-polish)" },
  };
  // w = how much attention the group needs: 3 read closely, 2 skim each, 1 one sample is enough, 0 glance
  const PATS = {
    new: { name: "Brand-new files", d: "Did not exist before. Nothing to compare against, so read them properly.", w: 3 },
    "one-off": { name: "One-of-a-kind edits", d: "Each of these is different. No shortcut.", w: 3 },
    "record-title": { name: "Record pages describe their title bar", d: "Each record page now says what its title bar should show, instead of drawing one itself.", w: 1 },
    "simple-title": { name: "Simple pages get a plain title", d: "The same small change: a title and an optional subtitle handed to the shared title bar.", w: 1 },
    "shell-props": { name: "Pages pass settings to the shell", d: "The same shape of edit in every page.", w: 1 },
    "drop-own-title": { name: "Pages drop their own title bar", d: "The page's old title bar code is removed.", w: 1 },
    "drop-header-flags": { name: "Old header switches removed", d: "Switches for the old header, cookies bar and trial bar are deleted.", w: 1 },
    "test-helpers": { name: "Tests read the bars through shared helpers", d: "The same two helpers swapped in, file after file.", w: 1 },
    "test-other": { name: "Other test updates", d: "Test changes that don't follow the helper pattern.", w: 2 },
    scenarios: { name: "Scenario wording", d: "Feature files with step text updated.", w: 1 },
    styles: { name: "Styling", d: "Stylesheet changes.", w: 2 },
    moved: { name: "Moved or renamed", d: "Mostly the same content at a new path.", w: 1 },
    deleted: { name: "Deleted outright", d: "Old header and title bar pieces, gone.", w: 0 },
  };
  const ATT = { 3: { name: "Read closely", c: "var(--coral)" }, 2: { name: "Skim each", c: "var(--yellow)" }, 1: { name: "One sample is enough", c: "var(--blue)" }, 0: { name: "Glance", c: "var(--sunken)" } };

  const files = D.files;
  const byPath = new Map(files.map((f) => [f.path, f]));
  files.forEach((f) => { f.lines = f.add + f.dele; f.name = f.path.split("/").pop(); f.dir = f.path.slice(0, -f.name.length); f.uses = []; f.users = []; });
  D.edges.forEach(([a, b]) => { const A = byPath.get(a), B = byPath.get(b); if (A && B) { A.uses.push(B); B.users.push(A); } });

  /* review marks */
  const KEY = "scout-review-explore";
  const seed = () => new Set(files.filter((f) => f.verdict === "approved").map((f) => f.path));
  let done = seed();
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) done = new Set(s); } catch (e) {}
  const listeners = [];
  const isDone = (p) => done.has(p.path || p);
  function mark(list, on = true) {
    (Array.isArray(list) ? list : [list]).forEach((f) => (on ? done.add(f.path || f) : done.delete(f.path || f)));
    try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch (e) {}
    paintProgress(); listeners.forEach((fn) => fn());
  }
  function paintProgress() {
    const n = files.filter(isDone).length;
    $("#progFill").style.width = (100 * n) / files.length + "%";
    $("#progFill").classList.toggle("done", n === files.length);
    $("#progTxt").textContent = n + " / " + files.length;
  }

  /* small render helpers */
  const bars = (f, w = 44) => { const t = Math.max(1, f.add + f.dele), k = Math.min(1, Math.log10(t + 1) / 2.6) * w; return `<span class="bars" style="width:${Math.max(8, k).toFixed(0)}px"><i class="ga" style="width:${(100 * f.add) / t}%"></i><i class="gd" style="width:${(100 * f.dele) / t}%"></i></span>`; };
  const counts = (f) => `<span class="mono add">+${f.add}</span> <span class="mono del">−${f.dele}</span>`;
  const sliceTag = (f) => `<span class="tag"><span class="dot" style="background:${SLICES[f.slice].c}"></span>${SLICES[f.slice].short}</span>`;
  const sum = (list, k) => list.reduce((s, f) => s + f[k], 0);

  /* tooltip */
  const tip = $("#tip");
  function showTip(html, ev) { tip.innerHTML = html; tip.classList.add("on"); moveTip(ev); }
  function moveTip(ev) { const r = tip.getBoundingClientRect(); let x = ev.clientX + 14, y = ev.clientY + 16; if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 12; if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 12; tip.style.left = x + "px"; tip.style.top = y + "px"; }
  const hideTip = () => tip.classList.remove("on");
  const KIND = { decision: "Decision", caveat: "Caveat", tradeoff: "Trade-off", implementation: "How it works", summary: "Summary" };
  const noteHtml = (n, where) => `<div class="jn k-${n.kind}"><div class="jn-h"><span class="jn-k">✎ Scout's note · ${KIND[n.kind] || n.kind}</span>${where ? `<span class="muted">${esc(where)}</span>` : ""}</div><b>${esc(n.title)}</b><p>${esc(n.body)}</p>${(n.alts || []).map((a) => `<p class="alt"><span>Considered:</span> ${esc(a.option)}<br><span>Why not:</span> ${esc(a.whyNot)}</p>`).join("")}</div>`;
  const fileTip = (f) => `<b>${esc(f.path)}</b><br>${f.sum ? `<i>${esc(f.sum.title)}</i><br>` : ""}${f.notes.length ? `✎ ${f.notes.length} decision note${f.notes.length > 1 ? "s" : ""}<br>` : ""}${SLICES[f.slice].name} · ${PATS[f.pat].name}<br><span class="add">+${f.add}</span> <span class="del">−${f.dele}</span>${f.users.length ? " · " + f.users.length + " changed files lean on it" : ""}${isDone(f) ? " · reviewed" : ""}`;

  /* diff drawer */
  let ctx = [], pos = 0, cur = null;
  const ST = { A: "New file", D: "Deleted", R: "Renamed", M: "Changed" };
  function parse(diff) {
    const rows = []; let o = 0, n = 0;
    for (const l of diff.split("\n")) {
      if (l.startsWith("@@")) { const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(l); o = +m[1]; n = +m[2]; rows.push({ t: "h", s: l }); }
      else if (l[0] === "+") rows.push({ t: "a", n: n++, s: l.slice(1) });
      else if (l[0] === "-") rows.push({ t: "d", o: o++, s: l.slice(1) });
      else if (l[0] === "\\") continue;
      else rows.push({ t: "c", o: o++, n: n++, s: l.slice(1) });
    }
    return rows;
  }
  const rowHtml = (r) => r.t === "h" ? `<div class="hunk">${esc(r.s)}</div>` : `<div class="dl ${r.t}" data-n="${r.n ?? ""}" data-o="${r.o ?? ""}"><span class="ln">${r.o ?? ""}</span><span class="ln">${r.n ?? ""}</span><span class="sg">${r.t === "a" ? "+" : r.t === "d" ? "−" : ""}</span><span class="cd">${esc(r.s) || " "}</span></div>`;
  function diffHtml(f, limit = 500) {
    const rows = parse(f.diff);
    if (!rows.length) return `<div style="padding:24px" class="muted">No line changes (moved or binary).</div>`;
    const at = new Map(), loose = [];
    f.notes.forEach((n) => { const i = rows.findIndex((r) => (n.side === "old" ? r.o : r.n) === n.line && r.t !== "h"); i >= 0 && i < limit ? at.set(i, (at.get(i) || "") + noteHtml(n)) : loose.push(n); });
    return loose.map((n) => noteHtml(n, n.line ? "line " + n.line + ", outside the changed lines" : "whole file")).join("") + rows.slice(0, limit).map((r, i) => rowHtml(r) + (at.get(i) || "")).join("") + (rows.length > limit ? `<button class="btn sm more" data-more>Show ${rows.length - limit} more lines</button>` : "");
  }
  function open(file, list, at) {
    cur = typeof file === "string" ? byPath.get(file) : file;
    ctx = list && list.length ? list : [cur]; pos = Math.max(0, ctx.indexOf(cur));
    paintDrawer(); $("#drawer").classList.add("on"); $("#scrim").classList.add("on");
    if (at) { const q = `.dl[data-${at.side === "old" ? "o" : "n"}="${at.line}"]`; let row = $("#dBody").querySelector(q); if (!row) { $("#dBody").innerHTML = diffHtml(cur, 1e9); row = $("#dBody").querySelector(q); }
      if (row) { row.scrollIntoView({ block: "center" }); row.classList.add("flash"); } }
  }
  function paintDrawer() {
    const f = cur, p = PATS[f.pat];
    $("#dPath").innerHTML = `<em>${esc(f.dir)}</em>${esc(f.name)}`;
    $("#dMeta").innerHTML = `${sliceTag(f)}<span class="tag">${ST[f.st]}</span><span class="tag">${p.name}</span><span class="tag"><span class="dot" style="background:${ATT[p.w].c}"></span>${ATT[p.w].name}</span>${counts(f)}${f.users.length ? `<span class="tag">${f.users.length} files lean on this</span>` : ""}${f.notes.length ? `<span class="tag jtag">✎ ${f.notes.length} decision note${f.notes.length > 1 ? "s" : ""}</span>` : ""}`;
    $("#dWhy").innerHTML = (f.sum ? `<div class="jsum"><span class="jn-k">✎ Scout's note</span><b>${esc(f.sum.title)}</b><p>${esc(f.sum.body)}</p></div>` : "") + `<span class="muted">${esc((f.old ? "Was " + f.old + ". " : "") + p.d)}</span>`;
    $("#dBody").innerHTML = diffHtml(f); $("#dBody").scrollTop = 0;
    $("#dPos").textContent = ctx.length > 1 ? pos + 1 + " of " + ctx.length + " in this group" : "";
    $("#dPrev").disabled = pos === 0; $("#dNext").disabled = pos >= ctx.length - 1;
    const d = isDone(f); $("#dStamp").classList.toggle("on", d);
    $("#dOk").innerHTML = d ? "Undo reviewed" : 'Mark reviewed <span class="kbd" style="color:var(--ink)">A</span>';
    $("#dOk").className = "btn " + (d ? "" : "approve");
  }
  const step = (d) => { const i = pos + d; if (i < 0 || i >= ctx.length) return false; pos = i; cur = ctx[i]; paintDrawer(); return true; };
  function close() { $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on"); cur = null; }
  function toggleOk() { if (!cur) return; const was = isDone(cur); mark(cur, !was); paintDrawer(); if (!was) setTimeout(() => { if (cur && !step(1)) close(); }, 420); }

  /* views */
  const views = [];
  let active = null;
  function register(v) { views.push(v); }
  function show(id) {
    active = views.find((v) => v.id === id) || views[0];
    views.forEach((v) => v.el.classList.toggle("on", v === active));
    [...$("#tabs").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === active.id));
    try { localStorage.setItem(KEY + "-view", active.id); } catch (e) {}
    active.show && active.show();
  }
  function start() {
    $("#sessTitle").textContent = D.title; $("#sessBranch").textContent = D.branch + " · " + files.length + " files · +" + sum(files, "add") + " −" + sum(files, "dele");
    views.forEach((v) => {
      v.el = h(`<section class="view" id="v-${v.id}"></section>`); $("#stage").appendChild(v.el);
      const b = h(`<button data-id="${v.id}" title="${esc(v.hint)}">${v.icon} ${v.label}</button>`); b.onclick = () => show(v.id); $("#tabs").appendChild(b);
      v.init(v.el);
    });
    listeners.push(() => active && active.refresh && active.refresh());
    $("#dClose").onclick = close; $("#scrim").onclick = close; $("#dPrev").onclick = () => step(-1); $("#dNext").onclick = () => step(1); $("#dOk").onclick = toggleOk;
    $("#dBody").addEventListener("click", (e) => { if (e.target.dataset.more !== undefined) $("#dBody").innerHTML = diffHtml(cur, 1e9); });
    $("#theme").onclick = () => { const d = document.documentElement.classList.toggle("dark"); try { localStorage.setItem(KEY + "-dark", d ? 1 : 0); } catch (e) {} active.refresh && active.refresh(); };
    $("#reset").onclick = () => { done = seed(); mark([]); };
    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (cur) { if (e.key === "Escape") close(); else if (e.key === "j") step(1); else if (e.key === "k") step(-1); else if (e.key === "a") toggleOk(); return; }
      active.key && active.key(e);
    });
    let dark = false, v = null;
    try { dark = localStorage.getItem(KEY + "-dark") === "1"; v = localStorage.getItem(KEY + "-view"); } catch (e) {}
    const q = new URLSearchParams(location.search); if (q.get("view")) v = q.get("view"); if (q.get("dark")) dark = q.get("dark") === "1";
    document.documentElement.classList.toggle("dark", dark);
    paintProgress(); show(v);
  }

  window.Scout = { D, files, byPath, SLICES, PATS, ATT, $, h, esc, bars, counts, sliceTag, sum, isDone, mark, open, register, start, showTip, moveTip, hideTip, fileTip, parse, rowHtml, noteHtml, diffHtml };
})();
