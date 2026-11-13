/* Prototype 2: Story. The change told in chapters: start with what matters, review repeated edits once. */
(function () {
  const S = window.Scout, { files, SLICES, PATS, ATT, $, h, esc } = S;
  let el, main, rail, cur = "shell", openKey = null, sample = 0, openRest = new Set();
  const order = Object.keys(SLICES);
  const inSlice = (s) => files.filter((f) => f.slice === s);

  function plan(s) {
    const fs = inSlice(s), score = (f) => f.users.length * 4 + Math.sqrt(f.lines);
    const key = fs.filter((f) => PATS[f.pat].w === 3 && f.kind === "app").sort((a, b) => score(b) - score(a)).slice(0, 6);
    const stacks = [], rest = [];
    Object.keys(PATS).forEach((p) => {
      const g = fs.filter((f) => f.pat === p && !key.includes(f)); if (!g.length) return;
      g.sort((a, b) => b.lines - a.lines);
      (PATS[p].w <= 1 && g.length >= 2 ? stacks : rest).push({ p, key: s + "/" + p, fs: g });
    });
    return { fs, key, stacks, rest };
  }
  const ring = (done, total, size = 30) => { const r = size / 2 - 3, c = 2 * Math.PI * r, k = total ? done / total : 0; return `<svg class="ring ${k === 1 ? "full" : ""}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - k)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${k === 1 ? `<path d="M${size / 2 - 5} ${size / 2} l3.5 3.5 l6 -7" class="tick"/>` : ""}</svg>`; };
  const why = (f) => f.sum ? esc(f.sum.title) : f.users.length ? `${f.users.length} changed files lean on this` : f.st === "A" ? `New · ${f.add} lines` : `${f.lines} lines changed`;
  const row = (f) => `<button class="st-row ${S.isDone(f) ? "done" : ""}" data-open="${esc(f.path)}"><span class="mono nm">${esc(f.name)}</span><span class="muted dir">${f.notes.length ? '<span class="tag jtag">✎</span> ' : ""}${esc(f.sum ? f.sum.title : f.dir)}</span>${S.bars(f)}<span class="cnt">${S.counts(f)}</span>${S.isDone(f) ? '<span class="check">✓</span>' : '<span class="check off"></span>'}</button>`;
  function excerpt(f, n = 24) { const rows = S.parse(f.diff); const i = rows.findIndex((r) => r.t === "a" || r.t === "d"); const st = Math.max(0, i - 3); return rows.slice(st, st + n).map(S.rowHtml).join("") || `<div class="muted" style="padding:16px">No line changes.</div>`; }

  function paintRail() {
    const att = [3, 2, 1, 0].map((w) => { const g = files.filter((f) => PATS[f.pat].w === w); return `<div class="att"><span class="dot" style="background:${ATT[w].c}"></span><b>${g.length}</b> ${ATT[w].name.toLowerCase()}</div>`; }).join("");
    rail.innerHTML = `<div class="eyebrow">Reading plan</div><p class="lede">${files.length} files, but most are the same few edits repeated.</p>${att}<div class="eyebrow" style="margin-top:22px">Chapters</div>` +
      order.map((s) => { const fs = inSlice(s), d = fs.filter(S.isDone).length; return `<button class="chap ${s === cur ? "on" : ""}" data-chap="${s}">${ring(d, fs.length)}<span><b>${SLICES[s].n}. ${SLICES[s].name}</b><small>${d}/${fs.length} files${SLICES[s].ticket ? " · " + SLICES[s].ticket : ""}</small></span></button>`; }).join("");
  }
  function paintMain(keep) {
    const top = main.scrollTop, sl = SLICES[cur], p = plan(cur), dn = p.fs.filter(S.isDone).length;
    let html = `<div class="hero" style="--c:${sl.c}"><div class="num">${sl.n}</div><div><div class="eyebrow">Chapter ${sl.n} of 4${sl.ticket ? " · " + sl.ticket : ""}</div><h1>${sl.name}</h1><p><b>What people see:</b> ${sl.see}</p>
      <div class="chips"><span class="tag">${p.fs.length} files</span><span class="tag">${S.counts({ add: S.sum(p.fs, "add"), dele: S.sum(p.fs, "dele") })}</span><span class="tag">${dn} reviewed</span></div></div></div>`;
    if (p.key.length) html += `<h2><i>1</i> Start here <small>The files everything else in this chapter hangs off.</small></h2><div class="keys">` + p.key.map((f) => `<button class="keycard ${S.isDone(f) ? "done" : ""}" data-open="${esc(f.path)}" data-list="key"><span class="mono nm">${esc(f.name)}</span><span class="muted mono dir">${esc(f.dir.replace("src/main/client/", ""))}</span><span class="why">${why(f)}</span><span class="ft">${S.bars(f, 60)} ${S.counts(f)}${f.users.length ? `<span class="muted">· ${f.users.length} lean on it</span>` : ""}${f.notes.length ? '<span class="tag jtag">✎</span>' : ""}${S.isDone(f) ? '<span class="check">✓</span>' : ""}</span></button>`).join("") + `</div>`;
    if (p.stacks.length) html += `<h2><i>2</i> Same edit, repeated <small>Read one sample, flick through the rest, approve the pile.</small></h2><div class="stacks">` + p.stacks.map((g) => {
      const d = g.fs.filter(S.isDone).length, all = d === g.fs.length, on = g.key === openKey;
      let out = `<button class="stack ${on ? "on" : ""} ${all ? "done" : ""}" data-stack="${g.key}"><span class="deck"><i></i><i></i><b>${all ? "✓" : g.fs.length}</b></span><span class="tx"><b>${PATS[g.p].name}</b><small>${PATS[g.p].d}</small><small class="mono">${g.fs.length} files · ${S.counts({ add: S.sum(g.fs, "add"), dele: S.sum(g.fs, "dele") })} · ${d} reviewed</small></span><span class="chev">${on ? "▾" : "▸"}</span></button>`;
      if (on) { const f = g.fs[Math.min(sample, g.fs.length - 1)];
        out += `<div class="flip"><div class="flip-l"><div class="flip-h"><button class="btn sm icon" data-flip="-1" title="Previous file (←)">←</button><span class="mono nm">${esc(f.name)}</span><span class="muted">${sample + 1} / ${g.fs.length}</span><button class="btn sm icon" data-flip="1" title="Next file (→)">→</button><span class="sp"></span><button class="btn sm" data-open="${esc(f.path)}" data-list="${g.key}">Full diff</button></div>${f.sum ? `<div class="jsum in"><span class="jn-k">✎ Scout's note</span><b>${esc(f.sum.title)}</b><p>${esc(f.sum.body)}</p></div>` : ""}<div class="flip-code">${excerpt(f)}</div></div>
          <div class="flip-r"><div class="flip-list">${g.fs.map((x, i) => `<button class="pip ${i === sample ? "on" : ""} ${S.isDone(x) ? "done" : ""}" data-pick="${i}" title="${esc(x.path)}">${S.bars(x, 34)}<span class="mono">${esc(x.name)}</span></button>`).join("")}</div>
          <button class="btn approve" data-okall="${g.key}">${all ? "Undo" : `Seen enough · mark all ${g.fs.length} reviewed`}</button><span class="muted hint"><span class="kbd">←</span> <span class="kbd">→</span> flick through files</span></div></div>`; }
      return out; }).join("") + `</div>`;
    if (p.rest.length) html += `<h2><i>${p.stacks.length ? 3 : 2}</i> The rest <small>Individual changes, biggest first.</small></h2>` + p.rest.map((g) => { const d = g.fs.filter(S.isDone).length, on = openRest.has(g.key);
      return `<div class="rest"><button class="rest-h" data-rest="${g.key}"><span class="chev">${on ? "▾" : "▸"}</span><span class="dot" style="background:${ATT[PATS[g.p].w].c}"></span><b>${PATS[g.p].name}</b><span class="muted">${ATT[PATS[g.p].w].name}</span><span class="sp"></span><span class="muted mono">${d}/${g.fs.length}</span></button>${on ? `<div class="rows" data-list="${g.key}">${g.fs.map(row).join("")}</div>` : ""}</div>`; }).join("");
    const nx = order[order.indexOf(cur) + 1];
    html += `<div class="next">${dn === p.fs.length ? '<span class="tag" style="background:var(--ok-bg)">✓ Chapter reviewed</span>' : `<span class="muted">${p.fs.length - dn} files left in this chapter</span>`}<span class="sp"></span>${nx ? `<button class="btn primary" data-chap="${nx}">Next: ${SLICES[nx].name} →</button>` : ""}</div>`;
    main.innerHTML = `<div class="st-wrap">${html}</div>`; main.scrollTop = keep ? top : 0;
  }
  const paint = (keep) => { paintRail(); paintMain(keep); };
  const groupOf = (key) => { const p = plan(cur); return key === "key" ? p.key : (p.stacks.concat(p.rest).find((g) => g.key === key) || {}).fs; };
  function flip(d) { const g = groupOf(openKey); if (!g) return; sample = (sample + d + g.length) % g.length; paintMain(true); }

  S.register({
    id: "story", label: "Story", icon: "❡", hint: "Guided chapters. Key files first, repeated edits reviewed once.",
    init(e) {
      el = e; el.innerHTML = `<div class="st"><nav class="st-rail"></nav><div class="st-main"></div></div>`;
      rail = $(".st-rail", el); main = $(".st-main", el);
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("button"); if (!b) return; const d = b.dataset;
        if (d.chap) { cur = d.chap; openKey = null; paint(false); }
        else if (d.open) { const lk = d.list || (b.closest("[data-list]") || {}).dataset?.list; S.open(d.open, lk ? groupOf(lk) : null); }
        else if (d.stack) { openKey = openKey === d.stack ? null : d.stack; sample = 0; paintMain(true); }
        else if (d.flip) flip(+d.flip);
        else if (d.pick) { sample = +d.pick; paintMain(true); }
        else if (d.okall) { const g = groupOf(d.okall); const all = g.every(S.isDone); S.mark(g, !all); if (!all) openKey = null, paintMain(true); }
        else if (d.rest) { openRest.has(d.rest) ? openRest.delete(d.rest) : openRest.add(d.rest); paintMain(true); }
      });
    },
    show: () => paint(true), refresh: () => paint(true),
    key(e) { if (openKey && e.key === "ArrowRight") { flip(1); e.preventDefault(); } else if (openKey && e.key === "ArrowLeft") { flip(-1); e.preventDefault(); } else if (e.key === "Escape" && openKey) { openKey = null; paintMain(true); } },
  });
})();
