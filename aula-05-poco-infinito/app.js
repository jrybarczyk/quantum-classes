(function () {
  "use strict";
  const P = window.QuantumPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9", violet: "#7b5ea7" };
  const LEVEL = ["#457b9d", "#c65c4b", "#619b60", "#e9a23b", "#7b5ea7", "#2a9d8f"];
  const TAU = 2 * Math.PI;
  const VIEWS = ["spectrum", "measure", "superposition", "expansion", "revival", "medical"];
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let view = new URLSearchParams(location.search).get("view");
  if (!VIEWS.includes(view)) view = "spectrum";

  const fmt = (x, n = 2) => Number(x).toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n });
  const v = (id) => Number($(id).value);
  const set = (id, text) => { $(id).textContent = text; };
  const html = (id, content) => { $(id).innerHTML = content; };
  const samples = (a, b, n, fn) => Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; });

  // ---------------------------------------------------------------- desenho
  function canvas(id, aspect) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, h = w * aspect;
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, ratio, el };
  }
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 52, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    const n = o.ticks ?? 5;
    for (let i = 0; i <= n; i += 1) {
      const x = xMin + i * (xMax - xMin) / n, y = yMin + i * (yMax - yMin) / n;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "center"; if (!o.noX) ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? 1), X(x), bottom + 14);
      ctx.textAlign = "right"; if (!o.noY) ctx.fillText(o.yLabels ? o.yLabels(y) : fmt(y, o.yDigits ?? 1), left - 6, Y(y) + 3);
    }
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top, ch.right - ch.left, ch.bottom - ch.top); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.6, alpha = 1) {
    clip(ch, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); });
  }
  function area(ch, pts, color, base = 0) {
    clip(ch, (c) => { c.fillStyle = color; c.beginPath(); c.moveTo(ch.X(pts[0].x), ch.Y(base)); pts.forEach((p) => c.lineTo(ch.X(p.x), ch.Y(p.y))); c.lineTo(ch.X(pts[pts.length - 1].x), ch.Y(base)); c.closePath(); c.fill(); });
  }
  function dot(ctx, x, y, color, r = 5) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function glow(ctx, x, y, color, r) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function arrow(ctx, x1, y1, x2, y2, color, width = 3) {
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = 9; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)); ctx.lineTo(x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
  }
  function walls(ch, from, to) {
    const c = ch.ctx; c.fillStyle = "rgba(38,49,45,.10)";
    c.fillRect(ch.left, ch.top, ch.X(from) - ch.left, ch.bottom - ch.top); c.fillRect(ch.X(to), ch.top, ch.right - ch.X(to), ch.bottom - ch.top);
    c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(ch.X(from), ch.top); c.lineTo(ch.X(from), ch.bottom); c.moveTo(ch.X(to), ch.top); c.lineTo(ch.X(to), ch.bottom); c.stroke();
  }
  function phasor(ctx, cx, cy, r, angle, len, color, text) {
    const x = cx + r * len * Math.cos(angle), y = cy - r * len * Math.sin(angle);
    arrow(ctx, cx, cy, x, y, color, 3); if (text) label(ctx, text, x + 6 * (Math.cos(angle) >= 0 ? 1 : -1), y - 6, color, Math.cos(angle) >= 0 ? "left" : "right");
  }
  // cor aproximada de um comprimento de onda (nm); fora do visível, tons escuros
  function spectralColor(nm) {
    if (nm < 380) return "#6b4fa0"; if (nm > 750) return "#7a1f1f";
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else r = 1;
    const k = nm < 420 ? .4 + .6 * (nm - 380) / 40 : nm > 700 ? .4 + .6 * (750 - nm) / 50 : 1, ch = (x) => Math.round(255 * Math.pow(Math.max(0, x) * k, .8));
    return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
  }
  function texts(d) {
    set("statusTitle", d.status); set("statusDetail", d.detail);
    set("mainTitle", d.title); set("mainSubtitle", d.subtitle); set("caption", d.caption);
    set("secondaryTitle", d.secondaryTitle); set("secondarySubtitle", d.secondarySubtitle); set("secondaryCaption", d.secondaryCaption);
    set("prediction", d.prediction); html("calculation", d.calculation);
    html("metrics", d.metrics.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join(""));
    set("conceptTitle", d.conceptTitle || "Ideia física"); set("conceptText", d.concept);
    html("prompts", d.prompts.map((p) => `<li>${p}</li>`).join(""));
    html("legend", d.legend.map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-top-style:dashed" : ""}"></i>${text}</span>`).join(""));
  }

  // ---------------------------------------------------------------- estado
  const state = {
    playing: null, last: 0,
    meas: { samples: [], drops: [], streaming: false, history: [] },
    rev: { key: "", coeffs: null, carpet: null, image: null },
    med: { mode: "dye", photon: -1 },
    exp: { key: "", coeffs: null },
  };

  // ================================================================ 01 · espectro
  function drawSpectrum() {
    const n = v("specN"), a = v("specL"), t = v("specT"), E = (k) => P.boxEnergy(k, a), top = E(6) * 1.12;
    set("specNOut", n); set("specLOut", fmt(a, 2)); set("specTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.12, 1.85, 0, top, "posição x (a₀)", "energia (E₁ de a₀)", { xDigits: 2, yDigits: 0 });
    walls(ch, 0, a);
    for (let k = 1; k <= 6; k += 1) {
      const sel = k === n, base = E(k), next = k < 6 ? E(k + 1) - E(k) : E(6) - E(5), amp = Math.min(top * .05, next * .38), col = LEVEL[k - 1];
      if (sel) clip(ch, (c) => { c.fillStyle = "rgba(131,196,78,.10)"; c.fillRect(ch.X(0), ch.Y(base + amp * 1.25), ch.X(a) - ch.X(0), ch.Y(base - amp * 1.25) - ch.Y(base + amp * 1.25)); });
      line(ch, [{ x: 0, y: base }, { x: a, y: base }], sel ? col : C.faint, [], sel ? 2 : 1.2);
      line(ch, samples(0, a, 220, (x) => base + amp * P.boxWave(x / a, k) / Math.SQRT2 * Math.cos(E(k) * t)), col, [], sel ? 3 : 1.3, sel ? 1 : .55);
      label(ch.ctx, `n=${k} · ${fmt(base, 1)}`, ch.X(a) + 8, ch.Y(base) + 4, sel ? col : C.gray, "left", sel ? "bold 11px Ubuntu, system-ui" : "10px Ubuntu, system-ui");
    }
    if (n > 1) { // transição para o nível de baixo: fóton emitido
      const x = ch.X(a * .5 + .03), y1 = ch.Y(E(n)), y2 = ch.Y(E(n - 1));
      arrow(ch.ctx, x, y1 + 4, x, y2 - 4, C.ink, 2);
      label(ch.ctx, `ΔE = ${fmt(E(n) - E(n - 1), 2)}`, x + 6, (y1 + y2) / 2 + 4, C.ink, "left", "10px Ubuntu, system-ui");
    }
    const sec = canvas("secondaryCanvas", .34), w = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, -.12, 1.85, -2.6, 2.6, "posição x (a₀)", `ψ${n} e |ψ${n}|²`, { xDigits: 2, ticks: 4 });
    walls(w, 0, a);
    area(w, samples(0, a, 300, (x) => P.boxWave(x / a, n) ** 2 / a), "rgba(69,123,157,.18)");
    line(w, samples(0, a, 300, (x) => P.boxWave(x / a, n) / Math.sqrt(a) * Math.cos(P.boxEnergy(n, a) * t)), LEVEL[n - 1], [], 2.8);
    line(w, samples(0, a, 300, (x) => P.boxWave(x / a, n) / Math.sqrt(a)), LEVEL[n - 1], [3, 4], 1.2, .5);
    line(w, samples(0, a, 300, (x) => -P.boxWave(x / a, n) / Math.sqrt(a)), LEVEL[n - 1], [3, 4], 1.2, .5);
    for (let j = 1; j < n; j += 1) { dot(sec.ctx, w.X(a * j / n), w.Y(0), C.red, 4.5); }
    texts({ status: "Espectro", detail: `n = ${n} · a = ${fmt(a, 2)} a₀`, title: "Níveis do poço e suas ondas estacionárias", subtitle: "Eₙ ∝ n²/a²: só cabem ondas que zeram nas duas paredes",
      caption: "Cada nível traz sua autofunção desenhada na própria energia, vibrando com a frequência Eₙ/ℏ: os níveis de cima vibram mais depressa. A seta mostra a transição para o nível de baixo, que emite um fóton de energia ΔE.",
      secondaryTitle: `Autofunção do nível n = ${n}`, secondarySubtitle: `${n - 1} nó(s) interno(s) (pontos vermelhos) · envoltória tracejada`,
      secondaryCaption: "A onda estacionária respira entre as envoltórias ±ψₙ(x), mas a densidade (azul claro) fica parada. Os nós estão nas mesmas posições em qualquer instante.",
      prediction: "Ao estreitar o poço (a menor), os níveis sobem ou descem? Por qual fator mudam quando a cai à metade?",
      calculation: `Eₙ = n²π²ℏ²/(2ma²)<br><b>E${n} = ${fmt(E(n), 3)} E₁(a₀)</b><small>E${Math.min(n + 1, 6)} − E${Math.min(n + 1, 6) - 1} = ${fmt(n < 6 ? E(n + 1) - E(n) : E(6) - E(5), 3)} = (2n+1)E₁/a²</small><small>λₙ = 2L/n = ${fmt(2 * a / n, 3)} a₀</small>`,
      metrics: [["n", n], ["a/a₀", fmt(a, 2)], ["Eₙ/E₁(a₀)", fmt(E(n), 3)], ["nós internos", n - 1], ["Δx · Δp/ℏ", fmt(P.deltaX(n) * P.deltaP(n), 3)], ["elétron, a₀ = 1 nm: E₁", `${fmt(P.levelEV(1, a), 3)} eV`], [`fóton ${n} → 1`, n > 1 ? `${fmt(P.wavelengthNm(P.levelEV(n, a) - P.levelEV(1, a)), 0)} nm` : "—"]],
      concept: "A equação Hψ = Eψ aceita qualquer E; as paredes, que exigem ψ(0) = ψ(a) = 0, só deixam passar ondas com um número inteiro de meios comprimentos de onda. É o mesmo princípio das cordas de um violão.",
      prompts: ["Reduza a à metade e confira o fator nas energias.", "Compare E₂ − E₁ com E₃ − E₂: os níveis se afastam como (2n+1)E₁.", "Relacione n ao número de nós e à rapidez da vibração.", "Com a₀ = 1 nm, confira o exemplo da nota: E₁ = 0,376 eV e o fóton 3 → 1 em 412 nm (violeta). Com a = 0,5 nm?"],
      legend: [[LEVEL[n - 1], "nível selecionado"], [C.faint, "demais níveis"], [C.blue, "|ψₙ|²"]] });
  }

  // ================================================================ 02 · medida de posição
  function measClear() { state.meas = { samples: [], drops: [], streaming: false, history: [] }; updateStream(); }
  function updateStream() { $("measStream").textContent = state.meas.streaming ? "❚❚ Pausar detector" : "▶ Detectar continuamente"; }
  function addSamples(k) {
    const n = v("measN"), b = v("measB");
    for (let i = 0; i < k; i += 1) state.meas.samples.push(P.samplePosition(n));
    const s = state.meas.samples; if (!s.length) return;
    const inside = s.filter((x) => x <= b).length;
    state.meas.history.push({ count: s.length, frac: inside / s.length });
    if (state.meas.history.length > 400) state.meas.history.shift();
  }
  function drawMeasure() {
    const n = v("measN"), b = v("measB"), s = state.meas.samples, N = s.length;
    set("measNOut", n); set("measBOut", fmt(b, 2));
    const main = canvas("mainCanvas", .5), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.08, 1.08, 0, 2.6, "posição x/a", "densidade de probabilidade (1/a)", { xDigits: 1 });
    walls(ch, 0, 1);
    clip(ch, (c) => { c.fillStyle = "rgba(233,162,59,.13)"; c.fillRect(ch.X(0), ch.top, ch.X(b) - ch.X(0), ch.bottom - ch.top); });
    if (N) { const bins = 40, hist = P.histogram(s, bins); clip(ch, (c) => { c.fillStyle = "rgba(69,123,157,.45)"; hist.forEach((hv, i) => { const x0 = ch.X(i / bins), x1 = ch.X((i + 1) / bins); c.fillRect(x0 + .5, ch.Y(Math.min(hv, 2.6)), x1 - x0 - 1, ch.bottom - ch.Y(Math.min(hv, 2.6))); }); }); }
    line(ch, samples(0, 1, 400, (x) => 2 * Math.sin(n * Math.PI * x) ** 2), C.green, [], 2.6);
    line(ch, [{ x: 0, y: 1 }, { x: 1, y: 1 }], C.red, [7, 5], 2);
    // detecções recentes: gotas caindo e brilhando no chão
    state.meas.drops.forEach((d) => { const y = ch.top + (ch.bottom - ch.top) * Math.min(1, d.age / .45); glow(ch.ctx, ch.X(d.x), Math.min(y, ch.bottom - 4), "rgba(233,162,59,.9)", d.age < .45 ? 6 : 10 * (1 - (d.age - .45) / .8)); });
    const pExact = P.intervalProbability(n, 0, b), pObs = N ? s.filter((x) => x <= b).length / N : null;
    const sec = canvas("secondaryCanvas", .34), hist = state.meas.history, maxN = Math.max(100, hist.length ? hist[hist.length - 1].count : 100);
    const conv = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 0, Math.log10(maxN), 0, 1, "número de detecções (escala log)", "fração em [0, b]", { ticks: 4, xLabels: (x) => fmt(10 ** x, 0), yDigits: 2 });
    line(conv, [{ x: 0, y: pExact }, { x: Math.log10(maxN), y: pExact }], C.green, [6, 4], 2);
    line(conv, [{ x: 0, y: b }, { x: Math.log10(maxN), y: b }], C.red, [3, 4], 1.4);
    if (hist.length) { line(conv, hist.map((hp) => ({ x: Math.log10(hp.count), y: hp.frac })), C.blue, [], 2.2); dot(sec.ctx, conv.X(Math.log10(hist[hist.length - 1].count)), conv.Y(hist[hist.length - 1].frac), C.blue, 5); }
    texts({ status: "Medida de posição", detail: `n = ${n} · ${N} detecções`, title: "Cada detecção é um ponto; |ψ|² é a estatística", subtitle: n >= 10 ? "n grande: as oscilações ficam finas e a média tende à densidade clássica" : "o histograma das detecções converge para |ψₙ|²",
      caption: "Cada detecção cai num ponto do poço (brilho dourado). O histograma azul acumula as detecções e converge para |ψₙ(x)|² (verde). A linha vermelha é a densidade clássica 1/a, de uma bola que quica com velocidade constante. A faixa dourada é o intervalo [0, b].",
      secondaryTitle: "Convergência da frequência observada", secondarySubtitle: "fração das detecções em [0, b] contra o número de detecções",
      secondaryCaption: "A curva azul é a fração medida até agora; o tracejado verde é a probabilidade quântica exata e o pontilhado vermelho, a previsão clássica b. Com poucas detecções a frequência flutua; com muitas, ela se fixa na previsão de Born.",
      prediction: "No estado fundamental, a fração das detecções no primeiro quarto do poço será maior, menor ou igual a 1/4? E com n = 20?",
      calculation: `P(0 ≤ x ≤ b) = b − sen(2nπb)/(2nπ)<br><b>= ${fmt(pExact, 4)}</b><small>clássico: b = ${fmt(b, 2)} · observado: ${pObs === null ? "—" : fmt(pObs, 4)}</small>`,
      metrics: [["detecções", N], ["P exata em [0, b]", fmt(pExact, 4)], ["fração observada", pObs === null ? "—" : fmt(pObs, 4)], ["clássico (b)", fmt(b, 2)], ["Δx/a do estado", fmt(P.deltaX(n), 3)]],
      concept: "A função de onda não diz onde a partícula está; diz com que frequência cada posição aparece quando a medida é repetida em sistemas preparados igualmente. Para n grande, as oscilações de |ψₙ|² ficam finas demais para qualquer detector, e a estatística quântica reproduz a clássica: o princípio da correspondência.",
      prompts: ["Com n = 1 e b = 0,25, detecte 1000 vezes: a fração fica perto de 0,0908 ou de 0,25?", "Passe para n = 2 e b = 0,5: por que a resposta é exatamente 1/2?", "Use n = 20 e compare o histograma com a linha clássica."],
      legend: [[C.green, "|ψₙ|² teórica"], [C.blue, "histograma"], [C.red, "clássica 1/a", true], [C.gold, "detecção"]] });
  }

  // ================================================================ 03 · superposição
  function drawSuperposition() {
    let m = v("supM"), n = v("supN");
    if (n <= m) { n = m + 1; $("supN").value = n; }
    const p = v("supP"), a = v("supA"), t = v("supT"), mean = P.twoLevelMeanX(t, m, n, p, a), omega = P.boxEnergy(n) - P.boxEnergy(m), period = TAU / omega;
    set("supMOut", m); set("supNOut", n); set("supPOut", fmt(p, 2)); set("supAOut", `${fmt(a / Math.PI, 2)}π`); set("supTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.1, 1.1, -2.4, 4.6, "posição u = x/a", "|Ψ|² e Re Ψ", { xDigits: 1 });
    walls(ch, 0, 1);
    for (let k = 6; k >= 1; k -= 1) line(ch, samples(0, 1, 200, (u) => P.twoLevel(u, t - k * period / 40, m, n, p, a).density), C.green, [], 1.2, .07 * (7 - k));
    const rho = samples(0, 1, 360, (u) => P.twoLevel(u, t, m, n, p, a).density);
    area(ch, rho, "rgba(97,155,96,.26)"); line(ch, rho, C.green, [], 2.8);
    line(ch, samples(0, 1, 360, (u) => P.twoLevel(u, t, m, n, p, a).re), C.gold, [6, 4], 1.6);
    const c = ch.ctx; c.setLineDash([4, 4]); c.strokeStyle = C.red; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ch.X(mean), ch.top); c.lineTo(ch.X(mean), ch.bottom); c.stroke(); c.setLineDash([]);
    dot(c, ch.X(mean), ch.Y(4.35), C.red, 6); label(c, `⟨x⟩ = ${fmt(mean, 3)} a`, ch.X(mean) + 8, ch.Y(4.35) + 4, C.red, "left", "bold 11px Ubuntu, system-ui");
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, wA = sec.w * .66;
    const tr = axes(sec, { x: 0, y: 0, w: wA, h: sec.h }, 0, 6.28, .25, .75, "t (ℏ/E₁)", "⟨x⟩/a", { ticks: 4, yDigits: 2 });
    line(tr, samples(0, 6.28, 600, (q) => P.twoLevelMeanX(q, m, n, p, a)), C.red, [], 1.3, .3);
    line(tr, samples(0, Math.max(t, .001), 400, (q) => P.twoLevelMeanX(q, m, n, p, a)), C.red, [], 2.6);
    dot(ctx, tr.X(t), tr.Y(mean), C.red, 5);
    const cx = wA + (sec.w - wA) / 2, cy = sec.h / 2 - 6, r = Math.min((sec.w - wA) * .36, sec.h * .36);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    phasor(ctx, cx, cy, r, -P.boxEnergy(m) * t, Math.sqrt(1 - p), LEVEL[m - 1], `c${m}`);
    phasor(ctx, cx, cy, r, a - P.boxEnergy(n) * t, Math.sqrt(p), LEVEL[n - 1], `c${n}`);
    label(ctx, `fasores (E${n}/E${m} = ${fmt(P.boxEnergy(n) / P.boxEnergy(m), 2)})`, cx, sec.h - 8, C.gray, "center", "10px Ubuntu, system-ui");
    const sameParity = (m + n) % 2 === 0, amp = 2 * Math.sqrt((1 - p) * p) * Math.abs(P.xElement(m, n)), E = (1 - p) * P.boxEnergy(m) + p * P.boxEnergy(n);
    texts({ status: "Superposição", detail: `níveis ${m} e ${n} · |c${n}|² = ${fmt(p, 2)}`, title: sameParity ? "A densidade respira, mas o centro não se move" : "A densidade balança de um lado ao outro do poço",
      subtitle: `frequência de Bohr ω = (E${n} − E${m})/ℏ = ${fmt(omega, 0)} E₁/ℏ · período ${fmt(period, 3)} ℏ/E₁`,
      caption: sameParity ? `Níveis de mesma paridade (${m} e ${n}) são ambos simétricos ou ambos antissimétricos em torno de a/2: a densidade muda de forma, mas permanece simétrica, e ⟨x⟩ fica em a/2 (x${m}${n} = 0).` : "A densidade vai e volta no poço, com um rastro dos instantes anteriores; ⟨x⟩ (vermelho) acompanha. O movimento vem do termo de interferência entre os dois níveis.",
      secondaryTitle: "⟨x⟩ no tempo e os fasores", secondarySubtitle: `os fasores giram com E${m}/ℏ e E${n}/ℏ; ⟨x⟩ depende só do ângulo entre eles`,
      secondaryCaption: "A amplitude de ⟨x⟩ é 2|c_m||c_n||x_mn|, máxima com pesos iguais. A fase α desloca a oscilação no tempo, mas não muda as probabilidades |c_m|² e |c_n|².",
      prediction: "Com os níveis 1 e 3, a densidade oscila? E ⟨x⟩? Por quê?",
      calculation: `x<sub>${m}${n}</sub> = ∫ψ${m} x ψ${n} dx = ${sameParity ? "0 (mesma paridade)" : fmt(P.xElement(m, n), 4) + " a"}<br><b>⟨x⟩(t) = a/2 + 2|c${m}||c${n}| x<sub>${m}${n}</sub> cos(ωt − α)</b><small>⟨H⟩ = ${fmt(E, 3)} E₁ · amplitude de ⟨x⟩ = ${fmt(amp, 3)} a</small>`,
      metrics: [["P(E" + m + ") · P(E" + n + ")", `${fmt(1 - p, 2)} · ${fmt(p, 2)}`], ["⟨H⟩", `${fmt(E, 3)} E₁`], ["ΔH = √(p(1−p))·|Eₙ − Eₘ|", `${fmt(Math.sqrt(p * (1 - p)) * omega, 3)} E₁`], ["período de Bohr", `${fmt(period, 3)} ℏ/E₁`], ["amplitude de ⟨x⟩", `${fmt(amp, 3)} a`]],
      concept: "Uma superposição de energias diferentes não é estacionária: o termo cruzado oscila com a frequência de Bohr. Se os dois estados têm paridades opostas, o pacote balança de uma parede à outra; se têm a mesma paridade, ele só respira em torno do centro.",
      prompts: ["Níveis 1 e 2 com pesos iguais: confira a amplitude 0,180 a do exemplo da nota.", "Use o preset do exercício, (ψ₁ + iψ₃)/√2: a densidade ainda se move? E ⟨x⟩? Confira ⟨H⟩ = 5E₁, ΔH = 4E₁ e o período 2πℏ/(8E₁).", "Com 1 e 2, compare os períodos para (1,2) e (2,3): a frequência de Bohr cresce com 2n+1."],
      legend: [[C.green, "|Ψ|² (com rastro)"], [C.gold, "Re Ψ", true], [C.red, "⟨x⟩"]] });
  }

  // ================================================================ 04 · expansão (truque de Fourier)
  function drawExpansion() {
    const key = $("expInit").value, init = P.INITIAL[key], N = v("expN"), t = v("expT");
    set("expNOut", N); set("expTOut", fmt(t, 2));
    if (state.exp.key !== key) state.exp = { key, coeffs: P.fourierCoefficients(init.f, 15) };
    const all = state.exp.coeffs, used = all.slice(0, N), st = P.expansionStats(used), stAll = P.expansionStats(all);
    const main = canvas("mainCanvas", .5), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.08, 1.08, -1.4, 2.6, "posição x/a", "Ψ (unid. a^−½) e |Ψ|² (unid. 1/a)", { xDigits: 1 });
    walls(ch, 0, 1);
    for (let k = 1; k <= N; k += 1) line(ch, samples(0, 1, 200, (u) => all[k - 1].re * P.boxWave(u, k)), LEVEL[(k - 1) % LEVEL.length], [], 1, .35);
    line(ch, samples(0, 1, 400, (u) => init.f(u)), C.gray, [5, 4], 2);
    line(ch, samples(0, 1, 400, (u) => P.packetPsi(used, u, 0).re), C.gold, [], 1.8, .75);
    const dens = samples(0, 1, 400, (u) => P.packetPsi(used, u, t).density);
    area(ch, dens, "rgba(69,123,157,.22)"); line(ch, dens, C.blue, [], 2.6);
    line(ch, samples(0, 1, 400, (u) => P.packetPsi(used, u, t).re), C.green, [], 1.6);
    // secundário: |c_n|² em escala log e leituras
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, wB = sec.w * .66, floor = -5;
    const bars = axes(sec, { x: 0, y: 0, w: wB, h: sec.h }, .3, 15.7, floor, 0, "n", "|cₙ|²", { ticks: 5, noX: true, yLabels: (y) => (y === 0 ? "1" : `10^${fmt(y, 0)}`) });
    all.forEach((c, i) => {
      const n = i + 1, p = c.re * c.re + c.im * c.im, h = Math.max(floor, Math.log10(Math.max(p, 1e-12))), x0 = bars.X(n - .36), x1 = bars.X(n + .36);
      ctx.fillStyle = n <= N ? LEVEL[(n - 1) % LEVEL.length] : C.faint; ctx.fillRect(x0, bars.Y(h), x1 - x0, bars.Y(floor) - bars.Y(h));
      label(ctx, `${n}`, (x0 + x1) / 2, bars.bottom + 13, n <= N ? C.ink : C.gray, "center", "10px Ubuntu, system-ui");
      if (p > 1e-5 && n <= 5) label(ctx, fmt(p, p > .01 ? 3 : 5), (x0 + x1) / 2, bars.Y(h) - 4, C.ink, "center", "9px Ubuntu, system-ui");
    });
    const rx = wB + 14, rows = [["Σ|cₙ|² (N termos)", fmt(st.norm, 4)], ["Σ|cₙ|² (15 termos)", fmt(stAll.norm, 4)], ["⟨H⟩ (N termos)", `${fmt(st.energy, 3)} E₁`], ["P(E₁)", fmt(all[0].re ** 2, 4)]];
    rows.forEach(([k, val], i) => { label(ctx, k, rx, 30 + i * 30, C.gray, "left", "10px Ubuntu, system-ui"); label(ctx, val, rx, 44 + i * 30, C.ink, "left", "bold 13px Ubuntu, system-ui"); });
    const para = key === "parabola";
    texts({ status: "Expansão", detail: `${init.name} · N = ${N}`, title: "Expandir é projetar: cₙ = ⟨n|Ψ(0)⟩", subtitle: "a base {ψₙ} é completa: qualquer Ψ(x,0) no poço é uma soma de autoestados",
      caption: "Tracejado cinza: a condição inicial Ψ(x,0). Dourado: a soma dos N primeiros termos em t = 0 — com poucos termos ela já cola na parábola, mas o degrau precisa de muitos (e oscila nas bordas: fenômeno de Gibbs). Verde e azul: Re Ψ e |Ψ|² da soma evoluída no tempo, cada termo com sua fase e^(−iEₙt/ℏ). As curvas finas são os termos cₙψₙ.",
      secondaryTitle: "Probabilidades de energia |cₙ|²", secondarySubtitle: "barras coloridas: termos incluídos na soma · cinza: ainda fora",
      secondaryCaption: para ? "Na parábola, P(E₁) = 960/π⁶ = 0,9986 e os n pares se anulam: a parábola é simétrica em torno de a/2 e os ψₙ pares são antissimétricos. ⟨H⟩ = 5ℏ²/(ma²) = 1,013 E₁, pouco acima de E₁." : "Σ|cₙ|² tende a 1 à medida que N cresce; quanto mais abrupta a função, mais devagar. ⟨H⟩ = Σ|cₙ|²Eₙ: cantos e degraus custam energia cinética.",
      prediction: para ? "Quantos termos a parábola A·x(a − x) precisa para ser indistinguível da soma? Que coeficientes serão nulos, e por quê?" : "Essa função é simétrica em torno de a/2? Então quais cₙ se anulam? A soma vai parar de mudar no tempo?",
      calculation: para ? `cₙ = √(2/a)·√(30/a⁵)∫x(a − x) sen(nπx/a) dx<br><b>cₙ = 8√15/(nπ)³ (n ímpar), 0 (n par)</b><br>P(E₁) = 960/π⁶ = <b>0,99855</b><small>⟨H⟩ = Σ|cₙ|²Eₙ = (480/π⁴)E₁·Σ₍ímpar₎1/n⁴ = 5ℏ²/(ma²) = 1,013 E₁</small>` : `cₙ = ∫ψₙ(x)Ψ(x,0) dx (integração numérica)<br><b>c₁ = ${fmt(all[0].re, 4)} · c₂ = ${fmt(all[1].re, 4)} · c₃ = ${fmt(all[2].re, 4)}</b><small>Σ|cₙ|² com 15 termos: ${fmt(stAll.norm, 4)}</small>`,
      metrics: [["condição inicial", init.name], ["termos N", N], ["Σ|cₙ|² (N termos)", fmt(st.norm, 4)], ["⟨H⟩ (N termos)", `${fmt(st.energy, 3)} E₁`], ["P(E₁)", fmt(all[0].re ** 2, 4)], ["P(E₂)", fmt(all[1].re ** 2, 4)]],
      conceptTitle: "Truque de Fourier",
      concept: "Multiplicar Ψ(x,0) = Σcₙψₙ por ψₘ e integrar mata todos os termos menos um, pela ortonormalidade: cₘ = ⟨m|Ψ(0)⟩. É a projeção de um vetor sobre uma base ortonormal, como vₓ = x̂·v. Depois, cada termo evolui com sua fase: Ψ(x,t) = Σcₙψₙe^(−iEₙt/ℏ). Σ|cₙ|² = 1 é a normalização e |cₙ|² é a probabilidade de medir Eₙ.",
      prompts: ["Parábola, N = 1: quanto da função já está em ψ₁? Suba N: a soma muda visivelmente?", "Toque a animação com a parábola: por que |Ψ|² quase não se mexe? E com o degrau?", "Troque para o degrau e leia Σ|cₙ|² com 15 termos: por que falta tanto? Olhe as bordas da soma dourada.", "Compare ⟨H⟩ das três funções: qual custa mais energia e por quê?"],
      legend: [[C.gray, "Ψ(x,0)", true], [C.gold, "soma em t = 0"], [C.green, "Re Ψ(x,t)"], [C.blue, "|Ψ(x,t)|²"]] });
  }

  // ================================================================ 05 · revivência
  function revKey() { return `${v("revU0")}|${v("revW")}|${v("revK")}`; }
  function revEnsure() {
    const key = revKey(); if (state.rev.key === key) return;
    const coeffs = P.packetCoefficients(v("revU0"), v("revW"), v("revK"), 70, 600), nu = 200, nt = 240, data = P.carpet(coeffs, nu, nt, P.revivalTime());
    const sorted = Float32Array.from(data).sort(), max = sorted[Math.floor(sorted.length * .995)] || 1;
    const off = document.createElement("canvas"); off.width = nu; off.height = nt; const octx = off.getContext("2d"), img = octx.createImageData(nu, nt);
    const cmap = (q) => { const s = Math.pow(Math.min(1, q), .7); const stops = [[16, 24, 32], [38, 70, 83], [69, 123, 157], [97, 155, 96], [131, 196, 78], [233, 220, 120]]; const f = s * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), u = f - i; return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * u)); };
    for (let j = 0; j < nt; j += 1) for (let i = 0; i < nu; i += 1) { const [r, g, b] = cmap(data[j * nu + i] / max), o = 4 * (j * nu + i); img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
    octx.putImageData(img, 0, 0);
    state.rev = { key, coeffs, carpet: data, image: off };
  }
  function drawRevival() {
    revEnsure();
    const u0 = v("revU0"), w = v("revW"), k0 = v("revK"), f = v("revT"), T = P.revivalTime(), t = f * T, coeffs = state.rev.coeffs;
    set("revU0Out", fmt(u0, 2)); set("revWOut", fmt(w, 3)); set("revKOut", fmt(k0, 0)); set("revTOut", fmt(f, 3));
    const dens = samples(0, 1, 500, (u) => P.packetPsi(coeffs, u, t).density), init = samples(0, 1, 300, (u) => P.packetPsi(coeffs, u, 0).density);
    const top = Math.max(...init.map((p) => p.y)) * 1.15;
    const main = canvas("mainCanvas", .5), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.06, 1.06, 0, top, "posição u = x/a", "|Ψ(x,t)|²", { xDigits: 1, noY: true });
    walls(ch, 0, 1);
    line(ch, init, C.gray, [4, 4], 1.4, .7);
    area(ch, dens, "rgba(69,123,157,.25)"); line(ch, dens, C.blue, [], 2.4);
    const named = [[0, "início"], [.25, "T/4: duas cópias"], [.5, "T/2: espelhado"], [1, "revivência"]].find(([q]) => Math.abs(q - f) < .004);
    if (named) label(ch.ctx, named[1], (ch.left + ch.right) / 2, ch.top + 16, C.red, "center", "bold 13px Ubuntu, system-ui");
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, box = { left: 54, right: sec.w - 16, top: 14, bottom: sec.h - 30 };
    ctx.imageSmoothingEnabled = true; ctx.drawImage(state.rev.image, box.left, box.top, box.right - box.left, box.bottom - box.top);
    const Yt = (q) => box.top + q * (box.bottom - box.top);
    [[.25, "T/4"], [.5, "T/2"], [.75, "3T/4"], [1, "T_rev"]].forEach(([q, s]) => { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(box.left, Yt(q)); ctx.lineTo(box.right, Yt(q)); ctx.stroke(); ctx.setLineDash([]); label(ctx, s, box.left - 6, Yt(q) + 4, C.gray, "right", "10px Ubuntu, system-ui"); });
    ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(box.left, Yt(f)); ctx.lineTo(box.right, Yt(f)); ctx.stroke();
    label(ctx, "0", box.left - 6, box.top + 4, C.gray, "right", "10px Ubuntu, system-ui");
    label(ctx, "x = 0", box.left, box.bottom + 14, C.gray, "left", "10px Ubuntu, system-ui"); label(ctx, "x = a", box.right, box.bottom + 14, C.gray, "right", "10px Ubuntu, system-ui");
    label(ctx, "posição →   tempo ↓", (box.left + box.right) / 2, box.bottom + 14, C.gray, "center", "10px Ubuntu, system-ui");
    const nBar = coeffs.reduce((s, c) => s + (c.re ** 2 + c.im ** 2) * c.n * c.n, 0), sigma = Math.sqrt(coeffs.reduce((s, c) => s + (c.re ** 2 + c.im ** 2) * c.n ** 4, 0) - nBar * nBar);
    texts({ status: "Revivência", detail: `t = ${fmt(f, 3)} T_rev`, title: "O pacote se desfaz… e renasce", subtitle: "como Eₙ = n²E₁, todas as fases voltam juntas em T_rev = 2πℏ/E₁",
      caption: "Um pacote gaussiano estreito, lançado contra a parede, se reflete, se espalha pelo poço e parece perdido — mas em T_rev reaparece exatamente como começou. Em T_rev/2 ele volta espelhado em torno do centro; em T_rev/4, dividido em duas cópias. Cinza tracejado: o pacote inicial.",
      secondaryTitle: "Tapete quântico: |Ψ(x,t)|² de 0 a T_rev", secondarySubtitle: "cada linha é um instante; a linha vermelha é o instante atual",
      secondaryCaption: "O desenho de canais e cruzamentos é a interferência entre os ~" + Math.round(sigma) + " níveis que compõem o pacote. Ele se repete com período T_rev e tem simetria de espelho em T_rev/2 — um padrão parecido com o efeito Talbot da óptica.",
      prediction: "Depois de o pacote se espalhar por todo o poço, ele volta a se juntar? Em que instante?",
      calculation: `fases e<sup>−in²E₁t/ℏ</sup> = 1 para todo n<br>quando E₁t/ℏ = 2π<br><b>T_rev = 2πℏ/E₁ = 4ma²/(πℏ)</b><small>Ψ(x, T/2) = −Ψ(a − x, 0) (espelhado)</small>`,
      metrics: [["t / T_rev", fmt(f, 3)], ["níveis com peso relevante", `≈ ${Math.round(sigma * 2.5)} (n̄² ≈ ${fmt(nBar, 0)})`], ["Σ|cₙ|² (70 níveis)", fmt(coeffs.reduce((s, c) => s + c.re ** 2 + c.im ** 2, 0), 4)], ["para um elétron em 1 nm", "T_rev ≈ 11 fs"]],
      concept: "A revivência é um efeito puramente ondulatório: depende de as energias serem múltiplos inteiros de E₁. Uma partícula clássica quicando nunca 'renasce' assim. Revivências são observadas em pacotes de onda em átomos de Rydberg e em moléculas.",
      prompts: ["Toque a animação e marque os instantes em que o pacote parece desaparecer.", "Use os presets T/4, T/2 e T_rev: descreva o que vê em cada um.", "Aumente w: o tapete fica mais simples ou mais complexo? Por quê? (Pense em quantos níveis o pacote usa.)"],
      legend: [[C.blue, "|Ψ(x,t)|²"], [C.gray, "pacote inicial", true]] });
  }

  // ================================================================ 06 · física médica
  function spectrumBar(sec, marker, extras) {
    const ctx = sec.ctx, x0 = 54, x1 = sec.w - 16, y0 = 34, y1 = sec.h - 46, X = (nm) => x0 + (nm - 300) * (x1 - x0) / (1000 - 300);
    for (let nm = 300; nm < 1000; nm += 2) { ctx.fillStyle = spectralColor(nm); ctx.globalAlpha = nm >= 380 && nm <= 750 ? .85 : .35; ctx.fillRect(X(nm), y0, X(nm + 2) - X(nm) + .5, y1 - y0); }
    ctx.globalAlpha = 1;
    const band = (a, b, color, text, row) => { ctx.fillStyle = color; ctx.fillRect(X(a), y1 + 4 + row * 12, X(b) - X(a), 8); label(ctx, text, X(a) - 6, y1 + 11 + row * 12, C.ink, "right", "10px Ubuntu, system-ui"); };
    band(P.OPTICAL.window[0], P.OPTICAL.window[1], "rgba(97,155,96,.8)", "janela óptica do tecido", 0);
    band(P.OPTICAL.pdt[0], P.OPTICAL.pdt[1], "rgba(198,92,75,.8)", "terapia fotodinâmica", 1);
    ctx.strokeStyle = "rgba(97,155,96,.9)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(X(P.OPTICAL.window[0]), y0, X(P.OPTICAL.window[1]) - X(P.OPTICAL.window[0]), y1 - y0); ctx.setLineDash([]);
    extras.forEach(([name, nm], i) => { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(nm), y0); ctx.lineTo(X(nm), y1); ctx.stroke(); label(ctx, name, X(nm), y0 - 4 - (i % 2) * 11, C.ink, "center", "10px Ubuntu, system-ui"); });
    for (let nm = 300; nm <= 1000; nm += 100) label(ctx, nm === 1000 ? "1000 nm" : `${nm}`, X(nm), y1 + 36, C.gray, nm === 1000 ? "right" : "center", "10px Ubuntu, system-ui");
    if (marker > 300 && marker < 1000) { arrow(ctx, X(marker), y0 - 2, X(marker), y1 - 2, C.ink, 3); glow(ctx, X(marker), (y0 + y1) / 2, "rgba(255,255,255,.95)", 12); label(ctx, `modelo: ${fmt(marker, 0)} nm`, X(marker) + 8, (y0 + y1) / 2 + 4, C.ink, "left", "bold 12px Ubuntu, system-ui"); }
  }
  function photonWave(ctx, x0, y0, x1, y1, color, progress) {
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, end = len * Math.min(1, progress);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let s = 0; s <= end; s += 2) { const a = 6 * Math.sin(s / 6), x = x0 + ux * s - uy * a, y = y0 + uy * s + ux * a; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); if (progress < 1) glow(ctx, x0 + ux * end, y0 + uy * end, "rgba(255,240,180,.95)", 9);
  }
  function drawMedical() {
    const dyeMode = state.med.mode === "dye", ph = state.med.photon;
    $("dyeControls").hidden = !dyeMode; $("laserControls").hidden = dyeMode;
    $("medDye").classList.toggle("on", dyeMode); $("medLaser").classList.toggle("on", !dyeMode);
    const main = canvas("mainCanvas", .5), ctx = main.ctx, sec = canvas("secondaryCanvas", .34);
    if (dyeMode) {
      const N = v("dyeN"), d = P.dye(N), color = spectralColor(d.wavelength);
      set("dyeNOut", N);
      // cadeia conjugada em zigue-zague
      const cx0 = main.w * .14, cx1 = main.w * .62, cy = 40, atoms = N + 1;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < atoms; i += 1) { const x = cx0 + (cx1 - cx0) * i / (atoms - 1), y = cy + (i % 2 ? 9 : -9); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      for (let i = 0; i < atoms; i += 1) { const x = cx0 + (cx1 - cx0) * i / (atoms - 1), y = cy + (i % 2 ? 9 : -9); dot(ctx, x, y, i === 0 || i === atoms - 1 ? C.blue : C.ink, 3.5); }
      label(ctx, `cadeia conjugada · L = ${fmt(d.length, 2)} nm`, (cx0 + cx1) / 2, cy + 30, C.gray, "center", "11px Ubuntu, system-ui");
      // poço com níveis e elétrons
      const bx0 = cx0, bx1 = cx1, by0 = 82, by1 = main.h - 22, levels = d.lumo + 1, Emax = levels * levels, Y = (k) => by1 - (k * k / Emax) * (by1 - by0) * .92;
      ctx.fillStyle = "rgba(38,49,45,.08)"; ctx.fillRect(bx0 - 14, by0, 14, by1 - by0); ctx.fillRect(bx1, by0, 14, by1 - by0);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx0, by1); ctx.lineTo(bx1, by1); ctx.lineTo(bx1, by0); ctx.stroke();
      const jump = ph >= 0 ? Math.min(1, Math.max(0, (ph - .55) / .45)) : 0;
      for (let k = 1; k <= levels; k += 1) {
        const y = Y(k), filled = k <= d.homo; ctx.strokeStyle = k === d.homo ? C.blue : k === d.lumo ? C.red : C.faint; ctx.lineWidth = k === d.homo || k === d.lumo ? 2.4 : 1.4;
        ctx.beginPath(); ctx.moveTo(bx0 + 6, y); ctx.lineTo(bx1 - 6, y); ctx.stroke();
        label(ctx, k === d.homo ? `n=${k} (HOMO)` : k === d.lumo ? `n=${k} (LUMO)` : `n=${k}`, bx1 + 20, y + 4, k === d.homo ? C.blue : k === d.lumo ? C.red : C.gray, "left", "10px Ubuntu, system-ui");
        if (filled) { const xm = (bx0 + bx1) / 2; const up = !(k === d.homo && jump > 0); if (up) dot(ctx, xm - 8, y, C.ink, 4); dot(ctx, xm + 8, y, C.ink, 4); }
      }
      if (jump > 0) { const xm = (bx0 + bx1) / 2 - 8, y = Y(d.homo) + (Y(d.lumo) - Y(d.homo)) * jump; glow(ctx, xm, y, "rgba(198,92,75,.6)", 12); dot(ctx, xm, y, C.red, 4.5); }
      arrow(ctx, (bx0 + bx1) / 2 + 40, Y(d.homo) - 3, (bx0 + bx1) / 2 + 40, Y(d.lumo) + 6, C.ink, 2);
      label(ctx, `ΔE = ${fmt(d.gap, 2)} eV`, (bx0 + bx1) / 2 + 48, (Y(d.homo) + Y(d.lumo)) / 2 + 4, C.ink, "left", "bold 11px Ubuntu, system-ui");
      if (ph >= 0) photonWave(ctx, main.w * .97, by0 + 10, (bx0 + bx1) / 2 - 8, Y(d.homo), color, ph / .55);
      // amostra de cor absorvida e transmitida
      ctx.fillStyle = color; ctx.fillRect(main.w * .8, by0 + 30, 46, 46); label(ctx, "absorve", main.w * .8 + 23, by0 + 92, C.gray, "center", "10px Ubuntu, system-ui");
      spectrumBar(sec, d.wavelength, P.OPTICAL.dyes);
      const inWin = d.wavelength >= P.OPTICAL.window[0] && d.wavelength <= P.OPTICAL.window[1];
      texts({ status: "Física médica", detail: `corante · N = ${N} · λ = ${fmt(d.wavelength, 0)} nm`, title: "Corantes conjugados: o poço infinito decide a cor", subtitle: "elétrons π livres ao longo da cadeia, presos entre as pontas da molécula",
        caption: `Os N elétrons π ocupam os níveis do poço, dois por nível (pontos pretos). Um fóton com energia ΔE = E_LUMO − E_HOMO promove um elétron do último nível ocupado (HOMO) para o primeiro vazio (LUMO): é a absorção. Use “Disparar fóton” para ver a transição.`,
        secondaryTitle: "Onde a absorção cai no espectro", secondarySubtitle: "marcas brancas: corantes reais usados em imagem (valores aproximados)",
        secondaryCaption: "Entre ≈ 650 e 950 nm, hemoglobina e água absorvem pouco e a luz penetra milímetros a centímetros no tecido: é a janela óptica usada em imagem por fluorescência (Cy5, Cy7, verde de indocianina — ICG — em angiografia) e na terapia fotodinâmica (≈ 630–690 nm).",
        prediction: "Alongar a cadeia (mais elétrons π) desloca a absorção para o azul ou para o vermelho?",
        calculation: `L = N · 0,139 nm = ${fmt(d.length, 3)} nm<br>ΔE = h²(N+1)/(8mL²) = <b>${fmt(d.gap, 3)} eV</b><br>λ = hc/ΔE = <b>${fmt(d.wavelength, 0)} nm</b><small>${inWin ? "dentro da janela óptica do tecido" : d.wavelength < P.OPTICAL.window[0] ? "abaixo da janela: absorvida e espalhada pelo tecido" : "acima da janela: a água absorve"}</small>`,
        metrics: [["elétrons π (N)", N], ["comprimento L", `${fmt(d.length, 2)} nm`], ["HOMO → LUMO", `${d.homo} → ${d.lumo}`], ["ΔE", `${fmt(d.gap, 3)} eV`], ["λ de absorção", `${fmt(d.wavelength, 0)} nm`], ["na janela óptica?", inWin ? "sim" : "não"]],
        conceptTitle: "Modelo do elétron livre",
        concept: "Como L ∝ N, ΔE ∝ (N+1)/N² cai quando a cadeia cresce: cada unidade −CH=CH− a mais desloca a absorção ~120 nm para o vermelho, a mesma tendência da 'regra dos 100 nm' das cianinas. O modelo é grosseiro (ignora as pontas e a alternância de ligações), mas acerta a ordem de grandeza e a tendência — é por isso que corantes para o infravermelho próximo têm cadeias longas.",
        prompts: ["Encontre os valores de N que põem a absorção na janela óptica do tecido.", "De N = 10 para 12, quanto a absorção se desloca? Compare com a distância entre Cy5 e Cy7.", "Por que um corante para imagem profunda precisa absorver acima de ~650 nm?"],
        legend: [[C.blue, "HOMO"], [C.red, "LUMO"], [color, "fóton absorvido"]] });
    } else {
      const a = v("qwA"), q = P.quantumWellLaser(a), color = spectralColor(q.wavelength);
      set("qwAOut", `${fmt(a, 1)} nm`);
      const x0 = main.w * .08, x1 = main.w * .66, xa = x0 + (x1 - x0) * .32, xb = x0 + (x1 - x0) * .68, yc = main.h * .2, yv = main.h * .78, depth = main.h * .12, scale = depth / .35;
      ctx.lineWidth = 3; ctx.strokeStyle = C.blue; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(xa, yc); ctx.lineTo(xa, yc + depth); ctx.lineTo(xb, yc + depth); ctx.lineTo(xb, yc); ctx.lineTo(x1, yc); ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(x0, yv); ctx.lineTo(xa, yv); ctx.lineTo(xa, yv - depth * .6); ctx.lineTo(xb, yv - depth * .6); ctx.lineTo(xb, yv); ctx.lineTo(x1, yv); ctx.stroke();
      label(ctx, "banda de condução", x0, yc - 8, C.blue, "left", "11px Ubuntu, system-ui"); label(ctx, "banda de valência", x0, yv + 18, C.red, "left", "11px Ubuntu, system-ui");
      label(ctx, "AlGaAs", (x0 + xa) / 2, (yc + yv) / 2, C.gray, "center", "11px Ubuntu, system-ui"); label(ctx, "AlGaAs", (xb + x1) / 2, (yc + yv) / 2, C.gray, "center", "11px Ubuntu, system-ui");
      label(ctx, `GaAs · a = ${fmt(a, 1)} nm`, (xa + xb) / 2, (yc + yv) / 2 + 30, C.ink, "center", "bold 11px Ubuntu, system-ui");
      const ye = yc + depth - Math.min(depth * .9, q.electron * scale), yh = yv - depth * .6 + Math.min(depth * .5, q.hole * scale * 3);
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xa, ye); ctx.lineTo(xb, ye); ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(xa, yh); ctx.lineTo(xb, yh); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i <= 60; i += 1) { const x = xa + (xb - xa) * i / 60, y = ye - 14 * Math.sin(Math.PI * i / 60); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); for (let i = 0; i <= 60; i += 1) { const x = xa + (xb - xa) * i / 60, y = yh + 14 * Math.sin(Math.PI * i / 60); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      label(ctx, `E₁ elétron = ${fmt(q.electron * 1000, 0)} meV`, xb + 8, ye + 4, C.blue, "left", "10px Ubuntu, system-ui"); label(ctx, `E₁ buraco = ${fmt(q.hole * 1000, 0)} meV`, xb + 8, yh + 4, C.red, "left", "10px Ubuntu, system-ui");
      const fall = ph >= 0 ? Math.min(1, ph / .45) : 0, xm = (xa + xb) / 2;
      dot(ctx, xm, ye + (yh - ye) * fall, C.blue, 5); dot(ctx, xm, yh, C.red, 5);
      arrow(ctx, xm - 26, ye + 3, xm - 26, yh - 4, C.ink, 2);
      label(ctx, `${fmt(q.photon, 3)} eV`, xm - 32, (ye + yh) / 2 + 4, C.ink, "right", "bold 11px Ubuntu, system-ui");
      if (ph >= .45) photonWave(ctx, xm + 10, (ye + yh) / 2, main.w * .97, (ye + yh) / 2 - 40, color, (ph - .45) / .55);
      ctx.fillStyle = color; ctx.fillRect(main.w * .82, main.h * .62, 46, 46); label(ctx, "emite", main.w * .82 + 23, main.h * .62 + 62, C.gray, "center", "10px Ubuntu, system-ui");
      spectrumBar(sec, q.wavelength, [["808 nm", 808], ["GaAs", q.bulk]]);
      texts({ status: "Física médica", detail: `laser · a = ${fmt(a, 1)} nm · λ = ${fmt(q.wavelength, 0)} nm`, title: "Laser de diodo: a largura do poço escolhe a cor", subtitle: "elétron e buraco confinados numa camada de GaAs entre barreiras de AlGaAs",
        caption: "Numa camada fina de GaAs, elétrons (banda de condução) e buracos (banda de valência) ficam presos como no poço infinito, cada um com sua energia de confinamento ∝ 1/(m* a²). Quando um elétron cai e se recombina com um buraco, sai um fóton com E_g + E₁ₑ + E₁ₕ. “Disparar fóton” mostra a emissão.",
        secondaryTitle: "Comprimento de onda emitido", secondarySubtitle: "808 nm: laser de diodo usado em fotobiomodulação e em depilação a laser",
        secondaryCaption: "Lasers de diodo de poço quântico em ~800–810 nm são comuns em medicina: fotobiomodulação (laserterapia de baixa potência), depilação, odontologia. A luz cai na janela óptica e penetra no tecido. Estreitar o poço encurta o comprimento de onda, até chegar ao visível.",
        prediction: "Estreitar o poço desloca a emissão para o azul ou para o vermelho? Por que o buraco contribui menos que o elétron?",
        calculation: `E₁ = h²/(8m*a²)<br>elétron (m* = 0,067 mₑ): ${fmt(q.electron, 3)} eV · buraco (0,51 mₑ): ${fmt(q.hole, 4)} eV<br>E = 1,424 + ${fmt(q.electron + q.hole, 3)} = <b>${fmt(q.photon, 3)} eV</b><br>λ = hc/E = <b>${fmt(q.wavelength, 0)} nm</b><small>sem confinamento (GaAs volumétrico): ${fmt(q.bulk, 0)} nm</small>`,
        metrics: [["largura a", `${fmt(a, 1)} nm`], ["E₁ do elétron", `${fmt(q.electron * 1000, 0)} meV`], ["E₁ do buraco", `${fmt(q.hole * 1000, 1)} meV`], ["energia do fóton", `${fmt(q.photon, 3)} eV`], ["λ emitido", `${fmt(q.wavelength, 0)} nm`]],
        conceptTitle: "Engenharia de poço quântico",
        concept: "O confinamento soma energia ao gap do material: quanto mais estreita a camada, maior E₁ ∝ 1/(m*a²) e mais curto o comprimento de onda. O buraco pesado (m* maior) contribui menos. Como as barreiras reais são finitas, o modelo de paredes infinitas exagera um pouco as energias, mas dá a ordem de grandeza certa.",
        prompts: ["Encontre a largura que dá ~808 nm.", "Compare a = 4 nm e a = 20 nm: quanto muda a energia do fóton? E com a muito grande?", "Por que a massa efetiva do elétron (0,067 mₑ) torna o confinamento tão importante?"],
        legend: [[C.blue, "elétron"], [C.red, "buraco"], [color, "fóton emitido"]] });
    }
  }

  // ---------------------------------------------------------------- animação e eventos
  const draws = { spectrum: drawSpectrum, measure: drawMeasure, superposition: drawSuperposition, expansion: drawExpansion, revival: drawRevival, medical: drawMedical };
  const render = () => draws[view]();
  const playIds = { spectrum: "specT", superposition: "supT", expansion: "expT", revival: "revT" };
  const speeds = { specT: .22, supT: .25, expT: .3, revT: .04 };
  let raf = 0;
  const busy = () => state.playing || (view === "measure" && (state.meas.streaming || state.meas.drops.length)) || (view === "medical" && state.med.photon >= 0);
  function kick() { if (!raf) { state.last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0; const dt = Math.max(0, Math.min(.05, (now - state.last) / 1000)); state.last = now;
    if (state.playing) { const s = $(state.playing); let next = Number(s.value) + dt * speeds[state.playing] * (Number(s.max) > 1.5 ? 1 : 1); if (next > Number(s.max)) next = 0; s.value = next.toFixed(4); }
    if (view === "measure") {
      if (state.meas.streaming) for (let i = 0; i < 3; i += 1) state.meas.drops.push({ x: P.samplePosition(v("measN")), age: 0 });
      state.meas.drops.forEach((d) => { d.age += dt; if (d.age >= .45 && !d.counted) { d.counted = true; state.meas.samples.push(d.x); } });
      if (state.meas.drops.some((d) => d.counted)) addSamples(0);
      state.meas.drops = state.meas.drops.filter((d) => d.age < 1.25);
    }
    if (view === "medical" && state.med.photon >= 0) { state.med.photon += dt / 1.6; if (state.med.photon > 1.3) state.med.photon = -1; }
    render();
    if (busy()) raf = requestAnimationFrame(frame);
  }
  function setPlaying(id) {
    state.playing = id;
    document.querySelectorAll("[data-play]").forEach((b) => { b.textContent = b.dataset.play === id ? "❚❚ Pausar" : "▶ Animar"; });
    if (id) kick();
  }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "spectrum";
    document.querySelectorAll("[data-view]").forEach((b) => { const a = b.dataset.view === view; b.classList.toggle("active", a); b.setAttribute("aria-selected", String(a)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) {}
    state.meas.streaming = false; updateStream(); state.med.photon = -1;
    setPlaying(!reducedMotion && playIds[view] ? playIds[view] : null);
    render(); if (busy()) kick();
  }
  const defaults = { spectrum: { specN: 2, specL: 1, specT: 0 }, measure: { measN: 1, measB: .25 }, superposition: { supM: 1, supN: 2, supP: .5, supA: 0, supT: 0 }, expansion: { expInit: "parabola", expN: 3, expT: 0 }, revival: { revU0: .3, revW: .05, revK: 30, revT: 0 }, medical: { dyeN: 10, qwA: 8 } };
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll("[data-view]")], i = tabs.findIndex((t) => t.dataset.view === view);
    const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view);
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", () => { if (el.id === "measN" || el.id === "measB") { const keep = state.meas.streaming; measClear(); state.meas.streaming = keep; updateStream(); } render(); }));
  document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => setPlaying(state.playing === b.dataset.play ? null : b.dataset.play)));
  document.querySelectorAll("[data-zero]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.zero).value = 0; render(); }));
  document.querySelectorAll("[data-sup]").forEach((b) => b.addEventListener("click", () => { const [m, n, p, al] = b.dataset.sup.split(","); $("supM").value = m; $("supN").value = n; $("supP").value = p; $("supA").value = al; $("supT").value = 0; render(); }));
  document.querySelectorAll("[data-revt]").forEach((b) => b.addEventListener("click", () => { setPlaying(null); $("revT").value = b.dataset.revt; render(); }));
  document.querySelectorAll("[data-shots]").forEach((b) => b.addEventListener("click", () => { addSamples(Number(b.dataset.shots)); render(); }));
  $("measStream").addEventListener("click", () => { state.meas.streaming = !state.meas.streaming; updateStream(); kick(); });
  $("measClear").addEventListener("click", () => { measClear(); render(); });
  $("medDye").addEventListener("click", () => { state.med.mode = "dye"; render(); });
  $("medLaser").addEventListener("click", () => { state.med.mode = "laser"; render(); });
  $("medPhoton").addEventListener("click", () => { state.med.photon = 0; kick(); });
  $("resetBtn").addEventListener("click", () => {
    Object.entries(defaults[view]).forEach(([id, value]) => { $(id).value = value; });
    if (view === "measure") measClear();
    render();
  });
  new URLSearchParams(location.search).forEach((value, key) => { const el = $(key); if (el && key !== "view" && (el.tagName === "INPUT" || el.tagName === "SELECT")) el.value = value; });
  window.addEventListener("resize", render);
  switchView(view);
})();
