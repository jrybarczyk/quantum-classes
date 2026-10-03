(function () {
  "use strict";
  const P = window.QuantumPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["separation", "stationary", "eigen", "twolevel", "vmin"];
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let view = new URLSearchParams(location.search).get("view");
  if (!VIEWS.includes(view)) view = "separation";

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
    return { ctx, w, h };
  }
  // Eixos dentro de uma região {x, y, w, h} do canvas.
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 52, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    for (let i = 0; i <= (o.ticks ?? 5); i += 1) {
      const n = o.ticks ?? 5, x = xMin + i * (xMax - xMin) / n, y = yMin + i * (yMax - yMin) / n;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? 1), X(x), bottom + 14);
      ctx.textAlign = "right"; ctx.fillText(fmt(y, o.yDigits ?? 1), left - 6, Y(y) + 3);
    }
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom, xMin, xMax, yMin, yMax };
  }
  function clip(chart, draw) { const c = chart.ctx; c.save(); c.beginPath(); c.rect(chart.left, chart.top, chart.right - chart.left, chart.bottom - chart.top); c.clip(); draw(c); c.restore(); }
  function line(chart, pts, color, dash = [], width = 2.6, alpha = 1) {
    clip(chart, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(chart.X(p.x), chart.Y(p.y)) : c.moveTo(chart.X(p.x), chart.Y(p.y)))); c.stroke(); });
  }
  function area(chart, pts, color, base = 0) {
    clip(chart, (c) => { c.fillStyle = color; c.beginPath(); c.moveTo(chart.X(pts[0].x), chart.Y(base)); pts.forEach((p) => c.lineTo(chart.X(p.x), chart.Y(p.y))); c.lineTo(chart.X(pts[pts.length - 1].x), chart.Y(base)); c.closePath(); c.fill(); });
  }
  function dot(ctx, x, y, color, r = 5) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function arrow(ctx, x1, y1, x2, y2, color, width = 3) {
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = 8; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)); ctx.lineTo(x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
  }
  function walls(chart, from, to) {
    const c = chart.ctx; c.fillStyle = "rgba(38,49,45,.10)";
    c.fillRect(chart.left, chart.top, chart.X(from) - chart.left, chart.bottom - chart.top); c.fillRect(chart.X(to), chart.top, chart.right - chart.X(to), chart.bottom - chart.top);
    c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(chart.X(from), chart.top); c.lineTo(chart.X(from), chart.bottom); c.moveTo(chart.X(to), chart.top); c.lineTo(chart.X(to), chart.bottom); c.stroke();
  }
  // Fita colorida pela fase de Ψ (matiz = arg Ψ), como na aula 2.
  function phaseStrip(chart, xs, phases, y) {
    const c = chart.ctx;
    for (let i = 1; i < xs.length; i += 1) {
      c.strokeStyle = `hsl(${((phases[i] % TAU) + TAU) % TAU * 180 / Math.PI} 62% 48%)`; c.lineWidth = 7;
      c.beginPath(); c.moveTo(chart.X(xs[i - 1]), y); c.lineTo(chart.X(xs[i]), y); c.stroke();
    }
  }
  function phasor(ctx, cx, cy, r, angle, length, color, labelText) {
    const x = cx + r * length * Math.cos(angle), y = cy - r * length * Math.sin(angle);
    arrow(ctx, cx, cy, x, y, color, 3); if (labelText) label(ctx, labelText, x + 6 * Math.sign(Math.cos(angle) || 1), y - 6, color, Math.cos(angle) >= 0 ? "left" : "right");
  }

  // ---------------------------------------------------------------- textos
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
    counts: { 1: 0, 2: 0 },
    vmin: { psi: null, history: [], relaxing: false, tau: 0 },
  };
  const grid = P.makeGrid();

  // ================================================================ 01 · separação
  function drawSeparation() {
    const n = v("sepN"), t = v("sepT"), E = P.energyLevel(n), T = P.phase(E, t);
    set("sepNOut", n); set("sepTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), chart = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -Math.PI, Math.PI, -.75, .85, "coordenada periódica θ", "Ψ(θ,t)", { xLabels: (x) => fmt(x / Math.PI, 1) + "π" });
    area(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringDensity(th, n)), "rgba(69,123,157,.13)");
    line(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringWave(th, n) * T.re), C.green);
    line(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringWave(th, n) * T.im), C.gold, [7, 4], 2.2);
    const xs = samples(-Math.PI, Math.PI, 240, (x) => x).map((p) => p.x);
    phaseStrip(chart, xs, xs.map((th) => (P.ringWave(th, n) >= 0 ? 0 : Math.PI) - E * t), chart.Y(.78));
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, cx = sec.w * .3, cy = sec.h / 2, r = Math.min(sec.w * .2, sec.h * .38);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.moveTo(cx - r - 14, cy); ctx.lineTo(cx + r + 14, cy); ctx.moveTo(cx, cy - r - 14); ctx.lineTo(cx, cy + r + 14); ctx.stroke();
    for (let k = 24; k >= 1; k -= 1) { const a = -E * (t - k * .02); dot(ctx, cx + r * Math.cos(a), cy - r * Math.sin(a), `rgba(97,155,96,${.5 * (1 - k / 25)})`, 3); }
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(cx + r * T.re, cy - r * T.im); ctx.lineTo(cx + r * T.re, cy); ctx.moveTo(cx + r * T.re, cy - r * T.im); ctx.lineTo(cx, cy - r * T.im); ctx.stroke(); ctx.setLineDash([]);
    phasor(ctx, cx, cy, r, -E * t, 1, C.green, "T(t)");
    dot(ctx, cx + r * T.re, cy, C.green, 4); dot(ctx, cx, cy - r * T.im, C.gold, 4);
    label(ctx, "Re", cx + r + 18, cy + 4); label(ctx, "Im", cx + 6, cy - r - 16);
    // à direita: Re T e Im T no tempo, a "sombra" do fasor
    const wave = axes(sec, { x: sec.w * .55, y: 0, w: sec.w * .45, h: sec.h }, 0, 6.28, -1.1, 1.1, "t (ℏ/E₁)", "T(t)", { ticks: 4 });
    line(wave, samples(0, 6.28, 300, (s) => Math.cos(E * s)), C.green, [], 1.6, .55);
    line(wave, samples(0, 6.28, 300, (s) => -Math.sin(E * s)), C.gold, [6, 4], 1.6, .55);
    dot(ctx, wave.X(t), wave.Y(T.re), C.green, 5); dot(ctx, wave.X(t), wave.Y(T.im), C.gold, 5);
    texts({ status: "Separação", detail: `n = ${n} · Eₙ = ${E}E₁`, title: "Separação em um sistema periódico", subtitle: "a forma espacial fica; só o fator temporal gira",
      caption: "Verde: Re Ψ; dourado: Im Ψ; azul claro: |Ψ|². A fita no alto é colorida pela fase de Ψ: a cor toda gira junto, porque a fase temporal é a mesma em todo θ. Onde ψₙ troca de sinal, a cor salta meia volta.",
      secondaryTitle: "Fator temporal no plano complexo", secondarySubtitle: "T(t) = e^(−iEₙt/ℏ) gira com |T| = 1",
      secondaryCaption: "O fasor dá uma volta a cada 2πℏ/Eₙ; suas projeções nos eixos são Re T e Im T, desenhadas à direita no tempo. Níveis mais altos giram mais depressa.",
      prediction: "Se n passa de 1 para 3, o fasor gira mais rápido ou mais devagar? A densidade azul muda com o tempo?",
      calculation: `iℏ T′ = E T ⇒ T(t) = e<sup>−iEt/ℏ</sup><br><b>fase = −Eₙt/ℏ = −${fmt(E * t, 2)} rad</b><br><small>período 2πℏ/Eₙ = ${fmt(TAU / E, 3)} ℏ/E₁</small>`,
      metrics: [["n", n], ["Eₙ/E₁", E], ["|T(t)|²", "1,000"], ["período", `${fmt(TAU / E, 3)} ℏ/E₁`]],
      concept: "Com V independente do tempo, Ψ = ψ(x)T(t) separa a equação em duas: a espacial Hψ = Eψ e a temporal iℏT′ = ET. Toda a evolução fica num fator de fase de módulo 1.",
      prompts: ["Compare os períodos do fasor para n = 1, 2 e 3: a razão segue n²?", "Pare num instante em que Re Ψ some inteira: o que vale Im Ψ ali?", "Por que essa separação exigiria mudar se V dependesse de t?"],
      legend: [[C.green, "Re Ψ"], [C.gold, "Im Ψ", true], [C.blue, "|Ψ|²"]] });
  }

  // ================================================================ 02 · estacionário
  function drawStationary() {
    const n = v("statN"), t = v("statT"), E = P.energyLevel(n), T = P.phase(E, t);
    set("statNOut", n); set("statTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), chart = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -Math.PI, Math.PI, -.62, .62, "coordenada periódica θ", "Re Ψ e |Ψ|²", { xLabels: (x) => fmt(x / Math.PI, 1) + "π" });
    area(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringDensity(th, n)), "rgba(69,123,157,.22)");
    line(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringDensity(th, n)), C.blue, [], 2);
    for (let k = 8; k >= 1; k -= 1) line(chart, samples(-Math.PI, Math.PI, 240, (th) => P.ringWave(th, n) * Math.cos(E * (t - k * .045))), C.green, [], 1.4, .09 * (9 - k));
    line(chart, samples(-Math.PI, Math.PI, 360, (th) => P.ringWave(th, n) * T.re), C.green, [], 3);
    const sec = canvas("secondaryCanvas", .34), half = sec.w / 2;
    const d0 = axes(sec, { x: 0, y: 0, w: half, h: sec.h }, -Math.PI, Math.PI, 0, .36, "θ", "|Ψ|²", { ticks: 4, xLabels: (x) => fmt(x / Math.PI, 1) + "π", yDigits: 2 });
    line(d0, samples(-Math.PI, Math.PI, 300, (th) => P.ringDensity(th, n)), C.blue, [], 3);
    line(d0, samples(-Math.PI, Math.PI, 300, (th) => P.ringDensity(th, n)), C.gold, [7, 4], 2);
    // à direita: valor em θ = 0 no tempo — Re Ψ oscila, |Ψ|² é reta
    const tr = axes(sec, { x: half, y: 0, w: half, h: sec.h }, 0, 6.28, -.62, .62, "t (ℏ/E₁)", "em θ = 0", { ticks: 4 });
    line(tr, samples(0, 6.28, 300, (s) => P.ringWave(0, n) * Math.cos(E * s)), C.green, [], 1.6, .5);
    line(tr, [{ x: 0, y: P.ringDensity(0, n) }, { x: 6.28, y: P.ringDensity(0, n) }], C.blue, [], 2.2);
    dot(sec.ctx, tr.X(t), tr.Y(P.ringWave(0, n) * T.re), C.green, 5); dot(sec.ctx, tr.X(t), tr.Y(P.ringDensity(0, n)), C.blue, 5);
    texts({ status: "Estacionário", detail: `n = ${n} · densidade invariante`, title: "A função de onda oscila; a densidade não", subtitle: "autoestado de energia num domínio periódico",
      caption: "Re Ψ (verde) oscila sem parar, com um rastro dos instantes anteriores; |Ψ|² (azul) não se move. É o módulo quadrado que elimina a fase e^(−iEt/ℏ).",
      secondaryTitle: "Densidade em t = 0 e agora · valores em θ = 0", secondarySubtitle: "as duas densidades coincidem; Re Ψ(0,t) oscila",
      secondaryCaption: "À esquerda, |Ψ|² em t = 0 (azul) e no instante atual (tracejado), sempre sobrepostos. À direita, no ponto θ = 0, Re Ψ sobe e desce enquanto |Ψ|² é uma reta.",
      prediction: "“Estado estacionário” quer dizer Ψ constante ou |Ψ|² constante? O que o rastro verde responde?",
      calculation: `|Ψₙ|² = ψₙ*e<sup>+iEt/ℏ</sup>ψₙe<sup>−iEt/ℏ</sup><br><b>= |ψₙ|² ⇒ ∂ρ/∂t = 0</b><br><small>⟨H⟩ = Eₙ, ΔE = 0</small>`,
      metrics: [["nós em −π < θ < π", 2 * n], ["Re Ψ(0,t)", fmt(P.ringWave(0, n) * T.re, 3)], ["|Ψ(0,t)|²", fmt(P.ringDensity(0, n), 3)], ["ΔE", "0"]],
      concept: "Um autoestado de energia tem E definida (ΔE = 0) e evolui só por uma fase global. Todas as distribuições de observáveis sem dependência explícita em t ficam paradas, embora Ψ gire.",
      prompts: ["Pause em dois instantes e compare as curvas verdes: Ψ mudou?", "Leia |Ψ(0,t)|² em vários tempos.", "Antecipe a estação 4: o que mudaria com duas energias diferentes?"],
      legend: [[C.green, "Re Ψ (com rastro)"], [C.blue, "|Ψ|²"], [C.gold, "|Ψ|² agora", true]] });
  }

  // ================================================================ 03 · autovalor
  function drawEigen() {
    const n = v("eigN"), L = v("eigL"), t = v("eigT"), E = (k) => P.energyLevel(k, L), top = E(6) * 1.12;
    set("eigNOut", n); set("eigLOut", fmt(L, 2)); set("eigTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), chart = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.15, 1.95, 0, top, "posição x (L₀)", "energia (E₁ de L₀)", { xDigits: 2, yDigits: 0 });
    walls(chart, 0, L);
    for (let k = 1; k <= 6; k += 1) {
      const selected = k === n, base = E(k), amp = Math.min(top * .045, (E(Math.min(k + 1, 6)) - E(k)) * .4 || top * .04);
      line(chart, [{ x: 0, y: base }, { x: L, y: base }], selected ? C.green : C.faint, [], selected ? 2.4 : 1.4);
      line(chart, samples(0, L, 200, (x) => base + amp * P.boxWave(x / L, k) * Math.cos(E(k) * t)), selected ? C.green : C.gray, [], selected ? 2.4 : 1, selected ? 1 : .45);
      label(chart.ctx, `n=${k} · ${fmt(base, 1)}`, chart.X(L) + 8, chart.Y(base) + 4, selected ? C.green : C.gray, "left", selected ? "bold 11px Ubuntu, system-ui" : "10px Ubuntu, system-ui");
    }
    const sec = canvas("secondaryCanvas", .34), w = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, -.15, 1.95, -2.2, 2.2, "posição x (L₀)", `ψ${n}(x)`, { xDigits: 2, ticks: 4 });
    walls(w, 0, L);
    area(w, samples(0, L, 300, (x) => P.boxWave(x / L, n) ** 2 / L), "rgba(69,123,157,.18)");
    line(w, samples(0, L, 300, (x) => P.boxWave(x / L, n) / Math.sqrt(L) * Math.cos(E(n) * t)), C.green, [], 2.6);
    line(w, samples(0, L, 300, (x) => P.boxWave(x / L, n) / Math.sqrt(L)), C.green, [3, 4], 1.2, .5);
    line(w, samples(0, L, 300, (x) => -P.boxWave(x / L, n) / Math.sqrt(L)), C.green, [3, 4], 1.2, .5);
    texts({ status: "Autovalor", detail: `n = ${n} · L = ${fmt(L, 2)} L₀`, title: "Autovalores permitidos no poço", subtitle: "as paredes selecionam as energias Eₙ ∝ n²/L²",
      caption: "Cada nível traz sua autofunção desenhada na própria energia, oscilando com sua frequência Eₙ/ℏ: os níveis de cima vibram mais depressa. Só cabem ondas que zeram nas duas paredes.",
      secondaryTitle: `Autofunção do nível n = ${n}`, secondarySubtitle: "ψ(0) = ψ(L) = 0 · envoltória tracejada",
      secondaryCaption: "A onda estacionária respira entre as envoltórias ±ψₙ(x); a densidade (azul claro) não se move. n − 1 nós internos.",
      prediction: "Ao dobrar L, as energias caem por 2 ou por 4? O espaçamento entre níveis cresce ou diminui com n?",
      calculation: `Eₙ = n²π²ℏ²/(2mL²)<br><b>E${n} = ${fmt(E(n), 3)} E₁(L₀)</b><br><small>E${n + 1 > 6 ? 6 : n + 1} − E${n + 1 > 6 ? 5 : n} = ${fmt(n < 6 ? E(n + 1) - E(n) : E(6) - E(5), 3)}</small>`,
      metrics: [["n", n], ["L/L₀", fmt(L, 2)], ["Eₙ/E₁(L₀)", fmt(E(n), 3)], ["nós internos", n - 1]],
      concept: "Hψ = Eψ tem solução para qualquer E, mas só alguns valores satisfazem também as condições de contorno. São esses os autovalores: a quantização vem do contorno, não da equação sozinha.",
      prompts: ["Dobre L e confira o fator nas energias.", "Compare E₂ − E₁ com E₃ − E₂.", "Relacione n ao número de nós e à rapidez da oscilação."],
      legend: [[C.green, "nível selecionado"], [C.gray, "demais níveis"], [C.blue, "|ψₙ|²"]] });
  }

  // ================================================================ 04 · dois níveis
  function drawTwoLevel() {
    const p2 = v("twoP"), alpha = v("twoA"), t = v("twoT"), s = P.twoLevelEnergy(p2), meanX = P.twoLevelMeanX(t, p2, alpha);
    set("twoPOut", fmt(p2, 2)); set("twoAOut", `${fmt(alpha / Math.PI, 2)}π`); set("twoTOut", fmt(t, 2));
    const main = canvas("mainCanvas", .5), chart = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.12, 1.12, -2.2, 4.4, "posição u = x/L", "|Ψ|² e Re Ψ", { xDigits: 1 });
    walls(chart, 0, 1);
    const rho = samples(0, 1, 360, (u) => P.twoLevel(u, t, p2, alpha).density);
    area(chart, rho, "rgba(97,155,96,.26)"); line(chart, rho, C.green, [], 2.8);
    line(chart, samples(0, 1, 360, (u) => P.twoLevel(u, t, p2, alpha).re), C.gold, [6, 4], 1.6);
    const c = chart.ctx; c.setLineDash([4, 4]); c.strokeStyle = C.red; c.lineWidth = 1.6; c.beginPath(); c.moveTo(chart.X(meanX), chart.top); c.lineTo(chart.X(meanX), chart.bottom); c.stroke(); c.setLineDash([]);
    dot(c, chart.X(meanX), chart.Y(4.15), C.red, 6); label(c, `⟨x⟩ = ${fmt(meanX, 3)} L`, chart.X(meanX) + 8, chart.Y(4.15) + 4, C.red, "left", "bold 11px Ubuntu, system-ui");
    // painel secundário: ⟨x⟩(t), fasores e histograma de medidas
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, wA = sec.w * .5, wB = sec.w * .22;
    const tr = axes(sec, { x: 0, y: 0, w: wA, h: sec.h }, 0, 6.28, .25, .75, "t (ℏ/E₁)", "⟨x⟩/L", { ticks: 4, yDigits: 2 });
    line(tr, samples(0, 6.28, 400, (q) => P.twoLevelMeanX(q, p2, alpha)), C.red, [], 1.4, .3);
    line(tr, samples(0, Math.max(t, .001), 300, (q) => P.twoLevelMeanX(q, p2, alpha)), C.red, [], 2.6);
    dot(ctx, tr.X(t), tr.Y(meanX), C.red, 5);
    for (let k = 1; k * s.period <= 6.28; k += 1) { ctx.strokeStyle = C.faint; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(tr.X(k * s.period), tr.top); ctx.lineTo(tr.X(k * s.period), tr.bottom); ctx.stroke(); ctx.setLineDash([]); }
    const cx = wA + wB / 2, cy = sec.h / 2 - 6, r = Math.min(wB * .42, sec.h * .36);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    phasor(ctx, cx, cy, r, -s.e1 * t, Math.sqrt(1 - p2), C.blue, "c₁");
    phasor(ctx, cx, cy, r, alpha - s.e2 * t, Math.sqrt(p2), C.gold, "c₂");
    label(ctx, "fasores (E₂ gira 4× mais rápido)", cx, sec.h - 8, C.gray, "center", "10px Ubuntu, system-ui");
    const total = state.counts[1] + state.counts[2];
    const hist = axes(sec, { x: wA + wB, y: 0, w: sec.w - wA - wB, h: sec.h }, .3, 2.7, 0, 1, "resultado", "fração", { ticks: 2, xLabels: () => "", yDigits: 1 });
    [[1, s.p1, C.blue], [2, s.p2, C.gold]].forEach(([k, prob, color]) => {
      const frac = total ? state.counts[k] / total : 0, x0 = hist.X(k - .32), x1 = hist.X(k + .32);
      ctx.fillStyle = color; ctx.globalAlpha = .75; ctx.fillRect(x0, hist.Y(frac), x1 - x0, hist.bottom - hist.Y(frac)); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ink; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 - 4, hist.Y(prob)); ctx.lineTo(x1 + 4, hist.Y(prob)); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, `E${k === 1 ? "₁" : "₂"}`, (x0 + x1) / 2, hist.bottom + 14, C.gray, "center");
    });
    label(ctx, total ? `${total} medidas` : "meça a energia", hist.left + 4, hist.top + 10, C.gray, "left", "10px Ubuntu, system-ui");
    const amp = 2 * Math.sqrt((1 - p2) * p2) * Math.abs(P.x12);
    texts({ status: "Dois níveis", detail: `|c₁|² = ${fmt(s.p1, 2)} · |c₂|² = ${fmt(s.p2, 2)}`, title: "Superposição: a densidade balança no poço", subtitle: `batimento na frequência de Bohr ω₂₁ = (E₂ − E₁)/ℏ = ${fmt(s.omega, 0)} E₁/ℏ`,
      caption: "A densidade (verde) vai de um lado ao outro do poço e volta, e ⟨x⟩ (vermelho) acompanha. Nenhum dos dois estados sozinho se move: o balanço vem do termo de interferência 2Re[c₁*c₂ψ₁ψ₂e^(−iω₂₁t)].",
      secondaryTitle: "⟨x⟩ no tempo · fasores · medidas de energia", secondarySubtitle: `período 2πℏ/(E₂ − E₁) = ${fmt(s.period, 3)} ℏ/E₁ (linhas pontilhadas)`,
      secondaryCaption: "Os dois fasores giram com velocidades E₁/ℏ e E₂/ℏ; ⟨x⟩ depende só do ângulo entre eles. Já uma medida de energia dá E₁ ou E₂, com frequências que tendem a |c₁|² e |c₂|² (linhas tracejadas) — e isso não muda com t nem com α.",
      prediction: "Se α mudar, as probabilidades de E₁ e E₂ mudam? E o movimento de ⟨x⟩? Com |c₂|² = 0, a densidade balança?",
      calculation: `P(E₁) = |c₁|² = ${fmt(s.p1, 3)} · P(E₂) = ${fmt(s.p2, 3)}<br>⟨H⟩ = ${fmt(s.p1, 3)}·1 + ${fmt(s.p2, 3)}·4 = ${fmt(s.mean, 3)} E₁<br><b>ΔE = √(|c₁|²|c₂|²)·|E₂ − E₁| = ${fmt(s.spread, 3)} E₁</b><small>com 1/3 e 2/3: ΔE = (√2/3)·3E₁ = ${fmt(Math.SQRT2, 3)} E₁</small>`,
      metrics: [["⟨H⟩", `${fmt(s.mean, 3)} E₁`], ["ΔE", `${fmt(s.spread, 3)} E₁`], ["amplitude de ⟨x⟩", `${fmt(amp, 3)} L`], ["período de Bohr", `${fmt(s.period, 3)} ℏ/E₁`], ["medidas E₁ · E₂", total ? `${state.counts[1]} · ${state.counts[2]}` : "—"]],
      concept: "Uma superposição de energias diferentes não é estacionária: o termo cruzado oscila com ω₂₁. Mas a distribuição de energia, |c₁|² e |c₂|², é fixa. A fase α não muda essas probabilidades; só desloca no tempo a oscilação de outros observáveis, como ⟨x⟩.",
      prompts: ["Use o preset do exercício (1/3 e 2/3): confira ⟨H⟩ e ΔE com a resposta guiada da nota.", "Meça 1000 vezes: as frações se aproximam de 1/3 e 2/3? Mude α e meça de novo.", "Leve |c₂|² a 0 e a 1: o que acontece com o balanço? Em que peso a amplitude de ⟨x⟩ é máxima?"],
      legend: [[C.green, "|Ψ|²"], [C.gold, "Re Ψ", true], [C.red, "⟨x⟩"], [C.blue, "c₁ / E₁"]] });
  }

  // ================================================================ 05 · E > V_min
  function vminTrial() { return P.trialGaussian(grid, v("vminX0"), v("vminW")); }
  function vminReset() { state.vmin = { psi: vminTrial(), history: [], relaxing: false, tau: 0 }; updateRelaxButton(); }
  function updateRelaxButton() { $("vminRelax").textContent = state.vmin.relaxing ? "❚❚ Pausar" : "▶ Relaxar"; }
  function drawVmin() {
    const key = $("vminPotential").value, pot = P.potentials[key], V = pot.V, vmin = P.potentialMinimum(V, grid);
    if (!state.vmin.psi) vminReset();
    set("vminX0Out", fmt(v("vminX0"), 2)); set("vminWOut", fmt(v("vminW"), 2));
    const psi = state.vmin.psi, parts = P.energyParts(psi, V, grid), trial = P.energyParts(vminTrial(), V, grid);
    if (!state.vmin.history.length) state.vmin.history.push({ tau: 0, E: parts.total });
    const yTop = Math.max(vmin + 3, Math.min(trial.total * 1.25, vmin + 12)), main = canvas("mainCanvas", .5);
    const chart = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -4, 4, vmin - .3, yTop, "posição x", "energia (ℏ = m = 1)", { xDigits: 1 });
    area(chart, samples(-4, 4, 400, V), "rgba(111,113,113,.12)", yTop);
    line(chart, samples(-4, 4, 400, V), C.ink, [], 2.6);
    line(chart, [{ x: -4, y: vmin }, { x: 4, y: vmin }], C.blue, [6, 4], 1.6);
    const peak = Math.max(...psi.map((p) => p * p)), scale = (yTop - vmin) * .32 / peak;
    const shown = grid.xs.map((x, i) => ({ x, y: parts.total + psi[i] * psi[i] * scale })).filter((p) => p.x >= -4 && p.x <= 4);
    area(chart, shown, "rgba(97,155,96,.3)", parts.total); line(chart, shown, C.green, [], 2.4);
    line(chart, [{ x: -4, y: parts.total }, { x: 4, y: parts.total }], C.red, [], 2);
    if (pot.ground !== null) line(chart, [{ x: -4, y: pot.ground }, { x: 4, y: pot.ground }], C.gold, [3, 4], 1.4);
    label(chart.ctx, `E = ${fmt(parts.total, 3)}`, chart.right - 6, chart.Y(parts.total) - 6, C.red, "right", "bold 11px Ubuntu, system-ui");
    label(chart.ctx, `V_mín = ${fmt(vmin, 2)}`, chart.left + 6, chart.Y(vmin) - 6, C.blue, "left", "bold 11px Ubuntu, system-ui");
    // secundário: barras T + ⟨V⟩ = E e E(τ) na relaxação
    const sec = canvas("secondaryCanvas", .34), ctx = sec.ctx, wBar = sec.w * .34, eMax = Math.max(trial.total, parts.total, vmin + 1) * 1.15;
    const bars = axes(sec, { x: 0, y: 0, w: wBar, h: sec.h }, 0, 3, Math.min(0, vmin), eMax, "", "energia", { ticks: 3, xLabels: () => "", yDigits: 1 });
    const bar = (x, from, to, color, text) => { const x0 = bars.X(x - .32), x1 = bars.X(x + .32); ctx.fillStyle = color; ctx.fillRect(x0, bars.Y(to), x1 - x0, bars.Y(from) - bars.Y(to)); label(ctx, text, (x0 + x1) / 2, bars.bottom + 14, C.gray, "center", "10px Ubuntu, system-ui"); };
    bar(.7, 0, parts.kinetic, C.gold, "cinética T"); bar(1.5, 0, parts.potential, C.blue, "⟨V⟩"); bar(2.3, 0, parts.potential, C.blue, "E"); bar(2.3, parts.potential, parts.total, C.gold, "");
    ctx.strokeStyle = C.blue; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bars.left, bars.Y(vmin)); ctx.lineTo(bars.right, bars.Y(vmin)); ctx.stroke(); ctx.setLineDash([]);
    const hist = state.vmin.history, tauMax = Math.max(4, hist[hist.length - 1].tau * 1.1);
    const curve = axes(sec, { x: wBar, y: 0, w: sec.w - wBar, h: sec.h }, 0, tauMax, Math.min(vmin, pot.ground ?? vmin) - .1, Math.max(hist[0].E, parts.total) * 1.08 + .1, "tempo imaginário τ", "E(τ)", { ticks: 4, yDigits: 2 });
    line(curve, [{ x: 0, y: vmin }, { x: tauMax, y: vmin }], C.blue, [6, 4], 1.4);
    if (pot.ground !== null) line(curve, [{ x: 0, y: pot.ground }, { x: tauMax, y: pot.ground }], C.gold, [3, 4], 1.4);
    line(curve, hist.map((h) => ({ x: h.tau, y: h.E })), C.red, [], 2.4);
    dot(ctx, curve.X(hist[hist.length - 1].tau), curve.Y(parts.total), C.red, 5);
    const gap = parts.total - vmin;
    texts({ status: "E > V_mín", detail: `${pot.name} · E − V_mín = ${fmt(gap, 3)}`, title: `Por que E > V_mín? · ${pot.name}`, subtitle: `${pot.formula}: a energia de qualquer estado fica acima do fundo do poço`,
      caption: `Preto: V(x); azul tracejado: V_mín; vermelho: E da função atual, com |ψ|² (verde) desenhada sobre a linha de E.${pot.ground !== null ? " Dourado pontilhado: energia do estado fundamental exato." : ""} Para pôr E em V_mín, ψ teria de ficar toda no ponto mais baixo — e isso exige ψ′ enorme.`,
      secondaryTitle: "E = T + ⟨V⟩ · relaxação", secondarySubtitle: "T ≥ 0 e ⟨V⟩ ≥ V_mín, logo E > V_mín",
      secondaryCaption: "Barras: a energia é a soma da cinética T = (ℏ²/2m)∫|ψ′|²dx (dourado, nunca negativa) com ⟨V⟩ (azul, nunca abaixo de V_mín). Curva: ao relaxar, E desce e se estabiliza no estado fundamental, sempre acima da linha de V_mín.",
      prediction: "Estreitando ψ no fundo do poço, E cai até V_mín? O que acontece com a parte cinética quando w diminui?",
      calculation: `E = (ℏ²/2m)∫|ψ′|²dx + ∫V|ψ|²dx<br>= ${fmt(parts.kinetic, 3)} + ${fmt(parts.potential, 3)}<br><b>= ${fmt(parts.total, 3)} > V_mín = ${fmt(vmin, 2)}</b><small>a integração por partes da nota transforma −∫ψ*ψ″ em ∫|ψ′|² ≥ 0</small>`,
      metrics: [["cinética T", fmt(parts.kinetic, 3)], ["⟨V⟩", fmt(parts.potential, 3)], ["E", fmt(parts.total, 3)], ["E − V_mín", fmt(gap, 3)], ["fundamental exato", pot.ground !== null ? fmt(pot.ground, 4) : "—"], ["τ relaxado", fmt(state.vmin.tau, 2)]],
      conceptTitle: "Griffiths 2.2",
      concept: "Integrando o termo cinético por partes, E = (ℏ²/2m)∫|ψ′|²dx + ∫V|ψ|²dx. O primeiro termo é ≥ 0 e o segundo ≥ V_mín. A igualdade exigiria ψ′ = 0 e ψ só onde V = V_mín, o que nenhum estado normalizável consegue: E > V_mín.",
      prompts: ["Com o oscilador e x₀ = 0, procure o w que minimiza E. Compare com o fundamental exato 0,5.", "Diminua w até 0,1: qual barra explode? Aumente w até 2: qual cresce?", "Relaxe nos três potenciais: o estado fundamental fica onde, em relação a V_mín? No poço duplo, onde ψ se concentra?"],
      legend: [[C.ink, "V(x)"], [C.blue, "V_mín", true], [C.red, "E"], [C.green, "|ψ|²"], [C.gold, "fundamental", true]] });
  }

  // ---------------------------------------------------------------- animação e eventos
  const draws = { separation: drawSeparation, stationary: drawStationary, eigen: drawEigen, twolevel: drawTwoLevel, vmin: drawVmin };
  const render = () => draws[view]();
  const playIds = { separation: "sepT", stationary: "statT", eigen: "eigT", twolevel: "twoT" };
  function setPlaying(id) {
    state.playing = id; state.last = performance.now();
    document.querySelectorAll("[data-play]").forEach((b) => { b.textContent = b.dataset.play === id ? "❚❚ Pausar" : "▶ Animar"; });
    if (id || state.vmin.relaxing) requestAnimationFrame(frame);
  }
  function frame(now) {
    const dt = Math.min(.05, (now - state.last) / 1000); state.last = now;
    if (state.playing) { const s = $(state.playing), speed = state.playing === "twoT" ? .35 : .25; let next = Number(s.value) + dt * speed; if (next > Number(s.max)) next = 0; s.value = next.toFixed(4); }
    if (view === "vmin" && state.vmin.relaxing) {
      const V = P.potentials[$("vminPotential").value].V, before = P.energyParts(state.vmin.psi, V, grid).total, steps = 80, dtau = .4 * grid.dx * grid.dx;
      state.vmin.psi = P.relax(state.vmin.psi, V, grid, steps, dtau); state.vmin.tau += steps * dtau;
      const after = P.energyParts(state.vmin.psi, V, grid).total; state.vmin.history.push({ tau: state.vmin.tau, E: after });
      if (Math.abs(before - after) < 1e-7 || state.vmin.tau > 40) { state.vmin.relaxing = false; updateRelaxButton(); }
    }
    render();
    if (state.playing || (view === "vmin" && state.vmin.relaxing)) requestAnimationFrame(frame);
  }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "separation";
    document.querySelectorAll("[data-view]").forEach((b) => { const a = b.dataset.view === view; b.classList.toggle("active", a); b.setAttribute("aria-selected", String(a)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) {}
    state.vmin.relaxing = false; updateRelaxButton();
    setPlaying(!reducedMotion && playIds[view] ? playIds[view] : null);
    render();
  }
  const defaults = { separation: { sepN: 2, sepT: 0 }, stationary: { statN: 2, statT: 0 }, eigen: { eigN: 2, eigL: 1, eigT: 0 }, twolevel: { twoP: 2 / 3, twoA: 0, twoT: 0 }, vmin: { vminPotential: "harmonic", vminX0: 1.5, vminW: .4 } };
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll("[data-view]")], i = tabs.findIndex((t) => t.dataset.view === view);
    const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view);
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", () => {
    if (el.id.startsWith("vmin")) vminReset();
    if (el.id === "twoP") state.counts = { 1: 0, 2: 0 };
    render();
  }));
  document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => setPlaying(state.playing === b.dataset.play ? null : b.dataset.play)));
  document.querySelectorAll("[data-zero]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.zero).value = 0; render(); }));
  document.querySelectorAll("[data-shots]").forEach((b) => b.addEventListener("click", () => { const p2 = v("twoP"); for (let i = 0; i < Number(b.dataset.shots); i += 1) state.counts[P.measureEnergy(p2)] += 1; render(); }));
  $("twoClear").addEventListener("click", () => { state.counts = { 1: 0, 2: 0 }; render(); });
  $("twoPreset").addEventListener("click", () => { $("twoP").value = 2 / 3; $("twoA").value = 0; state.counts = { 1: 0, 2: 0 }; render(); });
  $("vminRelax").addEventListener("click", () => { state.vmin.relaxing = !state.vmin.relaxing; updateRelaxButton(); if (state.vmin.relaxing) { state.last = performance.now(); requestAnimationFrame(frame); } });
  $("vminBack").addEventListener("click", () => { vminReset(); render(); });
  $("resetBtn").addEventListener("click", () => {
    Object.entries(defaults[view]).forEach(([id, value]) => { $(id).value = value; });
    if (view === "twolevel") state.counts = { 1: 0, 2: 0 };
    if (view === "vmin") vminReset();
    render();
  });
  // Estado inicial por URL: ?view=twolevel&twoT=1.2 (útil para links nas notas).
  new URLSearchParams(location.search).forEach((value, key) => { const el = $(key); if (el && key !== "view" && (el.tagName === "INPUT" || el.tagName === "SELECT")) el.value = value; });
  window.addEventListener("resize", render);
  switchView(view);
})();
