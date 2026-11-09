(function () {
  "use strict";
  const P = window.DeltaPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", violet: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const VIEWS = ["ligado", "espalhamento", "polo", "hpge"];
  const DEFAULTS = { ligA: 1, espG: 2, espE: 4.5, polA: 1, medEb: 12.7, medM: 0.12, medT: 300, medND: 10 };
  let view = new URLSearchParams(location.search).get("view");
  if (!VIEWS.includes(view)) view = "ligado";
  // moved[view]: a estação só mostra a frase-resposta da previsão depois do primeiro controle movido.
  const state = { sign: +1, moved: { ligado: false, espalhamento: false, polo: false, hpge: false } };
  const reveal = (before, after) => (state.moved[view] ? after : before);

  const fmt = (x, n = 3) => Number(x).toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n });
  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  // notação científica em pt-BR: 2,3×10¹³
  const sci = (x, n = 1) => { const [m, e] = Number(x).toExponential(n).split("e"); return `${fmt(m, n)}×10${String(Number(e)).split("").map((c) => SUP[c]).join("")}`; };
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
  function axes(target, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = 56, right = target.w - 16, top = 18, bottom = target.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    const n = o.ticks ?? 5, yFmt = o.yFmt || ((y) => fmt(y, o.yDigits ?? 1));
    for (let i = 0; i <= n; i += 1) {
      const x = xMin + i * (xMax - xMin) / n, y = yMin + i * (yMax - yMin) / n;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(fmt(x, o.xDigits ?? 1), X(x), bottom + 14);
      ctx.textAlign = "right"; ctx.fillText(yFmt(y), left - 6, Y(y) + 3);
    }
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    if (yMin < 0 && yMax > 0) { ctx.strokeStyle = C.faint; ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(right, Y(0)); ctx.stroke(); }
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, target.h - 6);
    ctx.save(); ctx.translate(12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top, ch.right - ch.left, ch.bottom - ch.top); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.6) {
    clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); c.setLineDash([]); });
  }
  function area(ch, pts, color, base = 0) {
    clip(ch, (c) => { c.fillStyle = color; c.beginPath(); c.moveTo(ch.X(pts[0].x), ch.Y(base)); pts.forEach((p) => c.lineTo(ch.X(p.x), ch.Y(p.y))); c.lineTo(ch.X(pts[pts.length - 1].x), ch.Y(base)); c.closePath(); c.fill(); });
  }
  function vline(ch, x, color, dash = [4, 4], width = 1.5) { const c = ch.ctx; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.X(x), ch.top); c.lineTo(ch.X(x), ch.bottom); c.stroke(); c.setLineDash([]); }
  function hline(ch, y, color, dash = [4, 4], width = 1.5) { const c = ch.ctx; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.left, ch.Y(y)); c.lineTo(ch.right, ch.Y(y)); c.stroke(); c.setLineDash([]); }
  function dot(ctx, x, y, color, r = 5) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  // rótulo ao lado de uma linha vertical: à esquerda dela quando não cabe à direita
  function sideLabel(ch, text, x, y, color, font = "10px Ubuntu, system-ui") {
    const fits = ch.X(x) + 5 + ch.ctx.measureText(text).width * 1.1 < ch.right;
    label(ch.ctx, text, ch.X(x) + (fits ? 5 : -5), y, color, fits ? "left" : "right", font);
  }
  function arrow(ctx, x1, y1, x2, y2, color, width = 2.5) {
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = 8; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)); ctx.lineTo(x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
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

  // ================================================================ 01 · estado ligado
  function drawLigado() {
    const alpha = v("ligA"), kappa = P.boundKappa(alpha), E = P.boundEnergy(alpha), psi0 = P.boundPsi(0, alpha);
    const jump = P.psiPrimeJump(alpha), dx = P.deltaX(alpha), prod = P.uncertaintyProduct(alpha);
    set("ligAOut", fmt(alpha, 2));
    const XR = 6;
    // painel principal: psi(x) com a quebra de inclinacao em x = 0
    const main = canvas("mainCanvas", .5), ch = axes(main, -XR, XR, 0, 1.85, "posição x (ħ = m = 1)", "ψ(x)", { xDigits: 0, yDigits: 1 });
    const psi = samples(-XR, XR, 601, (x) => P.boundPsi(x, alpha));
    area(ch, psi.filter((p) => Math.abs(p.x) <= dx), "rgba(69,123,157,.16)");
    vline(ch, -dx, C.blue, [3, 4], 1); vline(ch, dx, C.blue, [3, 4], 1);
    label(ch.ctx, "±σₓ", ch.X(dx) + 5, ch.top + 14, C.blue);
    vline(ch, 0, C.gray, [2, 4], 1);
    line(ch, psi, C.red);
    // tangentes laterais em x = 0: inclinacoes +kappa psi0 (esquerda) e -kappa psi0 (direita)
    const L = Math.min(1.6, 0.9 / Math.max(kappa * psi0, .3));
    line(ch, [{ x: -L, y: psi0 - kappa * psi0 * L }, { x: 0, y: psi0 }], C.gold, [6, 4], 1.8);
    line(ch, [{ x: 0, y: psi0 }, { x: L, y: psi0 - kappa * psi0 * L }], C.gold, [6, 4], 1.8);
    dot(ch.ctx, ch.X(0), ch.Y(psi0), C.gold, 5);
    label(ch.ctx, `ψ(0) = √κ = ${fmt(psi0, 3)}`, ch.X(0) + 10, ch.Y(psi0) - 8, C.ink, "left", "bold 11px Ubuntu, system-ui");
    label(ch.ctx, `inclinação +κψ(0) = ${fmt(kappa * psi0, 2)}`, ch.X(-L) - 4, ch.Y(psi0 - kappa * psi0 * L) + 14, C.gold, "right", "10px Ubuntu, system-ui");
    label(ch.ctx, `inclinação −κψ(0) = ${fmt(-kappa * psi0, 2)}`, ch.X(L) + 4, ch.Y(psi0 - kappa * psi0 * L) + 14, C.gold, "left", "10px Ubuntu, system-ui");
    // painel secundario: psi'(x) com o salto
    const A = Math.max(.35, 1.2 * kappa * psi0);
    const sec = canvas("secondaryCanvas", .3), ch2 = axes(sec, -XR, XR, -A, A, "posição x (ħ = m = 1)", "ψ′(x)", { xDigits: 0, yDigits: 1, ticks: 4 });
    line(ch2, samples(-XR, -1e-6, 300, (x) => P.boundPsiPrime(x, alpha)), C.blue);
    line(ch2, samples(1e-6, XR, 300, (x) => P.boundPsiPrime(x, alpha)), C.blue);
    arrow(ch2.ctx, ch2.X(0), ch2.Y(kappa * psi0), ch2.X(0), ch2.Y(-kappa * psi0), C.gold, 2.5);
    label(ch2.ctx, `salto = ψ′(0⁺) − ψ′(0⁻) = ${fmt(jump, 3)}`, ch2.X(0) + 10, ch2.Y(0) - 6, C.ink, "left", "bold 11px Ubuntu, system-ui");
    label(ch2.ctx, `ψ′(0⁻) = +κψ(0) = ${fmt(kappa * psi0, 2)}`, ch2.X(0) - 8, ch2.Y(kappa * psi0) + 4, C.blue, "right", "10px Ubuntu, system-ui");
    label(ch2.ctx, `ψ′(0⁺) = −κψ(0) = ${fmt(-kappa * psi0, 2)}`, ch2.X(0) + 8, ch2.Y(-kappa * psi0) + 4, C.blue, "left", "10px Ubuntu, system-ui");
    texts({
      status: "Estado ligado da delta atrativa", detail: `α = ${fmt(alpha, 2)} · κ = ${fmt(kappa, 2)}`,
      title: "Função de onda ψ(x) = √κ e^(−κ|x|)", subtitle: "contínua em x = 0, com quebra de inclinação; faixa azul = ±σₓ",
      caption: reveal(
        "As duas tangentes douradas em x = 0 têm inclinações opostas, ±κψ(0): ψ é contínua, mas ψ′ não. O que muda no pico e na faixa ±σₓ quando α dobra? Anote a previsão e só então mova α.",
        "As duas tangentes douradas em x = 0 têm inclinações opostas, ±κψ(0): ψ é contínua, mas ψ′ não. Com α maior, κ cresce na mesma proporção, o pico sobe (√κ), a faixa ±σₓ estreita e E cai com α² — fator 4 ao dobrar α."),
      secondaryTitle: "Derivada ψ′(x)", secondarySubtitle: "o salto em x = 0 é a condição de conexão (2mg/ħ²)ψ(0) com g = −α",
      secondaryCaption: "ψ′ = +κψ à esquerda e −κψ à direita; a seta mede ψ′(0⁺) − ψ′(0⁻) = −2κψ(0) = −2κ√κ.",
      prediction: "Se α dobrar, a energia E muda por que fator? E κ? Anote antes de mover.",
      calculation: `κ = mα/ħ² = ${fmt(alpha, 2)}<br>E = −mα²/2ħ² = −κ²/2 = <b>${fmt(E, 3)}</b><br>salto = −2κψ(0) = −2·${fmt(kappa, 2)}·${fmt(psi0, 3)} = <b>${fmt(jump, 3)}</b><small>confere com (2mg/ħ²)ψ(0) = 2·(−α)·ψ(0) = ${fmt(P.jumpCondition(-alpha, psi0), 3)}</small>`,
      metrics: [["κ", fmt(kappa, 3)], ["E", fmt(E, 3)], ["ψ(0) = √κ", fmt(psi0, 3)], ["salto de ψ′", fmt(jump, 3)], ["σₓ = 1/(√2κ)", fmt(dx, 3)], ["σₓσₚ", `${fmt(prod, 4)} = ħ/√2`]],
      concept: "A delta atrativa prende exatamente um estado: a única maneira de pagar o salto (2mg/ħ²)ψ(0) com uma função par e normalizável é a quebra de inclinação em x = 0, e ela fixa κ = mα/ħ². A delta é 'infinita' em x = 0 mas tem área finita α — por isso ψ(0) fica finita, ao contrário da parede do poço infinito. O produto σₓσₚ = ħ/√2 fica acima de ħ/2 e não depende de α.",
      prompts: ["Dobre α (de 1 para 2) e confira o fator em E e em κ.", "Leia o salto de ψ′ e compare com 2gψ(0) usando g = −α.", "Mova α de 0,2 a 3 e verifique que σₓσₚ não muda enquanto σₓ cai como 1/κ."],
      legend: [[C.red, "ψ(x)"], [C.gold, "tangentes em 0⁻ e 0⁺", true], [C.blue, "±σₓ"]],
    });
  }

  // ================================================================ 02 · espalhamento
  function drawEspalhamento() {
    const g = v("espG") * state.sign, E = v("espE"), s = P.scatter(E, g);
    set("espGOut", fmt(v("espG"), 2)); set("espEOut", fmt(E, 2));
    $("espRep").classList.toggle("on", state.sign > 0); $("espAtr").classList.toggle("on", state.sign < 0);
    const main = canvas("mainCanvas", .5), ch = axes(main, 0, 8, 0, 1.05, "energia E (ħ = m = 1)", "R, T", { xDigits: 0, yDigits: 2 });
    line(ch, samples(.01, 8, 400, (x) => P.scatter(x, g).R), C.red);
    line(ch, samples(.01, 8, 400, (x) => P.scatter(x, g).T), C.blue, [7, 4]);
    vline(ch, g * g / 2, C.gray, [2, 4], 1); sideLabel(ch, "E = γ²/2: R = T = ½", g * g / 2, ch.top + 14, C.gray);
    vline(ch, E, C.gold, [], 2);
    dot(ch.ctx, ch.X(E), ch.Y(s.R), C.red, 5); dot(ch.ctx, ch.X(E), ch.Y(s.T), C.blue, 5);
    // eixo de arg t em múltiplos de π/4 (ticks = 4 entre −π/2 e π/2)
    const piFmt = (y) => { const q = Math.round(4 * y / Math.PI); return q === 0 ? "0" : `${q < 0 ? "−" : ""}${{ 1: "π/4", 2: "π/2", 3: "3π/4", 4: "π" }[Math.abs(q)]}`; };
    const sec = canvas("secondaryCanvas", .3), ch2 = axes(sec, 0, 8, -Math.PI / 2, Math.PI / 2, "energia E (ħ = m = 1)", "arg t (rad)", { xDigits: 0, ticks: 4, yFmt: piFmt });
    line(ch2, samples(.01, 8, 400, (x) => P.scatter(x, Math.abs(g)).phaseT), C.blue);
    line(ch2, samples(.01, 8, 400, (x) => P.scatter(x, -Math.abs(g)).phaseT), C.violet);
    vline(ch2, E, C.gold, [], 2); dot(ch2.ctx, ch2.X(E), ch2.Y(s.phaseT), state.sign > 0 ? C.blue : C.violet, 5);
    label(ch2.ctx, "γ > 0", ch2.right - 8, ch2.Y(P.scatter(8, Math.abs(g)).phaseT) + 12, C.blue, "right");
    label(ch2.ctx, "γ < 0", ch2.right - 8, ch2.Y(P.scatter(8, -Math.abs(g)).phaseT) - 6, C.violet, "right");
    const sinal = state.sign > 0 ? "repulsiva" : "atrativa";
    texts({
      status: `Delta ${sinal}, γ = ${fmt(g, 2)}`, detail: `E = ${fmt(E, 2)} · k = ${fmt(s.k, 3)}`,
      title: "Coeficientes R(E) e T(E)",
      subtitle: reveal("R e T da delta atual; o ponto dourado marca E", "R = γ²/(k²+γ²), T = k²/(k²+γ²): dependem só de γ², não do sinal"),
      caption: reveal(
        "R e T de γ = +2 e γ = −2: iguais ou diferentes? Anote, depois troque o sinal com tudo fixo e veja. R → 1 quando E → 0⁺ e T → 1 quando E → ∞.",
        "Em E = γ²/2 (k = |γ|) a delta divide a onda ao meio. Trocar o sinal não mexe na curva: R e T dependem de γ². R → 1 quando E → 0⁺ e T → 1 quando E → ∞."),
      secondaryTitle: "Fase da amplitude de transmissão", secondarySubtitle: "arg t = −arctan(γ/k): é aqui que o sinal de γ aparece",
      secondaryCaption: "Mesmo |t|, fases opostas: é só aqui que o sinal de γ aparece. A fase não entra em R e T de uma delta, mas entra quando há duas — nos termos cos 4ka da transmissão do duplo delta (Griffiths 2.28, exercício 1).",
      prediction: "A delta atrativa transmite mais que a repulsiva de mesma intensidade |γ|? Mais, menos ou igual?",
      calculation: `k = √(2E) = √(2·${fmt(E, 2)}) = ${fmt(s.k, 3)}<br>t = ik/(ik − γ) = (k² − iγk)/(k² + γ²) = ${fmt(s.t.re, 3)} ${s.t.im < 0 ? "−" : "+"} ${fmt(Math.abs(s.t.im), 3)}i<br>R = |r|² = γ²/(k²+γ²) = ${fmt(g * g, 2)}/(${fmt(s.k * s.k, 2)} + ${fmt(g * g, 2)}) = <b>${fmt(s.R, 4)}</b><br>T = |t|² = k²/(k²+γ²) = <b>${fmt(s.T, 4)}</b><small>R + T = ${fmt(s.R + s.T, 6)} · arg t = −arctan(${fmt(g, 2)}/${fmt(s.k, 3)}) = ${fmt(s.phaseT, 3)} rad</small>`,
      metrics: [["k = √(2mE)/ħ", fmt(s.k, 3)], ["R", fmt(s.R, 4)], ["T", fmt(s.T, 4)], ["R + T", fmt(s.R + s.T, 4)], ["arg t (rad)", fmt(s.phaseT, 3)], ["E com T = ½", `γ²/2 = ${fmt(g * g / 2, 2)}`]],
      concept: "R e T dependem de γ²: uma delta atrativa e uma repulsiva de mesma intensidade refletem e transmitem igual. O sinal sobrevive só nas fases de r e t, e é na amplitude t, não em T, que o estado ligado deixará sua marca (estação 3).",
      prompts: ["Com γ = 2 e E = 4,5 (k = 3), leia R e T e compare com 4/13 e 9/13 da nota.", "Troque repulsiva por atrativa com tudo fixo: o que muda e o que não muda?", "Leve E até γ²/2 e confira R = T = ½; depois E → 0,05 e E → 8."],
      legend: [[C.red, "R(E)"], [C.blue, "T(E)", true], [C.gold, "E atual"]],
    });
  }

  // ================================================================ 03 · polo e estado ligado
  function drawPolo() {
    const alpha = v("polA"), gamma = -alpha, k0 = P.poleKappa(gamma), Epolo = P.poleEnergy(gamma), Elig = P.boundEnergy(alpha);
    const T1 = P.scatter(0.5, gamma).T, t3 = P.transmissionImaginaryAxis(3, gamma);
    set("polAOut", fmt(alpha, 2));
    const KM = 4;
    const main = canvas("mainCanvas", .5), ch = axes(main, 0, KM, 0, 1.05, "k real (E = k²/2 > 0; ħ = m = 1)", "|t(k)|² = T", { xDigits: 0, yDigits: 2 });
    line(ch, samples(0, KM, 400, (k) => P.scatter(k * k / 2, gamma).T), C.blue);
    vline(ch, k0, C.gray, [2, 4], 1); dot(ch.ctx, ch.X(k0), ch.Y(.5), C.gold, 5);
    sideLabel(ch, reveal(`k = κ₀ = ${fmt(k0, 2)}: T = ½`, `k = κ₀ = ${fmt(k0, 2)} (E = |E_lig|): T = ½ — escala, não pico`), k0, ch.Y(.5) - 8, C.ink, "10px Ubuntu, system-ui");
    vline(ch, 1, C.faint, [2, 4], 1); dot(ch.ctx, ch.X(1), ch.Y(T1), C.gold, 4); sideLabel(ch, `k = 1: T = ${fmt(T1, 3)}`, 1, ch.Y(T1) + 16, C.gray);
    const sec = canvas("secondaryCanvas", .3), YM = 10, ch2 = axes(sec, 0, KM, 0, YM, "q (k = iq, eixo imaginário)", "|t(iq)|²", { xDigits: 0, yDigits: 0, ticks: 4 });
    const left = samples(0, k0 * (1 - 1e-4), 300, (q) => P.transmissionImaginaryAxis(q, gamma));
    const right = samples(k0 * (1 + 1e-4), KM, 300, (q) => P.transmissionImaginaryAxis(q, gamma));
    line(ch2, left, C.violet); line(ch2, right, C.violet);
    vline(ch2, k0, C.red, [6, 4], 2); sideLabel(ch2, `polo: q = κ₀ = ${fmt(k0, 2)} → |t|² → ∞`, k0, ch2.top + 14, C.red, "bold 10px Ubuntu, system-ui");
    label(ch2.ctx, "|t(iq)|² = q²/(q − κ₀)²", ch2.right - 8, ch2.bottom - 8, C.violet, "right", "10px Ubuntu, system-ui");
    vline(ch2, 3, C.faint, [2, 4], 1);
    if (t3 <= YM) { dot(ch2.ctx, ch2.X(3), ch2.Y(t3), C.gold, 4); sideLabel(ch2, `q = 3: ${fmt(t3, 2)}`, 3, ch2.Y(t3) - 6, C.gray); }
    else sideLabel(ch2, `q = 3: ${fmt(t3, 1)} (fora da escala)`, 3, ch2.top + 28, C.gray);
    texts({
      status: "Polo de t(k) em k = iκ₀", detail: `γ = −${fmt(alpha, 2)} · κ₀ = ${fmt(k0, 2)}`,
      title: "Transmissão no eixo real", subtitle: "t(k) = ik/(ik + κ₀); para k real, T = k²/(k² + κ₀²) = E/(E + |E_lig|)",
      caption: reveal(
        "Procure no gráfico de T(k) uma marca do estado ligado — pico, degrau, nada? Anote e só então mova α.",
        "T(E) = E/(E + |E_lig|) é monótona: o estado ligado fixa a escala de T (T = ½ exatamente em E = |E_lig|), mas não deixa pico nem polo no eixo real. O polo está fora dele."),
      secondaryTitle: "Continuação ao eixo imaginário, k = iq", secondarySubtitle: "|t(iq)|² = q²/(q − κ₀)² diverge em q = κ₀, isto é, k = iκ₀",
      secondaryCaption: "Com k = iκ₀, e^{ikx} = e^{−κ₀x} decai para x > 0: é a cauda de ψ do estado ligado. Como t = C/A → ∞ com C finito, A = 0 — não há onda incidente — e E = ħ²k²/2m = −κ₀²/2.",
      prediction: "O estado ligado (E < 0) deixa alguma marca em T(E) para E > 0: um pico, um degrau, nada? Anote antes de mover α.",
      calculation: `γ = −mα/ħ² = −κ₀ = ${fmt(gamma, 2)}<br>ik + κ₀ = 0 ⇒ k = −κ₀/i = iκ₀ = i·${fmt(k0, 2)} (1/i = −i)<br>E = ħ²k²/2m = −κ₀²/2 = <b>${fmt(Epolo, 3)}</b><small>estação 1: E = −mα²/2ħ² = ${fmt(Elig, 3)} — o mesmo problema de contorno, com A = 0</small><br>T(k = 1) = 1/(1 + κ₀²) = <b>${fmt(T1, 3)}</b> · |t(3i)|² = 9/(3 − κ₀)² = <b>${fmt(t3, 3)}</b>`,
      metrics: [["κ₀ = −γ", fmt(k0, 3)], ["E do polo", fmt(Epolo, 3)], ["E ligado (estação 1)", fmt(Elig, 3)], ["T em k = 1", fmt(T1, 3)], ["|t(iq)|² em q = 3", fmt(t3, 3)]],
      conceptTitle: "Ideia física — continuação analítica",
      concept: "Continuação analítica (ideia que a nota antecipa) é tomar a fórmula de t(k), deduzida para k real, e avaliá-la em k complexo. k = iκ₀ não é um momento medido: é a afirmação de que a mesma equação, com E < 0, tem solução sem onda incidente. O polo devolve E = −κ₀²/2, a energia da estação 1: espectro ligado e espalhamento são partes da mesma estrutura analítica.",
      prompts: ["Mova α e acompanhe o polo em q = κ₀: as leituras em k = 1 e q = 3 mudam porque o polo se aproxima de q = 3 quando α cresce.", "Confira que T(E) no eixo real continua sem pico para qualquer α; onde fica T = ½?", "Explique por que, se γ > 0 (repulsiva), o polo cairia em q = −|γ|, com e^{+|γ|x} crescente, e não corresponde a estado normalizável."],
      legend: [[C.blue, "|t(k)|², k real"], [C.violet, "|t(iq)|², k = iq"], [C.red, "polo k = iκ₀", true]],
    });
  }

  // ================================================================ 04 · doador raso no HPGe
  function drawHpge() {
    const EbEV = v("medEb") / 1000, mr = v("medM"), T = v("medT"), ND = Math.pow(10, v("medND"));
    const kappa = P.kappaNmInv(EbEV, mr), dx = P.deltaXNm(kappa), cells = P.cellsSpanned(dx), alpha = P.alphaEVnm(kappa, mr);
    const h2m = P.HBAR2_OVER_2ME_EV_NM2 / mr, kT = P.KB_EV_PER_K * T;
    const boltz = P.donorBoltzmann(EbEV, T), neutral = P.neutralDonorFraction(EbEV, T, ND), ni = P.intrinsicDensity(T);
    const Tcross = P.intrinsicCrossoverK(ND), Vd = P.depletionVoltage(ND, 1);
    set("medEbOut", `${fmt(v("medEb"), 1)} meV`); set("medMOut", fmt(mr, 2)); set("medTOut", `${T} K`); set("medNDOut", `10^${fmt(v("medND"), 1)}`);
    const lg = (x) => Math.log10(Math.max(x, 1e-30));
    const fracTxt = neutral < 1e-3 ? `1 − ${sci(neutral, 1)}` : fmt(1 - neutral, 4);
    // painel principal: log10 n contra T
    const main = canvas("mainCanvas", .5), ch = axes(main, 50, 350, -6, 16, "temperatura T (K)", "log₁₀ n (cm⁻³)", { xDigits: 0, yDigits: 0, ticks: 6, yFmt: (y) => fmt(y, 0) });
    line(ch, samples(50, 350, 300, (t) => lg(P.intrinsicDensity(t))), C.red);
    hline(ch, lg(ND), C.blue, [7, 4], 2);
    label(ch.ctx, `N_D = ${sci(ND, 1)} cm⁻³ (todos ionizados)`, ch.right - 8, ch.Y(lg(ND)) - 6, C.blue, "right", "bold 10px Ubuntu, system-ui");
    line(ch, samples(50, 350, 300, (t) => lg(ND * P.neutralDonorFraction(EbEV, t, ND))), C.gold, [], 2);
    label(ch.ctx, "doadores neutros N_D(1 − n/N_D)", ch.right - 8, ch.Y(lg(ND * P.neutralDonorFraction(EbEV, 350, ND))) + 14, C.gold, "right", "10px Ubuntu, system-ui");
    for (const [t, txt] of [[77, "77 K"], [300, "300 K"]]) {
      const y = P.intrinsicDensity(t); dot(ch.ctx, ch.X(t), ch.Y(lg(y)), C.red, 5);
      label(ch.ctx, `${txt}: n_i = ${sci(y, 1)}`, ch.X(t) + 8, ch.Y(lg(y)) + (t < 200 ? -8 : 14), C.red, "left", "bold 10px Ubuntu, system-ui");
    }
    if (Number.isFinite(Tcross)) { vline(ch, Tcross, C.gray, [2, 4], 1); sideLabel(ch, `n_i = N_D em ${fmt(Tcross, 0)} K`, Tcross, ch.top + 14, C.gray); }
    vline(ch, T, C.gold, [], 2); dot(ch.ctx, ch.X(T), ch.Y(lg(ni)), C.gold, 5);
    // painel secundario: psi(x) sobre as celulas do Ge
    const XN = 20;
    const sec = canvas("secondaryCanvas", .3), ch2 = axes(sec, -XN, XN, 0, Math.max(.3, 1.15 * Math.sqrt(kappa)), "posição x (nm)", "ψ(x) (nm^−½)", { xDigits: 0, yDigits: 2, ticks: 4 });
    clip(ch2, (c) => { c.strokeStyle = "rgba(111,113,113,.25)"; c.lineWidth = 1; c.beginPath(); for (let x = -XN; x <= XN; x += P.GE_CELL_NM) { c.moveTo(ch2.X(x), ch2.bottom); c.lineTo(ch2.X(x), ch2.bottom - 7); } c.stroke(); });
    const psi = samples(-XN, XN, 601, (x) => P.boundPsiNm(x, kappa));
    area(ch2, psi.filter((p) => Math.abs(p.x) <= dx), "rgba(69,123,157,.16)"); line(ch2, psi, C.red);
    vline(ch2, -dx, C.blue, [3, 4], 1); vline(ch2, dx, C.blue, [3, 4], 1);
    label(ch2.ctx, `±σₓ = ±${fmt(dx, 1)} nm; 2σₓ ≈ ${fmt(2 * cells, 1)} células de 0,57 nm`, ch2.X(dx) + 6, ch2.top + 14, C.blue, "left", "10px Ubuntu, system-ui");
    texts({
      status: "Doador raso no detector HPGe", detail: `E_b = ${fmt(v("medEb"), 1)} meV · m* = ${fmt(mr, 2)} mₑ · ${T} K · N_D = ${sci(ND, 1)} cm⁻³`,
      title: "Extensão: portadores no Ge contra a temperatura", subtitle: "leia, não deduza · vermelho: n_i com gap fixo de 0,66 eV (a 77 K o gap é 0,73 eV e n_i é ainda menor); azul: N_D; dourado: doadores neutros (≈ 0)",
      caption: reveal(
        "Leve m* de 0,12 a 0,06 e compare σₓ (painel de baixo) com a sua previsão. O gráfico de cima é extensão: estatística do Ge calculada pela aplicação, fora da disciplina; leia, não deduza.",
        `σₓ = 1/(√2κ) com κ = √(2m*E_b)/ħ: σₓ ∝ 1/√m*, e metade da massa alarga o estado por √2 (3,54 → 5,00 nm com E_b = 12,7 meV). Extensão (gráfico de cima): os doadores rasos estão 100 % ionizados a 300 K e a 77 K (fração neutra ${sci(P.neutralDonorFraction(EbEV, 300, ND), 1)} e ${sci(P.neutralDonorFraction(EbEV, 77, ND), 1)}): o fator de Boltzmann ${fmt(P.donorBoltzmann(EbEV, 300), 2)} vem multiplicado por N_c/N_D ~ ${sci(P.Nc(300) / ND, 0)} estados livres. O que muda com o frio é n_i: ${sci(P.intrinsicDensity(300), 1)} cm⁻³ a 300 K (cristal intrínseco, ~10 A por cm³ a 500 V) contra ${sci(P.intrinsicDensity(77), 1)} cm⁻³ a 77 K. É o gap, não o doador, que obriga o nitrogênio líquido.`),
      secondaryTitle: "ψ(x) do elétron ligado ao doador", secondarySubtitle: "κ = √(E_b/(ħ²/2m*)); marcas inferiores = células unitárias do Ge (0,57 nm)",
      secondaryCaption: `O elétron se espalha por ≈ ${fmt(2 * cells, 1)} células (2σₓ = ${fmt(2 * dx, 1)} nm): doador raso, E_b/E_g = ${fmt(EbEV / P.EG_GE_EV, 3)}. Massa efetiva menor ou E_b menor alargam ainda mais ψ.`,
      prediction: "Se a massa efetiva m* cair à metade (0,12 → 0,06 mₑ), com o mesmo E_b, a largura σₓ do estado cresce ou diminui, e por que fator? Anote antes de mover.",
      calculation: `ħ²/2m* = 0,0381/${fmt(mr, 2)} = ${fmt(h2m, 4)} eV·nm²<br>κ = √(E_b/(ħ²/2m*)) = √(${fmt(EbEV, 4)}/${fmt(h2m, 4)}) = <b>${fmt(kappa, 3)} nm⁻¹</b> · σₓ = 1/(√2κ) = <b>${fmt(dx, 2)} nm</b><br>e^(−E_b/k_BT) = e^(−${fmt(EbEV, 4)}/${fmt(kT, 5)}) = ${fmt(boltz, 3)} <small>só a escala E_b/k_BT, não a fração</small><br>n/N_D ≈ 1 − 2N_D e^(E_b/k_BT)/N_c = 1 − 2·${sci(ND, 1)}/(${fmt(boltz, 3)}·${sci(P.Nc(T), 2)}) = <b>${fracTxt}</b><br>n_i = √(N_cN_v) e^(−0,66/2k_BT) = <b>${sci(ni, 2)} cm⁻³</b><br>V_depl = eN_Dd²/(2ε_rε₀) = <b>${Vd >= 1e4 ? `${sci(Vd, 2)} V` : `${fmt(Vd, 0)} V`}</b> (d = 1 cm)`,
      metrics: [["κ (nm⁻¹)", fmt(kappa, 3)], ["σₓ (nm) · 2σₓ em células", `${fmt(dx, 2)} · ${fmt(2 * cells, 1)}`], ["fator de Boltzmann e^(−E_b/k_BT)", fmt(boltz, 3)], ["fração ionizada n/N_D", fracTxt], ["n_i (cm⁻³)", sci(ni, 2)], ["V_depl, d = 1 cm (V)", Vd >= 1e4 ? sci(Vd, 2) : fmt(Vd, 0)]],
      conceptTitle: "Ideia física — limite do modelo",
      concept: "A delta atrativa é o modelo mínimo de um elétron preso a uma impureza: E = −mα²/2ħ² fixa κ e σₓ a partir de E_b. Limite: a delta tem alcance zero e é unidimensional; o doador real é um potencial coulombiano blindado em 3D (hidrogenoide com ε_r = 16 e m*, Aula 23): a* = 7,1 nm e E* = 6,4 meV. A delta não prevê E_b: usa o valor medido (12,7 meV) e devolve κ e σₓ; o hidrogenoide prevê E_b e fica a um fator 2 do medido. A estatística dos doadores e o gap são dados do Ge, não saem da delta.",
      prompts: ["Leve m* de 0,12 a 0,06: σₓ passa de 3,54 a 5,00 nm? Confira o fator √2 com κ ∝ √m*.", "Extensão (leia, não deduza): compare a 300 K e a 77 K o fator de Boltzmann (0,61 e 0,15, que NÃO é a fração) com a fração ionizada (≈ 1).", "Extensão: suba N_D para 10¹³; o que acontece com V_depl? Por isso 'hiperpuro'."],
      legend: [[C.red, "n_i(T)"], [C.blue, "N_D", true], [C.gold, "doadores neutros"], [C.gold, "T atual"]],
    });
  }

  // ---------------------------------------------------------------- coordenação
  function render() { ({ ligado: drawLigado, espalhamento: drawEspalhamento, polo: drawPolo, hpge: drawHpge })[view](); }
  function touch() { state.moved[view] = true; render(); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "ligado";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
    render();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input[type=range]").forEach((e) => e.addEventListener("input", touch));
  $("espRep").addEventListener("click", () => { state.sign = +1; touch(); });
  $("espAtr").addEventListener("click", () => { state.sign = -1; touch(); });
  document.querySelectorAll("[data-medt]").forEach((b) => b.addEventListener("click", () => { $("medT").value = b.dataset.medt; touch(); }));
  $("resetBtn").addEventListener("click", () => {
    const ids = { ligado: ["ligA"], espalhamento: ["espG", "espE"], polo: ["polA"], hpge: ["medEb", "medM", "medT", "medND"] }[view];
    ids.forEach((id) => { $(id).value = DEFAULTS[id]; });
    if (view === "espalhamento") state.sign = +1;
    state.moved[view] = false;
    render();
  });
  window.addEventListener("resize", render);
  switchView(view);
})();
