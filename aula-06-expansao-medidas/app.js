(function () {
  "use strict";
  // Coordena controles, canvas e textos da aplicação da Aula 6. A física está em physics.js.
  const P = window.QuantumPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", violet: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["boxes", "sequence", "spread", "degenerate", "parity", "mri"];
  let view = new URLSearchParams(location.search).get("view");
  if (!VIEWS.includes(view)) view = "boxes";

  const fmt = (x, n = 2) => (Number.isFinite(x) ? P.formatPt(x, n) : "—");
  const sci = (x, n = 2) => { if (!Number.isFinite(x) || x === 0) return fmt(x, n); let e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; if (Math.abs(Number(m.toFixed(n))) >= 10) { m /= 10; e += 1; } return `${fmt(m, n)}×10${String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])}`; };
  // TeX cru → HTML: e^(−2πikx) → e<sup>…</sup>, σ_H → σ<sub>H</sub> (só nos textos da página, não no canvas).
  const tex = (t) => String(t).replace(/\^\(([^)]*)\)/g, "<sup>$1</sup>").replace(/(\S)_([A-Za-zçíóáéãõ±]+)/g, "$1<sub>$2</sub>");
  const v = (id) => Number($(id).value);
  const set = (id, text) => { $(id).innerHTML = tex(text); };
  const html = (id, content) => { $(id).innerHTML = tex(content); };
  const samples = (a, b, n, fn) => Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; });

  // ---------------------------------------------------------------- desenho
  function canvas(id, aspect, minNarrow = 260) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, narrow = w < 600, h = narrow ? Math.max(w * aspect, minNarrow) : w * aspect;
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, narrow };
  }
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 54, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const lx = (x) => (o.logX ? Math.log10(x) : x), xa = lx(xMin), xb = lx(xMax);
    const X = (x) => left + (lx(x) - xa) * (right - left) / (xb - xa), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    // marcas "redondas" (passos 1, 2, 5 × 10ᵏ, com 0), rótulos com as casas do passo; lista explícita via xTicks/yTicks
    const n = o.ticks ?? 5, nx = P.niceTicks(xMin, xMax, o.xTarget ?? Math.min(n, box.w < 420 ? 4 : n)), ny = P.niceTicks(yMin, yMax, n);
    const xt = o.xTicks || nx.ticks, yt = o.yTicks || ny.ticks;
    xt.forEach((x) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? nx.decimals), X(x), bottom + 14); });
    yt.forEach((y) => {
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "right"; ctx.fillText(fmt(y, o.yDigits ?? ny.decimals), left - 6, Y(y) + 3);
    });
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
    if (d.prediction !== undefined) set("prediction", d.prediction);
    html("calculation", d.calculation);
    html("metrics", d.metrics.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join(""));
    set("conceptTitle", d.conceptTitle || "Ideia física"); set("conceptText", d.concept);
    $("conceptSection").hidden = !!d.hideConcept; $("promptsSection").hidden = !!d.hidePrompts;
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
    const main = canvas("mainCanvas", .5, 520), stack = main.narrow, wL = stack ? main.w : main.w * .36, hL = stack ? main.h * .5 : main.h;
    // painel esquerdo: ψ₁ antes, caixa depois
    const amp = 1 / Math.sqrt(eps), yTop = Math.max(1.7, amp * 1.12);
    const L = axes(main, { x: 0, y: 0, w: wL, h: hL }, -.08, 1.08, 0, yTop, "posição x/a", "amplitude (unid. 1/√a)", { ticks: 4 });
    walls(L, 0, 1);
    clip(L, (c) => { c.fillStyle = "rgba(233,162,59,.18)"; c.fillRect(L.X(x0 - eps / 2), L.top, L.X(x0 + eps / 2) - L.X(x0 - eps / 2), L.bottom - L.top); });
    line(L, samples(0, 1, 240, (u) => P.boxWave(1, u)), C.blue, [], 2.4);
    line(L, [{ x: 0, y: 0 }, { x: x0 - eps / 2, y: 0 }, { x: x0 - eps / 2, y: amp }, { x: x0 + eps / 2, y: amp }, { x: x0 + eps / 2, y: 0 }, { x: 1, y: 0 }], C.red, [], 2.6);
    label(main.ctx, "ψ₁ (antes)", L.X(.06), L.Y(1.5) - 4, C.blue, "left", "bold 11px Ubuntu, system-ui");
    {
      // rótulo da caixa do lado com espaço, sem cruzar a parede; se nenhum lado couber, fica no topo, à esquerda
      const txt = "caixa (depois)", fnt = "bold 11px Ubuntu, system-ui"; main.ctx.font = fnt;
      const wTxt = main.ctx.measureText(txt).width, xr = L.X(x0 + eps / 2) + 6, xl = L.X(x0 - eps / 2) - 6, yy = L.Y(Math.min(amp, yTop * .92)) + 4;
      if (xr + wTxt < L.X(1) - 4) label(main.ctx, txt, xr, yy, C.red, "left", fnt);
      else if (xl - wTxt > L.X(0) + 4) label(main.ctx, txt, xl, yy, C.red, "right", fnt);
      else label(main.ctx, txt, L.left + 6, L.top + 28, C.red, "left", fnt);
    }
    // painel direito: P(Eₙ) da nova medida de H
    const pMax = Math.max(...probs, plateau) * 1.15;
    const R = axes(main, stack ? { x: 0, y: hL, w: main.w, h: main.h - hL } : { x: wL, y: 0, w: main.w - wL, h: main.h }, 0, N + 1, 0, pMax, "nível n da nova medida de energia", "P(Eₙ) = |cₙ|²", { xTicks: [1, 10, 20, 30, 40, 50, 60], xLabels: (x) => String(x), ticks: 5 });
    probs.forEach((p, i) => bar(R, i + 1, .7, p, (i + 1) % 2 ? C.red : C.gold));
    hline(R, plateau, C.ink, [6, 4], 1.4);
    label(main.ctx, `patamar 2ε/a = ${fmt(plateau, 3)}`, R.right - 4, R.Y(plateau) - 5, C.ink, "right", "10px Ubuntu, system-ui");
    if (1 / eps <= N) { vline(R, 1 / eps, C.violet); label(main.ctx, "n = a/ε", R.X(1 / eps) + 4, R.top + 12, C.violet, "left", "10px Ubuntu, system-ui"); }
    // secundário: soma acumulada
    const sec = canvas("secondaryCanvas", .3), nMax = 2000;
    let s = 0; const cum = [];
    for (let n = 1; n <= nMax; n += 1) { s += P.boxCoefficient(n, x0, eps) ** 2; if (n < 10 || n % 5 === 0 || n === nMax) cum.push({ x: n, y: s }); }
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 1, nMax, 0, 1, "n (escala log)", "Σ P(Eₖ), k ≤ n", { logX: true, xTicks: [1, 10, 100, 1000], xLabels: (x) => String(x), ticks: 4 });
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
      concept: "Medir x é medir um observável incompatível com H: o estado é projetado no intervalo I e a informação sobre a energia se perde. H → x → H mostra essa incompatibilidade (a segunda medida de H deixa de ser certa). Não é, sozinha, prova de que a energia não pré-existia: essa prova é a interferência (Aula 5). Nota da Aula 6, §3.",
      prompts: ["Só para ε = a/10 e x₀ = a/2, confira a nota: P(E₁) = 0,198, P(E₃) = 0,186, P(E₅) = 0,162, e a soma só chega a 0,98 em n ≈ 100.", "Reduza ε para a/20: P(E₁) cai para quanto? Compare com o patamar 2ε/a e com n ~ a/ε.", "Tire o detector do centro (x₀ = 0,3a): por que os níveis pares aparecem?"],
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
    const main = canvas("mainCanvas", .46, 300);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 0, 15.5, 0, 1, "energia E (eV)", "probabilidade / frequência", { ticks: 4,  xTicks: [0, 3, 6, 9, 12, 15] });
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
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 1, nTop, 0, 15, "número de medidas N (log)", "média (eV)", { logX: true, xTicks: [1, 10, 100, 1000, 10000].filter((x) => x <= nTop), xLabels: (x) => String(x), ticks: 3 });
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
    const raw = [{ nx: 1, ny: 1, c: v("dgC11") }, { nx: 1, ny: 2, c: v("dgC12") }, { nx: 2, ny: 1, c: v("dgC21") }], nullState = raw.every((t) => Math.abs(t.c) < 1e-9);
    const st = P.normalizeState(raw), m5 = P.measureDegenerate(st, 5), m2 = P.measureDegenerate(st, 2);
    const meanE = st.reduce((a, t) => a + t.c * t.c * P.energy2D(t.nx, t.ny), 0);
    const main = canvas("mainCanvas", .5, 220), ctx = main.ctx, size = Math.min(main.h - 70, main.w * .36), gap = (main.w - 2 * size) / 3;
    const y0 = 34;
    heatmap(ctx, gap, y0, size, st, "before");
    label(ctx, nullState ? "antes: estado nulo → |1,1⟩" : "antes: |Ψ(x,y)|²", gap + size / 2, y0 - 12, nullState ? C.red : C.ink, "center", "bold 12px Ubuntu, system-ui");
    if (m5.P > 1e-9) {
      heatmap(ctx, 2 * gap + size, y0, size, m5.post, "after");
      label(ctx, main.narrow ? "depois (5E₁)" : "depois de obter E₁₂ = 5E₁: |Ψ(depois)|²", 2 * gap + 1.5 * size, y0 - 12, C.red, "center", "bold 12px Ubuntu, system-ui");
    } else {
      ctx.strokeStyle = C.faint; ctx.strokeRect(2 * gap + size, y0, size, size);
      label(ctx, main.narrow ? "P(E₁₂) = 0" : "P(E₁₂) = 0: esse resultado não ocorre", 2 * gap + 1.5 * size, y0 + size / 2, C.red, "center", "bold 12px Ubuntu, system-ui");
    }
    // seta entre os mapas
    const ax = gap + size + 8, bx = 2 * gap + size - 8, ay = y0 + size / 2;
    ctx.strokeStyle = ctx.fillStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, ay); ctx.lineTo(bx - 9, ay - 5); ctx.lineTo(bx - 9, ay + 5); ctx.closePath(); ctx.fill();
    if (bx - ax > 70) label(ctx, "P̂(q)Ψ/√P(q)", (ax + bx) / 2, ay - 8, C.ink, "center", "11px Ubuntu, system-ui");
    else label(ctx, "P̂(q)", (ax + bx) / 2, ay - 8, C.ink, "center", "bold 11px Ubuntu, system-ui");
    // secundário: diagrama de níveis com |c|²
    const sec = canvas("secondaryCanvas", .3);
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 0, 4, 0, 1, "autoestados (nx, ny), com a energia de cada um", "|c|² e P(E)", { xTicks: [.8, 2, 3.2], xLabels: (x) => (x < 1 ? "|1,1⟩ · E = 2E₁" : x < 2.5 ? "|1,2⟩ · E = 5E₁" : "|2,1⟩ · E = 5E₁"), ticks: 4 });
    const p11 = st[0].c ** 2, p12 = st[1].c ** 2, p21 = st[2].c ** 2;
    bar(S, .8, .5, p11, C.blue); bar(S, 2, .5, p12, C.red); bar(S, 3.2, .5, p21, C.gold);
    clip(S, (c) => { c.strokeStyle = C.ink; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(S.X(1.6), S.Y(m5.P), S.X(3.6) - S.X(1.6), S.Y(0) - S.Y(m5.P)); });
    label(sec.ctx, `P(E₁₂) = ${fmt(p12, 3)} + ${fmt(p21, 3)} = ${fmt(m5.P, 3)}`, S.X(2.6), Math.max(S.top + 12, S.Y(m5.P) - 6), C.ink, "center", "bold 11px Ubuntu, system-ui");
    const post = m5.post, a12 = post[0] ? post[0].c : NaN, a21 = post[1] ? post[1].c : NaN;
    texts({ status: "Degenerescência", detail: nullState ? "estado nulo: usando |1,1⟩" : `P(E₁₂) = ${fmt(m5.P, 3)}`,
      title: "Regra de Born com projetor num autovalor degenerado", subtitle: "|1,2⟩ e |2,1⟩ têm a mesma energia 5E₁: a medida não distingue entre eles",
      caption: "Mapa de |Ψ|² no quadrado (escuro = densidade alta). À direita, o estado depois de uma medida de energia que deu 5E₁: a componente |1,1⟩ some, e as componentes |1,2⟩ e |2,1⟩ ficam na mesma proporção (e com o mesmo sinal relativo) que tinham antes.",
      secondaryTitle: "Pesos na base de energia", secondarySubtitle: "a caixa tracejada soma o autoespaço degenerado: P(E₁₂) = ⟨Ψ|P̂_q|Ψ⟩",
      secondaryCaption: "Para g = 1 (|1,1⟩), a regra volta a ser P = |c|². Para g = 2, soma-se sobre o autoespaço, e o estado pós-medida é a projeção normalizada, não um dos kets.",
      prediction: "Em ½|1,1⟩ + (1/√2)|1,2⟩ + ½|2,1⟩, a medida de energia dá 5E₁. O estado depois é |1,2⟩, |2,1⟩, ou outra coisa? E qual é P(5E₁): ½, ¼ ou ¾?",
      calculation: `${nullState ? `<span class="warn">Estado nulo: as três amplitudes são 0 e não definem um estado; a conta usa |1,1⟩ (convenção da aplicação). Aumente alguma amplitude.</span><br>` : ""}P(E₁₂) = |⟨1,2|Ψ⟩|² + |⟨2,1|Ψ⟩|² = ${fmt(p12, 3)} + ${fmt(p21, 3)} = <b>${fmt(m5.P, 3)}</b><br>${m5.P > 1e-9 ? `Ψ_pós = (${fmt(st[1].c, 3)}|1,2⟩ + ${fmt(st[2].c, 3)}|2,1⟩)/√${fmt(m5.P, 3)} = <b>${fmt(a12, 3)}|1,2⟩ ${a21 < 0 ? "−" : "+"} ${fmt(Math.abs(a21), 3)}|2,1⟩</b>` : "P(E₁₂) = 0: não há estado pós-medida"}<small>P̂_q = |1,2⟩⟨1,2| + |2,1⟩⟨2,1|, P̂_q² = P̂_q</small>`,
      metrics: [["P(E₁₁ = 2E₁)", fmt(m2.P, 3)], ["P(E₁₂ = 5E₁)", fmt(m5.P, 3)], ["Ψ_pós: coeficiente de |1,2⟩", fmt(a12, 3)], ["Ψ_pós: coeficiente de |2,1⟩", fmt(a21, 3)], ["só |⟨1,2|Ψ⟩|² (esquece a degenerescência)", fmt(p12, 3)], ["⟨H⟩", `${fmt(meanE, 3)} E₁`]],
      concept: "Quando o autovalor é degenerado, a medida informa só o autoespaço: P(q) = ⟨Ψ|P̂_q|Ψ⟩ soma sobre os g estados, e o estado pós-medida P̂_qΨ/√P(q) preserva as proporções dentro do autoespaço. Em 1D, com estados ligados, isso não acontece (Aula 4); em 2D e 3D é a regra (hidrogênio, Aula 23).",
      prompts: ["Carregue o exemplo da nota: confira P = ¾ e Ψ_pós = √(2/3)|1,2⟩ + √(1/3)|2,1⟩.", "Carregue o segundo preset (|1,1⟩ + |1,2⟩ − |2,1⟩)/√3: o sinal relativo sobrevive à medida? Compare os dois mapas.", "Zere |1,2⟩ e |2,1⟩: o que a tela diz sobre o resultado 5E₁?"],
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
    const main = canvas("mainCanvas", .46, 300);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -.6, .6, -yMax, yMax, "posição x/a", "ψ (unid. 1/√a)", { ticks: 6 });
    walls(ch, -.5, .5); hline(ch, 0, C.gray, [], 1); vline(ch, 0, C.gray, [2, 3], 1);
    line(ch, samples(-.5, .5, 400, (s) => psi(-s)), C.gray, [5, 4], 1.8);
    line(ch, samples(-.5, .5, 400, pp.even), C.blue, [], 2.4);
    line(ch, samples(-.5, .5, 400, pp.odd), C.gold, [], 2.4);
    line(ch, samples(-.5, .5, 400, psi), C.red, [], 3);
    // secundário: P(±1) e |cₙ|² com a paridade de cada ψₙ
    const sec = canvas("secondaryCanvas", .3, 420), stk = sec.narrow, wA = stk ? sec.w : sec.w * .3, hA = stk ? sec.h * .42 : sec.h;
    const A = axes(sec, { x: 0, y: 0, w: wA, h: hA }, 0, 3, 0, 1, "autovalor de Π̂", "P", { xTicks: [1, 2], xLabels: (x) => (x === 1 ? "+1" : "−1"), ticks: 4 });
    bar(A, 1, .6, pp.pPlus, C.blue); bar(A, 2, .6, pp.pMinus, C.gold);
    const B = axes(sec, stk ? { x: 0, y: hA, w: sec.w, h: sec.h - hA } : { x: wA, y: 0, w: sec.w - wA, h: sec.h }, 0, 13, 0, 1, "nível n (azul: ψₙ par, n ímpar · dourado: ψₙ ímpar, n par)", "|cₙ|²", { xTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], xLabels: (x) => String(x), ticks: 4 });
    cs.forEach((c, i) => bar(B, i + 1, .6, c * c, P.parityOf(i + 1) > 0 ? C.blue : C.gold));
    texts({ status: "Paridade", detail: kind === "packet" ? `x₀ = ${fmt(x0, 2)}a · σ = ${fmt(w, 2)}a` : "(ψ₁ + ψ₂)/√2",
      title: "Paridade como observável: ψ = ψ_par + ψ_ímpar", subtitle: "vermelho: ψ(x) · cinza tracejado: Π̂ψ = ψ(−x) · azul: ψ_par · dourado: ψ_ímpar",
      caption: "ψ_par = ½[ψ(x) + ψ(−x)] e ψ_ímpar = ½[ψ(x) − ψ(−x)] são as projeções P̂_±ψ = ½(Î ± Π̂)ψ. Os autovalores de Π̂ são só ±1, porque Π̂² = Î.",
      secondaryTitle: "Probabilidades de paridade e a base de energia", secondarySubtitle: "P(+1) = Σ dos |cₙ|² com n ímpar (ψₙ par no poço simétrico)",
      secondaryCaption: "Como V(−x) = V(x), [Ĥ, Π̂] = 0 e cada ψₙ do poço tem paridade (−1)^(n+1): ψ₁, ψ₃, … são pares; ψ₂, ψ₄, … ímpares. Por isso P(+1) também é a soma dos |cₙ|² de n ímpar.",
      prediction: "Desloque o pacote do centro do poço. P(+1) cai a zero, vai para ½ ou continua 1? E num pacote estreito longe do centro?",
      calculation: `P(+1) = ∫|ψ_par|² dx = <b>${fmt(pp.pPlus, 4)}</b> · P(−1) = ∫|ψ_ímpar|² dx = <b>${fmt(pp.pMinus, 4)}</b><br>⟨Π̂⟩ = (+1)·${fmt(pp.pPlus, 4)} + (−1)·${fmt(pp.pMinus, 4)} = ${fmt(pp.mean, 4)}<small>conferência: Σ|cₙ|² sobre n ímpar ≤ 39 = ${fmt(oddSum, 4)}</small>`,
      metrics: [["P(+1)", fmt(pp.pPlus, 4)], ["P(−1)", fmt(pp.pMinus, 4)], ["P(+1) + P(−1)", fmt(pp.pPlus + pp.pMinus, 4)], ["⟨Π̂⟩", fmt(pp.mean, 4)], ["Σ|cₙ|², n ímpar ≤ 39", fmt(oddSum, 4)], ["|c₁|²", fmt(cs[0] ** 2, 4)]],
      concept: "A paridade é um observável como os outros: operador hermitiano Π̂, autovalores ±1, autoespaços infinitamente degenerados, e a regra de Born com os projetores P̂_± = ½(Î ± Π̂) (nota da Aula 6, §5.1). Na prática ela se lê por regras de seleção: a transição 3 → 1 do poço é proibida porque ψ₁ e ψ₃ têm a mesma paridade (Aula 5).",
      prompts: ["Escolha (ψ₁ + ψ₂)/√2 e confira a nota: P(+1) = P(−1) = ½.", "Com σ = 0,1a, leve x₀ de 0 a 0,3a. Para onde tende P(+1)? Por que um pacote estreito longe do centro tem P(±1) ≈ ½?", "Compare P(+1) com a soma dos |cₙ|² de n ímpar. Por que elas coincidem?"],
      legend: [[C.red, "ψ(x)"], [C.gray, "ψ(−x)", true], [C.blue, "ψ_par"], [C.gold, "ψ_ímpar"]] });
  }

  // ================================================================ 05 · espaço k da RM
  function drawMri() {
    const Gmt = v("mriG"), tms = v("mriT"), smm = v("mriS");
    set("mriGOut", fmt(Gmt, 1)); set("mriTOut", fmt(tms, 1)); set("mriSOut", fmt(smm, 1));
    const k = P.kMaxPerM(Gmt * 1e-3, tms * 1e-3), dxMm = P.resolutionM(k) * 1e3, dd = dxMm < .1 ? 3 : 2, bands = P.phantom(smm * 1e-3), res = P.resolved(bands, k, smm * 1e-3);
    const main = canvas("mainCanvas", .46, 300);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, -12, 12, -.3, 1.5, "posição x (mm)", "densidade de prótons ρ (relativa)", { xTicks: main.narrow ? [-12, -6, 0, 6, 12] : [-12, -8, -4, 0, 4, 8, 12], ticks: 5 });
    hline(ch, 0, C.gray, [], 1);
    area(ch, samples(-12, 12, 1200, (x) => P.rho(bands, x * 1e-3)), "rgba(111,113,113,.22)");
    line(ch, samples(-12, 12, 1200, (x) => P.reconstruct(bands, k, x * 1e-3)), C.red, [], 2.6);
    // barra de escala Δx
    // régua de Δx encostada na direita; se Δx > 23 mm (janela de 24 mm), ocupa a janela toda e o rótulo avisa
    const yb = 1.22, xr = 11.5, tooLong = dxMm > 23, xl = tooLong ? -11.5 : xr - dxMm;
    clip(ch, (c) => { c.strokeStyle = C.blue; c.lineWidth = 3; c.setLineDash([]); c.beginPath(); c.moveTo(ch.X(xl), ch.Y(yb)); c.lineTo(ch.X(xr), ch.Y(yb)); c.stroke(); if (tooLong) { c.fillStyle = C.blue; c.beginPath(); c.moveTo(ch.X(xr) + 4, ch.Y(yb)); c.lineTo(ch.X(xr) - 6, ch.Y(yb) - 5); c.lineTo(ch.X(xr) - 6, ch.Y(yb) + 5); c.closePath(); c.fill(); } });
    label(main.ctx, tooLong ? `Δx = ${fmt(dxMm, dd)} mm (> 23 mm: régua maior que a janela)` : `Δx = ${fmt(dxMm, dd)} mm`, ch.X(xr), ch.Y(yb) - 7, C.blue, "right", "bold 11px Ubuntu, system-ui");
    // secundário: S(k)
    const sec = canvas("secondaryCanvas", .3, 240), kPlot = Math.max(1500, 1.5 * k), S0 = P.signal(bands, 0);
    // marcas redondas com 0 e ±k_max; descarta a marca redonda que ficaria a menos de 12 % do vão de ±k_max (rótulos sobrepostos)
    const kTicks = [...P.niceTicks(-kPlot, kPlot, sec.narrow ? 4 : 6).ticks.filter((q) => Math.abs(Math.abs(q) - k) > 0.12 * kPlot), -k, k].sort((a, b) => a - b);
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, -kPlot, kPlot, -.4, 1, "frequência espacial k (m⁻¹)", "S(k)/S(0)", { xTicks: kTicks, xLabels: (q) => fmt(q, 0), yTicks: [-.4, 0, .5, 1], yDigits: 1 });
    clip(S, (c) => { c.fillStyle = "rgba(69,123,157,.14)"; c.fillRect(S.X(-k), S.top, S.X(k) - S.X(-k), S.bottom - S.top); });
    line(S, samples(-kPlot, kPlot, 3000, (q) => P.signal(bands, q) / S0), C.violet, [], 1.6);
    vline(S, -k, C.blue, [], 1.6); vline(S, k, C.blue, [], 1.6);
    {
      // "±k_max = ±426 m⁻¹" com índice rebaixado; do lado da faixa com espaço
      const c = sec.ctx, f1 = "bold 11px Ubuntu, system-ui", f2 = "bold 8px Ubuntu, system-ui", pre = "±k", sub = "max", post = ` = ±${fmt(k, 0)} m⁻¹`;
      c.font = f1; const w1 = c.measureText(pre).width, w3 = c.measureText(post).width; c.font = f2; const w2 = c.measureText(sub).width, tot = w1 + w2 + w3;
      let x = S.X(k) + 6; if (x + tot > S.right) x = S.X(k) - 6 - tot;
      c.fillStyle = C.blue; c.textAlign = "left"; c.font = f1; c.fillText(pre, x, S.top + 12); c.font = f2; c.fillText(sub, x + w1, S.top + 15); c.font = f1; c.fillText(post, x + w1 + w2, S.top + 12);
    }
    texts({ status: "Física médica: espaço k", detail: `G = ${fmt(Gmt, 1)} mT/m · t = ${fmt(tms, 1)} ms`,
      title: "Imagem de RM como expansão truncada em ondas planas", subtitle: "cinza: objeto ρ(x) · vermelho: reconstrução com |k| ≤ k_max",
      caption: "A reconstrução é a expansão de ρ(x) na base contínua e^(2πikx), cortada em k_max. Com k_max pequeno, as duas estruturas se fundem; as oscilações perto das bordas são o efeito do corte (o mesmo da soma parcial de Fourier da Aula 5).",
      secondaryTitle: "Sinal no espaço k", secondarySubtitle: "S(k) = ∫ρ(x)e^(−2πikx)dx · a faixa azul é o que a leitura amostra",
      secondaryCaption: "S(k) está para ρ(x) como Φ(p) está para Ψ(x), com p/ħ ↔ 2πk. Os detalhes finos do objeto vivem em k alto: fora da faixa, eles se perdem.",
      prediction: "Com G = 10 mT/m e t = 1 ms, duas estruturas separadas por 2 mm aparecem separadas? E separadas por 1 mm? Que G seria preciso para Δx = 0,5 mm?",
      calculation: `k_max = (γ/2π)·G·t = 42,58×10⁶ Hz/T × ${fmt(Gmt / 1000, 4)} T/m × ${sci(tms / 1000, 1)} s = <b>${fmt(k, 1)} m⁻¹</b><br>Δx = 1/(2k_max) = 1/(2 × ${fmt(k, 1)} m⁻¹) = <b>${fmt(dxMm, dd)} mm</b><small>uma volta da hélice de fase a cada 1/k_max = ${fmt(1000 / k, 2)} mm</small><div class="limit">Limite do modelo: a analogia é com a matemática da base contínua (expansão completa, Parseval), não com a regra de Born. O sinal de RM é o valor esperado ⟨M⟩ da magnetização de 10²⁰–10²¹ prótons por voxel (1 a 5 mm³), não uma medida projetiva; o ensemble é espacial (spins simultâneos, não muitas aquisições) e o estado do voxel é uma mistura, ρ = ½(1 + P σ_n), não um estado puro. Medir S(k) não colapsa ρ(x). O k aqui não é o de de Broglie. Objeto 1D, sem ruído, sem relaxação.</div>`,
      metrics: [["k_max", `${fmt(k, 1)} m⁻¹`], ["Δx = 1/(2k_max)", `${fmt(dxMm, dd)} mm`], ["passo da hélice 1/k_max", `${fmt(1000 / k, 2)} mm`], ["separação s/Δx", fmt(smm / dxMm, 2)], ["vale entre as estruturas", res.resolved ? `${fmt(res.dip * 100, 0)} % abaixo dos picos` : "não há vale"]],
      concept: "A imagem de RM é a expansão de ρ(x) na base contínua de ondas planas, com coeficientes S(k) medidos um a um: é a tabela 'discreto × contínuo' da Aula 6 com Φ(p) → S(k). O tempo de leitura e o gradiente limitam k_max, e k_max limita o menor detalhe, Δx = 1/(2k_max).",
      prompts: ["Confira a nota: G = 10 mT/m e t = 1 ms dão k_max = 426 m⁻¹ e Δx = 1,17 mm.", "Com s = 2 mm, reduza G até as estruturas se fundirem. Qual é s/Δx nesse ponto? (O vale some perto de s ≈ 1,5Δx.)", "Que G (com t = 1 ms) dá Δx = 0,5 mm? Por que esse ganho custa tempo de exame (sinal por voxel ∝ volume)?"],
      legend: [[C.gray, "objeto ρ(x)"], [C.red, "reconstrução |k| ≤ k_max"], [C.violet, "S(k)"], [C.blue, "±k_max"]] });
  }

  // ================================================================ 01 · caixas e fichas
  // Quarteto: caixas A1..A4 (E = 1, 4, 9, 16 E₁), jogo B (tabela ±½), sacos, fase, salas, paridade, contínuo.
  // Sete "blocos" em quatro modos; cada bloco tem sua previsão (campo que trava os controles), ação e leitura.
  const BNAMES = P.QUARTETO.names, BE = P.QUARTETO.E, BCOL = [C.red, C.gold, C.blue, C.violet], BB = ["B1", "B2", "B3", "B4"];
  const E1EV = P.levelEV(1, 0.5);   // 1,504 eV: conversão única do exemplo da nota (poço de 0,5 nm)
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const MODE_BLOCKS = { ficha: ["ficha"], sacos: ["sacos"], aba: ["aba", "fase"], salas: ["degen", "paridade", "continuo"] };
  const BLOCK_LABEL = { ficha: "Ficha e leitor", sacos: "Dois sacos", aba: "A → B → A", fase: "Fase e tempo", degen: "Degenerescência", paridade: "Paridade", continuo: "Contínuo" };
  const BLOCKS = Object.values(MODE_BLOCKS).flat();
  const modeOf = (b) => Object.keys(MODE_BLOCKS).find((m) => MODE_BLOCKS[m].includes(b));
  const seedParam = new URLSearchParams(location.search).get("seed");
  const rnd = seedParam !== null && seedParam !== "" && Number.isFinite(Number(seedParam)) ? P.mulberry32(Number(seedParam)) : () => Math.random();
  const T_PERIODO = 2 * Math.PI / P.DELTA_E_BATIMENTO;   // período do batimento em ħ/E₁ (2π/3)
  const bx = state.box = {
    block: "ficha", locked: {}, choice: {}, why: {}, acted: {}, anim: null, last: 0,
    ficha: { counts: [0, 0, 0, 0], N: 0, sumE: 0, after: null, sig: "" },
    sacos: { game: "A", M: { A: [0, 0, 0, 0], B: [0, 0, 0, 0] }, S: { A: [0, 0, 0, 0], B: [0, 0, 0, 0] } },
    aba: { rows: [], hist: [0, 0, 0, 0], same: 0, N: 0 },
    fase: { t: 0, playing: false },
    degen: { counts: [], N: 0, sig: "", roomSig: "", after: null },
    par: { game: "pi", pi: [0, 0], lr: [0, 0], sig: "", after: null },
    cont: { samples: [] },
  };
  const argDeg = (z) => { const d = Math.round(Math.atan2(z[1], z[0]) * 180 / Math.PI); return d === -180 ? 180 : d; };
  function fmtC(z, n = 3) {
    const re = Math.abs(z[0]) < 0.5 * 10 ** -n ? 0 : z[0], im = Math.abs(z[1]) < 0.5 * 10 ** -n ? 0 : z[1];
    if (!im) return fmt(re, n);
    if (!re) return `${fmt(im, n)} i`;
    return `${fmt(re, n)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im), n)} i`;
  }
  const setAria = (id, text) => $(id).setAttribute("aria-label", text);
  const hasData = (c) => c.reduce((a, b) => a + b, 0) > 0;
  const freqs = (c) => { const n = c.reduce((a, b) => a + b, 0); return c.map((k) => (n ? k / n : 0)); };

  // ---- controles de fichas (módulo e fase por caixa), gerados uma vez
  function buildBoxControls(hostId, prefix, names, o = {}) {
    $(hostId).innerHTML = `<div class="boxrow head${o.labels ? " withq" : ""}"><span>caixa</span><span>módulo</span><span>fase (°)</span>${o.labels ? "<span>rótulo q</span>" : ""}</div>` +
      names.map((nm, i) => `<div class="boxrow${o.labels ? " withq" : ""}"><b style="color:${BCOL[i % 4]}">${nm}</b><input id="${prefix}M${i}" type="range" min="0" max="2" step="${o.step || 0.05}" value="0" aria-label="módulo de ${nm}"><input id="${prefix}F${i}" type="range" min="0" max="355" step="5" value="0" aria-label="fase de ${nm}, em graus">` +
        `${o.labels ? `<select id="${prefix}Q${i}" aria-label="rótulo q de ${nm}">${[-2, -1, 0, 1, 2, 3, 4, 5].map((q) => `<option value="${q}">${q < 0 ? "−" + -q : q}</option>`).join("")}</select>` : ""}<output id="${prefix}O${i}"></output></div>`).join("");
  }
  buildBoxControls("fcBoxes", "fc", BNAMES);
  buildBoxControls("dgBoxes", "dg", ["|1⟩", "|2⟩", "|3⟩"], { labels: true, step: 0.001 });
  buildBoxControls("prBoxes", "pr", BNAMES);
  function readFicha(prefix, n) {
    const mods = Array.from({ length: n }, (_, i) => v(`${prefix}M${i}`)), phases = Array.from({ length: n }, (_, i) => v(`${prefix}F${i}`));
    const c = P.fichaDePolar(mods, phases);
    c.forEach((z, i) => { const m = Math.hypot(z[0], z[1]); set(`${prefix}O${i}`, m < 1e-9 ? "|c| = 0" : `|c| = ${fmt(m, 2)} ∠ ${argDeg(z)}°`); });
    return { mods, phases, c, nula: P.fichaNula(mods) };
  }
  function setFicha(prefix, spec) {
    const [m, f] = spec.split(";").map((s) => s.split(",").map(Number));
    m.forEach((x, i) => { $(`${prefix}M${i}`).value = x; }); f.forEach((x, i) => { $(`${prefix}F${i}`).value = x; });
  }
  const DG = {
    q: { names: ["|1⟩", "|2⟩", "|3⟩"], spec: "1,1,2;0,90,180", q: [2, -1, -1] },
    poco: { names: ["|1,1⟩", "|1,2⟩", "|2,1⟩"], spec: "0.5,0.707,0.5;0,0,0", q: [2, 5, 5] },
    ex3: { names: ["|1,1⟩", "|1,2⟩", "|2,1⟩"], spec: "0.5,0.5,0.707;0,0,0", q: [2, 5, 5] },
  };
  let dgNames = DG.poco.names;
  function setDegen(key) {
    const d = DG[key]; dgNames = d.names; setFicha("dg", d.spec); d.q.forEach((q, i) => { $(`dgQ${i}`).value = q; });
    document.querySelectorAll("#dgBoxes .boxrow:not(.head) b").forEach((b, i) => { b.textContent = d.names[i]; });
  }

  // ---- previsões (campo que trava)
  const PRED = {
    ficha: { q: "Na ficha preparada, o ponteiro de A2 tem comprimento 1/√6 e ângulo de 90°. O que determina a probabilidade de sair A2 numa medida de energia?",
      opts: ["o ângulo do ponteiro de A2 (90°, imaginário)", "o comprimento do ponteiro de A2, elevado ao quadrado", "o comprimento do ponteiro de A2, sem elevar", "o número de caixas da ficha (uma de quatro)"], ok: 1,
      why: "P = |c₂|² = (1/√6)² = 1/6. O ângulo é a fase: não aparece em P(A), só em jogos que atravessam as caixas (modo 3). O comprimento sem o quadrado é a amplitude, não a probabilidade; e as caixas não são equiprováveis." },
    sacos: { q: "Saco M: metade das fichas é A1 e metade é A2. Saco S: todas as fichas são (A1 + A2)/√2. Medindo no jogo B (tabela ±½), o que o saco S pode fazer que o M não faz?",
      opts: ["nada: ignorância e superposição dão a mesma estatística em todo jogo", "zerar exatamente B2 e B4, porque os ponteiros de A1 e A2 se cancelam", "zerar exatamente B1 e B3, porque os ponteiros de A1 e A2 se cancelam"], ok: 1,
      why: "S é uma ficha: c′ = Bc = (1/√2, 0, 1/√2, 0), logo B2 e B4 têm P = 0 exato. M é mistura: cada linha de B vale ±½ e P = ¼ em todas. (No jogo A os dois sacos coincidem.)" },
    aba: { q: "A ficha (1, 1, 0, 0)/√2 é medida no jogo A, depois no jogo B (que atravessa as caixas de A), depois no jogo A de novo. Com que probabilidade a segunda medida de A repete a primeira?",
      opts: ["1, pois a energia já foi medida e B não mexe nela", "1/2, pois sobram as duas caixas A iniciais", "1/4, pois B espalha a ficha pelas quatro caixas A"], ok: 2,
      why: "Depois de B a ficha é uma caixa B, e cada linha de B vale ±½ em A: P(A) = ¼ em todas as caixas. Uma bola clássica repetiria a cor em 100 % só porque olhar a forma não a perturba." },
    fase: { q: "Três fichas, (1, 1)/√2, (1, −1)/√2 e (1, i)/√2, têm as mesmas probabilidades de energia (½, ½, 0, 0). Onde a fase relativa de A2 pode aparecer?",
      opts: ["em nenhuma probabilidade: a fase é convenção de desenho", "em jogos que atravessam as caixas de A, como o jogo B", "nas de energia, que dependem de cada ponteiro inteiro"], ok: 1,
      why: "A fase está no termo cruzado c₁*c₂, que só aparece em jogos que atravessam as caixas de A: (½,0,½,0), (0,½,0,½) e (¼,¼,¼,¼) para as três fichas." },
    degen: { q: "No poço 2D a ficha tem ponteiros (½, 1/√2, ½) nas caixas |1,1⟩, |1,2⟩, |2,1⟩, de energias 2, 5 e 5 E₁ (as duas últimas formam a sala 5). Como se obtém a probabilidade de a medida dar 5E₁?",
      opts: ["soma dos |c|² das caixas da sala 5", "fração de caixas: 2 caixas de 3 (g/N)", "|c|² só da caixa de maior ponteiro", "soma dos ponteiros da sala, c₂ + c₃"], ok: 0,
      why: "P(5) = |c₂|² + |c₃|² = 1/2 + 1/4 = 3/4. A fração g/N = 2/3 trata as caixas como equiprováveis: a multiplicidade não dá probabilidade; e somar ponteiros sem o quadrado é somar amplitudes." },
    paridade: { q: "A ficha (3ψ₁ + 4iψ₂)/5 está nas caixas A1 (ψ₁, par, +1) e A2 (ψ₂, ímpar, −1). A probabilidade de a medida de paridade dar +1 vem de:",
      opts: ["o comprimento do ponteiro de A1 (3/5)", "o quadrado do comprimento do ponteiro de A1", "½, porque há só duas salas, + e −", "o quadrado do ponteiro de A2, que é ímpar"], ok: 1,
      why: "P(+) = |3/5|² = 0,36 (a sala + é A1 e A3) e P(−) = 0,64. Então ⟨Π⟩ = 0,36 − 0,64 = −0,28, que não é +1 nem −1." },
    continuo: { q: "A amplitude Φ(p) é uniforme em [0, 2p₀]. A probabilidade de medir p entre 0,5p₀ e 0,7p₀ é dada por:",
      opts: ["a altura de |Φ|² nesse intervalo", "a largura do intervalo (0,2p₀)", "a área de |Φ|² sob o intervalo", "1, pois p está no suporte de Φ"], ok: 2,
      why: "P = ∫|Φ|² dp = altura × largura = (0,5/p₀) × 0,2p₀ = 0,1: é a área, não a altura nem a largura." },
  };
  const LET = "ABCD";
  function buildPrediction() {
    const b = bx.block, p = PRED[b], lock = !!bx.locked[b], ch = bx.choice[b];
    set("bxQuestion", p.q);
    $("predChoices").innerHTML = p.opts.map((o, i) => `<label class="choice"><input type="radio" name="pred" value="${i}"${ch === i ? " checked" : ""}${lock ? " disabled" : ""}><span><b>${LET[i]})</b> ${tex(o)}</span></label>`).join("");
    $("predLock").hidden = lock; $("predLock").disabled = !(Number.isInteger(ch) && ch >= 0);
    const why = $("predWhy"); why.value = bx.why[b] || ""; why.disabled = lock;
  }
  function predFeedback() {
    const b = bx.block, p = PRED[b], ch = bx.choice[b];
    let t = "";   // a instrução de travar aparece num só lugar (lockNote)
    if (bx.locked[b]) {
      if (!Number.isInteger(ch) || ch < 0) t = "Previsão dispensada (?unlock=1).";
      else if (!bx.acted[b]) t = `Previsão travada: ${LET[ch]}. Agora use os controles e confronte com as leituras.`;
      else t = `Sua previsão: ${LET[ch]}. ${ch === p.ok ? "Confere" : "Difere"}: a resposta é ${LET[p.ok]}. ${p.why}`;
    }
    set("predFeedback", t); $("lockNote").hidden = !!bx.locked[b];
  }
  function applyLock() {
    document.querySelectorAll(".block-controls").forEach((fs) => { const on = fs.dataset.block === bx.block; fs.classList.toggle("active", on); fs.disabled = !bx.locked[fs.dataset.block] || !!bx.anim; });
  }
  const EQ = {
    ficha: "cₙ = ⟨n|ψ⟩ · P(n) = |cₙ|² · ⟨H⟩ = Σ|cₙ|²Eₙ · σ_H² = ⟨H²⟩ − ⟨H⟩²",
    sacos: "saco M: P(k) = Σᵢ wᵢ|⟨Bₖ|Aᵢ⟩|² · saco S: c′ₖ = Σₙ⟨Bₖ|Aₙ⟩cₙ, P(Bₖ) = |c′ₖ|²",
    aba: "medida: P̂|ψ⟩/√P(q) · c′ = Bc · A → B → A: P(A) final = ¼",
    fase: "cₙ(t) = cₙ e^(−iEₙt/ħ) · P(B₁,₃) = (1 + cos θ)/4, θ = φ₀ − (E₂ − E₁)t/ħ",
    degen: "P(q) = Σ|cₙ|² (n na sala q) · |ψ⟩ → P̂_q|ψ⟩/√P(q) · Q̂ = Σ q P̂_q",
    paridade: "P̂_± = (1 ± Π̂)/2 · P(±) = ½(1 ± ⟨Π⟩) · σ<sub>Π</sub>² = 1 − ⟨Π⟩²",
    continuo: "P(p₁ &lt; p &lt; p₂) = ∫|Φ|² dp (área) · P(caixa) = |Φ|² dp",
  };

  // ---- primitivas de desenho
  function canvasFixed(id, hWide, hNarrow) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, narrow = w < 560, h = narrow ? hNarrow : hWide;
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, narrow };
  }
  function drawDial(ctx, x, y, R, c, color, o = {}) {
    ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1.4; ctx.strokeStyle = C.faint; ctx.fillStyle = o.empty ? "#f1f4f0" : "#fff";
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); ctx.stroke();
    if (o.ring) { ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R + 4, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k += 1) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + R * 0.86 * Math.cos(a), y - R * 0.86 * Math.sin(a)); ctx.lineTo(x + R * Math.cos(a), y - R * Math.sin(a)); ctx.stroke(); }
    if (R >= 28) { ctx.fillStyle = C.gray; ctx.font = "9px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText("1", x + R + 7, y + 3); ctx.fillText("−1", x - R - 9, y + 3); ctx.fillText("i", x, y - R - 5); ctx.fillText("−i", x, y + R + 11); }
    const hand = (z, col, width, dash) => {
      const r = Math.hypot(z[0], z[1]) * R; if (r < 0.8) return;
      const th = Math.atan2(z[1], z[0]), ex = x + r * Math.cos(th), ey = y - r * Math.sin(th);
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      if (!dash) { const h = Math.min(9, r * 0.5); ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - h * Math.cos(th - 0.4), ey + h * Math.sin(th - 0.4)); ctx.lineTo(ex - h * Math.cos(th + 0.4), ey + h * Math.sin(th + 0.4)); ctx.closePath(); ctx.fill(); }
    };
    if (c && !o.empty) { if (o.conj) hand([c[0], -c[1]], C.ink, 1.6, [4, 3]); hand(c, color, 3); }
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Geometria do painel de mostradores (colunas, raio, altura), usada também para dimensionar o canvas.
  function fichaGeom(w, n, rMax, numbers) {
    const cols = w >= 500 ? n : Math.min(n, 2), rows = Math.ceil(n / cols), cw = w / cols, R = Math.max(20, Math.min(rMax || 52, cw * 0.36)), rowH = 2 * R + 40 + (numbers === false ? 0 : 28);
    return { n, cols, rows, cw, R, rowH, h: 24 + rows * rowH };
  }
  const mainW = () => ($("mainCanvas").clientWidth || 900) - 12;
  // Painel de mostradores de uma ficha: vec (complexos) ou null (vazio); sub = segunda legenda de cada caixa.
  function fichaPanel(ctx, x, y, w, o) {
    const n = o.names.length, { cols, rows, cw, R, rowH } = fichaGeom(w, n, o.rMax, o.numbers);
    label(ctx, o.title, x, y + 10, C.ink, "left", "bold 11px Ubuntu, system-ui");
    if (o.note) label(ctx, o.note, x + w, y + 10, C.gray, "right", "10px Ubuntu, system-ui");
    for (let i = 0; i < n; i += 1) {
      const col = i % cols, row = Math.floor(i / cols), cx = x + cw * (col + 0.5), cy = y + 24 + row * rowH + R + 6, z = o.vec ? o.vec[i] : null;
      drawDial(ctx, cx, cy, R, z, o.colors[i], { ring: o.ring === i, conj: o.conj === i, empty: !o.vec });
      if (o.conj === i && o.vec) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(cx - cw / 2 + 4, cy - R + 1, 34, 14); label(ctx, `⟨${o.names[i]}|`, cx - cw / 2 + 8, cy - R + 12, C.ink, "left", "bold 10px Ubuntu, system-ui"); }
      let ty = cy + R + 24;
      label(ctx, o.names[i] + (o.sub && o.sub[i] ? ` · ${o.sub[i]}` : ""), cx, ty, o.colors[i], "center", "bold 11px Ubuntu, system-ui");
      if (z && o.numbers !== false) {
        const m = Math.hypot(z[0], z[1]);
        label(ctx, m < 1e-9 ? "|c| = 0" : `|c| = ${fmt(m, 2)}  ∠ ${argDeg(z)}°`, cx, ty + 13, C.gray, "center", "10px Ubuntu, system-ui");
        label(ctx, `P = ${fmt(m * m, 3)}`, cx, ty + 25, C.ink, "center", "10px Ubuntu, system-ui");
      }
    }
    return 24 + rows * rowH;
  }
  // Faixa de caixas do jogo medido (sorteio), passos 1-2-3 e linha da folha de registro.
  function measureTop(ctx, x, y, w, o) {
    const n = o.items.length, gap = 6, cwid = (w - gap * (n - 1)) / n;
    label(ctx, o.title, x, y + 10, C.ink, "left", "bold 11px Ubuntu, system-ui");
    o.items.forEach((it, i) => {
      const cx = x + i * (cwid + gap), top = y + 16, isHi = o.hi === i, isCh = o.chosen === i;
      ctx.fillStyle = isCh ? "rgba(97,155,96,.22)" : "#fff"; ctx.strokeStyle = isHi || isCh ? C.ink : C.faint; ctx.lineWidth = isHi || isCh ? 2.6 : 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.rect(cx, top, cwid, 34); ctx.fill(); ctx.stroke();
      label(ctx, it.name, cx + cwid / 2, top + 14, it.color || C.ink, "center", "bold 11px Ubuntu, system-ui");
      label(ctx, it.p === null || it.p === undefined ? "" : `P = ${fmt(it.p, 3)}`, cx + cwid / 2, top + 28, C.gray, "center", "10px Ubuntu, system-ui");
    });
    const labs = w < 420 ? ["1 sorteia", "2 anota", "3 reescreve"] : ["1 · sorteia a caixa por |c|²", "2 · anota o rótulo", "3 · reescreve a ficha"], pw = (w - 2 * gap) / 3, py = y + 56;
    labs.forEach((t, i) => {
      const on = o.step === i + 1, px = x + i * (pw + gap);
      ctx.fillStyle = on ? C.green : "#eef2ed"; ctx.beginPath(); ctx.rect(px, py, pw, 20); ctx.fill();
      label(ctx, t, px + pw / 2, py + 14, on ? "#fff" : C.gray, "center", `${on ? "bold " : ""}10px Ubuntu, system-ui`);
    });
    label(ctx, o.log || "", x, py + 34, C.ink, "left", "10px Ubuntu, system-ui");
    return 100;
  }
  // Barras por caixa (teoria preenchida, frequência em contorno) com rótulos de valor.
  function catAxes(target, box, names, yMax, xLabel, yLabel, o = {}) {
    return axes(target, box, 0.4, names.length + 0.6, 0, yMax, xLabel, yLabel, Object.assign({ xTicks: names.map((_, i) => i + 1), xLabels: (x) => names[x - 1], ticks: 4 }, o));
  }
  function catBars(ch, ctx, theory, emp, colors, narrow) {
    (theory || emp || []).forEach((_, i) => {
      if (theory) { bar(ch, i + 1, 0.62, theory[i], colors[i % colors.length]); label(ctx, fmt(theory[i], 3), ch.X(i + 1), Math.max(ch.top + 11, ch.Y(theory[i]) - 5), colors[i % colors.length], "center", `bold ${narrow ? 10 : 11}px Ubuntu, system-ui`); }
      if (emp) bar(ch, i + 1, 0.86, emp[i], null, C.ink);
    });
  }
  const panelBox = (x, y, w, h) => ({ x, y: y + 16, w, h: h - 16 });
  // Medida em 3 passos: descreve o quadro em cada instante (sorteio, registro, reescrita).
  function animView(a) {
    const d = a.d, t = a.t, step = t < d ? 1 : t < 2 * d ? 2 : 3, p = Math.min(1, (t - (step - 1) * d) / d), ease = 1 - (1 - p) ** 3;
    const hi = step === 1 ? Math.floor(ease * (2 * a.n + a.k)) % a.n : a.k;
    const lerp = (u, w, s) => u.map((z, i) => [z[0] + (w[i][0] - z[0]) * s, z[1] + (w[i][1] - z[1]) * s]);
    const vec = step < 3 ? a.c0 : p < 0.5 ? lerp(a.c0, a.proj, 2 * p) : lerp(a.proj, a.post, 2 * p - 1);
    return { step, p, hi, vec, log: step === 1 ? "sorteando a caixa com probabilidade |cₙ|² ..." : step === 2 ? a.log : `ficha reescrita só com a caixa sorteada · o postulado diz o quê, não o porquê` };
  }
  let rafBox = 0;
  const boxBusy = () => !!bx.anim || bx.fase.playing;
  function kickBox() { if (!rafBox) { bx.last = performance.now(); rafBox = requestAnimationFrame(boxFrame); } }
  function boxFrame(now) {
    rafBox = 0; const dt = Math.max(0, Math.min(0.05, (now - bx.last) / 1000)); bx.last = now;
    let done = false;
    if (bx.fase.playing) { bx.fase.t = (bx.fase.t + dt * 0.6) % T_PERIODO; $("faT").value = bx.fase.t.toFixed(3); }
    if (bx.anim) { bx.anim.t += dt; if (bx.anim.t >= bx.anim.total) { finishAnim(); done = true; } }
    if (view === "boxes" && !done) drawBoxes(true);
    if (boxBusy() && !rafBox) rafBox = requestAnimationFrame(boxFrame);
  }
  function startAnim(spec) {
    bx.anim = Object.assign({ t: 0 }, spec, { total: 3 * spec.d });
    if (reducedMotion || spec.d <= 0) { finishAnim(); return; }
    applyLock(); kickBox(); render();
  }
  function cancelAnim() { if (!bx.anim) return; bx.stop = true; finishAnim(); bx.stop = false; }
  function finishAnim() { const a = bx.anim; if (!a) return; bx.anim = null; a.onDone(); applyLock(); if (view === "boxes") render(); }

  // ---- bloco 1: ficha, caixas e leitor
  function drawBoxFicha(full) {
    const fc = readFicha("fc", 4), st = bx.ficha, L = !!bx.locked.ficha, sel = v("fcReader"), sig = fc.mods.join() + "|" + fc.phases.join();
    if (st.sig !== sig) { st.sig = sig; st.counts = [0, 0, 0, 0]; st.N = 0; st.sumE = 0; st.after = null; }
    const probs = P.probsA(fc.c), a = bx.anim, av = a ? animView(a) : null, mean = P.mediaRotulos(fc.c, BE), sd = P.sigmaRotulos(fc.c, BE), fr = freqs(st.counts);
    const gh = fichaGeom(mainW(), 4, 44, L).h, HH = 4 + 100 + 6 + gh + 6 + gh + 6;
    const main = canvasFixed("mainCanvas", HH, HH), ctx = main.ctx, w = main.w - 12;
    const top = measureTop(ctx, 6, 4, w, { title: "jogo A (energia): as quatro caixas", items: BNAMES.map((nm, i) => ({ name: `${nm} · ${BE[i]}E₁`, p: L ? probs[i] : null, color: BCOL[i] })), hi: av ? av.hi : -1, chosen: av && av.step > 1 ? a.k : -1, step: av ? av.step : 0, log: av ? av.log : "folha de registro: use Medir 1 para ver os três passos" });
    const common = { names: BNAMES, colors: BCOL, sub: BE.map((e) => `${e}E₁`), numbers: L, rMax: 44 };
    const h1 = fichaPanel(ctx, 6, top + 6, w, Object.assign({ vec: fc.c, title: "ficha preparada (cada medida usa uma cópia nova)", conj: sel, ring: av && av.step === 1 ? av.hi : av ? a.k : -1 }, common));
    fichaPanel(ctx, 6, top + 12 + h1, w, Object.assign({ vec: av ? (av.step === 3 ? av.vec : null) : st.after, title: "depois da medida: ficha reescrita", note: !av && !st.after ? "meça para ver a reescrita" : "" }, common));
    const sec = canvasFixed("secondaryCanvas", 270, 290), ymax = Math.max(0.5, ...(L ? probs : [0]), ...fr) * 1.18;
    const S = catAxes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, BNAMES.map((nm, i) => `${nm} · ${BE[i]}E₁`), Math.min(1.05, ymax), "caixa do jogo A (energia)", "probabilidade / frequência");
    catBars(S, sec.ctx, L ? probs : null, hasData(st.counts) ? fr : null, BCOL, sec.narrow);
    if (!L) label(sec.ctx, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    setAria("secondaryCanvas", `Histograma de ${st.N} medidas de energia. Contagens: ${BNAMES.map((nm, i) => `${nm} ${st.counts[i]}`).join(", ")}.${L ? ` Probabilidades: ${probs.map((p, i) => `${BNAMES[i]} ${fmt(p, 3)}`).join(", ")}.` : ""}`);
    setAria("mainCanvas", `Ficha preparada e ficha depois da medida, quatro mostradores de relógio${L ? `; amplitudes: ${fc.c.map((z, i) => `${BNAMES[i]} ${fmtC(z, 2)}`).join("; ")}` : ""}.`);
    if (!full) return;
    const z = fc.c[sel], zc = P.cConj(z), pz = probs[sel], m2 = P.expectation(BE.map((e) => e * e), probs), mN = fc.mods.reduce((s, m) => s + m * m, 0);
    const hStr = `${fmt(mean, 2)} E₁ = ${fmt(mean * E1EV, 2)} eV`, sStr = `${fmt(sd, 2)} E₁ = ${fmt(sd * E1EV, 2)} eV`;
    boxTexts({ status: "Caixas e fichas", detail: "1 · ficha, caixas e leitor", eq: EQ.ficha,
      title: "A ficha: um ponteiro de relógio por caixa", subtitle: "comprimento do ponteiro = |cₙ| · ângulo = fase · o leitor ⟨n| lê cₙ; só |cₙ|² é probabilidade",
      caption: "Linha de cima: a ficha preparada, quatro mostradores. Linha de baixo: a ficha depois da medida, reescrita só com a caixa sorteada. O ponteiro tracejado escuro da caixa lida é o que o leitor vê pelo avesso do relógio: ⟨ψ|n⟩ = cₙ* (o bra conjuga a fase).",
      secondaryTitle: "Histograma das medidas de energia", secondarySubtitle: "barras: P(Aₙ) = |cₙ|² · contorno escuro: frequência nas N medidas",
      secondaryCaption: "Cada medida dá uma caixa (E = 1, 4, 9 ou 16 E₁), nunca ⟨H⟩. Com N grande a frequência converge para |cₙ|²; a flutuação é a de contagem, ∼ 1/√N.",
      calculation: !L ? "(oculta até a previsão)" : `${fc.nula ? `<span class="warn">Ficha nula: todos os módulos são 0; a conta usa A1.</span><br>` : ""}N = √(${fc.mods.map((m) => `${fmt(m, 2)}²`).join(" + ")}) = ${fmt(Math.sqrt(mN), 3)}<br>⟨${BNAMES[sel]}|ψ⟩ = c<sub>${sel + 1}</sub> = ${fmt(fc.mods[sel], 2)}·e^(i·${fc.phases[sel]}°)/${fmt(Math.sqrt(mN), 3)} = ${fmtC(z)}<br>⟨ψ|${BNAMES[sel]}⟩ = c<sub>${sel + 1}</sub>* = ${fmtC(zc)}<br><b>P(${BNAMES[sel]}) = |c<sub>${sel + 1}</sub>|² = ${fmt(pz, 3)}</b><br>⟨H⟩ = ${probs.map((p, i) => `${fmt(p, 3)}·${BE[i]}`).join(" + ")} = <b>${hStr}</b><br>⟨H²⟩ = ${fmt(m2, 2)} E₁² → σ_H = √(${fmt(m2, 2)} − ${fmt(mean, 2)}²) = <b>${sStr}</b><br>jogo B: c′ = Bc → P(B₁…B₄) = (${P.probsB(fc.c).map((p) => fmt(p, 3)).join("; ")}), soma ${fmt(P.probsB(fc.c).reduce((a, p) => a + p, 0), 3)} (completeza)<small>conversão única: E₁ = h²/(8mₑa²) = ${fmt(E1EV, 3)} eV (a = 0,5 nm, exemplo da nota); fora disso tudo está em E₁.</small><div class="limit">Limite do modelo: o Quarteto é um modelo-jogo de quatro caixas; no poço real há infinitas caixas e o jogo B é a posição (cauda lenta, estação 02).</div>`,
      metrics: [[`⟨${BNAMES[sel]}|ψ⟩ = c${"₁₂₃₄"[sel]}`, L ? fmtC(z, 2) : "—"], [`⟨ψ|${BNAMES[sel]}⟩ = c${"₁₂₃₄"[sel]}*`, L ? fmtC(zc, 2) : "—"], [`P(${BNAMES[sel]}) = |c${"₁₂₃₄"[sel]}|²`, L ? fmt(pz, 3) : "—"], ["⟨H⟩", L ? hStr : "—"], ["σ_H", L ? sStr : "—"], ["medidas N · média", st.N ? `${st.N} · ${fmt(st.sumE / st.N, 2)} E₁` : "—"]],
      concept: "A regra de Born da Aula 6 ganha um objeto: a ficha. Medir é sortear a caixa por |cₙ|² e reescrever a ficha com P̂ₙ|ψ⟩/√P; o leitor ⟨n| e a porta |n⟩⟨n| são o bra e o projetor da nota (§2).",
      prompts: ["Com (1, i, −2, 0)/√6 confira P(A2) = 1/6, ⟨H⟩ = 6,83 E₁ = 10,28 eV e σ_H = 3,18 E₁ = 4,79 eV (E₁ = 1,504 eV).", "Aumente o módulo de A3: o ponteiro cresce, mas a soma dos |cₙ|² continua 1. Mude a fase de A2: o que muda na leitura de P?", "Meça 1 e acompanhe os três passos: se medíssemos essa ficha reescrita outra vez, o que sairia? (veja A → B → A)"],
      brk: "A ficha não é uma lista de probabilidades: é o vetor de estado (ket), com ponteiros de ângulo (plano complexo, não relógio de parede), e o leitor é o espelho do relógio (conjuga a fase). A caixa é um resultado possível, não um lugar onde a ficha está; que a ficha seja mais que 'uma bola numa caixa que não vemos' é o que a interferência (Aula 5) mostra, e não esta estação.",
      misc: "«cₙ é a probabilidade da caixa n» (amplitude = probabilidade).", fix: "só o quadrado do comprimento do ponteiro é probabilidade, e a soma que dá 1 é Σ|cₙ|², nunca Σcₙ. A fase não aparece em P(A), mas aparece no jogo B (aba A → B → A, parte Fase).",
      legend: [[C.red, "A1"], [C.gold, "A2"], [C.blue, "A3"], [C.violet, "A4"], [C.ink, "leitor / frequência", true]] });
  }
  function fichaMeasure(n) {
    if (bx.anim || !bx.locked.ficha) return;
    bx.acted.ficha = true;
    const fc = readFicha("fc", 4), st = bx.ficha, probs = P.probsA(fc.c);
    const count = (k) => { st.counts[k] += 1; st.N += 1; st.sumE += BE[k]; };
    if (n >= 100) {
      let k = 0; for (let i = 0; i < n; i += 1) { k = P.sample(probs, rnd()); count(k); }
      st.after = P.medirJogo(fc.c, P.TABELA_A, k).post; render(); return;
    }
    const run = (left, d) => {
      const k = P.sample(probs, rnd()), m = P.medirJogo(fc.c, P.TABELA_A, k);
      startAnim({ owner: "ficha", d, n: 4, k, c0: fc.c, proj: m.proj, post: m.post, log: `folha de registro: ${BNAMES[k]} → E = ${BE[k]}E₁ (P = ${fmt(probs[k], 3)})`, onDone: () => { count(k); st.after = m.post; if (left > 1 && !bx.stop) run(left - 1, d); } });
    };
    run(n, n === 1 ? 0.8 : 0.13);
  }

  // ---- bloco 2: dois sacos
  function drawBoxSacos(full) {
    const sg = bx.sacos, g = sg.game, L = !!bx.locked.sacos, T = P.TABELAS[g], names = g === "A" ? BNAMES : BB;
    const pM = P.probsMistura(P.SACO_M.fichas, P.SACO_M.pesos, T), pS = P.probsJogo(P.FICHA_S, T), eM = sg.M[g], eS = sg.S[g], fM = freqs(eM), fS = freqs(eS);
    const main = canvasFixed("mainCanvas", 340, 640), ctx = main.ctx, stack = main.narrow, ymax = Math.min(1.05, Math.max(0.6, ...fM, ...fS) * 1.15);
    const wP = stack ? main.w : main.w / 2, hP = stack ? main.h / 2 : main.h;
    [["Saco M: ½ de fichas A1, ½ de A2 (mistura)", pM, eM, fM, 0], ["Saco S: fichas (A1 + A2)/√2 (estado puro)", pS, eS, fS, 1]].forEach(([ttl, th, em, fq, idx]) => {
      const x0 = stack ? 0 : idx * wP, y0 = stack ? idx * hP : 0;
      label(ctx, ttl, x0 + 12, y0 + 16, C.ink, "left", "bold 11px Ubuntu, system-ui");
      const ch = catAxes(main, panelBox(x0, y0 + 4, wP, hP - 4), names, ymax, `caixa do jogo ${g}${g === "B" ? " (tabela de conversão)" : " (energia)"}`, "probabilidade / frequência");
      catBars(ch, ctx, L ? th : null, hasData(em) ? fq : null, BCOL, main.narrow);
      label(ctx, `${em.reduce((s, k) => s + k, 0)} medidas`, ch.right - 4, ch.top + 12, C.gray, "right", "10px Ubuntu, system-ui");
    });
    if (!L) label(ctx, "(oculto até a previsão)", main.w / 2, main.h / 2, C.gray, "center");
    setAria("mainCanvas", `Jogo ${g}. Contagens no saco M: ${names.map((nm, i) => `${nm} ${eM[i]}`).join(", ")}. No saco S: ${names.map((nm, i) => `${nm} ${eS[i]}`).join(", ")}.${L ? ` Teoria M: ${pM.map((p) => fmt(p, 3)).join("; ")}. Teoria S: ${pS.map((p) => fmt(p, 3)).join("; ")}.` : ""}`);
    // tabela de conversão ⟨B_k|A_n⟩ e probabilidades dos dois sacos no jogo B
    const sec = canvasFixed("secondaryCanvas", 236, 236), c2 = sec.ctx, cwid = Math.min(72, (sec.w - 16) / 7), x0 = (sec.w - 7 * cwid) / 2, rh = 28, y0 = 30, cS = P.FICHA_S, cps = P.probsB(cS), cpm = P.probsMistura(P.SACO_M.fichas, P.SACO_M.pesos, P.TABELA_B);
    label(c2, "tabela de conversão ⟨Bₖ|Aₙ⟩ (jogo B) e P(Bₖ) de cada saco", sec.w / 2, 16, C.ink, "center", "bold 11px Ubuntu, system-ui");
    const cell = (i, j, txt, col, bold, bg) => { c2.fillStyle = bg || "#fff"; c2.strokeStyle = C.faint; c2.lineWidth = 1; c2.fillRect(x0 + j * cwid, y0 + i * rh, cwid, rh); c2.strokeRect(x0 + j * cwid, y0 + i * rh, cwid, rh); label(c2, txt, x0 + (j + 0.5) * cwid, y0 + i * rh + 18, col, "center", `${bold ? "bold " : ""}11px Ubuntu, system-ui`); };
    ["", "A1", "A2", "A3", "A4", "saco M", "saco S"].forEach((t, j) => cell(0, j, t, j >= 1 && j <= 4 ? BCOL[j - 1] : C.ink, true, "#eef2ed"));
    cell(1, 0, "c (S)", C.ink, true, "#f4f7f2"); cS.forEach((z, j) => cell(1, j + 1, fmt(z[0], 2), C.ink, false, "#f4f7f2")); cell(1, 5, "", C.ink, false, "#f4f7f2"); cell(1, 6, "", C.ink, false, "#f4f7f2");
    P.TABELA_B.forEach((row, k) => {
      cell(k + 2, 0, `B${k + 1}`, C.ink, true, "#f4f7f2");
      row.forEach((t, n) => cell(k + 2, n + 1, t > 0 ? "+½" : "−½", t > 0 ? C.blue : C.red, false, n < 2 ? "rgba(233,162,59,.12)" : "#fff"));
      cell(k + 2, 5, L ? fmt(cpm[k], 3) : "", C.ink, true); cell(k + 2, 6, L ? fmt(cps[k], 3) : "", L && cps[k] < 1e-9 ? C.red : C.ink, true, L && cps[k] < 1e-9 ? "#fff6f3" : "#fff");
    });
    if (!full) return;
    const ncM = eM.reduce((s, k) => s + k, 0), ncS = eS.reduce((s, k) => s + k, 0), zeroS = eS[1] + eS[3];
    boxTexts({ status: "Caixas e fichas", detail: `2 · dois sacos · jogo ${g}`, eq: EQ.sacos,
      title: `Saco M × saco S medidos no jogo ${g}`, subtitle: "barras: probabilidade teórica · contorno escuro: frequência nas medidas de cada saco",
      caption: g === "A" ? "No jogo A (energia) os dois sacos dão as mesmas frequências: ½ de A1 e ½ de A2. Só um jogo que atravessa as caixas de A distingue uma mistura de uma ficha: troque para o jogo B." : "No jogo B, M dá ¼ em cada caixa e S nunca dá B2 nem B4: B1 e B3 saem cerca de ½ cada. Os ponteiros de A1 e A2 do saco S somam com ângulo; a ignorância do saco M não cancela nada.",
      secondaryTitle: "Tabela B: a completeza em uso", secondarySubtitle: "c′ₖ = Σₙ⟨Bₖ|Aₙ⟩cₙ (saco S) · P(Bₖ) = Σᵢ wᵢ|⟨Bₖ|Aᵢ⟩|² (saco M)",
      secondaryCaption: "As colunas A1 e A2 (fundo dourado) são as caixas ocupadas. Em S os dois ponteiros somam: nas linhas B2 e B4 os sinais são opostos e c′ = 0. Em M não há ponteiro comum: cada ficha é lida sozinha e P = ½·¼ + ½·¼ = ¼. A tabela é real só por simplicidade; em geral ⟨Bₖ|Aₙ⟩ é complexa e ⟨Aₙ|Bₖ⟩ = ⟨Bₖ|Aₙ⟩*: em geral conjugue.",
      calculation: !L ? "(oculta até a previsão)" : `S, B1: c′₁ = ½(1/√2) + ½(1/√2) = ${fmt(cS.reduce((s, z, n) => s + P.TABELA_B[0][n] * z[0], 0), 3)} → P = <b>${fmt(cps[0], 2)}</b><br>S, B2: c′₂ = ½(1/√2) − ½(1/√2) = 0 → P = <b>0</b><br>M, B2: P = ½·|½|² + ½·|−½|² = <b>${fmt(cpm[1], 2)}</b><small>S é uma ficha (estado puro); M é um saco de fichas diferentes (mistura): no jogo A as frequências coincidem.</small>`,
      metrics: [["jogo A: M e S (teoria)", L ? "(½, ½, 0, 0)" : "—"], ["jogo B: M (teoria)", L ? "¼ em cada caixa" : "—"], ["jogo B: S (teoria)", L ? "(½, 0, ½, 0)" : "—"], [`medidas no jogo ${g}: M · S`, `${ncM} · ${ncS}`], [`S: B2 + B4 no jogo B`, g === "B" ? `${zeroS} de ${ncS}` : "—"], [`M: B2 no jogo B`, g === "B" && ncM ? `${fmt(fM[1], 3)}` : "—"]],
      concept: "Estado puro (ficha) e mistura (saco) dão as mesmas frequências de energia, mas não as de um jogo que atravessa as caixas de A: a mistura não interfere (nota 06, §1 e §2).",
      prompts: ["Meça 1000 no jogo A: dá para distinguir M de S? Troque para o jogo B e meça 1000.", "Quantas vezes S deu B2 ou B4? Por que o zero é exato e não 'quase zero'?", "Por que M dá ¼ em cada caixa B? (Cada linha da tabela vale ±½ e |±½|² = ¼.)"],
      brk: "Saco ≠ ficha. Superposição não é ignorância sobre qual caixa a ficha ocupa: no jogo A, M e S são indistinguíveis; só outro jogo mostra a diferença. (A mistura é descrita por ρ, fora do curso; aqui basta falar de 'dois sacos'. Aqui o saco é só um modelo: uma mistura real não vem de um saco de fichas em uma única decomposição.)",
      misc: "«superposição = não sei em qual caixa está» (saco = ficha).", fix: "no jogo B, S nunca dá B2 nem B4 e M dá ¼ em cada. Ignorância não cancela caixas; ponteiros somados com ângulo cancelam.",
      legend: [[C.red, "A1 / B1"], [C.gold, "A2 / B2"], [C.blue, "A3 / B3"], [C.violet, "A4 / B4"], [C.ink, "frequência medida", true]] });
  }
  function sacMeasure(n) {
    if (bx.anim || !bx.locked.sacos) return;
    bx.acted.sacos = true;
    const sg = bx.sacos, T = P.TABELAS[sg.game], SS = { fichas: [P.FICHA_S], pesos: [1] };
    for (let i = 0; i < n; i += 1) { sg.M[sg.game][P.sacoMedir(P.SACO_M, T, rnd(), rnd())] += 1; sg.S[sg.game][P.sacoMedir(SS, T, rnd(), rnd())] += 1; }
    render();
  }

  // ---- bloco 3: A → B → A
  const abNew = () => { const c0 = P.fichaDePolar([1, 1, 0, 0], [0, 0, 0, 0]); bx.aba.rows = [{ vec: c0, game: null, k: -1 }]; };
  abNew();
  function drawBola(ctx, x, y, r, a, b) {
    ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1.6; ctx.fillStyle = a >= 0 ? BCOL[a] : "#e8ece7"; ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    if (b >= 0) {
      ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 2; const s = r * 0.5; ctx.beginPath();
      if (b === 0) ctx.arc(x, y, s * 0.7, 0, TAU);
      else if (b === 1) ctx.rect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.6);
      else if (b === 2) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); ctx.closePath(); }
      else { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }
      ctx.stroke();
    }
    if (a < 0 && b < 0) label(ctx, "?", x, y + 5, C.gray, "center", "bold 14px Ubuntu, system-ui");
    ctx.restore();
  }
  function drawBoxAba(full) {
    const ab = bx.aba, L = !!bx.locked.aba, a = bx.anim, av = a ? animView(a) : null, stage = ab.rows.length - 1, nextGame = stage === 1 ? "B" : "A";
    const curGame = a ? a.game : nextGame, T = P.TABELAS[curGame], cur = ab.rows[stage].vec, names = curGame === "A" ? BNAMES : BB;
    const main = canvasFixed("mainCanvas", 440, 440), ctx = main.ctx, w = main.w - 12;
    const top = measureTop(ctx, 6, 4, w, { title: stage >= 3 && !a ? "sequência completa: use Nova ficha" : `próxima medida: jogo ${curGame}${curGame === "B" ? " (tabela de conversão)" : " (energia)"}`, items: names.map((nm, i) => ({ name: nm, p: L && (stage < 3 || a) ? P.probsJogo(a ? a.c0 : cur, T)[i] : null, color: BCOL[i] })), hi: av ? av.hi : -1, chosen: av && av.step > 1 ? a.k : -1, step: av ? av.step : 0, log: av ? av.log : "" });
    const rows = ["0 · ficha preparada", "1 · depois de medir A", "2 · depois de medir B", "3 · depois de medir A de novo"], rowH = 70, y0 = top + 14, pitch = Math.min(100, (w * 0.56) / 4), bolaX = 6 + pitch * 4 + (w - pitch * 4) / 2;
    label(ctx, "ficha quântica (escrita nas caixas A)", 6, y0 - 4, C.ink, "left", "bold 11px Ubuntu, system-ui"); label(ctx, "bola clássica: cor (A) e forma (B)", bolaX, y0 - 4, C.ink, "center", "bold 11px Ubuntu, system-ui");
    rows.forEach((txt, i) => {
      const y = y0 + 8 + i * rowH, cy = y + 40, r = ab.rows[i], showAnim = !r && av && av.step === 3 && i === stage + 1;
      const vec = r ? r.vec : showAnim ? av.vec : null;
      label(ctx, r ? `${txt}${i ? `: saiu ${r.game === "B" ? BB[r.k] : BNAMES[r.k]}` : ""}` : txt, 6, y + 8, r ? C.ink : C.gray, "left", "10px Ubuntu, system-ui");
      for (let k = 0; k < 4; k += 1) drawDial(ctx, 6 + pitch * (k + 0.5), cy, 24, vec ? vec[k] : null, BCOL[k], { empty: !vec });
      const aIdx = i >= 1 && ab.rows[1] ? ab.rows[1].k : -1, bIdx = i >= 2 && ab.rows[2] ? ab.rows[2].k : -1;
      if (r) { drawBola(ctx, bolaX, cy, 24, aIdx, bIdx); if (i === 3) label(ctx, "mesma cor (olhar a forma não perturba)", bolaX, cy + 38, C.ink, "center", "bold 10px Ubuntu, system-ui"); }
      else drawBola(ctx, bolaX, cy, 24, -2, -2);
    });
    const sec = canvasFixed("secondaryCanvas", 250, 470), c2 = sec.ctx, stk = sec.narrow, wP = stk ? sec.w : sec.w * 0.55, hP = stk ? sec.h * 0.5 : sec.h, fq = freqs(ab.hist);
    label(c2, "A final depois de A → B → A (ficha)", 12, 14, C.ink, "left", "bold 11px Ubuntu, system-ui");
    const H1 = catAxes(sec, panelBox(0, 4, wP, hP - 4), BNAMES, 1.05, "caixa A da 2ª medida de A", "probabilidade / frequência");
    catBars(H1, c2, L ? [0.25, 0.25, 0.25, 0.25] : null, ab.N ? fq : null, BCOL, sec.narrow);
    const x2 = stk ? 0 : wP, y2 = stk ? hP : 0, w2 = stk ? sec.w : sec.w - wP;
    label(c2, "2ª medida de A repete a 1ª?", x2 + 12, y2 + 14, C.ink, "left", "bold 11px Ubuntu, system-ui");
    const H2 = catAxes(sec, panelBox(x2, y2 + 4, w2, hP - 4), ["ficha", "bola"], 1.05, "o que se mede", "fração que repete");
    if (L) { bar(H2, 1, 0.55, 0.25, C.blue); bar(H2, 2, 0.55, 1, C.gray); label(c2, "¼", H2.X(1), H2.Y(0.25) - 5, C.blue, "center", "bold 11px Ubuntu, system-ui"); label(c2, "1", H2.X(2), H2.Y(1) - 5, C.gray, "center", "bold 11px Ubuntu, system-ui"); }
    if (ab.N) { bar(H2, 1, 0.8, ab.same / ab.N, null, C.ink); bar(H2, 2, 0.8, 1, null, C.ink); }
    if (!L) label(c2, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    setAria("secondaryCanvas", `${ab.N} sequências A, B, A. A final: ${BNAMES.map((nm, i) => `${nm} ${ab.hist[i]}`).join(", ")}. A segunda medida repetiu a primeira em ${ab.same} de ${ab.N}.`);
    setAria("mainCanvas", `Ficha depois de cada medida (${ab.rows.length - 1} medidas feitas): ${ab.rows.map((r) => r.vec.map((z) => fmtC(z, 2)).join(" ")).join(" | ")}.`);
    $("abNext").textContent = ["1 · medir A", "2 · medir B", "3 · medir A", "Nova ficha"][stage];
    if (!full) return;
    const r1 = ab.rows[1], r2 = ab.rows[2], r3 = ab.rows[3];
    boxTexts({ status: "Caixas e fichas", detail: `3 · A → B → A · passo ${Math.min(stage + 1, 3)}`, eq: EQ.aba,
      title: "A → B → A: a ficha reescrita a cada medida", subtitle: "esquerda: a ficha (quatro mostradores, escrita nas caixas A) · direita: a bola clássica, que já traz cor e forma",
      caption: "Cada linha é a ficha depois de uma medida. Depois de B, os ponteiros ficam todos com comprimento ½ (uma linha da tabela B, ±½, a menos de uma fase global): a informação sobre A foi desfeita. A bola clássica (modelo em que olhar a forma não perturba a cor) repete a cor sempre.",
      secondaryTitle: "O que a 2ª medida de A dá", secondarySubtitle: "esquerda: A final (ficha) · direita: fração em que a 2ª medida repete a 1ª",
      secondaryCaption: "Ficha: ¼ em cada caixa, e repete o primeiro resultado em ¼ das vezes. Bola clássica (modelo: olhar a forma não perturba a cor): repete em 100 %. É o fenômeno da estação 02, numa tabela 4×4.",
      calculation: !L ? "(oculta até a previsão)" : `A: P(A1) = P(A2) = |1/√2|² = ½ → saiu A<sub>j</sub><br>B: P(Bₖ) = |⟨Bₖ|A<sub>j</sub>⟩|² = (½)² = <b>¼</b> para os quatro k<br>A: P(A<sub>n</sub>) = |⟨A<sub>n</sub>|Bₖ⟩|² = (½)² = <b>¼</b><br>P(A final = A inicial) = Σₖ ¼·¼ = <b>¼</b> (bola que não é perturbada: 1)<small>${r2 ? `ficha depois de ${BB[r2.k]}: ±(${P.TABELA_B[r2.k].map((t) => (t > 0 ? "+½" : "−½")).join(", ")}), a menos de uma fase global (sem significado físico)` : "ainda sem B"}</small><div class="limit">Limite do modelo: é um modelo-jogo com tabela B escolhida a dedo; no poço real o jogo B é a posição e, só para ε = a/10 e x₀ = a/2, o retorno a E₁ é 0,198 (outros ε e x₀ dão outros valores), não ¼.</div>`,
      metrics: [["1ª medida (A)", r1 ? BNAMES[r1.k] : "—"], ["2ª medida (B)", r2 ? BB[r2.k] : "—"], ["3ª medida (A)", r3 ? BNAMES[r3.k] : "—"], ["sequências completas N", String(ab.N)], ["repete a 1ª: ficha", ab.N ? `${fmt(ab.same / ab.N, 3)} (teoria 0,250)` : "—"], ["repete a 1ª: bola (modelo)", ab.N ? "1,000" : "—"]],
      concept: "Medir B entre duas medidas de A muda a ficha: as caixas B atravessam as de A (⟨B|A⟩ ≠ 0). É a incompatibilidade de H → x → H da nota (§3), numa tabela 4×4: a segunda medida de A não repete a primeira. Isso mostra incompatibilidade, não que o valor de A não pré-existia (essa prova é a interferência, Aula 5).",
      prompts: ["Rode a sequência uma vez, passo a passo. Que ficha aparece depois de B? Compare com a linha de B na tabela.", "Rode 1000 sequências: em que fração a 2ª medida de A repete a 1ª? E para a bola?", "Reveja a previsão: por que ¼, e não ½ (as duas caixas que a ficha ocupava)?"],
      brk: "O postulado diz o quê (a ficha é reescrita), não o porquê. O colapso clássico (Bayes) muda o conhecimento; aqui muda o objeto, mesmo com a ficha totalmente conhecida. As caixas A e B só são disjuntas dentro do mesmo jogo: as de B atravessam as de A.",
      misc: "«a bola já estava na caixa» (valor pré-existente).", fix: "B desfaz o resultado de A: a ficha, depois de B, volta a A com ¼, enquanto uma bola clássica repetiria a cor em 100 % porque olhar a forma não a perturba. Isso é incompatibilidade; que o valor de A não pré-existia é conclusão da interferência (Aula 5), não desta sequência.",
      legend: [[C.red, "A1"], [C.gold, "A2"], [C.blue, "A3"], [C.violet, "A4"], [C.gray, "bola (modelo clássico)"]] });
  }
  function abaNext() {
    const ab = bx.aba; if (bx.anim || !bx.locked.aba) return;
    bx.acted.aba = true;
    const stage = ab.rows.length - 1; if (stage >= 3) { abNew(); render(); return; }
    const game = stage === 1 ? "B" : "A", T = P.TABELAS[game], cur = ab.rows[stage].vec, probs = P.probsJogo(cur, T), k = P.sample(probs, rnd()), m = P.medirJogo(cur, T, k);
    startAnim({ owner: "aba", game, d: 0.5, n: 4, k, c0: cur, proj: m.proj, post: m.post, log: `folha de registro: ${game === "A" ? BNAMES[k] : BB[k]} (P = ${fmt(probs[k], 3)})`,
      onDone: () => { ab.rows.push({ vec: m.post, game, k }); if (stage === 2) { ab.N += 1; ab.hist[k] += 1; if (k === ab.rows[1].k) ab.same += 1; } } });
  }
  function abaRun(n) {
    const ab = bx.aba; if (bx.anim || !bx.locked.aba) return; bx.acted.aba = true;
    const c0 = P.fichaDePolar([1, 1, 0, 0], [0, 0, 0, 0]);
    for (let i = 0; i < n; i += 1) {
      const k1 = P.sample(P.probsA(c0), rnd()), c1 = P.medirJogo(c0, P.TABELA_A, k1).post, k2 = P.sample(P.probsB(c1), rnd()), c2 = P.medirJogo(c1, P.TABELA_B, k2).post, k3 = P.sample(P.probsA(c2), rnd()), c3 = P.medirJogo(c2, P.TABELA_A, k3).post;
      ab.N += 1; ab.hist[k3] += 1; if (k3 === k1) ab.same += 1;
      if (i === n - 1) ab.rows = [{ vec: c0, game: null, k: -1 }, { vec: c1, game: "A", k: k1 }, { vec: c2, game: "B", k: k2 }, { vec: c3, game: "A", k: k3 }];
    }
    render();
  }

  // ---- bloco 3b: fase e tempo
  function drawBoxFase(full) {
    const L = !!bx.locked.fase, fs = bx.fase, phi = v("faPhi"), t = fs.t, c0 = P.fichaDePolar([1, 1, 0, 0], [0, phi, 0, 0]), ct = P.evoluir(c0, BE, t);
    set("faPhiOut", `${fmt(phi, 0)}°`); set("faTOut", `${fmt(t, 2)} ħ/E₁`);
    const pA = P.probsA(ct), pB = P.probsB(ct), formula = P.probsBBatimento(phi, t), theta = phi * Math.PI / 180 - P.DELTA_E_BATIMENTO * t;
    const g1 = fichaGeom(mainW(), 4, 38, true).h, narrowM = ($("mainCanvas").clientWidth || 900) < 560, HF = 4 + g1 + 6 + (narrowM ? 440 : 230);
    const main = canvasFixed("mainCanvas", HF, HF), ctx = main.ctx, w = main.w - 12;
    const h1 = fichaPanel(ctx, 6, 4, w, { vec: ct, names: BNAMES, colors: BCOL, sub: BE.map((e) => `${e}E₁`), rMax: 38, numbers: true, title: `a ficha no instante t = ${fmt(t, 2)} ħ/E₁ (os ponteiros giram, as caixas não mudam)` });
    const y2 = 4 + h1 + 6, hh = main.h - y2, stack = main.narrow, wP = stack ? main.w : main.w / 2, hP = stack ? hh / 2 : hh;
    [["jogo A (energia)", pA, BNAMES, 0], ["jogo B", pB, BB, 1]].forEach(([ttl, pr, nm, idx]) => {
      const x0 = stack ? 0 : idx * wP, yy = stack ? y2 + idx * hP : y2;
      label(ctx, ttl, x0 + 12, yy + 14, C.ink, "left", "bold 11px Ubuntu, system-ui");
      const ch = catAxes(main, panelBox(x0, yy + 2, wP, hP - 2), nm, 1.05, `caixa do ${ttl}`, "probabilidade");
      if (idx === 0 || L) catBars(ch, ctx, pr, null, BCOL, main.narrow);
      else label(ctx, "(oculto até a previsão)", (ch.left + ch.right) / 2, (ch.top + ch.bottom) / 2, C.gray, "center");
    });
    const sec = canvasFixed("secondaryCanvas", 250, 290), TM = T_PERIODO;
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 0, 2.1, 0, 0.55, "tempo t (ħ/E₁)", "P(jogo B)", { ticks: 4, xTicks: [0, 0.5, 1, 1.5, 2], yTicks: [0, 0.25, 0.5], yDigits: 2 });
    if (L) {
      line(S, samples(0, 2.1, 300, (x) => P.probsBBatimento(phi, x)[0]), C.red, [], 2.4); line(S, samples(0, 2.1, 300, (x) => P.probsBBatimento(phi, x)[1]), C.blue, [], 2.4);
      vline(S, P.TEMPO_MEIO_BATIMENTO, C.violet, [5, 4], 1.4); label(sec.ctx, "πħ/(3E₁)", S.X(P.TEMPO_MEIO_BATIMENTO) + 4, S.top + 12, C.violet, "left", "bold 10px Ubuntu, system-ui");
      vline(S, t, C.ink, [2, 3], 1.4);
    } else label(sec.ctx, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    setAria("secondaryCanvas", `Probabilidades do jogo B em t = ${fmt(t, 2)}: ${L ? pB.map((p, i) => `B${i + 1} ${fmt(p, 3)}`).join(", ") : "travadas até a previsão"}.`);
    if (!full) return;
    const kRef = (180 / Math.PI) * P.DELTA_E_BATIMENTO * t;
    boxTexts({ status: "Caixas e fichas", detail: `3 · fase e tempo · φ₀ = ${fmt(phi, 0)}°`, eq: EQ.fase,
      title: "Fase relativa e tempo: o jogo B enxerga o ponteiro", subtitle: "topo: a ficha (1, e^(iφ₀))/√2 evoluindo · embaixo: P(A) e P(B) no instante t",
      caption: "A1 gira com taxa E₁/ħ e A2 com 4E₁/ħ: a diferença de ângulo cresce como 3E₁t/ħ. As probabilidades do jogo A não mudam; as do jogo B oscilam com período 2πħ/(E₂ − E₁) = 2,09 ħ/E₁.",
      secondaryTitle: "P(B) em função do tempo (batimento)", secondarySubtitle: "vermelho: B1 e B3 · azul: B2 e B4 · tracejado violeta: t = πħ/(3E₁)",
      secondaryCaption: "P(B₁,₃) = (1 + cos θ)/4 e P(B₂,₄) = (1 − cos θ)/4, com θ = φ₀ − 3E₁t/ħ. Em φ₀ = 0, t = πħ/(3E₁) leva (½, 0, ½, 0) a (0, ½, 0, ½). Fase 90° (1, i) começa em (¼, ¼, ¼, ¼).",
      calculation: !L ? "(oculta até a previsão)" : `θ = φ₀ − (E₂ − E₁)t/ħ = ${fmt(phi, 0)}° − 3·${fmt(t, 2)} rad = <b>${fmt(((phi - kRef) % 360 + 540) % 360 - 180, 0)}°</b><br>P(B₁) = P(B₃) = (1 + cos θ)/4 = <b>${fmt(formula[0], 3)}</b><br>P(B₂) = P(B₄) = (1 − cos θ)/4 = <b>${fmt(formula[1], 3)}</b><br>P(A₁) = P(A₂) = ½ em qualquer t<small>c′ = Bc direto: P(B₁…B₄) = (${pB.map((p) => fmt(p, 3)).join("; ")})</small>`,
      metrics: [["P(A1) · P(A2)", L ? `${fmt(pA[0], 3)} · ${fmt(pA[1], 3)}` : "—"], ["P(B1) · P(B3)", L ? `${fmt(pB[0], 3)} · ${fmt(pB[2], 3)}` : "—"], ["P(B2) · P(B4)", L ? `${fmt(pB[1], 3)} · ${fmt(pB[3], 3)}` : "—"], ["θ = φ₀ − 3t", L ? `${fmt(((phi - kRef) % 360 + 540) % 360 - 180, 0)}°` : "—"], ["período do batimento", `${fmt(TM, 2)} ħ/E₁`], ["t da inversão (φ₀ = 0)", `πħ/(3E₁) = ${fmt(P.TEMPO_MEIO_BATIMENTO, 3)} ħ/E₁`]],
      concept: "A fase relativa não muda P(A), mas muda P(B): o termo cruzado c₁*c₂ só aparece em jogos que atravessam as caixas. No tempo, e^(−iEₙt/ħ) gira os ponteiros: a energia é constante e o jogo B oscila, o batimento da Aula 5 (nota 06, §3, fase e tempo).",
      prompts: ["Com φ₀ = 0°, leve t a πħ/(3E₁): o que acontece com B1 e B2? E com A1 e A2?", "Mude a fase inicial para 90°: em que t o jogo B fica (½, 0, ½, 0)? (θ = 0 em t = π/6 ≈ 0,52.)", "Gire no tempo e diga em que momento as quatro caixas B têm ¼."],
      brk: "As fichas não pulam de caixa: os ponteiros giram, com taxa Eₙ/ħ. A evolução é determinística; o sorteio só aparece na medida. No jogo de energia nada muda, e por isso o batimento só se vê em outro jogo (B).",
      misc: "«se a energia não muda no tempo, nada muda».", fix: "só os ponteiros giram: P(A) é constante, mas P(B) oscila; em t = πħ/(3E₁) o jogo B inverte, de (½, 0, ½, 0) para (0, ½, 0, ½).",
      legend: [[C.red, "B1, B3"], [C.blue, "B2, B4"], [C.violet, "t = πħ/(3E₁)", true], [C.ink, "t atual", true]] });
  }

  // ---- bloco 4a: salas e portas (degenerescência)
  function dgState() {
    const fc = readFicha("dg", 3), q = [0, 1, 2].map((i) => v(`dgQ${i}`)), salas = P.salasPorRotulo(q), probs = salas.map((s) => s.indices.reduce((a, i) => a + P.cAbs2(fc.c[i]), 0));
    const sig = fc.mods.join() + "|" + fc.phases.join() + "|" + q.join();
    if (bx.degen.sig !== sig) { bx.degen.sig = sig; bx.degen.counts = salas.map(() => 0); bx.degen.N = 0; bx.degen.after = null; }
    const rs = salas.map((s) => `${s.q}:${s.indices.join("")}`).join(";"), sel = $("dgRoom");
    if (bx.degen.roomSig !== rs) { bx.degen.roomSig = rs; sel.innerHTML = salas.map((s, i) => `<option value="${i}">q = ${s.q < 0 ? "−" + -s.q : s.q} (g = ${s.indices.length})</option>`).join(""); const dflt = Math.max(0, salas.findIndex((s) => s.indices.length > 1)); sel.value = String(dflt); }
    return { fc, q, salas, probs, room: Math.min(Number(sel.value) || 0, salas.length - 1) };
  }
  const qStr = (q) => (q < 0 ? "−" + -q : String(q));
  function drawBoxDegen(full) {
    const d = dgState(), st = bx.degen, L = !!bx.locked.degen, a = bx.anim, av = a ? animView(a) : null, { fc, q, salas, probs, room } = d;
    const sala = salas[room], m = P.medirSala(fc.c, sala.indices), mean = P.mediaRotulos(fc.c, q), sd = P.sigmaRotulos(fc.c, q), Qpsi = P.aplicaRotulos(fc.c, q), q2 = P.expectation(q.map((x) => x * x), P.probsA(fc.c));
    const gh = fichaGeom(mainW(), 3, 46, L).h, HH = 4 + 100 + 6 + gh + 6 + gh + 6;
    const main = canvasFixed("mainCanvas", HH, HH), ctx = main.ctx, w = main.w - 12, cols = [BCOL[0], BCOL[1], BCOL[2]];
    const top = measureTop(ctx, 6, 4, w, { title: "tabela de rótulos: as salas (caixas com o mesmo rótulo q)", items: salas.map((s, i) => ({ name: `q = ${qStr(s.q)} · g = ${s.indices.length}`, p: L ? probs[i] : null, color: C.ink })), hi: av ? av.hi : -1, chosen: av && av.step > 1 ? a.k : (!av && hasData(st.counts) ? room : -1), step: av ? av.step : 0, log: av ? av.log : "" });
    const common = { names: dgNames, colors: cols, sub: q.map((x) => `q = ${qStr(x)}`), numbers: L, rMax: 46 };
    const h1 = fichaPanel(ctx, 6, top + 6, w, Object.assign({ vec: fc.c, title: "ficha preparada", ring: av && av.step === 1 ? salas[av.hi].indices[0] : -1 }, common));
    const afterVec = av ? (av.step === 3 ? av.vec : null) : (L && m.P > 1e-12 ? m.post : null);
    fichaPanel(ctx, 6, top + 12 + h1, w, Object.assign({ vec: afterVec, title: `depois de obter q = ${qStr(sala.q)}: ficha reescrita`, note: !afterVec && L ? "P = 0: esse resultado não ocorre" : "" }, common));
    const sec = canvasFixed("secondaryCanvas", 260, 290), ymax = Math.min(1.05, Math.max(0.5, ...(L ? probs : [0]), ...freqs(st.counts)) * 1.18);
    const S = catAxes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, salas.map((s) => `q = ${qStr(s.q)} (g = ${s.indices.length})`), ymax, "sala (rótulo da medida)", "probabilidade / frequência");
    catBars(S, sec.ctx, L ? probs : null, hasData(st.counts) ? freqs(st.counts) : null, [C.blue, C.red, C.gold], sec.narrow);
    if (L && sala.indices.length > 1) { const gN = sala.indices.length / 3; hline(S, gN, C.violet, [5, 4], 1.6); label(sec.ctx, `g/N = ${fmt(gN, 3)}: não é a probabilidade`, S.left + 8, S.Y(gN) - 5, C.violet, "left", "bold 10px Ubuntu, system-ui"); }
    if (!L) label(sec.ctx, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    setAria("secondaryCanvas", `${st.N} medidas por sala. Contagens: ${salas.map((s, i) => `q ${qStr(s.q)}: ${st.counts[i] || 0}`).join("; ")}.${L ? ` Probabilidades: ${salas.map((s, i) => `q ${qStr(s.q)}: ${fmt(probs[i], 3)}`).join("; ")}.` : ""}`);
    if (!full) return;
    const idx = sala.indices, sumTerms = idx.map((i) => `|c<sub>${i + 1}</sub>|²`).join(" + "), sumNum = idx.map((i) => fmt(P.cAbs2(fc.c[i]), 3)).join(" + "), pS = probs[room];
    boxTexts({ status: "Caixas e fichas", detail: `4 · salas e portas · degenerescência`, eq: EQ.degen,
      title: "Q̂ como tabela de rótulos: salas e estado depois da medida", subtitle: "caixas com o mesmo rótulo formam uma sala; a medida dá o rótulo, não a caixa",
      caption: "A medida dá q e não escolhe uma caixa dentro da sala: a ficha depois é P̂_q|ψ⟩/√P(q), com as proporções (e fases) dos ponteiros preservadas. Em 2D: sala 5 com (½, 1/√2, ½) dá √(2/3)|1,2⟩ + √(1/3)|2,1⟩.",
      secondaryTitle: "P(sala) e a armadilha g/N", secondarySubtitle: "barras: P(q) = soma dos |cₙ|² da sala · tracejado violeta: g/N (multiplicidade), que não é probabilidade",
      secondaryCaption: "Ω (aqui g) conta caixas; a probabilidade soma |c|². Com (½, 1/√2, ½), g/N = 2/3 e P(5) = 3/4. Não há equiprobabilidade a priori: a ficha decide.",
      calculation: !L ? "(oculta até a previsão)" : `${fc.nula ? `<span class="warn">Ficha nula: a conta usa |1⟩.</span><br>` : ""}P(q = ${qStr(sala.q)}) = ${sumTerms} = ${sumNum} = <b>${fmt(pS, 3)}</b><br>${m.P > 1e-12 ? `ficha depois = P̂_q|ψ⟩/√P(q) = (${idx.map((i) => fmtC(m.post[i], 3)).join("; ")}) nas caixas ${idx.map((i) => dgNames[i]).join(", ")}` : "P = 0: não há ficha depois"}<br>⟨Q⟩ = ${salas.map((s, i) => `${fmt(probs[i], 3)}·(${qStr(s.q)})`).join(" + ")} = <b>${fmt(mean, 3)}</b>, σ_Q = √(${fmt(q2, 3)} − ${fmt(mean * mean, 3)}) = <b>${fmt(sd, 3)}</b><small>Q̂|ψ⟩ = (${Qpsi.map((z) => fmtC(z, 2)).join("; ")}): a ficha com cada ponteiro × rótulo, de norma² ⟨Q²⟩ = ${fmt(q2, 2)}. Não é o resultado da medida.</small>`,
      metrics: [["P por sala", L ? salas.map((s, i) => `q=${qStr(s.q)}: ${fmt(probs[i], 3)}`).join(" · ") : "—"], ["⟨Q⟩", L ? fmt(mean, 3) : "—"], ["σ_Q", L ? fmt(sd, 3) : "—"], [`sala q = ${qStr(sala.q)}: P · g/N`, L ? `${fmt(pS, 3)} · ${fmt(sala.indices.length / 3, 3)}` : "—"], ["ficha depois: ponteiros da sala", L && m.P > 1e-12 ? idx.map((i) => fmt(Math.hypot(...m.post[i]), 3)).join(" · ") : "—"], ["medidas N", String(st.N)]],
      concept: "Q̂ = Σ q P̂_q é uma tabela de rótulos sobre as caixas; a medida de um autovalor degenerado fixa a sala e preserva as proporções dentro dela (nota 06, §5, regra de Lüders postulada para g > 1).",
      prompts: ["Poço 2D: depois de obter 5E₁ o estado é |1,2⟩, |2,1⟩ ou outra coisa? Confira √(2/3) e √(1/3), e que P ≠ 2/3.", "Carregue o segundo preset, (½, ½, 1/√2): quem tem o maior ponteiro depois da medida? Confira P = ¾.", "Carregue Q̂ = 2P̂₁ − P̂₂ − P̂₃: P(2) = 1/6, P(−1) = 5/6, ⟨Q⟩ = −½, σ = 1,12. ⟨Q⟩ é um dos rótulos?"],
      brk: "Ω (a multiplicidade g) não dá probabilidade: não há equiprobabilidade a priori, e a probabilidade da sala soma |c|². Também Q̂|ψ⟩ não é o resultado da medida: é a ficha com cada ponteiro multiplicado pelo rótulo; o resultado é um rótulo sorteado.",
      misc: "«degenerescência dá probabilidade g/N» (Ω/N da Mecânica Estatística).", fix: "P(sala 5) = |c₂|² + |c₃|² = 3/4, não 2/3: a multiplicidade conta caixas, a probabilidade soma |c|².",
      legend: [[C.red, "caixa 1"], [C.gold, "caixa 2"], [C.blue, "caixa 3"], [C.violet, "g/N", true]] });
  }
  function dgMeasure(n) {
    if (bx.anim || !bx.locked.degen) return; bx.acted.degen = true;
    const d = dgState(), st = bx.degen, pick = () => P.sample(d.probs, rnd());
    if (n >= 100) { let k = 0; for (let i = 0; i < n; i += 1) { k = pick(); st.counts[k] += 1; st.N += 1; } $("dgRoom").value = String(k); render(); return; }
    const k = pick(), m = P.medirSala(d.fc.c, d.salas[k].indices);
    startAnim({ owner: "degen", d: 0.8, n: d.salas.length, k, c0: d.fc.c, proj: m.proj, post: m.post, log: `folha de registro: q = ${qStr(d.salas[k].q)} (P = ${fmt(d.probs[k], 3)}, g = ${d.salas[k].indices.length})`, onDone: () => { st.counts[k] += 1; st.N += 1; $("dgRoom").value = String(k); } });
  }

  // ---- bloco 4b: paridade e jogo L/R
  function parMeasureOne(c, game, k) { return game === "pi" ? P.medirSala(c, k === 0 ? [0, 2] : [1, 3]) : P.medirLado(c, k); }
  function drawBoxPar(full) {
    const fc = readFicha("pr", 4), st = bx.par, L = !!bx.locked.paridade, g = st.game, a = bx.anim, av = a ? animView(a) : null, sig = fc.mods.join() + "|" + fc.phases.join();
    if (st.sig !== sig) { st.sig = sig; st.pi = [0, 0]; st.lr = [0, 0]; st.after = null; }
    const pp = P.probsPi(fc.c), pl = P.probLado(fc.c), pPi = [pp.mais, pp.menos], pLR = [pl.esq, pl.dir], items = g === "pi" ? [["sala + : A1, A3", pPi[0]], ["sala − : A2, A4", pPi[1]]] : [["esquerda (L₁₂, L₃₄)", pLR[0]], ["direita (R₁₂, R₃₄)", pLR[1]]];
    const gh = fichaGeom(mainW(), 4, 46, L).h, HH = 4 + 100 + 6 + gh + 6 + gh + 6;
    const main = canvasFixed("mainCanvas", HH, HH), ctx = main.ctx, w = main.w - 12, sign = P.PARIDADE_A.map((p) => (p > 0 ? "π = +1" : "π = −1"));
    const top = measureTop(ctx, 6, 4, w, { title: g === "pi" ? "medida de paridade Π̂: duas salas, + e −" : "medida do lado: esquerda ou direita (jogo L/R)", items: items.map(([name, p]) => ({ name, p: L ? p : null, color: C.ink })), hi: av ? av.hi : -1, chosen: av && av.step > 1 ? a.k : -1, step: av ? av.step : 0, log: av ? av.log : "" });
    const common = { names: BNAMES, colors: BCOL, sub: sign, numbers: L, rMax: 46 };
    const h1 = fichaPanel(ctx, 6, top + 6, w, Object.assign({ vec: fc.c, title: "ficha preparada" }, common));
    fichaPanel(ctx, 6, top + 12 + h1, w, Object.assign({ vec: av ? (av.step === 3 ? av.vec : null) : st.after, title: "depois da medida: ficha reescrita", note: !av && !st.after ? "meça para ver a reescrita" : "" }, common));
    const sec = canvasFixed("secondaryCanvas", 270, 540), c2 = sec.ctx, stk = sec.narrow, wP = stk ? sec.w : sec.w / 2, hP = stk ? sec.h / 2 : sec.h;
    [["paridade Π̂", pPi, st.pi, ["+1", "−1"], C.blue, 0], ["esquerda/direita", pLR, st.lr, ["L", "R"], C.violet, 1]].forEach(([ttl, th, em, nm, col, idx]) => {
      const x0 = stk ? 0 : idx * wP, y0 = stk ? idx * hP : 0;
      label(c2, `jogo ${ttl}`, x0 + 12, y0 + 14, C.ink, "left", "bold 11px Ubuntu, system-ui");
      const ch = catAxes(sec, panelBox(x0, y0 + 2, wP, hP - 2), nm, 1.05, `resultado: ${ttl}`, "probabilidade / frequência");
      catBars(ch, c2, L ? th : null, hasData(em) ? freqs(em) : null, [col, C.gold], sec.narrow);
    });
    if (!L) label(c2, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    setAria("secondaryCanvas", `Contagens de paridade: + ${st.pi[0]}, − ${st.pi[1]}. Contagens esquerda/direita: L ${st.lr[0]}, R ${st.lr[1]}.${L ? ` Probabilidades: + ${fmt(pPi[0], 3)}, − ${fmt(pPi[1], 3)}; L ${fmt(pLR[0], 3)}, R ${fmt(pLR[1], 3)}.` : ""}`);
    if (!full) return;
    const Pm = P.cAbs2(fc.c[0]) + P.cAbs2(fc.c[2]), post = P.medirSala(fc.c, [0, 2]), pA1 = post.P > 1e-12 ? P.cAbs2(fc.c[0]) / post.P : NaN;
    boxTexts({ status: "Caixas e fichas", detail: `4 · salas e portas · paridade · ${g === "pi" ? "Π̂" : "L/R"}`, eq: EQ.paridade,
      title: "Paridade: duas salas, e um jogo que a atravessa", subtitle: "Π̂ rotula A1 e A3 com +1, A2 e A4 com −1 · o jogo L/R usa (A1 ± A2)/√2 e (A3 ± A4)/√2",
      caption: "A paridade é um jogo de duas salas (g = 2 no Quarteto; no poço cada sala tem infinitas caixas). No modelo de duas caixas, a ficha (A1 + A2)/√2 fica de um lado: L/R dá 100 % (modelo; no poço real o peso de um lado é 0,924) e a paridade dá ½. As caixas de um jogo atravessam as do outro.",
      secondaryTitle: "Os dois jogos sobre a mesma ficha", secondarySubtitle: "barras: probabilidade teórica · contorno dourado: frequência nas medidas",
      secondaryCaption: "No Quarteto, nestas fichas, quando um dos jogos é nítido (100 %), o outro dá ½. (⟨Π⟩ pode estar entre −1 e 1 mesmo que cada medida dê só ±1.)",
      calculation: !L ? "(oculta até a previsão)" : `${fc.nula ? `<span class="warn">Ficha nula: a conta usa A1.</span><br>` : ""}P(+1) = |c₁|² + |c₃|² = ${fmt(P.cAbs2(fc.c[0]), 3)} + ${fmt(P.cAbs2(fc.c[2]), 3)} = <b>${fmt(Pm, 3)}</b>, P(−1) = <b>${fmt(1 - Pm, 3)}</b><br>⟨Π⟩ = P(+) − P(−) = <b>${fmt(pp.mean, 3)}</b>, σ<sub>Π</sub> = √(1 − ⟨Π⟩²) = <b>${fmt(pp.sigma, 3)}</b><br>conferência: P(±) = ½(1 ± ⟨Π⟩) = ${fmt(pp.mais, 3)} e ${fmt(pp.menos, 3)}<br>P(L) = ${fmt(pl.esq, 3)}, P(R) = ${fmt(pl.dir, 3)}<br>P(A1 | π = +1) = |c₁|²/P(+) = ${Number.isFinite(pA1) ? `<b>${fmt(pA1, 3)}</b> (renormalizada; sem dividir seria ${fmt(P.cAbs2(fc.c[0]), 3)})` : "—"}<small>Π̂ comuta com Ĥ (V par): paridade e energia são compatíveis; Π̂ e L/R não.</small>`,
      metrics: [["P(+1) · P(−1)", L ? `${fmt(pp.mais, 3)} · ${fmt(pp.menos, 3)}` : "—"], ["⟨Π⟩", L ? fmt(pp.mean, 3) : "—"], ["σ<sub>Π</sub>", L ? fmt(pp.sigma, 3) : "—"], ["P(L) · P(R) (modelo)", L ? `${fmt(pl.esq, 3)} · ${fmt(pl.dir, 3)}` : "—"], ["P(A1 | π = +1)", L && Number.isFinite(pA1) ? fmt(pA1, 3) : "—"], [`medidas (${g === "pi" ? "Π̂" : "L/R"})`, String((g === "pi" ? st.pi : st.lr).reduce((s, k) => s + k, 0))]],
      concept: "A paridade é um observável de duas salas, P̂_± = (1 ± Π̂)/2, cada uma com muitas caixas; ⟨Π⟩ = P(+) − P(−) fica entre −1 e 1, e Π̂ e a posição esquerda/direita são incompatíveis (nota 06, §5.1).",
      prompts: ["Com (3ψ₁ + 4iψ₂)/5, confira P(+) = 0,36, ⟨Π⟩ = −0,28 e σ = 0,96. ⟨Π⟩ é um resultado possível?", "Carregue (ψ₁ + ψ₂)/√2: meça 100 vezes a paridade e 100 vezes L/R. Qual dos dois jogos é nítido (no modelo)?", "Com (½, ½, ½, ½), depois de π = +1 qual é P(A1)? Compare com ¼ (sem renormalizar)."],
      brk: "As caixas só são disjuntas dentro do mesmo jogo: as caixas L/R atravessam as de paridade (Π̂x̂Π̂ = −x̂, logo não comutam). Cada sala de Π̂ tem multiplicidade infinita no poço; no Quarteto, g = 2.",
      misc: "«paridade é só uma propriedade da função desenhada» / «⟨Π⟩ só vale ±1».", fix: "Π̂ é um jogo de duas salas com autovalores ±1; ⟨Π⟩ = −0,28 em (3ψ₁ + 4iψ₂)/5 é média, e cada medida dá +1 ou −1. Com (ψ₁ + ψ₂)/√2, no modelo de duas caixas, L/R dá 100 % e Π̂ dá ½ (no poço real, 92,4 % de um lado).",
      legend: [[C.red, "A1"], [C.gold, "A2"], [C.blue, "A3 / paridade"], [C.violet, "A4 / L-R"]] });
  }
  function prMeasure(n) {
    if (bx.anim || !bx.locked.paridade) return; bx.acted.paridade = true;
    const fc = readFicha("pr", 4), st = bx.par, g = st.game, pr = g === "pi" ? [P.probsPi(fc.c).mais, P.probsPi(fc.c).menos] : [P.probLado(fc.c).esq, P.probLado(fc.c).dir], tgt = g === "pi" ? st.pi : st.lr;
    if (n >= 100) { let k = 0; for (let i = 0; i < n; i += 1) { k = P.sample(pr, rnd()); tgt[k] += 1; } st.after = parMeasureOne(fc.c, g, k).post; render(); return; }
    const k = P.sample(pr, rnd()), m = parMeasureOne(fc.c, g, k);
    startAnim({ owner: "par", d: 0.8, n: 2, k, c0: fc.c, proj: m.proj, post: m.post, log: `folha de registro: ${g === "pi" ? (k === 0 ? "π = +1" : "π = −1") : (k === 0 ? "esquerda (L)" : "direita (R)")} (P = ${fmt(pr[k], 3)})`, onDone: () => { tgt[k] += 1; st.after = m.post; } });
  }

  // ---- bloco 4c: caixas contínuas
  function drawBoxCont(full) {
    const L = !!bx.locked.continuo, dp = v("ctDp"); let p1 = v("ctP1"), p2 = v("ctP2"); if (p1 > p2) [p1, p2] = [p2, p1];
    set("ctDpOut", `${fmt(dp, 2)} p₀`); set("ctP1Out", `${fmt(p1, 2)} p₀`); set("ctP2Out", `${fmt(p2, 2)} p₀`);
    const hist = P.histogramaUniforme(dp), nb = hist.length, samples_ = bx.cont.samples, N = samples_.length, counts = hist.map(() => 0);
    samples_.forEach((p) => { counts[Math.min(nb - 1, Math.floor(p / dp + 1e-12))] += 1; });
    const area = P.probIntervalo(p1, p2), mean = N ? samples_.reduce((s, x) => s + x, 0) / N : NaN, sdv = N > 1 ? Math.sqrt(samples_.reduce((s, x) => s + (x - mean) ** 2, 0) / (N - 1)) : NaN;
    const main = canvasFixed("mainCanvas", 380, 380), ctx = main.ctx;
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 0, 2.2, 0, 0.32, "momento p/p₀", "probabilidade por caixa", { ticks: 5, xTicks: [0, 0.5, 1, 1.5, 2], yDigits: 2 });
    clip(ch, (c) => { c.fillStyle = "rgba(233,162,59,.18)"; c.fillRect(ch.X(p1), ch.top, ch.X(p2) - ch.X(p1), ch.bottom - ch.top); });
    if (L) hist.forEach((b) => { clip(ch, (c) => { c.fillStyle = "rgba(69,123,157,.55)"; c.strokeStyle = "#fff"; c.lineWidth = 1; c.fillRect(ch.X(b.lo), ch.Y(b.P), ch.X(b.hi) - ch.X(b.lo), ch.Y(0) - ch.Y(b.P)); c.strokeRect(ch.X(b.lo), ch.Y(b.P), ch.X(b.hi) - ch.X(b.lo), ch.Y(0) - ch.Y(b.P)); }); });
    if (N) hist.forEach((b, i) => { const f = counts[i] / N; clip(ch, (c) => { c.strokeStyle = C.ink; c.lineWidth = 1.6; c.strokeRect(ch.X(b.lo), ch.Y(f), ch.X(b.hi) - ch.X(b.lo), ch.Y(0) - ch.Y(f)); }); });
    if (L) label(ctx, `P por caixa = |Φ|²·dp = ${fmt(dp / 2, 3)} (cada caixa de largura ${fmt(dp, 2)}p₀)`, ch.right - 6, ch.top + 14, C.blue, "right", "bold 11px Ubuntu, system-ui");
    else label(ctx, "(oculto até a previsão)", main.w / 2, main.h / 2, C.gray, "center");
    setAria("mainCanvas", `Histograma de ${N} medidas de momento em ${nb} caixas de largura ${fmt(dp, 2)} p0.${L ? ` P por caixa ${fmt(dp / 2, 3)}; P entre ${fmt(p1, 2)} e ${fmt(p2, 2)} p0 = ${fmt(area, 3)}.` : ""}`);
    const sec = canvasFixed("secondaryCanvas", 250, 280), c2 = sec.ctx;
    const S = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 0, 2.2, 0, 0.8, "momento p/p₀", "densidade |Φ|² (1/p₀)", { ticks: 4, xTicks: [0, 0.5, 1, 1.5, 2], yTicks: [0, 0.25, 0.5, 0.75], yDigits: 2 });
    if (L) {
      area_(S, p1, p2);
      line(S, [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 2, y: 0.5 }, { x: 2, y: 0 }], C.red, [], 2.8);
      if (N) hist.forEach((b, i) => { const f = counts[i] / N / (b.hi - b.lo); line(S, [{ x: b.lo, y: f }, { x: b.hi, y: f }], C.ink, [], 1.4); });
      label(c2, `área = 0,5·(${fmt(p2, 2)} − ${fmt(p1, 2)}) = ${fmt(area, 3)}`, S.X((p1 + p2) / 2), S.Y(0.5) - 10, "#b07a14", "center", "bold 11px Ubuntu, system-ui");
    } else label(c2, "(oculto até a previsão)", sec.w / 2, sec.h / 2, C.gray, "center");
    function area_(Sx, a, b) { clip(Sx, (c) => { c.fillStyle = "rgba(233,162,59,.4)"; c.fillRect(Sx.X(a), Sx.Y(0.5), Sx.X(b) - Sx.X(a), Sx.Y(0) - Sx.Y(0.5)); }); }
    if (!full) return;
    boxTexts({ status: "Caixas e fichas", detail: "4 · salas e portas · caixas contínuas", eq: EQ.continuo,
      title: "Caixas contínuas: a densidade não muda com a largura da caixa", subtitle: "barras azuis: P por caixa = |Φ|²dp · contorno escuro: frequência · faixa dourada: intervalo [p₁, p₂]",
      caption: "Φ(p) uniforme em [0, 2p₀]. A altura de cada barra é P = |Φ|²·dp e cresce com a largura da caixa; a densidade |Φ|² = 0,5/p₀ (painel de baixo) não depende dela. A probabilidade do intervalo é a área.",
      secondaryTitle: "A densidade |Φ|²: a área é a probabilidade", secondarySubtitle: "vermelho: |Φ|² (teoria) · contorno escuro: frequência/(N·dp) · dourado: área em [p₁, p₂]",
      secondaryCaption: "Uma caixa de largura zero tem P = 0: |p⟩⟨p| sozinho não é projetor (aparece δ(0)). Caixas são intervalos, P̂<sub>Δ</sub> = ∫<sub>Δ</sub> |p⟩⟨p| dp; a delta é o limite de caixas cada vez mais estreitas.",
      calculation: !L ? "(oculta até a previsão)" : `|Φ|² = 1/(2p₀) = 0,5/p₀ em [0, 2p₀]<br>P(${fmt(p1, 2)}p₀ &lt; p &lt; ${fmt(p2, 2)}p₀) = 0,5·(${fmt(p2, 2)} − ${fmt(p1, 2)}) = <b>${fmt(area, 3)}</b> (área)<br>por caixa: P = |Φ|²·dp = 0,5·${fmt(dp, 2)} = <b>${fmt(dp / 2, 3)}</b><br>⟨p⟩ = p₀, σ_p = p₀/√3 = <b>${fmt(P.SIGMA_UNIFORME, 3)}p₀</b><small>${N ? `amostra de ${N} medidas: média ${fmt(mean, 3)}p₀, desvio ${N > 1 ? fmt(sdv, 3) : "—"}p₀` : "sem medidas ainda: use Medir para amostrar |Φ|²"}</small>`,
      metrics: [["P(p₁ < p < p₂)", L ? fmt(area, 3) : "—"], ["altura |Φ|²", L ? "0,5/p₀" : "—"], ["P por caixa (dp)", L ? fmt(dp / 2, 3) : "—"], ["número de caixas", String(nb)], ["⟨p⟩ · σ_p (teoria)", L ? `1,000 · ${fmt(P.SIGMA_UNIFORME, 3)} (p₀)` : "—"], ["medidas N · média · σ", N ? `${N} · ${fmt(mean, 3)} · ${N > 1 ? fmt(sdv, 3) : "—"}` : "—"]],
      concept: "Numa caixa de largura finita a probabilidade é a área P = ∫|Φ|²dp = ⟨P̂<sub>Δ</sub>⟩; a largura zero dá P = 0, e é a densidade |Φ|², não o histograma, que descreve o estado (nota 06, §6).",
      prompts: ["Confira P(0,5p₀ < p < 0,7p₀) = 0,1 pela área e compare com a altura 0,5/p₀.", "Reduza dp para 0,02: o histograma fica baixo, a densidade continua em 0,5/p₀. Por quê?", "Meça 10000: a frequência por caixa se aproxima de |Φ|²·dp? Compare ⟨p⟩ = p₀ e σ_p = 0,577p₀."],
      brk: "Caixa de largura zero tem P = 0: as |p⟩ não são normalizáveis, e |p⟩⟨p| sozinho não é projetor. Caixas são intervalos; a delta é uma caixa que 'vaza', o limite de caixas cada vez mais estreitas, e não um estado.",
      misc: "«|Φ|² é uma probabilidade» (densidade = probabilidade).", fix: "|Φ|² = 0,5/p₀ tem unidade de 1/p; só a área é probabilidade. Mude dp: as barras mudam, a densidade não.",
      legend: [[C.blue, "P por caixa"], [C.red, "densidade |Φ|²"], [C.gold, "[p₁, p₂]"], [C.ink, "frequência"]] });
  }
  function ctMeasure(n) {
    if (!bx.locked.continuo) return; bx.acted.continuo = true;
    const s = bx.cont.samples; for (let i = 0; i < n; i += 1) s.push(2 * rnd());
    if (s.length > 20000) s.splice(0, s.length - 20000);
    render();
  }

  // ---- coordenação do modo, blocos e textos
  const BDRAW = { ficha: drawBoxFicha, sacos: drawBoxSacos, aba: drawBoxAba, fase: drawBoxFase, degen: drawBoxDegen, paridade: drawBoxPar, continuo: drawBoxCont };
  // Versão estreita (≤ 760 px): os gráficos ficam abaixo da dobra; repete a ficha preparada em miniatura sob a pergunta.
  function drawMini() {
    const el = $("miniFicha"), b = bx.block, ok = ["ficha", "aba", "fase", "degen", "paridade"].includes(b);
    el.classList.toggle("off", !ok); if (!ok || !el.offsetWidth) return;
    let vec, names, cols;
    if (b === "ficha") { vec = readFicha("fc", 4).c; names = BNAMES; cols = BCOL; }
    else if (b === "paridade") { vec = readFicha("pr", 4).c; names = BNAMES; cols = BCOL; }
    else if (b === "degen") { vec = readFicha("dg", 3).c; names = dgNames; cols = BCOL; }
    else if (b === "fase") { vec = P.fichaDePolar([1, 1, 0, 0], [0, v("faPhi"), 0, 0]); names = BNAMES; cols = BCOL; }
    else { vec = P.fichaDePolar([1, 1, 0, 0], [0, 0, 0, 0]); names = BNAMES; cols = BCOL; }
    const m = canvasFixed("miniFicha", 108, 108), n = vec.length, cw = m.w / n, R = Math.min(27, cw / 2 - 6);
    label(m.ctx, "ficha preparada", 4, 11, C.ink, "left", "bold 10px Ubuntu, system-ui");
    vec.forEach((z, i) => { const cx = cw * (i + 0.5); drawDial(m.ctx, cx, 24 + R + 4, R, z, cols[i], {}); label(m.ctx, names[i], cx, 24 + 2 * R + 20, cols[i], "center", "bold 10px Ubuntu, system-ui"); });
    el.setAttribute("aria-label", `Ficha preparada em miniatura: ${names.map((nm, i) => `${nm} comprimento ${fmt(Math.hypot(vec[i][0], vec[i][1]), 2)}, ângulo ${argDeg(vec[i])}°`).join("; ")}.`);
  }
  function drawBoxes(canvasOnly) { BDRAW[bx.block](!canvasOnly); drawMini(); }
  // Antes da trava, nada da resposta aparece: equação, legendas, leituras, tarefas e "Ideia física" ficam ocultos.
  function boxTexts(d) {
    const b = bx.block, L = !!bx.locked[b];
    const dd = Object.assign({ prompts: [], metrics: [] }, d);
    if (!L) { dd.subtitle = ""; dd.caption = ""; dd.secondarySubtitle = ""; dd.secondaryCaption = ""; dd.metrics = dd.metrics.map(([k]) => [k, "—"]); dd.prompts = []; }
    dd.hidePrompts = !L; dd.hideConcept = !L;
    texts(dd);
    $("bxEquation").hidden = !L; $("breakBand").hidden = !bx.acted[b];
    set("bxEquation", d.eq); set("breakText", d.brk); set("miscName", d.misc); set("miscFix", d.fix); predFeedback();
    document.querySelectorAll("[data-bmode]").forEach((b) => { const on = b.dataset.bmode === modeOf(bx.block); b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  }
  function buildBlockTabs() {
    const list = MODE_BLOCKS[modeOf(bx.block)], host = $("blockTabs");
    host.hidden = list.length < 2;
    host.innerHTML = list.map((b) => `<button type="button" role="tab" data-bblock="${b}" class="${b === bx.block ? "active" : ""}" aria-selected="${b === bx.block}">${BLOCK_LABEL[b]}</button>`).join("");
  }
  function setBlock(b) {
    if (!BLOCKS.includes(b)) b = "ficha";
    cancelAnim();
    bx.fase.playing = false; $("faPlay").textContent = "Girar no tempo";
    bx.block = b; buildBlockTabs(); buildPrediction(); applyLock();
    try { const u = new URL(location.href); u.searchParams.set("block", b); history.replaceState(null, "", u); } catch (_) { /* file:// */ }
    render();
  }
  const BDEFAULT = {
    ficha: () => { setFicha("fc", "1,1,2,0;0,90,180,0"); $("fcReader").value = "1"; bx.ficha.sig = ""; },
    sacos: () => { bx.sacos.game = "A"; syncGame("sacGame", "A"); },
    aba: () => { abNew(); },
    fase: () => { $("faPhi").value = 0; $("faT").value = 0; bx.fase.t = 0; },
    degen: () => { setDegen("poco"); bx.degen.sig = ""; bx.degen.roomSig = ""; },
    paridade: () => { setFicha("pr", "3,4,0,0;0,90,0,0"); bx.par.game = "pi"; syncGame("prGame", "pi"); bx.par.sig = ""; },
    continuo: () => { $("ctDp").value = 0.1; $("ctP1").value = 0.5; $("ctP2").value = 0.7; bx.cont.samples = []; },
  };
  function syncGame(id, g) { document.querySelectorAll(`#${id} button`).forEach((b) => { const on = (b.dataset.game || b.dataset.pgame) === g; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }); }
  function resetBlock() {
    const b = bx.block; cancelAnim(); bx.fase.playing = false; $("faPlay").textContent = "Girar no tempo";
    bx.locked[b] = false; bx.choice[b] = undefined; bx.acted[b] = false; bx.why[b] = "";
    const fresh = { ficha: { counts: [0, 0, 0, 0], N: 0, sumE: 0, after: null, sig: "" }, sacos: { game: "A", M: { A: [0, 0, 0, 0], B: [0, 0, 0, 0] }, S: { A: [0, 0, 0, 0], B: [0, 0, 0, 0] } }, aba: { rows: [], hist: [0, 0, 0, 0], same: 0, N: 0 }, fase: { t: 0, playing: false }, degen: { counts: [], N: 0, sig: "", roomSig: "", after: null }, par: { game: "pi", pi: [0, 0], lr: [0, 0], sig: "", after: null }, cont: { samples: [] } };
    const key = { paridade: "par", continuo: "cont" }[b] || b; Object.assign(bx[key], fresh[key]);
    BDEFAULT[b](); buildPrediction(); applyLock(); render();
  }
  function initBoxes() {
    const q = new URLSearchParams(location.search), un = q.get("unlock") === "1";
    setFicha("fc", "1,1,2,0;0,90,180,0"); setDegen("poco"); setFicha("pr", "3,4,0,0;0,90,0,0");
    if (un) BLOCKS.forEach((b) => { bx.locked[b] = true; bx.choice[b] = -1; });
    document.querySelectorAll("[data-bmode]").forEach((b) => b.addEventListener("click", () => setBlock(MODE_BLOCKS[b.dataset.bmode][0])));
    $("blockTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-bblock]"); if (b) setBlock(b.dataset.bblock); });
    $("predChoices").addEventListener("change", (e) => { if (e.target.name === "pred") { bx.choice[bx.block] = Number(e.target.value); $("predLock").disabled = false; } });
    $("predLock").addEventListener("click", () => { if (!Number.isInteger(bx.choice[bx.block])) return; bx.locked[bx.block] = true; buildPrediction(); applyLock(); render(); });
    document.querySelector(".controls").addEventListener("input", (e) => { if (view === "boxes" && e.target.closest(".block-controls") && !bx.acted[bx.block]) { bx.acted[bx.block] = true; render(); } });
    $("predWhy").addEventListener("input", (e) => { bx.why[bx.block] = e.target.value; });
    document.querySelectorAll("[data-ficha]").forEach((b) => b.addEventListener("click", () => { setFicha("fc", b.dataset.ficha); bx.acted.ficha = true; render(); }));
    document.querySelectorAll("[data-pr]").forEach((b) => b.addEventListener("click", () => { setFicha("pr", b.dataset.pr); bx.acted.paridade = true; render(); }));
    document.querySelectorAll("[data-dg]").forEach((b) => b.addEventListener("click", () => { setDegen(b.dataset.dg); bx.acted.degen = true; render(); }));
    document.querySelectorAll("[data-fphi]").forEach((b) => b.addEventListener("click", () => { $("faPhi").value = b.dataset.fphi; bx.acted.fase = true; render(); }));
    document.querySelectorAll("[data-shots]").forEach((b) => b.addEventListener("click", () => fichaMeasure(Number(b.dataset.shots))));
    document.querySelectorAll("[data-sacshots]").forEach((b) => b.addEventListener("click", () => sacMeasure(Number(b.dataset.sacshots))));
    document.querySelectorAll("[data-dgshots]").forEach((b) => b.addEventListener("click", () => dgMeasure(Number(b.dataset.dgshots))));
    document.querySelectorAll("[data-prshots]").forEach((b) => b.addEventListener("click", () => prMeasure(Number(b.dataset.prshots))));
    document.querySelectorAll("[data-ctshots]").forEach((b) => b.addEventListener("click", () => ctMeasure(Number(b.dataset.ctshots))));
    document.querySelectorAll("[data-abrun]").forEach((b) => b.addEventListener("click", () => abaRun(Number(b.dataset.abrun))));
    document.querySelectorAll("#sacGame button").forEach((b) => b.addEventListener("click", () => { bx.sacos.game = b.dataset.game; bx.acted.sacos = bx.acted.sacos || bx.locked.sacos; syncGame("sacGame", b.dataset.game); render(); }));
    document.querySelectorAll("#prGame button").forEach((b) => b.addEventListener("click", () => { bx.par.game = b.dataset.pgame; bx.acted.paridade = bx.acted.paridade || bx.locked.paridade; syncGame("prGame", b.dataset.pgame); render(); }));
    $("fcClear").addEventListener("click", () => { Object.assign(bx.ficha, { counts: [0, 0, 0, 0], N: 0, sumE: 0, after: null }); render(); });
    $("sacClear").addEventListener("click", () => { bx.sacos.M = { A: [0, 0, 0, 0], B: [0, 0, 0, 0] }; bx.sacos.S = { A: [0, 0, 0, 0], B: [0, 0, 0, 0] }; render(); });
    $("abNext").addEventListener("click", abaNext); $("abNew").addEventListener("click", () => { if (!bx.anim) { abNew(); render(); } });
    $("abClear").addEventListener("click", () => { Object.assign(bx.aba, { hist: [0, 0, 0, 0], same: 0, N: 0 }); render(); });
    $("dgClear").addEventListener("click", () => { bx.degen.counts = bx.degen.counts.map(() => 0); bx.degen.N = 0; render(); });
    $("prClear").addEventListener("click", () => { bx.par.pi = [0, 0]; bx.par.lr = [0, 0]; render(); });
    $("ctClear").addEventListener("click", () => { bx.cont.samples = []; render(); });
    $("faPlay").addEventListener("click", () => { bx.fase.playing = !bx.fase.playing; bx.acted.fase = true; $("faPlay").textContent = bx.fase.playing ? "Pausar" : "Girar no tempo"; if (bx.fase.playing) kickBox(); render(); });
    $("faHalf").addEventListener("click", () => { bx.fase.playing = false; $("faPlay").textContent = "Girar no tempo"; bx.fase.t = P.TEMPO_MEIO_BATIMENTO; $("faT").value = bx.fase.t.toFixed(3); bx.acted.fase = true; render(); });
    $("faT").addEventListener("input", () => { bx.fase.t = v("faT"); });
    const qb = q.get("block"); bx.block = BLOCKS.includes(qb) ? qb : "ficha";
    buildBlockTabs(); buildPrediction(); applyLock();
  }

  // ---------------------------------------------------------------- coordenação
  const DRAW = { boxes: () => drawBoxes(false), sequence: drawSequence, spread: drawSpread, degenerate: drawDegenerate, parity: drawParity, mri: drawMri };
  function render() { DRAW[view](); }
  function switchView(next) {
    cancelAnim();
    if (view === "boxes" && next !== "boxes") { bx.fase.playing = false; $("faPlay").textContent = "Girar no tempo"; }
    view = VIEWS.includes(next) ? next : "boxes";
    $("predictSection").hidden = view === "boxes"; $("breakBand").hidden = view !== "boxes"; $("dictSection").hidden = view !== "boxes";
    if (view === "boxes") { buildBlockTabs(); buildPrediction(); applyLock(); }
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); if (view === "boxes") u.searchParams.set("block", bx.block); else u.searchParams.delete("block"); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
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
  ["spW1", "spW2", "spW3"].forEach((id) => $(id).addEventListener("input", () => { state.spread.outcomes = []; }));  // antes do render: medidas antigas descrevem outro estado
  initBoxes();
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
    if (view === "boxes") { resetBlock(); return; }
    Object.entries(DEFAULTS[view]).forEach(([id, val]) => { $(id).value = val; });
    if (view === "spread") state.spread.outcomes = [];
    render();
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });
  new URLSearchParams(location.search).forEach((value, key) => { const el = $(key); if (el && key !== "view" && (el.tagName === "INPUT" || el.tagName === "SELECT")) el.value = value; });
  switchView(view);
})();
