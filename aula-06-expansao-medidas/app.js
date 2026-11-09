(function () {
  "use strict";
  // Coordena controles, canvas e textos da aplicação da Aula 6. A física está em physics.js.
  const P = window.QuantumPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", violet: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["sequence", "spread", "degenerate", "parity", "mri"];
  let view = new URLSearchParams(location.search).get("view");
  if (!VIEWS.includes(view)) view = "sequence";

  const fmt = (x, n = 2) => { if (!Number.isFinite(x)) return "—"; const r = Math.abs(x) < 0.5 * 10 ** -n ? 0 : x; return Number(r).toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n }).replace(/^-/, "−"); };
  const sci = (x, n = 2) => { if (!Number.isFinite(x) || x === 0) return fmt(x, n); const e = Math.floor(Math.log10(Math.abs(x))); return `${fmt(x / 10 ** e, n)}×10${String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])}`; };
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
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 54, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const lx = (x) => (o.logX ? Math.log10(x) : x), xa = lx(xMin), xb = lx(xMax);
    const X = (x) => left + (lx(x) - xa) * (right - left) / (xb - xa), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    const n = o.ticks ?? 5;
    const xt = o.xTicks || Array.from({ length: n + 1 }, (_, i) => xMin + i * (xMax - xMin) / n);
    xt.forEach((x) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? 1), X(x), bottom + 14); });
    for (let i = 0; i <= n; i += 1) {
      const y = yMin + i * (yMax - yMin) / n;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "right"; ctx.fillText(fmt(y, o.yDigits ?? 1), left - 6, Y(y) + 3);
    }
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top - 2, ch.right - ch.left, ch.bottom - ch.top + 2); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.6, alpha = 1) {
    clip(ch, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); });
  }
  function area(ch, pts, color, base = 0) {
    clip(ch, (c) => { c.fillStyle = color; c.beginPath(); c.moveTo(ch.X(pts[0].x), ch.Y(base)); pts.forEach((p) => c.lineTo(ch.X(p.x), ch.Y(p.y))); c.lineTo(ch.X(pts[pts.length - 1].x), ch.Y(base)); c.closePath(); c.fill(); });
  }
  function vline(ch, x, color, dash = [5, 4], width = 1.4) { clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.X(x), ch.top); c.lineTo(ch.X(x), ch.bottom); c.stroke(); }); }
  function hline(ch, y, color, dash = [5, 4], width = 1.4) { clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.left, ch.Y(y)); c.lineTo(ch.right, ch.Y(y)); c.stroke(); }); }
  function bar(ch, x, w, y, fill, stroke) { clip(ch, (c) => { const x0 = ch.X(x - w / 2), x1 = ch.X(x + w / 2), y0 = ch.Y(0), y1 = ch.Y(y); if (fill) { c.fillStyle = fill; c.fillRect(x0, y1, x1 - x0, y0 - y1); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.setLineDash([]); c.strokeRect(x0, y1, x1 - x0, y0 - y1); } }); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function walls(ch, from, to) {
    const c = ch.ctx; c.fillStyle = "rgba(38,49,45,.10)";
    c.fillRect(ch.left, ch.top, Math.max(0, ch.X(from) - ch.left), ch.bottom - ch.top); c.fillRect(ch.X(to), ch.top, Math.max(0, ch.right - ch.X(to)), ch.bottom - ch.top);
    c.strokeStyle = C.ink; c.lineWidth = 3; c.setLineDash([]); c.beginPath(); c.moveTo(ch.X(from), ch.top); c.lineTo(ch.X(from), ch.bottom); c.moveTo(ch.X(to), ch.top); c.lineTo(ch.X(to), ch.bottom); c.stroke();
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
  const state = { spread: { outcomes: [] } };

  // ================================================================ 01 · H → x → H
  function drawSequence() {
    const eps = v("seqEps"), x0 = Math.min(1 - eps / 2, Math.max(eps / 2, v("seqX0")));
    if (Math.abs(x0 - v("seqX0")) > 1e-9) $("seqX0").value = x0;
    set("seqEpsOut", fmt(eps, 2)); set("seqX0Out", fmt(x0, 2));
    const N = 60, probs = P.boxProbabilities(x0, eps, N), pI = P.intervalProbability(1, x0, eps), tail = P.boxTailIndex(x0, eps, 0.98), plateau = P.boxPlateau(eps);
    const main = canvas("mainCanvas", .5), wL = main.w * .36;
    // painel esquerdo: ψ₁ antes, caixa depois
    const amp = 1 / Math.sqrt(eps), yTop = Math.max(1.7, amp * 1.12);
    const L = axes(main, { x: 0, y: 0, w: wL, h: main.h }, -.08, 1.08, 0, yTop, "posição x/a", "amplitude (unid. 1/√a)", { ticks: 4, xDigits: 1 });
    walls(L, 0, 1);
    clip(L, (c) => { c.fillStyle = "rgba(233,162,59,.18)"; c.fillRect(L.X(x0 - eps / 2), L.top, L.X(x0 + eps / 2) - L.X(x0 - eps / 2), L.bottom - L.top); });
    line(L, samples(0, 1, 240, (u) => P.boxWave(1, u)), C.blue, [], 2.4);
    line(L, [{ x: 0, y: 0 }, { x: x0 - eps / 2, y: 0 }, { x: x0 - eps / 2, y: amp }, { x: x0 + eps / 2, y: amp }, { x: x0 + eps / 2, y: 0 }, { x: 1, y: 0 }], C.red, [], 2.6);
    label(main.ctx, "ψ₁ (antes)", L.X(.06), L.Y(1.5) - 4, C.blue, "left", "bold 11px Ubuntu, system-ui");
    label(main.ctx, "caixa 1/√ε (depois)", L.X(Math.min(.98, x0 + eps / 2 + .02)), L.Y(Math.min(amp, yTop * .92)), C.red, x0 > .6 ? "right" : "left", "bold 11px Ubuntu, system-ui");
    // painel direito: P(Eₙ) da nova medida de H
    const pMax = Math.max(...probs, plateau) * 1.15;
    const R = axes(main, { x: wL, y: 0, w: main.w - wL, h: main.h }, 0, N + 1, 0, pMax, "nível n da nova medida de energia", "P(Eₙ) = |cₙ|²", { xTicks: [1, 10, 20, 30, 40, 50, 60], xLabels: (x) => String(x), yDigits: 2, ticks: 5 });
    probs.forEach((p, i) => bar(R, i + 1, .7, p, (i + 1) % 2 ? C.red : C.gold));
    hline(R, plateau, C.ink, [6, 4], 1.4);
    label(main.ctx, `patamar 2ε/a = ${fmt(plateau, 3)}`, R.right - 4, R.Y(plateau) - 5, C.ink, "right", "10px Ubuntu, system-ui");
    if (1 / eps <= N) { vline(R, 1 / eps, C.violet); label(main.ctx, "n = a/ε", R.X(1 / eps) + 4, R.top + 12, C.violet, "left", "10px Ubuntu, system-ui"); }
    // secundário: soma acumulada
    const sec = canvas("secondaryCanvas", .3), nMax = 2000;
    let s = 0; const cum = [];
    for (let n = 1; n <= nMax; n += 1) { s += P.boxCoefficient(n, x0, eps) ** 2; if (n < 10 || n % 5 === 0 || n === nMax) cum.push({ x: n, y: s }); }
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 1, nMax, 0, 1, "n (escala log)", "Σ P(E_k), k ≤ n", { logX: true, xTicks: [1, 10, 100, 1000], xLabels: (x) => String(x), yDigits: 2, ticks: 4 });
    line(S, cum, C.red, [], 2.6); hline(S, .98, C.gray);
    if (Number.isFinite(tail) && tail <= nMax) { vline(S, tail, C.violet); label(sec.ctx, `0,98 em n = ${tail}`, S.X(tail) + 5, S.Y(.5), C.violet, "left", "bold 11px Ubuntu, system-ui"); }
    const c1 = P.boxCoefficient(1, x0, eps);
    texts({ status: "H → x → H", detail: `ε = ${fmt(eps, 2)}a · x₀ = ${fmt(x0, 2)}a`,
      title: "Depois de medir x, o que dá uma nova medida de energia?", subtitle: "esquerda: estado antes (ψ₁) e depois (caixa) da medida de posição · direita: P(Eₙ) na terceira medida",
      caption: "Rodada 1: em (ψ₁ + ψ₂)/√2, P(E₁) = P(E₂) = ½; saiu E₁ e o estado virou ψ₁. Rodada 2: o detector achou a partícula em I; o estado vira a caixa. Rodada 3: a caixa se expande em muitos ψₙ. Barras vermelhas: n ímpar; douradas: n par (nulas quando x₀ = a/2, nó de ψ₂, ψ₄, …).",
      secondaryTitle: "A cauda é lenta", secondarySubtitle: "soma acumulada das probabilidades até o nível n (Parseval: tende a 1)",
      secondaryCaption: "Quanto menor ε, mais níveis entram com peso apreciável: o patamar 2ε/a vai até n ~ a/ε, isto é, momentos pₙ = nπħ/a ~ ħ/ε. É a largura em momento que a relação de incerteza exige.",
      prediction: "A partícula estava em ψ₁ (energia E₁ com certeza). Um detector a acha perto de a/2 com resolução ε = a/10. Uma nova medida de energia dá E₁ com probabilidade 1, cerca de ½ ou cerca de 0,2? E se o detector for mais preciso (ε menor)?",
      calculation: `cₙ = √(2/aε)·(2a/nπ)·sen(nπx₀/a)·sen(nπε/2a)<br>c₁ = √(2/${fmt(eps, 2)})·(2/π)·sen(${fmt(x0, 2)}π)·sen(${fmt(eps / 2, 3)}π) = ${fmt(c1, 4)}<br><b>P(E₁) = c₁² = ${fmt(c1 * c1, 4)}</b><small>∫_I |ψ₁|² dx = ${fmt(pI, 4)} (estado P̂_Iψ₁ exato; difere da caixa em ${fmt(Math.abs(pI - c1 * c1) / pI * 100, 2)} %)</small>`,
      metrics: [["P(E₁) na 3ª medida", fmt(probs[0], 4)], ["P(E₂)", fmt(probs[1], 4)], ["P(E₃)", fmt(probs[2], 4)], ["∫_I |ψ₁|² dx", fmt(pI, 4)], ["patamar 2ε/a", fmt(plateau, 3)], ["n com Σ ≥ 0,98", Number.isFinite(tail) ? String(tail) : "> 2×10⁵"]],
      concept: "Medir x é medir outro observável: o estado é projetado no intervalo I e a informação sobre a energia se perde. E₁ não 'estava lá' esperando ser olhada; era propriedade do estado ψ₁, e o estado mudou com a medida de posição (nota da Aula 6, §3).",
      prompts: ["Com x₀ = a/2 e ε = a/10, confira a nota: P(E₁) = 0,198, P(E₃) = 0,186, P(E₅) = 0,162, e a soma só chega a 0,98 em n ≈ 100.", "Reduza ε para a/20: P(E₁) cai para quanto? Compare com o patamar 2ε/a e com n ~ a/ε.", "Tire o detector do centro (x₀ = 0,3a): por que os níveis pares aparecem?"],
      legend: [[C.blue, "ψ₁"], [C.red, "caixa / n ímpar"], [C.gold, "n par"], [C.ink, "patamar 2ε/a", true]] });
  }

  // ================================================================ 02 · média e σ_H
  const E3 = [1, 2, 3].map((n) => P.levelEV(n, 0.5));
  function spreadProbs() { return P.normalize([v("spW1"), v("spW2"), v("spW3")]); }
  function shoot(k) { const pr = spreadProbs(); for (let i = 0; i < k; i += 1) state.spread.outcomes.push(P.sample(pr, Math.random())); if (state.spread.outcomes.length > 20000) state.spread.outcomes.splice(0, state.spread.outcomes.length - 20000); render(); }
  function drawSpread() {
    const pr = spreadProbs(), phi = v("spPhi"), mean = P.expectation(E3, pr), sd = P.sigma(E3, pr), mean2 = P.expectation(E3.map((e) => e * e), pr);
    ["spW1", "spW2", "spW3"].forEach((id) => set(`${id}Out`, fmt(v(id), 2))); set("spPhiOut", fmt(phi, 2));
    const out = state.spread.outcomes, N = out.length, counts = [0, 0, 0];
    out.forEach((k) => { counts[k] += 1; });
    const sMean = N ? out.reduce((a, k) => a + E3[k], 0) / N : NaN, sSd = N > 1 ? Math.sqrt(out.reduce((a, k) => a + (E3[k] - sMean) ** 2, 0) / (N - 1)) : NaN;
    const main = canvas("mainCanvas", .46);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 0, 15.5, 0, 1, "energia E (eV)", "probabilidade / frequência", { ticks: 4, xDigits: 0, yDigits: 2, xTicks: [0, 3, 6, 9, 12, 15] });
    clip(ch, (c) => { c.fillStyle = "rgba(69,123,157,.12)"; c.fillRect(ch.X(Math.max(0, mean - sd)), ch.top, ch.X(Math.min(15.5, mean + sd)) - ch.X(Math.max(0, mean - sd)), ch.bottom - ch.top); });
    E3.forEach((e, i) => {
      bar(ch, e, .9, pr[i], C.red);
      if (N) bar(ch, e, 1.3, counts[i] / N, null, C.gold);
      label(main.ctx, `E${"₁₂₃"[i]} = ${fmt(e, 2)} eV`, ch.X(e), ch.bottom + 26, C.ink, "center", "10px Ubuntu, system-ui");
      label(main.ctx, fmt(pr[i], 3), ch.X(e), ch.Y(pr[i]) - 6, C.red, "center", "bold 11px Ubuntu, system-ui");
    });
    vline(ch, mean, C.blue, [6, 4], 2);
    label(main.ctx, `⟨H⟩ = ${fmt(mean, 2)} eV`, ch.X(mean) + 5, ch.top + 14, C.blue, "left", "bold 11px Ubuntu, system-ui");
    // secundário: média das N medidas
    const sec = canvas("secondaryCanvas", .3);
    const nTop = Math.max(10, N);
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 1, nTop, 0, 15, "número de medidas N (log)", "média (eV)", { logX: true, xTicks: [1, 10, 100, 1000, 10000].filter((x) => x <= nTop), xLabels: (x) => String(x), yDigits: 0, ticks: 3 });
    hline(S, mean, C.blue, [6, 4], 2);
    if (N) {
      const pts = []; let acc = 0;
      out.forEach((k, i) => { acc += E3[k]; if (i < 50 || i % Math.ceil(N / 400) === 0 || i === N - 1) pts.push({ x: i + 1, y: acc / (i + 1) }); });
      line(S, samples(1, nTop, 120, (n) => mean + sd / Math.sqrt(n)), C.gray, [3, 4], 1.2);
      line(S, samples(1, nTop, 120, (n) => mean - sd / Math.sqrt(n)), C.gray, [3, 4], 1.2);
      line(S, pts, C.gold, [], 2.4);
    } else label(sec.ctx, "Use “Medir” para sortear resultados.", sec.w / 2, sec.h / 2, C.gray, "center");
    const c2 = Math.sqrt(pr[1]);
    texts({ status: "Média e variância", detail: `N = ${N} medidas`,
      title: "Espectro de medida de três níveis (poço de 0,5 nm)", subtitle: "barras vermelhas: P(Eₙ) = |cₙ|² · contorno dourado: frequência nas N medidas · faixa azul: ⟨H⟩ ± σ_H",
      caption: "Cada medida dá um autovalor E₁, E₂ ou E₃, nunca ⟨H⟩. A média de muitas medidas sobre cópias idênticas converge para ⟨H⟩ = Σ|cₙ|²Eₙ; σ_H mede o espalhamento dos resultados.",
      secondaryTitle: "A média das N medidas converge para ⟨H⟩", secondarySubtitle: "linha dourada: média acumulada · tracejado: ⟨H⟩ ± σ_H/√N",
      secondaryCaption: "O desvio da média cai como σ_H/√N: é a estatística de contagem que a nota liga à imagem médica (ruído relativo 1/√N).",
      prediction: "No estado (|1⟩ + i|2⟩ − 2|3⟩)/√6, alguma medida individual dá ⟨H⟩ = 10,28 eV? A fase i de c₂ muda P(E₂)? Depois, com (|2⟩ + |3⟩)/√2, σ_H aumenta ou diminui?",
      calculation: `⟨H⟩ = ${fmt(pr[0], 3)}·${fmt(E3[0], 3)} + ${fmt(pr[1], 3)}·${fmt(E3[1], 3)} + ${fmt(pr[2], 3)}·${fmt(E3[2], 2)} = <b>${fmt(mean, 2)} eV</b><br>⟨H²⟩ = ${fmt(mean2, 1)} eV² → σ_H = √(${fmt(mean2, 1)} − ${fmt(mean, 2)}²) = <b>${fmt(sd, 2)} eV</b><small>c₂ = ${fmt(c2, 3)}·e^(i·${fmt(phi, 2)}) → |c₂|² = ${fmt(pr[1], 3)}, qualquer que seja a fase</small><small>E₁ = h²/(8mₑa²) = ${fmt(E3[0], 3)} eV (a = 0,5 nm)</small>`,
      metrics: [["⟨H⟩", `${fmt(mean, 2)} eV`], ["σ_H", `${fmt(sd, 2)} eV`], ["P(E₁) · P(E₂) · P(E₃)", `${fmt(pr[0], 3)} · ${fmt(pr[1], 3)} · ${fmt(pr[2], 3)}`], ["medidas N", String(N)], ["média das N medidas", N ? `${fmt(sMean, 2)} eV` : "—"], ["desvio das N medidas", N > 1 ? `${fmt(sSd, 2)} eV` : "—"]],
      concept: "A regra de Born transforma a expansão Ψ = Σcₙψₙ numa distribuição de probabilidade sobre os autovalores: ⟨H⟩ e σ_H são a média e o desvio dessa distribuição. Como |cₙe^(−iEₙt/ħ)|² = |cₙ|², ⟨H⟩ e σ_H não mudam no tempo (conservação da energia).",
      prompts: ["Carregue o exemplo da nota e confira ⟨H⟩ = 10,28 eV e σ_H = 4,79 eV. Gire a fase de c₂: algo muda?", "Carregue (|2⟩ + |3⟩)/√2 e depois (|1⟩ + |2⟩ + |3⟩)/√3: decida antes se σ_H sobe ou desce (9,78 e 3,76 eV; 7,02 e 4,96 eV).", "Zere dois pesos: quanto vale σ_H? O que isso diz sobre o estado?"],
      legend: [[C.red, "P(Eₙ)"], [C.gold, "frequência medida"], [C.blue, "⟨H⟩", true]] });
  }

  // ================================================================ 03 · degenerescência
  const heatCache = {};
  function heatmap(ctx, x, y, size, terms, key) {
    const n = 90;
    if (!heatCache[key] || heatCache[key].sig !== JSON.stringify(terms)) {
      const off = document.createElement("canvas"); off.width = n; off.height = n;
      const oc = off.getContext("2d"), img = oc.createImageData(n, n);
      let max = 0; const d = [];
      for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) { const val = P.density2D(terms, (i + .5) / n, 1 - (j + .5) / n); d.push(val); if (val > max) max = val; }
      d.forEach((val, k) => { const t = max > 0 ? val / max : 0; img.data[4 * k] = Math.round(251 - t * (251 - 38)); img.data[4 * k + 1] = Math.round(252 - t * (252 - 74)); img.data[4 * k + 2] = Math.round(250 - t * (250 - 120)); img.data[4 * k + 3] = 255; });
      oc.putImageData(img, 0, 0); heatCache[key] = { sig: JSON.stringify(terms), off };
    }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(heatCache[key].off, x, y, size, size);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, size, size);
    label(ctx, "0", x - 4, y + size + 12, C.gray, "right", "10px Ubuntu, system-ui"); label(ctx, "a", x + size, y + size + 12, C.gray, "center", "10px Ubuntu, system-ui"); label(ctx, "a", x - 6, y + 4, C.gray, "right", "10px Ubuntu, system-ui");
    label(ctx, "x", x + size / 2, y + size + 14, C.gray, "center", "11px Ubuntu, system-ui"); label(ctx, "y", x - 10, y + size / 2, C.gray, "right", "11px Ubuntu, system-ui");
  }
  const ket = (t) => `|${t.nx},${t.ny}⟩`;
  function drawDegenerate() {
    ["dgC11", "dgC12", "dgC21"].forEach((id) => set(`${id}Out`, fmt(v(id), 2)));
    const raw = [{ nx: 1, ny: 1, c: v("dgC11") }, { nx: 1, ny: 2, c: v("dgC12") }, { nx: 2, ny: 1, c: v("dgC21") }];
    const st = P.normalizeState(raw), m5 = P.measureDegenerate(st, 5), m2 = P.measureDegenerate(st, 2);
    const meanE = st.reduce((a, t) => a + t.c * t.c * P.energy2D(t.nx, t.ny), 0);
    const main = canvas("mainCanvas", .5), ctx = main.ctx, size = Math.min(main.h - 70, main.w * .36), gap = (main.w - 2 * size) / 3;
    const y0 = 34;
    heatmap(ctx, gap, y0, size, st, "before");
    label(ctx, "antes: |Ψ(x,y)|²", gap + size / 2, y0 - 12, C.ink, "center", "bold 12px Ubuntu, system-ui");
    if (m5.P > 1e-9) {
      heatmap(ctx, 2 * gap + size, y0, size, m5.post, "after");
      label(ctx, "depois de obter E₁₂ = 5E₁: |Ψ_pós|²", 2 * gap + 1.5 * size, y0 - 12, C.red, "center", "bold 12px Ubuntu, system-ui");
    } else {
      ctx.strokeStyle = C.faint; ctx.strokeRect(2 * gap + size, y0, size, size);
      label(ctx, "P(E₁₂) = 0: esse resultado não ocorre", 2 * gap + 1.5 * size, y0 + size / 2, C.red, "center", "bold 12px Ubuntu, system-ui");
    }
    // seta entre os mapas
    const ax = gap + size + 8, bx = 2 * gap + size - 8, ay = y0 + size / 2;
    ctx.strokeStyle = ctx.fillStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, ay); ctx.lineTo(bx - 9, ay - 5); ctx.lineTo(bx - 9, ay + 5); ctx.closePath(); ctx.fill();
    label(ctx, "P̂_q Ψ/√P(q)", (ax + bx) / 2, ay - 8, C.ink, "center", "11px Ubuntu, system-ui");
    // secundário: diagrama de níveis com |c|²
    const sec = canvas("secondaryCanvas", .3);
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 0, 4, 0, 1, "autoestados de energia (E/E₁)", "|c|² e P(E)", { xTicks: [.8, 2, 3.2], xLabels: (x) => (x < 1 ? "|1,1⟩ · E = 2E₁" : x < 2.5 ? "|1,2⟩ · E = 5E₁" : "|2,1⟩ · E = 5E₁"), yDigits: 2, ticks: 4 });
    const p11 = st[0].c ** 2, p12 = st[1].c ** 2, p21 = st[2].c ** 2;
    bar(S, .8, .5, p11, C.blue); bar(S, 2, .5, p12, C.red); bar(S, 3.2, .5, p21, C.gold);
    clip(S, (c) => { c.strokeStyle = C.ink; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(S.X(1.6), S.Y(m5.P), S.X(3.6) - S.X(1.6), S.Y(0) - S.Y(m5.P)); });
    label(sec.ctx, `P(E₁₂) = ${fmt(p12, 3)} + ${fmt(p21, 3)} = ${fmt(m5.P, 3)}`, S.X(2.6), Math.max(S.top + 12, S.Y(m5.P) - 6), C.ink, "center", "bold 11px Ubuntu, system-ui");
    const post = m5.post, a12 = post[0] ? post[0].c : NaN, a21 = post[1] ? post[1].c : NaN;
    texts({ status: "Degenerescência", detail: `P(E₁₂) = ${fmt(m5.P, 3)}`,
      title: "Regra de Born com projetor num autovalor degenerado", subtitle: "|1,2⟩ e |2,1⟩ têm a mesma energia 5E₁: a medida não distingue entre eles",
      caption: "Mapa de |Ψ|² no quadrado (escuro = densidade alta). À direita, o estado depois de uma medida de energia que deu 5E₁: a componente |1,1⟩ some, e as componentes |1,2⟩ e |2,1⟩ ficam na mesma proporção (e com o mesmo sinal relativo) que tinham antes.",
      secondaryTitle: "Pesos na base de energia", secondarySubtitle: "a caixa tracejada soma o autoespaço degenerado: P(E₁₂) = ⟨Ψ|P̂_q|Ψ⟩",
      secondaryCaption: "Para g = 1 (|1,1⟩), a regra volta a ser P = |c|². Para g = 2, soma-se sobre o autoespaço, e o estado pós-medida é a projeção normalizada, não um dos kets.",
      prediction: "Em ½|1,1⟩ + (1/√2)|1,2⟩ + ½|2,1⟩, a medida de energia dá 5E₁. O estado depois é |1,2⟩, |2,1⟩, ou outra coisa? E qual é P(5E₁): ½, ¼ ou ¾?",
      calculation: `P(E₁₂) = |⟨1,2|Ψ⟩|² + |⟨2,1|Ψ⟩|² = ${fmt(p12, 3)} + ${fmt(p21, 3)} = <b>${fmt(m5.P, 3)}</b><br>${m5.P > 1e-9 ? `Ψ_pós = (${fmt(st[1].c, 3)}|1,2⟩ + ${fmt(st[2].c, 3)}|2,1⟩)/√${fmt(m5.P, 3)} = <b>${fmt(a12, 3)}|1,2⟩ ${a21 < 0 ? "−" : "+"} ${fmt(Math.abs(a21), 3)}|2,1⟩</b>` : "P(E₁₂) = 0: não há estado pós-medida"}<small>P̂_q = |1,2⟩⟨1,2| + |2,1⟩⟨2,1|, P̂_q² = P̂_q</small>`,
      metrics: [["P(E₁₁ = 2E₁)", fmt(m2.P, 3)], ["P(E₁₂ = 5E₁)", fmt(m5.P, 3)], ["Ψ_pós: coeficiente de |1,2⟩", fmt(a12, 3)], ["Ψ_pós: coeficiente de |2,1⟩", fmt(a21, 3)], ["só |⟨1,2|Ψ⟩|² (esquece a degenerescência)", fmt(p12, 3)], ["⟨H⟩", `${fmt(meanE, 3)} E₁`]],
      concept: "Quando o autovalor é degenerado, a medida informa só o autoespaço: P(q) = ⟨Ψ|P̂_q|Ψ⟩ soma sobre os g estados, e o estado pós-medida P̂_qΨ/√P(q) preserva as proporções dentro do autoespaço. Em 1D, com estados ligados, isso não acontece (Aula 4); em 2D e 3D é a regra (hidrogênio, Aula 23).",
      prompts: ["Carregue o exemplo da nota: confira P = ¾ e Ψ_pós = √(2/3)|1,2⟩ + √(1/3)|2,1⟩.", "Carregue o exercício (|1,1⟩ + |1,2⟩ − |2,1⟩)/√3: o sinal relativo sobrevive à medida? Compare os dois mapas.", "Zere |1,2⟩ e |2,1⟩: o que a tela diz sobre o resultado 5E₁?"],
      legend: [[C.blue, "|c₁₁|²"], [C.red, "|c₁₂|²"], [C.gold, "|c₂₁|²"], [C.ink, "P(E₁₂)", true]] });
  }

  // ================================================================ 04 · paridade
  function drawParity() {
    const kind = $("parKind").value, x0 = v("parX0"), w = v("parW");
    $("parPacket").hidden = kind !== "packet";
    set("parX0Out", fmt(x0, 2)); set("parWOut", fmt(w, 2));
    const psi = P.parityState(kind, x0, w), pp = P.parityProbabilities(psi, 1600), csAll = P.symCoefficients(psi, 40, 1600), cs = csAll.slice(0, 12);
    const oddSum = csAll.reduce((a, c, i) => a + (i % 2 === 0 ? c * c : 0), 0);
    const yMax = Math.max(1.6, ...samples(-.5, .5, 200, (s) => Math.abs(psi(s))).map((p) => p.y)) * 1.12;
    const main = canvas("mainCanvas", .46);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.6, .6, -yMax, yMax, "posição x/a", "ψ (unid. 1/√a)", { ticks: 6, xDigits: 1, yDigits: 1 });
    walls(ch, -.5, .5); hline(ch, 0, C.gray, [], 1); vline(ch, 0, C.gray, [2, 3], 1);
    line(ch, samples(-.5, .5, 400, (s) => psi(-s)), C.gray, [5, 4], 1.8);
    line(ch, samples(-.5, .5, 400, pp.even), C.blue, [], 2.4);
    line(ch, samples(-.5, .5, 400, pp.odd), C.gold, [], 2.4);
    line(ch, samples(-.5, .5, 400, psi), C.red, [], 3);
    // secundário: P(±1) e |cₙ|² com a paridade de cada ψₙ
    const sec = canvas("secondaryCanvas", .3), wA = sec.w * .3;
    const A = axes(sec, { x: 0, y: 0, w: wA, h: sec.h }, 0, 3, 0, 1, "autovalor de Π̂", "P", { xTicks: [1, 2], xLabels: (x) => (x === 1 ? "+1" : "−1"), yDigits: 2, ticks: 4 });
    bar(A, 1, .6, pp.pPlus, C.blue); bar(A, 2, .6, pp.pMinus, C.gold);
    const B = axes(sec, { x: wA, y: 0, w: sec.w - wA, h: sec.h }, 0, 13, 0, 1, "nível n (azul: par, π = +1; dourado: ímpar, π = −1)", "|cₙ|²", { xTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], xLabels: (x) => String(x), yDigits: 2, ticks: 4 });
    cs.forEach((c, i) => bar(B, i + 1, .6, c * c, P.parityOf(i + 1) > 0 ? C.blue : C.gold));
    texts({ status: "Paridade", detail: kind === "packet" ? `x₀ = ${fmt(x0, 2)}a · σ = ${fmt(w, 2)}a` : "(ψ₁ + ψ₂)/√2",
      title: "Paridade como observável: ψ = ψ_par + ψ_ímpar", subtitle: "vermelho: ψ(x) · cinza tracejado: Π̂ψ = ψ(−x) · azul: ψ_par · dourado: ψ_ímpar",
      caption: "ψ_par = ½[ψ(x) + ψ(−x)] e ψ_ímpar = ½[ψ(x) − ψ(−x)] são as projeções P̂_±ψ = ½(Î ± Π̂)ψ. Os autovalores de Π̂ são só ±1, porque Π̂² = Î.",
      secondaryTitle: "Probabilidades de paridade e a base de energia", secondarySubtitle: "P(+1) = Σ dos |cₙ|² com n ímpar (ψₙ par no poço simétrico)",
      secondaryCaption: "Como V(−x) = V(x), [Ĥ, Π̂] = 0 e cada ψₙ do poço tem paridade (−1)^(n+1): ψ₁, ψ₃, … são pares; ψ₂, ψ₄, … ímpares. Por isso P(+1) também é a soma dos |cₙ|² de n ímpar.",
      prediction: "Desloque o pacote do centro do poço. P(+1) cai a zero, vai para ½ ou continua 1? E num pacote estreito longe do centro?",
      calculation: `P(+1) = ∫|ψ_par|² dx = <b>${fmt(pp.pPlus, 4)}</b> · P(−1) = ∫|ψ_ímpar|² dx = <b>${fmt(pp.pMinus, 4)}</b><br>⟨Π̂⟩ = (+1)·${fmt(pp.pPlus, 4)} + (−1)·${fmt(pp.pMinus, 4)} = ${fmt(pp.mean, 4)}<small>conferência: Σ|cₙ|² sobre n ímpar ≤ 39 = ${fmt(oddSum, 4)}</small>`,
      metrics: [["P(+1)", fmt(pp.pPlus, 4)], ["P(−1)", fmt(pp.pMinus, 4)], ["P(+1) + P(−1)", fmt(pp.pPlus + pp.pMinus, 4)], ["⟨Π̂⟩", fmt(pp.mean, 4)], ["Σ|cₙ|², n ímpar ≤ 39", fmt(oddSum, 4)], ["|c₁|²", fmt(cs[0] ** 2, 4)]],
      concept: "A paridade é um observável como os outros: operador hermitiano Π̂, autovalores ±1, autoespaços infinitamente degenerados, e a regra de Born com os projetores P̂_± = ½(Î ± Π̂) (Aula 6, §6). Na prática ela se lê por regras de seleção: a transição 3 → 1 do poço é proibida porque ψ₁ e ψ₃ têm a mesma paridade (Aula 5).",
      prompts: ["Escolha (ψ₁ + ψ₂)/√2 e confira a nota: P(+1) = P(−1) = ½.", "Com σ = 0,1a, leve x₀ de 0 a 0,3a. Para onde tende P(+1)? Por que um pacote estreito longe do centro tem P(±1) ≈ ½?", "Compare P(+1) com a soma dos |cₙ|² de n ímpar. Por que elas coincidem?"],
      legend: [[C.red, "ψ(x)"], [C.gray, "ψ(−x)", true], [C.blue, "ψ_par"], [C.gold, "ψ_ímpar"]] });
  }

  // ================================================================ 05 · espaço k da RM
  function drawMri() {
    const Gmt = v("mriG"), tms = v("mriT"), smm = v("mriS");
    set("mriGOut", fmt(Gmt, 1)); set("mriTOut", fmt(tms, 1)); set("mriSOut", fmt(smm, 1));
    const k = P.kMaxPerM(Gmt * 1e-3, tms * 1e-3), dxMm = P.resolutionM(k) * 1e3, dd = dxMm < .1 ? 3 : 2, bands = P.phantom(smm * 1e-3), res = P.resolved(bands, k, smm * 1e-3);
    const main = canvas("mainCanvas", .46);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -12, 12, -.3, 1.5, "posição x (mm)", "densidade de prótons ρ (relativa)", { ticks: 6, xDigits: 0, yDigits: 1 });
    hline(ch, 0, C.gray, [], 1);
    area(ch, samples(-12, 12, 1200, (x) => P.rho(bands, x * 1e-3)), "rgba(111,113,113,.22)");
    line(ch, samples(-12, 12, 1200, (x) => P.reconstruct(bands, k, x * 1e-3)), C.red, [], 2.6);
    // barra de escala Δx
    const yb = 1.22, xa = 6.5;
    clip(ch, (c) => { c.strokeStyle = C.blue; c.lineWidth = 3; c.setLineDash([]); c.beginPath(); c.moveTo(ch.X(xa), ch.Y(yb)); c.lineTo(ch.X(Math.min(12, xa + dxMm)), ch.Y(yb)); c.stroke(); });
    label(main.ctx, `Δx = ${fmt(dxMm, dd)} mm`, ch.X(xa), ch.Y(yb) - 7, C.blue, "left", "bold 11px Ubuntu, system-ui");
    // secundário: S(k)
    const sec = canvas("secondaryCanvas", .3), kPlot = Math.max(1500, 1.5 * k), S0 = P.signal(bands, 0);
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, -kPlot, kPlot, -.4, 1, "frequência espacial k (m⁻¹)", "S(k)/S(0)", { ticks: 7, xDigits: 0, yDigits: 1 });
    clip(S, (c) => { c.fillStyle = "rgba(69,123,157,.14)"; c.fillRect(S.X(-k), S.top, S.X(k) - S.X(-k), S.bottom - S.top); });
    line(S, samples(-kPlot, kPlot, 3000, (q) => P.signal(bands, q) / S0), C.violet, [], 1.6);
    vline(S, -k, C.blue, [], 1.6); vline(S, k, C.blue, [], 1.6);
    label(sec.ctx, `±k_max = ±${fmt(k, 0)} m⁻¹`, S.X(k) + 5, S.top + 12, C.blue, "left", "bold 11px Ubuntu, system-ui");
    texts({ status: "Física médica: espaço k", detail: `G = ${fmt(Gmt, 1)} mT/m · t = ${fmt(tms, 1)} ms`,
      title: "Imagem de RM como expansão truncada em ondas planas", subtitle: "cinza: objeto ρ(x) · vermelho: reconstrução com |k| ≤ k_max",
      caption: "A reconstrução é a expansão de ρ(x) na base contínua e^(2πikx), cortada em k_max. Com k_max pequeno, as duas estruturas se fundem; as oscilações perto das bordas são o efeito do corte (o mesmo da soma parcial de Fourier da Aula 5).",
      secondaryTitle: "Sinal no espaço k", secondarySubtitle: "S(k) = ∫ρ(x)e^(−2πikx)dx · a faixa azul é o que a leitura amostra",
      secondaryCaption: "S(k) está para ρ(x) como Φ(p) está para Ψ(x), com p/ħ ↔ 2πk. Os detalhes finos do objeto vivem em k alto: fora da faixa, eles se perdem.",
      prediction: "Com G = 10 mT/m e t = 1 ms, duas estruturas separadas por 2 mm aparecem separadas? E separadas por 1 mm? Que G seria preciso para Δx = 0,5 mm?",
      calculation: `k_max = (γ/2π)·G·t = 42,58×10⁶ Hz/T × ${fmt(Gmt / 1000, 4)} T/m × ${sci(tms / 1000, 1)} s = <b>${fmt(k, 1)} m⁻¹</b><br>Δx = 1/(2k_max) = 1/(2 × ${fmt(k, 1)} m⁻¹) = <b>${fmt(dxMm, dd)} mm</b><small>uma volta da hélice de fase a cada 1/k_max = ${fmt(1000 / k, 2)} mm</small><div class="limit">Limite do modelo: a analogia é com a matemática da base contínua (expansão completa, Parseval), não com a regra de Born. O sinal de RM é o valor esperado ⟨M⟩ da magnetização de ~10²⁰ prótons por voxel, não uma medida projetiva; medir S(k) não colapsa ρ(x). O k aqui não é o de de Broglie. Objeto 1D, sem ruído, sem relaxação.</div>`,
      metrics: [["k_max", `${fmt(k, 1)} m⁻¹`], ["Δx = 1/(2k_max)", `${fmt(dxMm, dd)} mm`], ["passo da hélice 1/k_max", `${fmt(1000 / k, 2)} mm`], ["separação s/Δx", fmt(smm / dxMm, 2)], ["vale entre as estruturas", res.resolved ? `${fmt(res.dip * 100, 0)} % abaixo dos picos` : "não há vale"]],
      concept: "A imagem de RM é a expansão de ρ(x) na base contínua de ondas planas, com coeficientes S(k) medidos um a um: é a tabela 'discreto × contínuo' da Aula 6 com Φ(p) → S(k). O tempo de leitura e o gradiente limitam k_max, e k_max limita o menor detalhe, Δx = 1/(2k_max).",
      prompts: ["Confira a nota: G = 10 mT/m e t = 1 ms dão k_max = 426 m⁻¹ e Δx = 1,17 mm.", "Com s = 2 mm, reduza G até as estruturas se fundirem. Qual é s/Δx nesse ponto? (O vale some perto de s ≈ 1,5Δx.)", "Que G (com t = 1 ms) dá Δx = 0,5 mm? Por que esse ganho custa tempo de exame (sinal por voxel ∝ volume)?"],
      legend: [[C.gray, "objeto ρ(x)"], [C.red, "reconstrução |k| ≤ k_max"], [C.violet, "S(k)"], [C.blue, "±k_max"]] });
  }

  // ---------------------------------------------------------------- coordenação
  const DRAW = { sequence: drawSequence, spread: drawSpread, degenerate: drawDegenerate, parity: drawParity, mri: drawMri };
  function render() { DRAW[view](); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "sequence";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
    render();
  }
  const DEFAULTS = {
    sequence: { seqEps: .1, seqX0: .5 },
    spread: { spW1: 1, spW2: 1, spW3: 4, spPhi: 1.57 },
    degenerate: { dgC11: .5, dgC12: .707, dgC21: .5 },
    parity: { parKind: "packet", parX0: .1, parW: .1 },
    mri: { mriG: 10, mriT: 1, mriS: 2 },
  };
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((e) => e.addEventListener("input", render));
  document.querySelectorAll("[data-shots]").forEach((b) => b.addEventListener("click", () => shoot(Number(b.dataset.shots))));
  $("spClear").addEventListener("click", () => { state.spread.outcomes = []; render(); });
  document.querySelectorAll("[data-spread]").forEach((b) => b.addEventListener("click", () => {
    const [w1, w2, w3, phi] = b.dataset.spread.split(",").map(Number);
    $("spW1").value = w1; $("spW2").value = w2; $("spW3").value = w3; $("spPhi").value = phi; state.spread.outcomes = []; render();
  }));
  document.querySelectorAll("[data-degen]").forEach((b) => b.addEventListener("click", () => {
    const [a, b2, c] = b.dataset.degen.split(",").map(Number);
    $("dgC11").value = a; $("dgC12").value = b2; $("dgC21").value = c; render();
  }));
  $("resetBtn").addEventListener("click", () => {
    Object.entries(DEFAULTS[view]).forEach(([id, val]) => { $(id).value = val; });
    if (view === "spread") state.spread.outcomes = [];
    render();
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });
  switchView(view);
})();
