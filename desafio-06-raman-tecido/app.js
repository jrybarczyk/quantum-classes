(function () {
  "use strict";
  const P = window.ChallengePhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9", violet: "#7b5ea7" };
  const LASER_COLOR = { 532: "#3a9d4a", 785: "#c65c4b", 1064: "#7b5ea7" };
  const TAU = 2 * Math.PI, NPX = P.NPX;
  const VIEWS = ["mission", "spectrum", "laser", "deliver"];
  const TITLES = { mission: "Missão", spectrum: "Laboratório: espectro", laser: "Laboratório: escolha do laser", deliver: "Entrega" };
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const url = new URLSearchParams(location.search);
  const prof = url.get("prof") === "1";
  let view = url.get("view"); if (!VIEWS.includes(view)) view = "mission";

  const fmt = (x, n = 2) => P.formatPt(x, n);
  const set = (id, t) => { $(id).textContent = t; };
  const html = (id, h) => { $(id).innerHTML = h; };
  const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
  const sup = (n) => String(n).replace(/[\d-]/g, (d) => (d === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]));

  // ---------------------------------------------------------------- desenho (mesmo padrão das aulas 4–10)
  function canvas(id, aspect, minNarrow) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, h = Math.max(w * aspect, w < 600 ? (minNarrow ?? 320) : 0);
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.scale(ratio, ratio); ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, ratio, el, narrow: w < 600 };
  }
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 54, right = box.x + box.w - 14, top = box.y + 14, bottom = box.y + box.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    const nx = Math.max(2, Math.min(o.ticks ?? 6, Math.floor((right - left) / 58))), ny = Math.max(2, Math.min(o.ticks ?? 5, Math.floor((bottom - top) / 34)));
    const xs = o.xTicks || P.niceTicks(xMin, xMax, nx).ticks, ys = o.yTicks || P.niceTicks(yMin, yMax, ny).ticks, xd = P.listDigits(xs), yd = P.listDigits(ys);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1; ctx.strokeStyle = C.grid;
    ctx.beginPath(); xs.forEach((x) => { ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); }); ys.forEach((y) => { ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); }); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.textAlign = "center"; xs.forEach((x) => ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, xd), X(x), bottom + 14));
    ctx.textAlign = "right"; ys.forEach((y) => ctx.fillText(o.yLabels ? o.yLabels(y) : fmt(y, yd), left - 6, Y(y) + 3));
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  // eixo vertical linear: marcas bonitas e topo acima do máximo (a curva nunca é cortada)
  function topAxis(max, n = 4) { const t = P.niceTicks(0, Math.max(1, max) * 1.08, n), ticks = t.ticks.slice(); let top = ticks[ticks.length - 1]; if (top < max * 1.04) { top += t.step; ticks.push(Number(top.toFixed(12))); } return { ticks, top }; }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function labelBox(ctx, text, x, y, color, align = "left", font = "10px Ubuntu, system-ui") {
    ctx.font = font; const w = ctx.measureText(text).width, x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    ctx.fillStyle = "rgba(251,252,250,.9)"; ctx.fillRect(x0 - 2, y - 10, w + 4, 14); label(ctx, text, x, y, color, align, font);
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top, ch.right - ch.left, ch.bottom - ch.top); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.2, alpha = 1) {
    clip(ch, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); });
  }
  function dot(ctx, x, y, color, r = 4) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function glow(ctx, x, y, color, r) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function texts(d) {
    set("statusTitle", d.status); set("statusDetail", d.detail);
    set("mainTitle", d.title || ""); html("mainSubtitle", d.subtitle || ""); html("caption", d.caption || "");
    set("secondaryTitle", d.secondaryTitle || ""); html("secondarySubtitle", d.secondarySubtitle || ""); html("secondaryCaption", d.secondaryCaption || "");
    set("prediction", d.prediction); html("calculation", d.calculation);
    html("metrics", d.metrics.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join(""));
    set("conceptTitle", d.conceptTitle || "Ideia física"); html("conceptText", d.concept);
    html("prompts", d.prompts.map((p) => `<li>${p}</li>`).join(""));
    html("legend", (d.legend || []).map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-top-style:dashed" : ""}"></i>${text}</span>`).join(""));
  }

  // ---------------------------------------------------------------- estado do desafio
  const state = { seed: 1, level: 1, caso: null, lab: null, pred: null, hints: 0, deliveries: 0, log: true, acq: null, photons: [], flashes: 0, delivered: null, geo: null, last: 0, cur: -1, spawn: 0, picks: {} };
  const HINTS = [
    "O espectro tem dois lados: Stokes (ν̃ > 0) e anti-Stokes (ν̃ < 0). Meça primeiro com 785 nm e uma potência baixa (ΔT do ponto abaixo de 5 K); os picos têm posições fixas, independentes do laser.",
    "Para T, use uma banda de baixo ν̃ (menos de 1100 cm⁻¹), que tem anti-Stokes mensurável: R = I_AS/I_S = ((ν₀+ν̃)/(ν₀−ν̃))³·e<sup>−hcν̃/k_BT</sup>, com a resposta QE corrigida. Subtraia o ΔT do ponto.",
    "Compare os três lasers medindo cada um com a potência segura (ΔT ≈ 3 K, que depende da cor da amostra: tabela na aba do laser): vence o de menor σ_T, e ele varia de amostra para amostra. A fluorescência cresce para 532 nm; o CCD de Si perde a banda de 3400 cm⁻¹ em 785 nm; o InGaAs é mais ruidoso.",
  ];
  const cap = () => state.lab.params.powerCap;
  const kc = (laser) => P.kOf(laser, state.caso);                       // coeficiente de aquecimento do caso (K/mW): depende da cor da amostra
  function newCase(seed, level) {
    state.seed = Math.max(1, Math.trunc(Number(seed)) || 1); state.level = [1, 2, 3].includes(level) ? level : 1;
    state.caso = P.makeCase(state.seed, state.level); state.lab = new P.Lab(state.caso);
    state.pred = null; state.hints = 0; state.deliveries = 0; state.acq = null; state.photons = []; state.delivered = null; state.cur = -1; state.picks = {};
    $("seedIn").value = state.seed; $("levelSel").value = state.level; buildPrediction();
    $("powIn").max = cap(); if (Number($("powIn").value) > cap()) $("powIn").value = cap();
    try { const u = new URL(location.href); u.searchParams.set("seed", state.seed); u.searchParams.set("level", state.level); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* local */ }
    buildHintButtons(); buildRunSel(); syncBudget();
  }
  const run = () => (state.cur >= 0 ? state.lab.runs[state.cur] : null);
  function buildRunSel() {
    const sel = $("runSel"), runs = state.lab.runs;
    sel.innerHTML = runs.length ? runs.map((r, i) => `<option value="${i}">#${r.id} · ${r.laser} nm · ${fmt(r.powerMW, 0)} mW · ${r.done}/${r.tSec} s${r.burnt ? " · queimou" : ""}</option>`).join("") : '<option value="-1">nenhuma medida</option>';
    if (state.cur >= runs.length) state.cur = runs.length - 1; sel.value = String(state.cur);
  }
  function syncBudget() {
    const lab = state.lab, L = lab.params, tF = lab.timeS / L.budgetS, dF = lab.thermal / L.thermalMax;
    set("timeTxt", `${fmt(lab.timeS, 0)} / ${fmt(L.budgetS, 0)} s`); set("doseTxt", `${fmt(lab.thermal, 2)} / ${fmt(L.thermalMax, 1)} (u. de dose térmica)`);
    for (const [id, f] of [["timeBar", tF], ["doseBar", dF]]) { const el = $(id); el.style.width = `${Math.min(100, 100 * f)}%`; el.className = f > 0.9 ? "over" : f > 0.6 ? "warn" : ""; }
    set("chipLevel", L.name); set("chipSeed", `semente ${state.seed}`); set("chipDeliv", `entregas: ${state.deliveries}`); $("chipProf").hidden = !prof;
    syncPrediction();
    if (state.level === 1) { $("qeChk").checked = true; $("qeChk").disabled = true; } else $("qeChk").disabled = false;   // nível 1: a correção pela QE é aplicada pela tela
    const P0 = Number($("powIn").value), laser = $("laserSel").value, dT = P.heatingSteadyK(laser, P0, kc(laser));
    set("powOut", `${fmt(P0, 0)} mW`); set("timOut", `${fmt(Number($("timeIn").value), 0)} s`);
    set("acqState", state.acq ? `medindo #${state.acq.run.id}: ${state.acq.run.done}/${state.acq.run.tSec} s · ΔT do ponto ${fmt(P.heatingAt(state.acq.run.laser, state.acq.run.powerMW, state.acq.run.done, kc(state.acq.run.laser)), 1)} K` : `aquecimento previsto no regime estacionário (amostra ${state.caso.color}, ${fmt(kc(laser), 3)} K/mW): ΔT = ${fmt(dT, 1)} K (limite ${fmt(P.T_LIM_K, 0)} K)${dT > P.T_LIM_K ? ": QUEIMA" : ""}`);
    $("acqBtn").disabled = !!state.acq; $("stopBtn").disabled = !state.acq;
    set("thShiftOut", `${fmt(Number($("thShift").value), 0)}`); set("thWOut", `${fmt(Number($("thW").value), 0)}`);
  }
  // ---------------------------------------------------------------- previsão: escolha qualitativa, depois o número (a conta só abre depois do registro)
  function buildPrediction() {
    const box = $("predQBox"); box.querySelectorAll("label").forEach((l) => l.remove());
    P.PREDICTION.qual.options.forEach(([v, t]) => { const l = document.createElement("label"); l.innerHTML = `<input type="radio" name="pq" value="${v}"><span>${t}</span>`; box.appendChild(l); });
    $("predIn").value = "";
  }
  const pqVal = () => { const e = document.querySelector('input[name="pq"]:checked'); return e ? e.value : ""; };
  function syncPrediction() {
    const locked = state.pred !== null, has = pqVal() !== "", num = Number($("predIn").value), ready = has && $("predIn").value !== "" && Number.isFinite(num) && num > 0;
    document.querySelectorAll('input[name="pq"]').forEach((e) => { e.disabled = locked; });
    $("predIn").disabled = locked || !has; $("predBtn").disabled = locked || !ready;
    set("predState", locked ? `Previsão registrada: P₁/P₀ = ${fmt(state.pred.num, 2)}×10⁻⁴.` : has ? "Registre para travar a previsão e abrir a conta." : "Escolha uma opção para liberar o campo numérico.");
  }
  function registerPrediction() {
    const num = Number($("predIn").value);
    if (state.pred !== null || !pqVal() || !Number.isFinite(num) || num <= 0) return;
    state.pred = { q: pqVal(), num }; syncBudget(); render();
  }
  function buildHintButtons() {
    const box = $("hintBtns"), L = state.lab.params; $("hintTitle").hidden = !L.hints; box.hidden = !L.hints; box.innerHTML = ""; if (!L.hints) return;
    HINTS.forEach((h, i) => { const b = document.createElement("button"); b.type = "button"; b.dataset.hint = i; b.textContent = `Dica ${i + 1} (−${P.HINT_PENALTY[i]} pontos)`; box.appendChild(b); });
    const out = document.createElement("div"); out.id = "hintOut"; out.className = "hint"; box.appendChild(out); showHints();
  }
  function showHints() {
    const out = $("hintOut"); if (!out) return; out.innerHTML = HINTS.slice(0, state.hints).map((h, i) => `<b>Dica ${i + 1}.</b> ${h}`).join("<br><br>");
    document.querySelectorAll("#hintBtns button").forEach((b) => { b.disabled = Number(b.dataset.hint) !== state.hints; });
  }

  // ---------------------------------------------------------------- esquema (feixe, tecido, fótons)
  function schematic(main, h0, laser, powerMW, dTnow) {
    const c = main.ctx, w = main.w, y = h0 / 2 + 2, narrow = main.narrow, xl = narrow ? 30 : 46, xt = w * 0.42, wt = narrow ? 70 : 110, hh = h0 - 30, xd = w * 0.78;
    c.fillStyle = "#f3f6f1"; c.fillRect(0, 0, w, h0); c.strokeStyle = C.grid; c.beginPath(); c.moveTo(0, h0 - .5); c.lineTo(w, h0 - .5); c.stroke();
    const col = LASER_COLOR[laser] || C.green;
    c.fillStyle = "#6f7171"; c.fillRect(xl - 14, y - 9, 28, 18); label(c, `laser ${laser} nm`, xl, h0 - 5, C.gray, "center", "10px Ubuntu, system-ui");
    c.strokeStyle = col; c.lineWidth = 1 + Math.min(4, powerMW / 50); c.globalAlpha = .85; c.beginPath(); c.moveTo(xl + 14, y); c.lineTo(xt, y); c.stroke(); c.globalAlpha = 1;
    const heat = Math.min(1, dTnow / P.T_LIM_K);
    glow(c, xt + wt / 2, y, `rgba(198,92,75,${.15 + .6 * heat})`, 40 + 20 * heat);
    c.fillStyle = `rgb(${232 - 20 * heat},${205 - 90 * heat},${190 - 100 * heat})`; c.fillRect(xt, y - hh / 2, wt, hh); c.strokeStyle = C.gray; c.lineWidth = 1.5; c.strokeRect(xt + .5, y - hh / 2 + .5, wt - 1, hh - 1);
    label(c, `tecido · ΔT ${fmt(dTnow, 1)} K`, xt + wt / 2, h0 - 5, heat > 1 ? C.red : C.gray, "center", "10px Ubuntu, system-ui");
    c.fillStyle = P.LASERS[laser] && P.LASERS[laser].detector === "si" ? "rgba(69,123,157,.3)" : "rgba(123,94,167,.3)"; c.fillRect(xd, y - hh / 2, narrow ? 50 : 70, hh); c.strokeStyle = C.blue; c.lineWidth = 2; c.strokeRect(xd, y - hh / 2, narrow ? 50 : 70, hh);
    label(c, P.LASERS[laser] && P.LASERS[laser].detector === "si" ? "CCD de Si" : "InGaAs", xd, h0 - 5, C.gray, "left", "10px Ubuntu, system-ui");
    state.photons.forEach((p) => { const px = xt + wt + (xd - xt - wt) * p.u, py = y + p.dy * (1 - .5 * p.u); dot(c, px, py, p.stokes ? col : "#e9a23b", 2.6); });
    if (state.flashes > 0) glow(c, xd + 20, y, `rgba(233,220,120,${Math.min(.8, state.flashes)})`, 22);
  }
  function stepPhotons(dt, active, laser) {
    if (active) { state.spawn += dt * 30; while (state.spawn >= 1) { state.spawn -= 1; state.photons.push({ u: 0, dy: (Math.random() - .5) * 40, stokes: Math.random() < .93 }); } }
    state.photons.forEach((p) => { p.u += dt * .7; if (p.u >= 1) { p.done = true; state.flashes = Math.min(1.2, state.flashes + .06); } });
    state.photons = state.photons.filter((p) => !p.done); state.flashes = Math.max(0, state.flashes - dt * 2.4); void laser;
  }

  // ---------------------------------------------------------------- 01 · missão
  function drawMission() {
    const L = state.lab.params, W = P.WEIGHTS;
    const bandRows = P.BANDS.map((b) => `<tr><td class="num">${fmt(b.s, 0)}</td><td class="num">${fmt(b.w, 0)}</td><td>${b.name}</td></tr>`).join("");
    const lv = [1, 2, 3].map((k) => `<tr${k === state.level ? ' style="background:#f4faef"' : ""}><td>${P.LEVELS[k].name}</td><td>${fmt(P.LEVELS[k].budgetS, 0)} s · dose térmica ${fmt(P.LEVELS[k].thermalMax, 1)}</td><td>até ${fmt(P.LEVELS[k].powerCap, 0)} mW · tolerância de T ×${fmt(P.LEVELS[k].tolT, 1)}</td><td>${P.LEVELS[k].hints ? "sim" : "não"}</td></tr>`).join("");
    const sig = (a) => a.map((s) => (s >= 0.8 ? "●●●" : s >= 0.4 ? "●●" : s >= 0.15 ? "●" : "·")).join("");
    const lib = ["phe", "amide", "ch2sc", "ch2tw", "lip1066", "cc", "ester", "col855", "po4", "dna785", "ch3", "woh"];
    const sigRows = P.TISSUE_KEYS.map((k) => `<tr><td>${P.TISSUES[k].name}</td>${lib.map((id) => `<td class="num">${sig([P.bandAmp(k, id)])}</td>`).join("")}</tr>`).join("");
    html("missionDoc", `
      <h2>Missão</h2>
      <p>Uma amostra de tecido chegou ao laboratório de espectroscopia <b>sem identificação</b>. Um microscópio Raman a ilumina com um laser que você escolhe (532, 785 ou 1064 nm) e registra o espectro dos <b>dois lados</b>: Stokes (ν̃ positivo) e anti-Stokes (ν̃ negativo). Você precisa (1) <b>atribuir as três bandas mais fortes a ligações</b> e identificar o <b>tecido</b>; (2) <b>estimar a temperatura</b> do tecido pela razão anti-Stokes/Stokes; e (3) <b>escolher o laser</b> que melhor mede esse tecido, sem queimá-lo. Todo o espectro é sintético.</p>
      <div class="brief"><div><b>${state.caso.color}</b><small>cor da amostra (decide o aquecimento por mW em cada laser; tabela na aba do laser)</small></div><div><b>${fmt(L.budgetS, 0)} s</b><small>tempo de integração total (todas as medidas)</small></div><div><b>${fmt(L.thermalMax, 1)}</b><small>dose térmica máxima: soma de (ΔT/5 K)²·t/10 s</small></div><div><b>5 K</b><small>limite de aquecimento do ponto: acima disso o tecido queima</small></div><div><b>${fmt(L.powerCap, 0)} mW</b><small>potência máxima do laser neste nível</small></div></div>
      <h3>O que entregar</h3>
      <ul><li><b>Tecido</b>: tecido adiposo, músculo, osso, pele (colágeno) ou tecido com autofluorescência alta (pigmentado ou fixado).</li><li><b>Temperatura</b> do tecido (°C), sem o aquecimento do laser.</li><li><b>Laser</b> escolhido (532, 785 ou 1064 nm).</li><li><b>Três bandas</b> fortes: posição (cm⁻¹) e ligação.</li><li>Dois valores calculados: o comprimento de onda Stokes da banda de 3400 cm⁻¹ no seu laser e P₁/P₀ do C=O (1700 cm⁻¹) na sua temperatura.</li><li>Três perguntas de conceito: o que decidiu cada resposta.</li></ul>
      <h3>Como o laboratório funciona</h3>
      <ul><li>Cada medida gasta <b>tempo</b> e acumula <b>dose térmica</b>: ΔT = c(λ)·P·(1 − e<sup>−t/4 s</sup>). Acima de 5 K o ponto queima e o orçamento acaba.</li>
      <li>O <b>termômetro</b> lê as contagens líquidas de uma banda nos dois lados, aplica o fator de frequência e a resposta do detector, e devolve T com incerteza de Poisson. A temperatura medida inclui o ΔT do ponto iluminado: subtraia-o.</li>
      <li>Em <b>Laboratório: escolha do laser</b> estão a janela óptica do tecido, as curvas dos detectores, o sinal relativo de cada laser e o aquecimento por mW conforme a <b>cor da amostra</b> (clara, média ou escura: é informação do caso).</li>
      <li>Pode entregar de novo, com −${P.REDELIVERY_COST} pontos por entrega adicional: a tela mostra a pontuação por item e <b>quantos conceitos de 3</b> estão certos (não quais). Os números do caso só aparecem com nota ≥ 90 ou na 3ª entrega.</li></ul>
      <h3>Biblioteca de bandas (valores sintéticos, próximos da literatura)</h3>
      <table><tr><th class="num">ν̃ (cm⁻¹)</th><th class="num">largura (cm⁻¹)</th><th>atribuição</th></tr>${bandRows}</table>
      <h3>Assinaturas dos tecidos (intensidade relativa das bandas Stokes)</h3>
      <table style="font-size:.66rem"><tr><th>tecido</th><th>Phe 1004</th><th>amida I</th><th>CH₂ 1440</th><th>CH₂ 1300</th><th>C–C 1066</th><th>C=C 1655</th><th>éster 1743</th><th>col. 855</th><th>PO₄ 960</th><th>DNA 785</th><th>C–H 2935</th><th>O–H 3400</th></tr>${sigRows}</table>
      <p class="hint">Três pontos: forte (≥ 0,8), dois: médio, um: fraco, ponto: ausente. A intensidade medida depende também de ν₀, da QE e do tempo.</p>
      <h3>Níveis</h3><table><tr><th>nível</th><th>orçamento</th><th>restrições</th><th>dicas</th></tr>${lv}</table>
      <h3>Pontuação (0 a 100)</h3>
      <table><tr><th>parte</th><th class="num">pontos</th></tr>
      <tr><td>Restrições da missão: tecido ${W.tissue}, temperatura ${W.temperature}, laser ${W.laser}, três bandas ${W.bands} (perda linear, zero a 25 % de erro)</td><td class="num">40</td></tr>
      <tr><td>Valores calculados: λ Stokes ${W.lambda}, P₁/P₀ ${W.pop}</td><td class="num">10</td></tr>
      <tr><td>Previsão registrada antes da primeira medida: uma escolha qualitativa (${P.PRED_PARTS.qual}) e P₁/P₀ do C=O (${P.PRED_PARTS.num}; tolerância de 0,15 década)</td><td class="num">${W.prediction}</td></tr>
      <tr><td>Eficiência: máximo até 50 % do orçamento usado, linear até zero em 100 %, multiplicada pela fração da missão cumprida ao quadrado</td><td class="num">${W.efficiency}</td></tr>
      <tr><td>Justificativa: três perguntas de conceito</td><td class="num">${W.c1 + W.c2 + W.c3}</td></tr>
      <tr><td>Dicas (nível 1): −4, −6 e −10; cada entrega adicional: −${P.REDELIVERY_COST}</td><td class="num">desconto</td></tr></table>
      <div class="limit"><b>Hipóteses e limite do modelo.</b> Oscilador harmônico (anarmonicidade ≈ 3 % no C=O, Aula 10); bandas, larguras e amplitudes <b>sintéticas</b>; linhas lorentzianas; fluorescência suave (maior em 532 nm), com φ <b>inventada</b>: o tecido de autofluorescência alta tem φ ≈ 800× a do adiposo, sem base de literatura (a autofluorescência sobe com pigmento e fixação; a assinatura de DNA é outra propriedade); cor e estado da amostra sintéticos; detectores com QE parametrizada; sem Raman ressonante e sem espalhamento múltiplo no tecido. A razão I<sub>AS</sub>/I<sub>S</sub> usa o expoente 3 (contagem de fótons; para potência, 4) e não depende da seção de choque. Temperaturas de 30 a 42 °C. <b>Segurança:</b> o limite de 5 K é didático; em pele vale a exposição máxima permitida (MPE, ANSI Z136.1): 0,30 W/cm² a 785 nm, 0,2 W/cm² a 532 nm (200 mW a 785 nm exigem ≥ 0,7 cm², cerca de 9 mm de diâmetro): os 200 mW do app são de <b>bancada</b>. A termometria Raman em tecido é um conceito didático; o uso clínico do Raman é a impressão espectral.</div>`);
    const registered = state.pred !== null;
    texts({ status: "Missão", detail: `semente ${state.seed} · ${L.name}`,
      prediction: "Antes de medir: a razão anti-Stokes/Stokes da banda de 1004 cm⁻¹ a 37 °C, com 785 nm, é perto de 50 %, de 10 %, de 1 % ou bem abaixo de 0,1 %? Decida e só então estime P₁/P₀ do C=O (coluna da esquerda).",
      calculation: registered ? `Aula 10, C=O: ħω = hcν̃ = 1,2398×10⁻⁴ eV·cm × 1700 cm⁻¹ = 0,2108 eV<br>k<sub>B</sub>T(37 °C) = 0,02673 eV<br><b>P₁/P₀ = e<sup>−0,2108/0,02673</sup> = 3,8×10⁻⁴</b> (3,76)<small>a nota arredonda para 3,7×10⁻⁴ (k<sub>B</sub>T truncado); a razão A/S de 1004 cm⁻¹ a 785 nm é 1,5×10⁻², perto de 1 %</small>` : "A conta abre quando você registrar a previsão (coluna da esquerda): primeiro a escolha, depois o número.",
      metrics: [["orçamento de tempo", `${fmt(L.budgetS, 0)} s`], ["dose térmica máxima", fmt(L.thermalMax, 1)], ["limite de aquecimento", "5 K"], ["potência máxima", `${fmt(L.powerCap, 0)} mW`], ["cor da amostra", state.caso.color], ["nível", L.name.split(" · ")[0]]],
      concept: "Cada ligação vibra como um oscilador harmônico, ν̃ = (1/2πc)√(k/μ) (Aula 10); a Raman Stokes deixa ħω na ligação e a anti-Stokes tira ħω de uma ligação já excitada, de população e<sup>−ħω/k_BT</sup>. A escolha do laser usa a energia do fóton hc/λ e a janela óptica do tecido (Aulas 1 e 5). Os espectros e os parâmetros do tecido são sintéticos.",
      prompts: ["Planeje: quantas medidas, com que laser, potência e tempo? Quanto sobra do orçamento?", "Calcule P₁/P₀ para o C–H de 2900 cm⁻¹ a 37 °C e compare com o C=O.", "Em que laser a banda de 3400 cm⁻¹ do O–H cai fora do detector de Si?"] });
  }

  // ---------------------------------------------------------------- 02 · espectro Raman
  const ZOOM = { all: [-1300, 3700], fp: [600, 1800], as: [-1300, -300], hi: [2600, 3700] };
  function thermo(r) {
    if (!r || !r.done) return null;
    const shift = Number($("thShift").value), w = Number($("thW").value);
    return { shift, w, th: P.thermometer(r.counts, r.laser, shift, w, P.readNoise(r.laser) ** 2, $("qeChk").checked) };
  }
  function drawSpectrum() {
    const r = run(), cur = Number($("curIn").value), [x0, x1] = ZOOM[$("zoomSel").value], lz = r ? r.laser : $("laserSel").value;
    set("curOut", `${cur}`); syncBudget();
    const main = canvas("mainCanvas", .66, 420), SH = main.narrow ? 70 : 90, active = !!state.acq, dTnow = active ? P.heatingAt(state.acq.run.laser, state.acq.run.powerMW, state.acq.run.done, kc(state.acq.run.laser)) : r ? P.heatingAt(r.laser, r.powerMW, r.done, kc(r.laser)) : P.heatingAt($("laserSel").value, Number($("powIn").value), 1e9, kc($("laserSel").value));
    schematic(main, SH, lz, r ? r.powerMW : Number($("powIn").value), dTnow);
    let counts = r ? r.counts : new Float32Array(NPX);
    if (r && $("bgChk").checked) { const w = 20, out = new Float32Array(NPX); for (let i = 0; i < NPX; i += 1) { const win = []; for (let j = Math.max(0, i - w); j <= Math.min(NPX - 1, i + w); j += 1) win.push(counts[j]); win.sort((p, q) => p - q); out[i] = counts[i] - win[win.length >> 1]; } counts = out; }
    const log = state.log && !(r && $("bgChk").checked), i0 = Math.max(0, Math.floor(P.pixelOf(x0))), i1 = Math.min(NPX - 1, Math.ceil(P.pixelOf(x1)));
    let mx = 1, mn = Infinity; for (let i = i0; i <= i1; i += 1) { if (Math.abs(P.pixShift(i)) < P.NOTCH) continue; mx = Math.max(mx, counts[i]); if (counts[i] > 0) mn = Math.min(mn, counts[i]); }
    const lin = (() => { const t = P.niceTicks(0, mx * 1.08, 5), tk = t.ticks.slice(); let top = tk[tk.length - 1]; if (top < mx * 1.04) { top += t.step; tk.push(Number(top.toFixed(12))); } return { ticks: tk, top }; })();
    const lo = log ? Math.floor(Math.log10(Math.max(1, Math.min(mn, mx / 1e4)))) : 0, hi = log ? Math.ceil(Math.log10(mx * 1.3)) : lin.top;
    const tr = (v) => (log ? Math.log10(Math.max(v, Math.pow(10, lo))) : v);
    const yTicks = log ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k) : lin.ticks;
    const ch = axes(main, { x: 0, y: SH, w: main.w, h: main.h - SH }, x0, x1, log ? lo : 0, log ? hi : lin.top, "deslocamento Raman ν̃ (cm⁻¹): anti-Stokes à esquerda, Stokes à direita", `contagens por pixel${log ? " (log)" : ""}`, { xTicks: P.niceTicks(x0, x1, 8).ticks, yTicks, yLabels: log ? (y) => (y >= 5 ? `10${sup(y)}` : fmt(Math.pow(10, y), 0)) : (y) => (y >= 1e6 ? fmt(y / 1e6, y % 1e6 ? 1 : 0) + " M" : y >= 1e4 ? fmt(y / 1e3, 0) + " k" : fmt(y, P.listDigits([y]))) });
    { const c = main.ctx; c.fillStyle = "rgba(111,113,113,.15)"; c.fillRect(ch.X(-P.NOTCH), ch.top, ch.X(P.NOTCH) - ch.X(-P.NOTCH), ch.bottom - ch.top); label(c, "filtro notch", ch.X(0), ch.top + 10, C.gray, "center", "9px Ubuntu, system-ui");
      const t = thermo(r); if (t) { for (const sg of [1, -1]) { c.fillStyle = "rgba(233,162,59,.2)"; c.fillRect(ch.X(sg * t.shift - t.w), ch.top, ch.X(sg * t.shift + t.w) - ch.X(sg * t.shift - t.w), ch.bottom - ch.top); } } }
    if (r) clip(ch, (c) => {
      c.strokeStyle = C.blue; c.lineWidth = 1.3; c.beginPath(); let first = true;
      for (let i = i0; i <= i1; i += 1) { if (Math.abs(P.pixShift(i)) < P.NOTCH) { first = true; continue; } const x = ch.X(P.pixShift(i)), y = ch.Y(Math.min(log ? hi : lin.top, tr(counts[i]))); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
      c.stroke();
    });
    if ($("linesChk").checked) P.BANDS.forEach((b, k) => { const c = main.ctx; for (const sg of [1, -1]) { const s = sg * b.s; if (s < x0 || s > x1) continue; c.strokeStyle = "rgba(123,94,167,.5)"; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(ch.X(s), ch.top); c.lineTo(ch.X(s), ch.bottom); c.stroke(); c.setLineDash([]); if (sg > 0 || (x1 - x0) < 2200) label(c, `${fmt(b.s, 0)}`, ch.X(s) + 2, ch.top + 22 + (k % 4) * 10, C.violet, "left", "9px Ubuntu, system-ui"); } });
    { const c = main.ctx, x = ch.X(cur); c.strokeStyle = C.red; c.lineWidth = 1.4; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x, ch.top); c.lineTo(x, ch.bottom); c.stroke(); c.setLineDash([]);
      const nu0 = P.wavenumberOfLaser(Number(lz)), nm = 1e7 / (nu0 - cur), ip = Math.max(0, Math.min(NPX - 1, Math.round(P.pixelOf(cur))));
      labelBox(c, `${fmt(cur, 0)} cm⁻¹ · ${nm > 0 && nm < 4000 ? fmt(nm, 0) + " nm" : "—"} · ${fmt(counts[ip], 0)} cont.`, x > ch.right - 200 ? x - 6 : x + 6, ch.top + 12, C.red, x > ch.right - 200 ? "right" : "left", "bold 10px Ubuntu, system-ui"); }
    if (active) label(main.ctx, `medindo ${state.acq.run.done}/${state.acq.run.tSec} s`, ch.right - 6, ch.bottom - 8, C.green, "right", "bold 12px Ubuntu, system-ui");
    if (!r) labelBox(main.ctx, "sem dados: use “Medir”", (ch.left + ch.right) / 2, (ch.top + ch.bottom) / 2, C.gray, "center", "bold 13px Ubuntu, system-ui");
    state.geo = { left: ch.left, right: ch.right, x0, x1 };
    // secundário: razão A/S em função de T
    const t = thermo(r), sec = canvas("secondaryCanvas", .36, 300), shift = Number($("thShift").value), nu0 = P.wavenumberOfLaser(Number(lz));
    const gated = state.pred === null;   // o gráfico da razão só abre depois do registro da previsão (ele mostra 0,010 a 0,020)
    if (gated) { sec.ctx.fillStyle = C.gray; sec.ctx.font = "bold 12px Ubuntu, system-ui"; sec.ctx.textAlign = "center"; sec.ctx.fillText("gráfico liberado depois de registrar a previsão (aba Missão)", sec.w / 2, sec.h / 2); }
    else {
      const lnR = (T) => Math.log10(P.asOverS(nu0, shift, T)), yA = lnR(280), yB = lnR(345), yl = Math.floor(yB * 4) / 4 - 0.05, yh = Math.ceil(yA * 4) / 4 + .05;
      const tk = P.niceTicks(10, 70, 6).ticks, sc = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 7, 72, Math.min(yl, yA), Math.max(yh, yB), "temperatura T (°C)", "razão I_AS/I_S (log)", { xTicks: tk, yTicks: (() => { const lo = Math.min(yl, yA), hi = Math.max(yh, yB), out = []; for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k += 1) for (const m of [1, 2, 3, 5]) { const v = Math.log10(m * Math.pow(10, k)); if (v >= lo && v <= hi) out.push(v); } return out; })(), yLabels: (y) => P.formatPt(Math.pow(10, y), Math.pow(10, y) < 0.1 ? 3 : 2) });
      line(sc, Array.from({ length: 70 }, (_, k) => { const TC = 7 + k * (65 / 69); return { x: TC, y: lnR(P.kelvin(TC)) }; }), C.green, [], 2.6);
      if (t && Number.isFinite(t.th.ratio)) { const c = sec.ctx, Rm = Math.log10(t.th.ratio * (t.th.qeRel || 1)), Tm = t.th.TK - 273.15 - 0; line(sc, [{ x: 7, y: Rm }, { x: 72, y: Rm }], C.red, [6, 4], 1.8); const x = sc.X(Tm), y = sc.Y(Rm); dot(c, x, y, C.red, 5.5); glow(c, x, y, "rgba(198,92,75,.5)", 14); }
    }
    // textos
    const dTm = r ? r.dTmean : 0, T0 = t && Number.isFinite(t.th.TK) ? t.th.TK - 273.15 - dTm : NaN;
    texts({ status: "Laboratório: espectro Raman", detail: r ? `#${r.id} · ${r.laser} nm · ${fmt(r.powerMW, 0)} mW` : "sem medida", title: r ? `Espectro #${r.id}: ${r.laser} nm, ${fmt(r.powerMW, 0)} mW, ${r.done} s${r.burnt ? " (queimou)" : ""}` : "Espectro Raman Stokes e anti-Stokes",
      subtitle: state.acq ? "os fótons chegam por contagens de Poisson…" : `ΔT médio do ponto: ${fmt(dTm, 1)} K · limite 5 K`,
      caption: "Bandas estreitas: ligações (posição ν̃ = (1/2πc)√(k/μ)). Fundo suave: fluorescência. O lado anti-Stokes (esquerda) é muito mais fraco que o Stokes, por e<sup>−ħω/k_BT</sup>. As faixas douradas são as janelas do termômetro. A banda larga de 3400 cm⁻¹ é a água, não ruído.",
      secondaryTitle: "Razão anti-Stokes/Stokes contra a temperatura", secondarySubtitle: gated ? "liberado depois de registrar a previsão na Missão" : `banda de ${fmt(shift, 0)} cm⁻¹ com o laser de ${lz} nm; o ponto vermelho é a sua medida (inclui ΔT do ponto)`,
      secondaryCaption: "Curva: I_AS/I_S = ((ν₀+ν̃)/(ν₀−ν̃))³·e<sup>−hcν̃/k_BT</sup>, a mesma para qualquer seção de choque. A razão medida (corrigida pela QE) cruza a curva na temperatura do ponto iluminado.",
      prediction: "Se você dobrar a potência com o mesmo laser e o mesmo tempo, N_S e N_AS dobram: a razão R muda? E o ΔT do ponto? Decida antes de medir.",
      calculation: t && Number.isFinite(t.th.TK) ? `R = N<sub>AS</sub>/N<sub>S</sub> = ${fmt(t.th.A.net, 0)}/${fmt(t.th.S.net, 0)} = ${t.th.ratio.toExponential(2).replace(".", ",").replace("e-", "×10⁻")}${$("qeChk").checked ? ` (÷ QE ${fmt(t.th.qeRel, 3)})` : ""}<br>fator de frequência ((ν₀+ν̃)/(ν₀−ν̃))³ = ${fmt(t.th.corr, 3)}<br><b>T = ${fmt(t.th.TK - 273.15, 1)} ± ${fmt(t.th.sigmaK, 1)} °C</b> no ponto<small>− ΔT do ponto (${fmt(dTm, 1)} K) → T do tecido = ${fmt(T0, 1)} °C</small>` : "Sem medida, ou a banda não tem Stokes e anti-Stokes mensuráveis: escolha ν̃ menor que 1090 cm⁻¹ de uma banda presente.",
      metrics: [["N Stokes (líquida)", t ? `${fmt(t.th.S.net, 0)} ± ${fmt(t.th.S.sigma, 0)}` : "—"], ["N anti-Stokes", t ? `${fmt(t.th.A.net, 0)} ± ${fmt(t.th.A.sigma, 0)}` : "—"], ["T do ponto", t && Number.isFinite(t.th.TK) ? `${fmt(t.th.TK - 273.15, 1)} ± ${fmt(t.th.sigmaK, 1)} °C` : "—"], ["ΔT do ponto (médio)", r ? `${fmt(dTm, 1)} K` : "—"], ["T do tecido", Number.isFinite(T0) ? `${fmt(T0, 1)} °C` : "—"], ["cursor", `${fmt(cur, 0)} cm⁻¹`]],
      concept: "A anti-Stokes parte de um estado excitado, de população e<sup>−ħω/k_BT</sup> (Aula 10: muito menor que 1 para as ligações do tecido a 37 °C): por isso é fraca e o Raman de tecido é quase só Stokes. A razão carrega a temperatura e não a seção de choque.",
      prompts: ["Meça com 785 nm e 20 mW por 20 s e identifique as três bandas mais fortes entre 600 e 1800 cm⁻¹.", "Use o termômetro em duas bandas diferentes: as temperaturas concordam dentro das incertezas?", "Aumente a potência: o sinal cresce, e o ΔT do ponto? Em que potência o tecido queima?"],
      legend: [[C.blue, "contagens"], [C.gold, "janela do termômetro"], [C.violet, "biblioteca", true]] });
  }

  // ---------------------------------------------------------------- 03 · escolha do laser
  function drawLaser() {
    set("lsShiftOut", `${fmt(Number($("lsShift").value), 0)}`); syncBudget();
    const sh = Number($("lsShift").value), cs = P.LASER_KEYS;
    const main = canvas("mainCanvas", .55, 380), ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 400, 1800, 0, 1, "comprimento de onda (nm)", "eficiência quântica", { xTicks: [400, 600, 800, 1000, 1200, 1400, 1600, 1800], yTicks: [0, .25, .5, .75, 1] });
    { const c = main.ctx; c.fillStyle = "rgba(97,155,96,.15)"; c.fillRect(ch.X(P.OPTICAL_WINDOW[0]), ch.top, ch.X(P.OPTICAL_WINDOW[1]) - ch.X(P.OPTICAL_WINDOW[0]), ch.bottom - ch.top); label(c, "janela óptica do tecido (650–950 nm)", ch.X(800), ch.top + 12, C.green, "center", "bold 10px Ubuntu, system-ui"); }
    line(ch, Array.from({ length: 160 }, (_, i) => { const nm = 400 + i * 1400 / 159; return { x: nm, y: P.qeSi(nm) }; }), C.blue, [], 2.6);
    line(ch, Array.from({ length: 160 }, (_, i) => { const nm = 400 + i * 1400 / 159; return { x: nm, y: P.qeInGaAs(nm) }; }), C.violet, [], 2.6);
    cs.forEach((l, k) => { const c = main.ctx, nu0 = P.wavenumberOfLaser(Number(l)), a = 1e7 / (nu0 - 0), b = 1e7 / (nu0 - 3600), ys = ch.bottom - 24 - k * 18; c.strokeStyle = LASER_COLOR[l]; c.lineWidth = 6; c.globalAlpha = .55; c.beginPath(); c.moveTo(ch.X(Math.min(a, 1800)), ys); c.lineTo(ch.X(Math.min(b, 1800)), ys); c.stroke(); c.globalAlpha = 1; c.lineWidth = 2; c.beginPath(); c.moveTo(ch.X(Number(l)), ch.top + 24); c.lineTo(ch.X(Number(l)), ys + 4); c.stroke(); label(c, `${l} nm`, ch.X(Number(l)), ch.top + 20, LASER_COLOR[l], "center", "bold 10px Ubuntu, system-ui");
      const e3400 = 1e7 / (nu0 - 3400); if (e3400 < 1800) { dot(c, ch.X(e3400), ys, C.ink, 3.5); label(c, "3400", ch.X(e3400), ys - 6, C.ink, "center", "9px Ubuntu, system-ui"); } });
    const sec = canvas("secondaryCanvas", .42, 320), sx = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 400, 3600, -2, 1, "deslocamento ν̃ (cm⁻¹)", "sinal relativo (log)", { xTicks: [500, 1000, 1500, 2000, 2500, 3000, 3500], yTicks: [-2, -1, 0, 1], yLabels: (y) => fmt(Math.pow(10, y), y < 0 ? -y : 0) });
    const sig = (l, s) => { const nu0 = P.wavenumberOfLaser(Number(l)), nm = 1e7 / (nu0 - s); return Math.pow((nu0 - s) / P.NU_REF, 3) * Math.max(1e-6, P.qeOf(l, nm)); };
    cs.forEach((l) => line(sx, Array.from({ length: 80 }, (_, i) => { const s = 400 + i * 3200 / 79; return { x: s, y: Math.log10(sig(l, s)) }; }), LASER_COLOR[l], [], 2.4));
    { const c = sec.ctx; c.strokeStyle = C.faint; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(sx.X(sh), sx.top); c.lineTo(sx.X(sh), sx.bottom); c.stroke(); c.setLineDash([]); }
    const rows = cs.map((l) => { const nu0 = P.wavenumberOfLaser(Number(l)), nm = 1e7 / (nu0 - sh); return { l, nm, s: sig(l, sh), qe: P.qeOf(l, nm), c: kc(l), fl: P.LASERS[l].fluor, pmax: P.safePower(l, state.level, state.caso), mpe: P.mpeWcm2(P.LASERS[l].nm), spot: P.minSpot(P.LASERS[l].nm, P.safePower(l, state.level, state.caso)) }; });
    html("lsInfo", `Em ν̃ = ${fmt(sh, 0)} cm⁻¹: ${rows.map((r) => `${r.l} nm cai em ${fmt(r.nm, 0)} nm (QE ${fmt(r.qe, 2)})`).join("; ")}.`);
    texts({ status: "Laboratório: escolha do laser", detail: "compromisso", title: "Detectores e janela óptica", subtitle: "QE do CCD de Si (azul) e do InGaAs (violeta); barras: faixa Stokes de 0 a 3600 cm⁻¹ de cada laser; ponto preto: banda de 3400 cm⁻¹",
      caption: "O CCD de Si corta perto de 1000 nm: com 785 nm, a banda de 3400 cm⁻¹ cai em 1071 nm, fora do detector. O InGaAs enxerga o infravermelho, mas é mais ruidoso. A faixa verde é a janela óptica do tecido (650–950 nm).",
      secondaryTitle: "Sinal relativo de cada laser", secondarySubtitle: "∝ (ν₀−ν̃)³·QE(λ), na mesma potência; unidade: 785 nm com ν̃ = 1000 cm⁻¹ ≈ 1",
      secondaryCaption: "Na mesma potência, 532 nm dá mais sinal; mas tem muito mais fluorescência e, em amostra escura, aquece mais e queima com potências menores. Em amostra clara e pouco fluorescente, ele pode vencer. A potência segura (ΔT ≈ 3 K) é diferente em cada laser e depende da cor.",
      prediction: "Com a mesma potência, o laser de 532 nm dá mais ou menos sinal Raman que o de 785 nm? Em que condições da amostra (cor e fluorescência) ele pode vencer mesmo assim?",
      calculation: rows.map((r) => `${r.l} nm: sinal relativo ${fmt(r.s, 2)} · c = ${fmt(r.c, 3)} K/mW · P segura ≈ ${fmt(r.pmax, 0)} mW · fluorescência relativa ${fmt(r.fl, 4)}<br>&nbsp;&nbsp;MPE (pele) ${fmt(r.mpe, 2)} W/cm² → ponto ≥ ${fmt(r.spot.areaCm2, 2)} cm² (${fmt(r.spot.diamMm, 1)} mm de diâmetro) para ${fmt(r.pmax, 0)} mW`).join("<br>") + `<small>P segura: ΔT estacionário = 3 K (60 % do limite). Sua amostra é <b>${state.caso.color}</b>. c por cor (532/785/1064 nm, K/mW): ${P.COLORS.map((cl) => `${cl} ${fmt(P.K_TABLE[cl][532], 3)}/${fmt(P.K_TABLE[cl][785], 3)}/${fmt(P.K_TABLE[cl][1064], 3)}`).join(" · ")}. MPE de memória (ANSI Z136.1, CW): conferir na norma; os ${fmt(cap(), 0)} mW do app são de bancada.</small>`,
      metrics: rows.map((r) => [`${r.l} nm`, `${fmt(r.nm, 0)} nm · QE ${fmt(r.qe, 2)}`]),
      concept: "O sinal Raman cresce com (ν₀−ν̃)³ (contagem de fótons; potência: ν⁴), mas o limite térmico, a fluorescência e a faixa do detector decidem: 785 nm cabe na janela óptica e tem pouca fluorescência; 532 nm dá mais sinal por mW e pode vencer em amostra clara e pouco fluorescente; 1064 nm quase não tem fluorescência e vence quando ela domina em 785 nm, mas o InGaAs é ruidoso e o sinal é menor (Aulas 1 e 5). Nenhum laser vence sempre.",
      prompts: ["Para a banda de 3400 cm⁻¹, qual laser a deixa dentro do CCD de Si?", "Compare o sinal relativo e a potência segura de cada laser: qual dá mais fótons Raman por ponto sem queimar?", "Meça cada laser na potência segura e compare as incertezas σ_T do termômetro: o melhor depende do tecido?"],
      legend: [[C.blue, "QE Si"], [C.violet, "QE InGaAs"], [LASER_COLOR[532], "532 nm"], [LASER_COLOR[785], "785 nm"], [LASER_COLOR[1064], "1064 nm"]] });
  }

  // ---------------------------------------------------------------- 04 · entrega
  // a ordem das opções muda por semente e a cada entrega; a letra exibida é a da posição; a escolha anterior é mantida (por conteúdo, não por letra)
  function conceptHtml() { return P.CONCEPTS.map((q) => `<fieldset class="concept"><legend>${q.question}</legend>${P.shuffledOptions(state.seed, q, state.deliveries).map(([id, t], k) => `<label><input type="radio" name="${q.id}" value="${id}"${state.picks[q.id] === id ? " checked" : ""}><span><b>${"ABCD"[k]})</b> ${t}</span></label>`).join("")}</fieldset>`).join(""); }
  function deliverFormHtml() {
    const tis = P.TISSUE_KEYS.map((k) => `<option value="${k}">${P.TISSUES[k].name}</option>`).join(""), asg = P.ASSIGN.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
    const rows = [0, 1, 2].map((i) => `<div class="formrow"><label for="bandShift${i}">Banda ${i + 1}: posição (cm⁻¹) e ligação</label><span style="display:flex;gap:6px;flex-wrap:wrap"><input id="bandShift${i}" type="number" step="any" style="max-width:130px"><select id="bandKey${i}"><option value="">atribuição…</option>${asg}</select></span></div>`).join("");
    return `<h2>Entrega</h2><p>Responda com o que você <b>mediu</b>. Pode entregar de novo; cada entrega adicional custa ${P.REDELIVERY_COST} pontos, e a tela só informa quantos dos três conceitos estão certos.</p>
      <div class="formrow"><label for="ansTissue">Tecido</label><select id="ansTissue"><option value="">escolha…</option>${tis}</select></div>
      <div class="formrow"><label for="ansTemp">Temperatura do tecido (°C, sem o aquecimento do laser)</label><input id="ansTemp" type="number" step="any"></div>
      <div class="formrow"><label for="ansLaser">Laser escolhido</label><select id="ansLaser"><option value="">escolha…</option><option value="532">532 nm</option><option value="785">785 nm</option><option value="1064">1064 nm</option></select></div>
      ${rows}
      <div class="formrow"><label for="ansLam">λ Stokes da banda de 3400 cm⁻¹ no seu laser (nm)</label><input id="ansLam" type="number" step="any"></div>
      <div class="formrow"><label for="ansPop">P₁/P₀ do C=O (1700 cm⁻¹) na sua temperatura (10⁻⁴)</label><input id="ansPop" type="number" step="any"></div>
      <h3>Qual conceito decidiu?</h3><p class="hint">Na folha, escreva a letra marcada e uma frase de razão para cada pergunta: o professor corrige a frase.</p><div id="conceptBox">${conceptHtml()}</div>
      <p><button type="button" class="primary" id="deliverBtn2">Entregar</button></p><div id="deliverResult"></div>`;
  }
  let formBuilt = "";
  function drawDeliver() {
    const key = `${state.seed}|${state.level}`; if (formBuilt !== key) { formBuilt = key; html("deliverDoc", deliverFormHtml()); $("deliverBtn2").addEventListener("click", deliver); renderResult(); }
    const lab = state.lab; syncBudget();
    html("deliverSummary", `Medidas: ${lab.runs.length} · tempo ${fmt(lab.timeS, 0)} s · uso do orçamento ${fmt(100 * lab.costFraction(), 0)} %${lab.burnt ? "<br><b>A amostra queimou.</b>" : ""}<br>Previsão: ${state.pred === null ? "ainda não registrada" : `P₁/P₀ = ${fmt(state.pred.num, 2)}×10⁻⁴`}<br>Dicas usadas: ${state.hints}${lab.params.hints ? "" : " (este nível não tem dicas)"}<br>Entregas: ${state.deliveries}`);
    texts({ status: "Entrega", detail: `${state.deliveries} entrega(s) · semente ${state.seed}`, prediction: "Antes de entregar: se a temperatura estimada subir de 37 para 47 °C, a razão anti-Stokes/Stokes do C=O sobe por quanto: cerca de 10 %, 40 % ou um fator 10?",
      calculation: state.deliveries >= 1 ? `Razão ∝ e<sup>−ħω/k<sub>B</sub>T</sup>: d ln R/dT = x/T<br>C=O a 37 °C: x = 0,2108/0,02673 = 7,89 → 2,5 % por kelvin<br><b>+10 K ≈ +28 %</b><small>por isso σ_T de poucos kelvin exige a razão a poucos %</small>` : "A conta abre depois da primeira entrega.",
      metrics: [["uso do orçamento", `${fmt(100 * lab.costFraction(), 0)} %`], ["tempo gasto", `${fmt(lab.timeS, 0)} s`], ["medidas", `${lab.runs.length}`], ["dicas", `${state.hints}`], ["entregas", `${state.deliveries}`], ["queimou", lab.burnt ? "sim" : "não"]],
      concept: "A auditoria mostra a cadeia: oscilador (posição das bandas), população térmica, razão anti-Stokes/Stokes, laser e detector, janela óptica e limite térmico. A física é a das Aulas 1, 5 e 10; os números são os do seu caso.",
      prompts: ["Reveja o que decidiu cada resposta: a razão A/S ou a seção de choque?", "Se o laser errou, compare σ_T de cada laser nas suas medidas.", "Se entregar de novo, qual medida acrescentaria, e quanto do orçamento custa?"] });
  }
  function deliver() {
    const val = (id) => $(id).value, num = (id) => (val(id) === "" ? NaN : Number(val(id))), radio = (n) => { const e = document.querySelector(`input[name="${n}"]:checked`); return e ? e.value : ""; };
    state.deliveries += 1;
    const input = { tissue: val("ansTissue"), temperatureC: num("ansTemp"), laser: val("ansLaser"), bands: [0, 1, 2].map((i) => ({ shift: num(`bandShift${i}`), key: val(`bandKey${i}`) })), lambdaNm: num("ansLam"), popE4: num("ansPop"), predQual: state.pred === null ? "" : state.pred.q, prediction: state.pred === null ? NaN : state.pred.num, c1: radio("c1"), c2: radio("c2"), c3: radio("c3"), hintsUsed: state.hints, deliveries: state.deliveries };
    state.delivered = { score: P.score(state.caso, state.lab, input), input };
    state.picks = { c1: input.c1, c2: input.c2, c3: input.c3 }; html("conceptBox", conceptHtml());   // nova ordem das opções para a próxima entrega
    syncBudget(); renderResult(); if (view === "deliver") drawDeliver(); const res = $("deliverResult"); if (res && res.scrollIntoView) res.scrollIntoView({ block: "nearest" });
  }
  function renderResult() {
    const box = $("deliverResult"); if (!box) return; const c = state.caso, chain = P.auditChain(c), d = state.delivered, revealed = prof || (d && (d.score.total >= 90 || d.score.deliveries >= 3)); let h = "";
    if (d) { const s = d.score;
      // a nota que deixaria o valor verdadeiro à mostra (diferença de T em kelvin) e os conceitos individuais só aparecem na revelação
      const rows = s.parts.filter((p) => p.group !== "concept").map((p) => `<tr><td>${p.label}</td><td>${p.reveals && !revealed ? "pontuação proporcional ao erro" : p.note}</td><td class="num">${fmt(p.pts, 1)} / ${fmt(p.max, 0)}</td></tr>`).join("");
      h += `<h3>Pontuação</h3><div class="score-big"><b>${fmt(s.total, 0)}</b><span>de 100 · entrega nº ${s.deliveries}</span></div><table><tr><th>item</th><th>observação</th><th class="num">pontos</th></tr>${rows}<tr><td>Justificativa (três conceitos)</td><td><b>${s.conceptsRight} de 3 conceitos corretos</b></td><td class="num">—</td></tr><tr><td>Dicas</td><td>${state.hints} usada(s)</td><td class="num">−${fmt(s.hintsPenalty, 0)}</td></tr><tr><td>Entregas adicionais</td><td>${s.deliveries - 1}</td><td class="num">−${fmt(s.redeliveryPenalty, 0)}</td></tr></table>`;
      h += `<div class="msg">${s.conceptsRight} de 3 conceitos corretos.${revealed ? ` ${P.CONCEPTS.map((q) => q.lesson).join(". ")}.` : s.conceptsRight === 3 ? "" : " A tela não diz quais: releia as opções e a razão de cada uma."}</div>`; }
    if (prof && !d) h += refBox();
    if (d || prof) {
      h += `<h3>Auditoria: a cadeia física</h3>` + chain.slice(0, 5).map((s) => `<div class="audit"><b>${s.step}</b><code>${s.formula}</code><br>${s.generic}${revealed ? `<br><b>${s.caso}</b>` : ""}</div>`).join("");
      h += revealed ? (prof && d ? refBox() : "") : `<div class="msg">Os números do seu caso aparecem aqui com pontuação ≥ 90 ou depois de três entregas.</div>`;
      h += `<div class="limit"><b>Limite do modelo.</b> ${chain[5].generic}</div>`; }
    box.innerHTML = h;
  }
  function refBox() {
    const c = state.caso, ref = P.solveReference(c);
    return `<div class="refbox"><b>Solução de referência (modo professor).</b> Tecido: ${P.TISSUES[c.tissue].name}; T = ${fmt(c.TC, 1)} °C; amostra ${c.color} e ${P.CONDITIONS[c.condition].label} (φ = ${c.phi.toExponential(1).replace(".", ",")}); potências seguras: ${P.LASER_KEYS.map((l) => `${l} nm ${fmt(c.powerByLaser[l], 0)} mW`).join(", ")}; melhor laser: ${c.bestLaser} nm (σ_T esperado 532: ${fmt(c.sigmaByLaser["532"], 2)}, 785: ${fmt(c.sigmaByLaser["785"], 2)}, 1064: ${fmt(c.sigmaByLaser["1064"], 2)} K); bandas fortes: ${P.strongBands(c.tissue).filter((b) => b.s < 1800).map((b) => `${fmt(b.s, 0)} (${P.assignName(b.key)})`).join(", ")}.<br>Solver independente: ${P.TISSUES[ref.tissue].name}, T = ${fmt(ref.TC, 1)} °C, laser ${ref.laser} nm, ${fmt(ref.lab.timeS, 0)} s (${fmt(100 * ref.lab.costFraction(), 0)} % do orçamento), pontuação ${fmt(P.score(c, ref.lab, ref.answers).total, 0)}.</div>`;
  }

  // ---------------------------------------------------------------- medida e laço de animação
  function startAcq() {
    if (state.acq) return;
    if (state.pred === null) { set("acqState", "Registre antes a previsão da Missão (aba 01): escolha qualitativa e P₁/P₀."); switchView("mission"); return; }
    const lab = state.lab, t = Number($("timeIn").value);
    if (!lab.canStart(1)) { set("acqState", "Orçamento de tempo ou de dose térmica esgotado."); return; }
    const r = lab.begin($("laserSel").value, Number($("powIn").value), t); state.cur = lab.runs.length - 1; buildRunSel();
    if (reducedMotion) { while (lab.step(r)) { /* instantâneo */ } buildRunSel(); syncBudget(); render(); return; }
    state.acq = { run: r, carry: 0 }; syncBudget(); kick();
  }
  function stopAcq() { state.acq = null; buildRunSel(); syncBudget(); render(); }
  let raf = 0;
  function kick() { if (!raf) { state.last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0; const dt = Math.max(0, Math.min(.05, (now - state.last) / 1000)); state.last = now;
    if (state.acq) { const a = state.acq; a.carry += dt * Math.max(6, a.run.tSec / 3.5); while (a.carry >= 1 && a.run.done < a.run.tSec) { a.carry -= 1; if (!state.lab.step(a.run)) { a.run.tSec = a.run.done; break; } } if (a.run.done >= a.run.tSec || state.lab.burnt) { state.acq = null; buildRunSel(); } syncBudget(); }
    stepPhotons(dt, !!state.acq, "");
    render(); if (state.acq || state.photons.length || state.flashes > 0) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- abas e eventos
  const draws = { mission: drawMission, spectrum: drawSpectrum, laser: drawLaser, deliver: drawDeliver };
  const render = () => { draws[view](); };
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "mission";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    document.querySelectorAll(".view-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === (view === "mission" ? "mission" : view === "deliver" ? "deliver" : "lab")));
    const slot = view === "spectrum" ? $("slotSpectrum") : null; if (slot) slot.appendChild($("roiBlock")); $("roiBlock").hidden = !slot;
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* local */ }
    render(); if (state.acq) kick();
  }
  function bind() {
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
    $("levelSel").addEventListener("change", () => { newCase(state.seed, Number($("levelSel").value)); formBuilt = ""; render(); });
    $("seedApply").addEventListener("click", () => { newCase(Number($("seedIn").value), state.level); formBuilt = ""; render(); });
    const fresh = () => { newCase(1000 + Math.floor(Math.random() * 8999), state.level); formBuilt = ""; render(); };
    $("newCase").addEventListener("click", fresh); $("newCase2").addEventListener("click", fresh);
    $("resetBtn").addEventListener("click", () => { newCase(state.seed, state.level); formBuilt = ""; render(); });
    $("hintBtns").addEventListener("click", (e) => { const b = e.target.closest("button[data-hint]"); if (!b || Number(b.dataset.hint) !== state.hints) return; state.hints += 1; showHints(); });
    $("acqBtn").addEventListener("click", startAcq); $("stopBtn").addEventListener("click", stopAcq);
    $("predBtn").addEventListener("click", registerPrediction);
    document.addEventListener("change", (e) => { if (e.target.name === "pq") syncPrediction(); });
    $("runSel").addEventListener("change", () => { state.cur = Number($("runSel").value); render(); });
    $("scaleLin").addEventListener("click", () => { state.log = false; $("scaleLin").classList.add("on"); $("scaleLog").classList.remove("on"); render(); });
    $("scaleLog").addEventListener("click", () => { state.log = true; $("scaleLog").classList.add("on"); $("scaleLin").classList.remove("on"); render(); });
    $("thCursor").addEventListener("click", () => { const s = Math.abs(Number($("curIn").value)); $("thShift").value = Math.max(300, Math.min(1090, s)); render(); });
    $("goSpec").addEventListener("click", () => switchView("spectrum")); $("deliverBtn").addEventListener("click", deliver);
    document.querySelectorAll("input[type=range], select, input[type=checkbox]").forEach((el) => el.addEventListener("input", () => { if (el.id !== "levelSel") render(); }));
    $("predIn").addEventListener("input", () => { syncPrediction(); });
    const mc = $("mainCanvas"), pick = (e) => { if (view !== "spectrum" || !state.geo) return; const rect = mc.getBoundingClientRect(), g = state.geo, x = g.x0 + (e.clientX - rect.left - g.left) / (g.right - g.left) * (g.x1 - g.x0); if (x >= g.x0 && x <= g.x1) { $("curIn").value = Math.round(x / 4) * 4; render(); } };
    mc.addEventListener("pointerdown", (e) => { pick(e); mc.setPointerCapture && mc.setPointerCapture(e.pointerId); mc.dataset.drag = "1"; });
    mc.addEventListener("pointermove", (e) => { if (mc.dataset.drag === "1") pick(e); }); mc.addEventListener("pointerup", () => { mc.dataset.drag = ""; });
    document.querySelector(".tabs").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const tabs = [...document.querySelectorAll("[data-view]")], i = tabs.findIndex((t) => t.dataset.view === view), j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view);
    });
    window.addEventListener("resize", render);
  }
  bind();
  newCase(Number(url.get("seed")) || 1, Number(url.get("level")) || 1);
  url.forEach((value, key) => { const el = $(key); if (el && !["seedIn", "levelSel", "predIn"].includes(key) && (el.tagName === "INPUT" || el.tagName === "SELECT") && el.type !== "checkbox") el.value = value; });
  if (url.get("scale") === "lin") { state.log = false; $("scaleLin").classList.add("on"); $("scaleLog").classList.remove("on"); }
  if (url.get("pred")) { $("predIn").value = url.get("pred"); syncPrediction(); }
  switchView(view);
})();
