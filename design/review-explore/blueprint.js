/* Prototype: Blueprint. A UML-style diagram you walk through: packages, then classes with their changed members, then code. */
(function () {
  const S = window.Scout, { files, byPath, SLICES, $, h, esc } = S;
  const BW = 264, PW = 236, GX = 30, GY = 62;
  let el, wrap, canvas, svg, root, path = [], around = null, details = true, cur = { items: [], order: [] };

  /* file-level relations */
  const extOf = new Map(); // file -> Set of files it extends
  S.D.ext.forEach(([a, b]) => { const A = byPath.get(a), B = byPath.get(b); if (A && B) (extOf.get(A) || extOf.set(A, new Set()).get(A)).add(B); });
  const isExt = (a, b) => extOf.has(a) && extOf.get(a).has(b);
  files.forEach((f) => { f.kids_ = files.filter((x) => isExt(x, f)); });

  /* package tree: structural groups, then folders */
  const GROUPS = ["Shell", "UI library", "Base pages and editor", "Pages and features", "Old widgets", "Styles", "Unit and component tests", "Cucumber tests", "Playwright tests", "Config and scripts"];
  const GNOTE = { "Shell": "The frame every page sits in: sidebar, top bar, title bar.", "UI library": "Shared building blocks.", "Base pages and editor": "What every page and record editor inherits from.", "Pages and features": "The individual screens.", "Old widgets": "Old header and title bar pieces, mostly deleted.", "Styles": "Stylesheets.", "Unit and component tests": "Tests that sit next to the code.", "Cucumber tests": "End-to-end scenarios and their steps.", "Playwright tests": "End-to-end page objects and specs.", "Config and scripts": "Build and tooling." };
  const leaves = (n, out = []) => { if (n.file) out.push(n.file); else n.kids.forEach((k) => leaves(k, out)); return out; };
  function build() {
    root = { name: "Whole change", key: "", kids: [] };
    GROUPS.forEach((g) => {
      const fs = files.filter((f) => f.group === g); if (!fs.length) return;
      const gn = { name: g, key: g, kids: [], note: GNOTE[g] };
      let pre = fs[0].dir.split("/"); fs.forEach((f) => { const d = f.dir.split("/"); let i = 0; while (i < pre.length && pre[i] === d[i]) i++; pre = pre.slice(0, i); });
      fs.forEach((f) => { let n = gn; f.dir.split("/").slice(pre.length).filter(Boolean).forEach((p) => { let k = n.kids.find((x) => !x.file && x.name === p); if (!k) { k = { name: p, key: n.key + "/" + p, kids: [] }; n.kids.push(k); } n = k; }); n.kids.push({ file: f, key: f.path }); });
      const tidy = (n) => { n.kids.forEach((k) => !k.file && tidy(k));
        n.kids = n.kids.flatMap((k) => { if (k.file) return [k]; const ls = leaves(k); return ls.length <= 2 ? ls.map((f) => ({ file: f, key: f.path })) : [k]; });
        while (n.kids.length === 1 && !n.kids[0].file) { const k = n.kids[0]; if (n !== gn) n.name += "/" + k.name; n.kids = k.kids; }
        if (leaves(n).length <= 14) n.kids = leaves(n).map((f) => ({ file: f, key: f.path })); };
      tidy(gn); root.kids.push(gn);
    });
  }
  const nodeAt = () => path.reduce((n, k) => n.kids.find((x) => x.key === k) || n, root);

  /* what to draw: items (packages or classes) + relations between them */
  function model() {
    let items, forced = null;
    if (around) {
      const up = [...new Set(around.uses)], down = [...new Set(around.users)].sort((a, b) => isExt(b, around) - isExt(a, around) || b.lines - a.lines);
      items = [...up, around, ...down].map((f) => ({ file: f, key: f.path })); forced = (it) => (it.file === around ? 1 : up.includes(it.file) ? 0 : 2);
    } else items = nodeAt().kids.map((k) => ({ ...k }));
    const owner = new Map(); items.forEach((it) => { it.files = it.file ? [it.file] : leaves(it); it.files.forEach((f) => owner.set(f, it)); it.out = new Map(); it.in = new Map(); it.extIn = 0; it.extOut = 0; it.kidsOut = 0; });
    const rels = new Map();
    files.forEach((a) => a.uses.forEach((b) => { const ia = owner.get(a), ib = owner.get(b);
      if (ia && ib && ia !== ib) { if (around && a !== around && b !== around) return; const k = ia.key + ">" + ib.key; const r = rels.get(k) || rels.set(k, { a: ia, b: ib, n: 0, ext: 0 }).get(k); r.n++; if (isExt(a, b)) r.ext++; ia.out.set(ib, r); ib.in.set(ia, r); }
      else if (ia && !ib) ia.extOut++; else if (ib && !ia) { ib.extIn++; if (isExt(a, b)) ib.kidsOut++; } }));
    const L = new Map(), vis = new Set();
    const lay = (i) => { if (L.has(i)) return L.get(i); if (vis.has(i)) return 0; vis.add(i); let l = 0; i.out.forEach((_, j) => (l = Math.max(l, lay(j) + 1))); vis.delete(i); L.set(i, l); return l; };
    items.forEach((it) => { it.layer = forced ? forced(it) : it.out.size || it.in.size ? lay(it) : -1; });
    return { items, rels: [...rels.values()] };
  }

  const pct = (fs) => { const d = fs.filter(S.isDone).length; return { d, n: fs.length }; };
  function boxHtml(it) {
    if (!it.file) { const fs = it.files, p = pct(fs), names = [...fs].sort((a, b) => b.lines - a.lines).slice(0, 3).map((f) => esc(f.name)).join(", ");
      return `<div class="um-box pkg ${p.d === p.n ? "done" : ""}" data-key="${esc(it.key)}"><span class="um-tab">package</span><button class="um-open" data-drill="${esc(it.key)}"><b>${esc(it.name)}</b></button>
        ${it.note ? `<p class="um-note">${it.note}</p>` : ""}<p class="um-mini mono">${names}${fs.length > 3 ? ` +${fs.length - 3} more` : ""}</p>
        <div class="um-ft"><span>${fs.length} files</span>${S.counts({ add: S.sum(fs, "add"), dele: S.sum(fs, "dele") })}<span class="sp"></span><span class="mono">${p.d}/${p.n}</span></div><div class="um-track"><i style="width:${(100 * p.d) / p.n}%"></i></div>${ports(it)}</div>`; }
    const f = it.file, st = { A: "new", D: "deleted", R: "moved", M: "" }[f.st], par = extOf.has(f) ? [...extOf.get(f)][0] : null;
    return `<div class="um-box cls ${S.isDone(f) ? "done" : ""} ${f.st === "D" ? "del" : ""} ${f === around ? "center" : ""}" data-key="${esc(it.key)}">
      <button class="um-hd" style="background:${SLICES[f.slice].c}" data-open="${esc(f.path)}" title="Open the code"><span class="um-st">«${f.stereo}»${st ? " · " + st : ""}</span><b>${esc(f.name)}</b>${S.isDone(f) ? '<span class="check">✓</span>' : `<span class="um-n">${it.ord}</span>`}</button>
      ${f.sum ? `<p class="um-sum">${f.notes.length ? "✎ " : ""}${esc(f.sum.title)}</p>` : ""}
      ${f.members.length ? `<div class="um-mem">${f.members.map((m) => `<button class="m${m.t === "+" ? "a" : m.t === "-" ? "d" : "c"}" data-open="${esc(f.path)}" data-line="${m.line}" data-side="${m.side}" title="Jump to this in the code"><i>${m.t === "-" ? "−" : m.t}</i>${esc(m.n)}</button>`).join("")}</div>` : ""}
      <div class="um-ft">${S.bars(f, 40)}${S.counts(f)}<span class="sp"></span>${f.uses.length + f.users.length && f !== around ? `<button class="um-rel" data-around="${esc(f.path)}" title="Redraw the diagram around this file">${par ? "▲ " : ""}${f.users.length ? f.users.length + " lean on it" : "relations"} ⤢</button>` : ""}</div>${around ? "" : ports(it)}</div>`;
  }
  const ports = (it) => { const a = []; if (it.kidsOut) a.push(`▲ ${it.kidsOut} extend this from elsewhere`); if (it.extIn - it.kidsOut > 0) a.push(`← ${it.extIn - it.kidsOut} use this from elsewhere`); if (it.extOut) a.push(`→ leans on ${it.extOut} elsewhere`); return a.length ? `<div class="um-ports">${a.map((x) => `<span>${x}</span>`).join("")}</div>` : ""; };

  function render() {
    S.hideTip(); const { items, rels } = model();
    const linked = items.filter((i) => i.layer >= 0), iso = items.filter((i) => i.layer < 0).sort((a, b) => S.sum(b.files, "lines") - S.sum(a.files, "lines"));
    const maxL = Math.max(-1, ...linked.map((i) => i.layer)), layers = [];
    for (let l = 0; l <= maxL; l++) { const row = linked.filter((i) => i.layer === l);
      row.forEach((i) => { const ps = [...i.out.keys()].map((j) => j.pos ?? 0); i.bary = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : -1; });
      row.sort((a, b) => (l ? a.bary - b.bary : b.in.size - a.in.size) || S.sum(b.files, "lines") - S.sum(a.files, "lines")); row.forEach((i, k) => (i.pos = k)); layers.push(row); }
    const order = [...layers.flat(), ...iso]; order.forEach((it, i) => (it.ord = i + 1));
    cur = { items, order, list: order.flatMap((it) => it.files) };
    canvas.querySelectorAll(".um-box,.um-rowlab").forEach((n) => n.remove());
    order.forEach((it) => { it.el = h(boxHtml(it)); it.el.style.width = (it.file ? BW : PW) + "px"; canvas.appendChild(it.el); it.w = it.file ? BW : PW; it.h = it.el.offsetHeight; });
    const vw = wrap.clientWidth - 36, per = Math.max(2, Math.floor((vw + GX) / (BW + GX)));
    const rows = []; layers.forEach((r) => { for (let i = 0; i < r.length; i += per) rows.push({ items: r.slice(i, i + per) }); });
    if (iso.length) for (let i = 0; i < iso.length; i += per) rows.push({ items: iso.slice(i, i + per), lab: i === 0 && linked.length ? "No links to the others in this diagram" : null, tight: i > 0 });
    const rw = (r) => r.items.reduce((s, i) => s + i.w, 0) + GX * (r.items.length - 1), W = Math.max(vw, ...rows.map(rw));
    let y = 26;
    rows.forEach((r) => { if (r.lab) { const l = h(`<div class="um-rowlab eyebrow" style="top:${y}px">${r.lab}</div>`); canvas.appendChild(l); y += 30; } else if (r.tight) y -= GY - 22;
      let x = (W - rw(r)) / 2; r.items.forEach((i) => { i.x = x; i.y = y; i.el.style.left = x + "px"; i.el.style.top = y + "px"; x += i.w + GX; }); y += Math.max(...r.items.map((i) => i.h)) + GY; });
    canvas.style.width = W + "px"; canvas.style.height = y + "px"; svg.setAttribute("width", W); svg.setAttribute("height", y);
    // relations
    const fan = new Map(); rels.forEach((r) => (fan.get(r.b) || fan.set(r.b, []).get(r.b)).push(r)); fan.forEach((a) => a.sort((p, q) => p.a.x - q.a.x));
    svg.querySelectorAll("path.um-e,text.um-el").forEach((n) => n.remove());
    rels.forEach((r) => { const A = r.a, B = r.b, sib = fan.get(B), k = sib.length > 1 ? sib.indexOf(r) / (sib.length - 1) - 0.5 : 0; let d, mx, my;
      const bx = B.x + B.w / 2 + k * B.w * 0.6, ax = A.x + A.w / 2;
      if (A.y > B.y + B.h) { const y1 = A.y, y2 = B.y + B.h + 9, c = Math.max(26, (y1 - y2) * 0.45); const bow = y1 - y2 > 230 && Math.abs(ax - bx) < 220 ? (ax + bx < W ? -1 : 1) * Math.min(300, (y1 - y2) * 0.42) : 0; d = `M${ax} ${y1} C${ax + bow} ${y1 - c} ${bx + bow} ${y2 + c} ${bx} ${y2}`; mx = (ax + bx) / 2 + bow * 0.75; my = (y1 + y2) / 2; }
      else if (A.y + A.h < B.y) { const y1 = A.y + A.h, y2 = B.y - 9, c = Math.max(26, (y2 - y1) * 0.45); d = `M${ax} ${y1} C${ax} ${y1 + c} ${bx} ${y2 - c} ${bx} ${y2}`; mx = (ax + bx) / 2; my = (y1 + y2) / 2; }
      else { const lr = A.x < B.x, x1 = lr ? A.x + A.w : A.x, x2 = lr ? B.x - 9 : B.x + B.w + 9, y1 = A.y + 30, y2 = B.y + 30; d = `M${x1} ${y1} C${x1 + (lr ? 14 : -14)} ${y1 - 34} ${x2 + (lr ? -14 : 14)} ${y2 - 34} ${x2} ${y2}`; mx = (x1 + x2) / 2; my = y1 - 28; }
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); p.setAttribute("class", "um-e " + (r.ext ? "ext" : "use")); p.setAttribute("marker-end", `url(#um-${r.ext ? "tri" : "arr"})`); svg.appendChild(p); r.el = p;
      if (r.n > 1) { const t = document.createElementNS("http://www.w3.org/2000/svg", "text"); t.setAttribute("x", mx); t.setAttribute("y", my); t.setAttribute("class", "um-el"); t.textContent = r.n; svg.appendChild(t); r.lb = t; } });
    cur.rels = rels; paintBar();
  }
  function hot(key) { const it = key && cur.items.find((i) => i.key === key), near = new Set(it ? [it] : []);
    (cur.rels || []).forEach((r) => { const on = it && (r.a === it || r.b === it); if (on) { near.add(r.a); near.add(r.b); } r.el.classList.toggle("hot", !!on); r.el.classList.toggle("dim", !!it && !on); if (r.lb) r.lb.classList.toggle("dim", !!it && !on); });
    cur.items.forEach((i) => i.el.classList.toggle("dim", !!it && !near.has(i))); }
  function paintBar() {
    const c = [`<button data-up="0">Whole change</button>`]; let n = root; path.forEach((k, i) => { n = n.kids.find((x) => x.key === k); c.push(`<span>›</span><button data-up="${i + 1}">${esc(n.name)}</button>`); });
    if (around) c.push(`<span>›</span><button data-up="x">around ${esc(around.name)}</button>`);
    $(".crumbs", el).innerHTML = c.join(""); const p = pct(cur.list);
    $(".um-sumline", el).innerHTML = `${cur.items.length} boxes · ${p.n} files · ${p.d} reviewed`;
    $("[data-details]", el).setAttribute("aria-pressed", details); canvas.classList.toggle("compact", !details);
  }
  function go(fn) { fn(); canvas.classList.remove("in"); void canvas.offsetWidth; canvas.classList.add("in"); render(); wrap.scrollTo(0, 0); }


  /* ---- file review: Scout's own cards (Swipe) and Grid, scoped to the files of the diagram you came from ---- */
  const FT = (f) => { const n = f.name; return /\.(tsx|jsx)$/.test(n) ? "react" : /\.ts$/.test(n) ? "ts" : /\.js$/.test(n) ? "js" : /\.s?css$/.test(n) ? "css" : /\.ya?ml$/.test(n) ? "yaml" : /\.json$/.test(n) ? "json" : "other"; };
  const STN = { A: "Added", D: "Deleted", R: "Renamed", M: "Modified" }, rej = new Set();
  let fr = null, frEl, frBody;
  const verdict = (f) => (S.isDone(f) ? "ok" : rej.has(f) ? "no" : "");
  const frVis = () => fr.list.filter((f) => fr.filter === "all" || (fr.filter === "todo" ? !verdict(f) : verdict(f) === fr.filter));
  function openFiles(file, at) {
    const direct = cur.order.filter((it) => it.file).map((it) => it.file), list = direct.length ? direct : cur.list;
    const f = file || list.find((x) => !S.isDone(x)) || list[0];
    fr = { list: list.includes(f) ? list : cur.list, f, mode: "swipe", filter: "all", at, title: around ? "around " + around.name : path.length ? nodeAt().name : "Whole change" };
    el.classList.add("fr-on"); paintFR(1);
  }
  function closeFiles() { fr = null; el.classList.remove("fr-on"); render(); }
  function paintFR(dir) {
    const all = fr.list, vis = frVis(); if (!vis.includes(fr.f)) fr.f = vis[0] || null;
    const cnt = { all: all.length, todo: all.filter((f) => !verdict(f)).length, ok: all.filter((f) => verdict(f) === "ok").length, no: all.filter((f) => verdict(f) === "no").length };
    $(".fr-title", frEl).textContent = fr.title;
    $(".fr-filters", frEl).innerHTML = [["all", "All"], ["todo", "Unreviewed"], ["ok", "Approved"], ["no", "Rejected"]].map(([k, n]) => `<button class="flat" data-filter="${k}" aria-pressed="${fr.filter === k}">${n} <i>${cnt[k]}</i></button>`).join("");
    frEl.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === fr.mode));
    if (!fr.f) { frBody.innerHTML = `<p class="muted" style="padding:60px;text-align:center">Nothing here with this filter.</p>`; return; }
    if (fr.mode === "grid") { frBody.innerHTML = `<div class="gd">${vis.map((f) => { const v = verdict(f), t = Math.max(1, f.lines), a = Math.round((5 * f.add) / t);
        return `<button class="gd-card ${f === fr.f ? "cur" : ""} ${v}" data-card="${esc(f.path)}" style="--ft:var(--ft-${FT(f)})"><span class="gd-dir mono">${esc(f.dir)}</span><b class="mono">${esc(f.name)}</b>
          <span class="gd-row"><span class="dot" style="background:var(--ft-${FT(f)})"></span>${STN[f.st]}<span class="sp"></span>${S.counts(f)}<span class="gd-blk">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < a ? "a" : "d"}"></i>`).join("")}</span></span>
          ${f.sum ? `<span class="gd-sum">${esc(f.sum.title)}</span>` : ""}<span class="gd-v">${v === "ok" ? "✓ Approved" : v === "no" ? "✕ Rejected" : "Unreviewed"}</span>${v ? `<span class="gd-stamp">${v === "ok" ? "✓" : "✕"}</span>` : ""}</button>`; }).join("")}</div>`; return; }
    const f = fr.f, i = vis.indexOf(f), v = verdict(f);
    frBody.innerHTML = `<div class="sw"><button class="sw-nav" data-step="-1" ${i === 0 ? "disabled" : ""} aria-label="Previous file" title="Previous (←)">‹</button>
      <div class="sw-deck">${i < vis.length - 2 ? '<i class="peek b"></i>' : ""}${i < vis.length - 1 ? '<i class="peek a"></i>' : ""}<article class="sw-card ${dir ? (dir > 0 ? "inr" : "inl") : ""}" style="--ft:var(--ft-${FT(f)})">
        <header><div class="sw-id"><span class="mono">${esc(f.dir)}</span><b class="mono">${esc(f.name)} <span class="tag">${STN[f.st]}</span></b></div><span class="sp"></span>${S.counts(f)}<span class="mono sw-n">${i + 1} / ${vis.length}</span>${v ? `<span class="sw-stamp ${v}">${v === "ok" ? "APPROVED" : "REJECTED"}</span>` : ""}</header>
        ${f.sum ? `<div class="sw-notes"><span class="jn-k">✎ Scout's notes</span><p>${esc(f.sum.body)}</p></div>` : ""}
        <div class="sw-code">${S.diffHtml(f, 400)}</div>
        <div class="sw-foot"><input class="sw-cm" placeholder="Leave a comment…" aria-label="Comment"><button class="btn ${v === "no" ? "on-no" : ""}" data-v="no">✕ Reject <span class="kbd">X</span></button><button class="btn ${v === "ok" ? "approve" : "primary"}" data-v="ok">✓ ${v === "ok" ? "Approved" : "Approve"} <span class="kbd">A</span></button></div>
      </article></div><button class="sw-nav" data-step="1" ${i >= vis.length - 1 ? "disabled" : ""} aria-label="Next file" title="Next (→)">›</button></div><div class="sw-pos mono">${i + 1} / ${vis.length}</div>`;
    if (fr.at) { const code = $(".sw-code", frBody), q = `.dl[data-${fr.at.side === "old" ? "o" : "n"}="${fr.at.line}"]`; let row = code.querySelector(q); if (!row) { code.innerHTML = S.diffHtml(f, 1e9); row = code.querySelector(q); } if (row) { code.scrollTop = row.offsetTop - code.clientHeight / 2; row.classList.add("flash"); } fr.at = null; }
  }
  function frStep(d) { const vis = frVis(), i = vis.indexOf(fr.f) + d; if (i < 0 || i >= vis.length) return false; fr.f = vis[i]; fr.mode = "swipe"; paintFR(d); return true; }
  function frVerdict(k) { const f = fr.f; if (!f) return; const was = verdict(f); let adv = false;
    if (k === "ok") { rej.delete(f); adv = was !== "ok"; S.mark(f, was !== "ok"); } else { was === "no" ? rej.delete(f) : rej.add(f); adv = was !== "no"; S.mark(f, false); }
    if (adv && fr.mode === "swipe") setTimeout(() => fr && fr.f === f && frStep(1), 450); }
  function frClick(ev) { const b = ev.target.closest("button"); if (!b) return; const d = b.dataset;
    if (d.back !== undefined) closeFiles(); else if (d.mode) { fr.mode = d.mode; paintFR(); } else if (d.filter) { fr.filter = d.filter; paintFR(); }
    else if (d.card) { fr.f = byPath.get(d.card); fr.mode = "swipe"; paintFR(1); } else if (d.step) frStep(+d.step); else if (d.v) frVerdict(d.v);
    else if (d.more !== undefined) $(".sw-code", frBody).innerHTML = S.diffHtml(fr.f, 1e9); }

  S.register({
    id: "blueprint", label: "Blueprint", icon: "◫", hint: "A UML-style diagram: packages, classes and what changed inside them.",
    init(e) {
      el = e; build();
      el.innerHTML = `<div class="bar um-bar"><div class="crumbs"></div><span class="muted um-sumline"></span><span class="sp"></span>
        <span class="grp um-legend"><span><svg width="34" height="12"><path d="M2 6H24" class="um-e ext" marker-end="url(#um-tri)"/></svg>extends</span><span><svg width="34" height="12"><path d="M2 6H26" class="um-e use" marker-end="url(#um-arr)"/></svg>leans on</span><span><b class="add">+</b> added</span><span><b class="del">−</b> removed</span><span><b>~</b> changed</span></span>
        <button class="flat" data-details>Details</button><button class="btn sm" data-read>Read in order →</button></div>
        <div class="um-wrap"><div class="um-canvas in"><svg class="um-svg"><defs><marker id="um-tri" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1L11 6L1 11Z" class="um-tri"/></marker><marker id="um-arr" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M2 1L10 6L2 11" class="um-arr"/></marker></defs></svg></div></div>`;
      frEl = h(`<div class="fr"><div class="bar"><button class="btn sm" data-back>← Back to diagram <span class="kbd">Esc</span></button><b class="fr-title"></b><span class="fr-filters grp"></span><span class="sp"></span><span class="grp"><button class="flat" data-mode="swipe">▭ Swipe</button><button class="flat" data-mode="grid">▦ Grid <span class="kbd">G</span></button></span></div><div class="fr-body"></div></div>`);
      el.appendChild(frEl); frBody = $(".fr-body", frEl); frEl.addEventListener("click", frClick);
      wrap = $(".um-wrap", el); canvas = $(".um-canvas", el); svg = $(".um-svg", el);
      el.addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; const d = b.dataset;
        if (d.drill) go(() => { path = [...path, d.drill]; });
        else if (d.around) go(() => { around = byPath.get(d.around); });
        else if (d.up !== undefined) { if (d.up !== "x") go(() => { around = null; path = path.slice(0, +d.up); }); }
        else if (d.open) openFiles(byPath.get(d.open), d.line ? { line: +d.line, side: d.side } : null);
        else if (d.details !== undefined) { details = !details; render(); }
        else if (d.read !== undefined) openFiles(null); });
      canvas.addEventListener("mouseover", (ev) => { const b = ev.target.closest(".um-box"); hot(b ? b.dataset.key : null); });
      canvas.addEventListener("mouseleave", () => hot(null));
      let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => el.classList.contains("on") && !fr && render(), 120); }).observe(wrap);
    },
    show: () => (fr ? paintFR() : render()), refresh: () => (fr ? paintFR() : render()),
    key(e) { if (fr) { const k = e.key; if (k === "Escape") closeFiles(); else if (k === "ArrowRight" || k === "j") frStep(1); else if (k === "ArrowLeft" || k === "k") frStep(-1); else if (k === "a") frVerdict("ok"); else if (k === "x") frVerdict("no"); else if (k === "g") { fr.mode = fr.mode === "grid" ? "swipe" : "grid"; paintFR(); } return; }
      if (e.key === "Escape") { if (around) go(() => { around = null; }); else if (path.length) go(() => { path = path.slice(0, -1); }); } },
  });
})();
