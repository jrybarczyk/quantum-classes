(function () {
  "use strict";
  const P = window.ChallengePhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9", violet: "#7b5ea7" };
  const MAT_COLOR = { water: "#457b9d", bone: "#7b5ea7", al: "#e9a23b", fe: "#c65c4b", lead: "#26312d" };
  const TAU = 2 * Math.PI, NCH = P.NCH;
  const VIEWS = ["mission", "spectrum", "attenuation", "deliver"];
  const TITLES = { mission: "Missão", spectrum: "Laboratório: espectro", attenuation: "Laboratório: atenuação", deliver: "Entrega" };
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const url = new URLSearchParams(location.search);
  const prof = url.get("prof") === "1";
  let view = url.get("view"); if (!VIEWS.includes(view)) view = "mission";

  const fmt = (x, n = 2) => P.formatPt(x, n);
  const set = (id, t) => { $(id).textContent = t; };
  const html = (id, h) => { $(id).innerHTML = h; };
  const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
  const sup = (n) => String(n).replace(/[\d-]/g, (d) => (d === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]));
  const nucName = (k) => P.NUCLIDES[k].name;

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
  const state = { seed: 1, level: 1, caso: null, lab: null, pred: null, hints: 0, deliveries: 0, calib: null, log: false, acq: null, photons: [], flashes: 0, delivered: null, geo: null, last: 0, picks: {} };
  const HINTS = [
    "Calibre antes de interpretar: meça duas fontes conhecidas (por exemplo Cs-137 e Co-60), leia o centroide de cada fotopico com a ROI e use E = E₀ + g·canal.",
    "O fotopico é o pico de maior energia da fonte (o resto é Compton): a borda fica em E·2α/(1 + 2α), com α = E/511, e o retroespalhamento em E/(1 + 2α). Use isso para saber onde olhar.",
    "Para o material, use a mesma ROI no espectro sem lâmina e com uma lâmina: μ = ln(R₀/R₁)/d. Compare com a tabela de μ(E) na energia do fotopico.",
  ];
  function configLabel(k) { return P.CONFIGS[k].label; }
  function newCase(seed, level) {
    state.seed = Math.max(1, Math.trunc(Number(seed)) || 1); state.level = [1, 2, 3].includes(level) ? level : 1;
    state.caso = P.makeCase(state.seed, state.level); state.lab = new P.Lab(state.caso);
    state.pred = null; state.hints = 0; state.deliveries = 0; state.calib = null; state.acq = null; state.photons = []; state.delivered = null; state.picks = {};
    $("seedIn").value = state.seed; $("levelSel").value = state.level; $("predIn").value = ""; buildPrediction();
    ["cal1x", "cal2x"].forEach((id) => { $(id).value = ""; });
    try { const u = new URL(location.href); u.searchParams.set("seed", state.seed); u.searchParams.set("level", state.level); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* arquivo local sem history */ }
    $("roiLo").value = 40; $("roiHi").value = 60; $("curIn").value = 100;
    buildHintButtons(); syncBudget();
  }
  const roi = () => { let lo = Number($("roiLo").value), hi = Number($("roiHi").value); if (hi < lo + 4) hi = lo + 4; return { lo, hi }; };
  const cursor = () => Number($("curIn").value);
  const cfgNow = () => $("cfgSel").value;
  const xAxisE = (x) => (state.calib ? P.energyOf(state.calib, x) : null);

  function syncBudget() {
    const lab = state.lab, L = lab.params, tF = lab.timeS / L.budgetS, dF = lab.doseUSv / L.doseMaxUSv;
    set("timeTxt", `${fmt(lab.timeS, 0)} / ${fmt(L.budgetS, 0)} s`); set("doseTxt", `${fmt(lab.doseUSv, 4)} / ${fmt(L.doseMaxUSv, 2)} µSv`);
    for (const [id, f] of [["timeBar", tF], ["doseBar", dF]]) { const el = $(id); el.style.width = `${Math.min(100, 100 * f)}%`; el.className = f > 0.9 ? "over" : f > 0.6 ? "warn" : ""; }
    set("chipLevel", L.name); set("chipSeed", `semente ${state.seed}`); set("chipDeliv", `entregas: ${state.deliveries}`); $("chipProf").hidden = !prof;
    const locked = state.pred !== null;
    syncPrediction();
    $("presetRow").hidden = state.level !== 1;
    set("acqState", state.acq ? `adquirindo ${configLabel(state.acq.config)}: ${state.acq.done}/${state.acq.total} s` : `tempo vivo desta medida: ${fmt(lab.live[cfgNow()] || 0, 0)} s`);
    set("calState", state.calib ? `calibração: g = ${fmt(state.calib.g, 3)} keV/canal · E₀ = ${fmt(state.calib.E0, 1)} keV` : state.level === 1 ? "sem calibração: faça-a com dois picos ou use a calibração pré-feita do nível 1." : "sem calibração: o eixo está em canais.");
    $("acqBtn").disabled = !!state.acq; $("stopBtn").disabled = !state.acq;
  }
  // ---------------------------------------------------------------- previsão: duas escolhas qualitativas, depois o número
  const PQ_OPTS = [["above", "acima de E/2"], ["below", "abaixo de E/2"], ["equal", "exatamente em E/2"]];
  function buildPrediction() {
    const q = P.predictionFor(state.seed), E = fmt(q.E, 0);
    set("predPrompt", `Um fóton de ${E} keV é espalhado por efeito Compton no cristal. Decida antes de qualquer conta, e só então estime o número.`);
    [["1", `1. A borda Compton (energia máxima do elétron de recuo) fica acima ou abaixo de E/2, isto é, de ${fmt(q.E / 2, 1)} keV?`], ["2", `2. O fóton retroespalhado (180°) tem energia acima ou abaixo de E/2?`]].forEach(([k, text]) => {
      $(`predQ${k}Leg`).textContent = text;
      $(`predQ${k}Box`).querySelectorAll("label").forEach((l) => l.remove());
      PQ_OPTS.forEach(([v, t]) => { const l = document.createElement("label"); l.innerHTML = `<input type="radio" name="pq${k}" value="${v}"><span>${t}</span>`; $(`predQ${k}Box`).appendChild(l); });
    });
    set("predNumLabel", `depois das duas escolhas: a borda Compton de ${E} keV, em keV`);
    $("predIn").value = "";
  }
  const pqVal = (k) => { const e = document.querySelector(`input[name="pq${k}"]:checked`); return e ? e.value : ""; };
  function syncPrediction() {
    const locked = state.pred !== null, both = pqVal(1) !== "" && pqVal(2) !== "", num = Number($("predIn").value), ready = both && $("predIn").value !== "" && Number.isFinite(num) && num > 0;
    document.querySelectorAll('input[name="pq1"], input[name="pq2"]').forEach((e) => { e.disabled = locked; });
    $("predIn").disabled = locked || !both; $("predBtn").disabled = locked || !ready;
    set("predState", locked ? `Previsão registrada: borda ${fmt(state.pred.num, 0)} keV.` : both ? "Registre para travar a previsão e abrir a conta." : "Responda às duas perguntas para liberar o campo numérico.");
  }
  function registerPrediction() {
    const num = Number($("predIn").value);
    if (state.pred !== null || !pqVal(1) || !pqVal(2) || !Number.isFinite(num) || num <= 0) return;
    state.pred = { q1: pqVal(1), q2: pqVal(2), num }; syncBudget(); render();
  }
  function buildHintButtons() {
    const box = $("hintBtns"), L = state.lab.params;
    $("hintTitle").hidden = !L.hints; box.hidden = !L.hints; box.innerHTML = "";
    if (!L.hints) return;
    HINTS.forEach((h, i) => { const b = document.createElement("button"); b.type = "button"; b.dataset.hint = i; b.textContent = `Dica ${i + 1} (−${P.HINT_PENALTY[i]} pontos)`; b.disabled = i >= state.hints + 1 && false; box.appendChild(b); });
    const out = document.createElement("div"); out.id = "hintOut"; out.className = "hint"; box.appendChild(out); showHints();
  }
  function showHints() {
    const out = $("hintOut"); if (!out) return;
    out.innerHTML = HINTS.slice(0, state.hints).map((h, i) => `<b>Dica ${i + 1}.</b> ${h}`).join("<br><br>");
    document.querySelectorAll("#hintBtns button").forEach((b) => { const i = Number(b.dataset.hint); b.disabled = i !== state.hints; });
  }

  // ---------------------------------------------------------------- esquema da bancada (animação)
  function schematic(main, h0, cfg) {
    const c = main.ctx, w = main.w, y = h0 / 2 + 2, kind = P.CONFIGS[cfg].kind, plates = P.CONFIGS[cfg].plates || 0, narrow = main.narrow;
    const xs = narrow ? 30 : 46, xp = [w * 0.34, w * 0.34 + 16], xd = w * 0.62, wd = narrow ? 52 : 76, hh = h0 - 28;
    c.fillStyle = "#f3f6f1"; c.fillRect(0, 0, w, h0); c.strokeStyle = C.grid; c.beginPath(); c.moveTo(0, h0 - .5); c.lineTo(w, h0 - .5); c.stroke();
    // fonte
    if (kind === "bg") { c.strokeStyle = C.faint; c.setLineDash([3, 3]); c.beginPath(); c.arc(xs, y, 12, 0, TAU); c.stroke(); c.setLineDash([]); }
    else { glow(c, xs, y, "rgba(233,162,59,.55)", 28); dot(c, xs, y, C.gold, 9); c.strokeStyle = "#a66c17"; c.lineWidth = 1.5; c.beginPath(); c.arc(xs, y, 9, 0, TAU); c.stroke(); }
    label(c, kind === "bg" ? "sem fonte" : kind === "cal" ? "calibrador" : "fonte", xs, h0 - 5, C.gray, "center", "10px Ubuntu, system-ui");
    // lâminas
    for (let k = 0; k < plates; k += 1) { c.fillStyle = "#9aa3a1"; c.fillRect(xp[k], y - hh / 2 - 4, 13, hh + 8); c.strokeStyle = C.gray; c.strokeRect(xp[k] + .5, y - hh / 2 - 3.5, 12, hh + 7); }
    if (plates) label(c, `${plates} lâmina${plates > 1 ? "s" : ""}`, (xp[0] + xp[plates - 1] + 13) / 2, h0 - 5, C.gray, "center", "10px Ubuntu, system-ui");
    // detector: cristal e fotomultiplicadora
    const flash = Math.min(1, state.flashes);
    c.fillStyle = `rgba(69,123,157,${.28 + .3 * flash})`; c.fillRect(xd, y - hh / 2, wd * .62, hh); c.strokeStyle = C.blue; c.lineWidth = 2; c.strokeRect(xd, y - hh / 2, wd * .62, hh);
    c.fillStyle = "#c9d3c9"; c.fillRect(xd + wd * .62, y - hh / 3, wd * .38, hh * 2 / 3); c.strokeStyle = C.gray; c.lineWidth = 1; c.strokeRect(xd + wd * .62, y - hh / 3, wd * .38, hh * 2 / 3);
    if (flash > 0) glow(c, xd + wd * .3, y, `rgba(233,220,120,${.85 * flash})`, 26);
    label(c, "NaI(Tl) + fotomultiplicadora", xd, h0 - 5, C.gray, "left", "10px Ubuntu, system-ui");
    // fótons
    state.photons.forEach((p) => { if (!p.alive && p.dead > .35) return; const px = xs + (xd - xs) * p.u, a = p.alive ? 1 : Math.max(0, 1 - p.dead / .35);
      c.strokeStyle = `rgba(233,162,59,${a})`; c.lineWidth = 2; c.beginPath(); for (let s = -10; s <= 0; s += 2) { const yy = y + p.dy + 3.5 * Math.sin((p.u * 60 + s) * .9); s === -10 ? c.moveTo(px + s, yy) : c.lineTo(px + s, yy); } c.stroke(); });
  }
  function spawnPhotons(dt, cfg) {
    const kind = P.CONFIGS[cfg].kind, caso = state.caso; if (kind === "bg") return;
    const n = P.CONFIGS[cfg].plates || 0, E = (P.NUCLIDES[kind === "cal" ? P.CONFIGS[cfg].nuclide : caso.nuclide].lines[0]).E;
    state.spawn = (state.spawn || 0) + dt * 16;
    while (state.spawn >= 1) {
      state.spawn -= 1; const p = { u: 0, dy: (Math.random() - .5) * 22, alive: true, dead: 0 };
      if (kind === "src") { let surv = 1; for (let k = 0; k < n; k += 1) surv *= Math.exp(-P.linearAttenuation(caso.material, E) * caso.plateCm); p.stopAt = Math.random() < surv ? 2 : 0.28 + 0.1 * Math.random(); } else p.stopAt = 2;
      state.photons.push(p);
    }
  }
  function stepPhotons(dt) {
    state.photons.forEach((p) => { if (p.alive) { p.u += dt * 0.55; if (p.u >= p.stopAt || p.u >= 1) { p.alive = false; if (p.u >= 1 && p.stopAt >= 2) state.flashes = Math.min(1.2, state.flashes + .25); } } else p.dead += dt; });
    state.photons = state.photons.filter((p) => p.alive || p.dead < .4); state.flashes = Math.max(0, state.flashes - dt * 2.4);
  }

  // ---------------------------------------------------------------- 01 · missão
  function drawMission() {
    const L = state.lab.params, c = state.caso, W = P.WEIGHTS;
    html("missionDoc", `
      <h2>Missão</h2>
      <p>Uma fonte gama selada chegou ao laboratório de medicina nuclear <b>sem rótulo</b>. Ela está atrás de uma blindagem feita de <b>duas lâminas idênticas</b> de um material desconhecido; cada lâmina tem espessura <b>d = ${fmt(c.plateCm, 2)} cm</b> (paquímetro). O detector é um cintilador de NaI(Tl) com 512 canais, e a <b>calibração canal → energia é desconhecida</b>: ganho e zero mudam de um dia para o outro. Você dispõe de três fontes de calibração (Cs-137, Co-60 e F-18, 0,2 MBq cada) e de um orçamento de tempo de máquina e de dose.</p>
      <div class="brief"><div><b>${fmt(L.budgetS, 0)} s</b><small>tempo de máquina (aquisição de qualquer espectro)</small></div><div><b>${fmt(L.doseMaxUSv, 2)} µSv</b><small>dose do operador a ${fmt(P.BENCH_M * 100, 0)} cm da fonte (modelo didático)</small></div><div><b>${fmt(c.plateCm, 2)} cm</b><small>espessura de cada lâmina (0, 1 ou 2 lâminas)</small></div><div><b>${L.name.split(" · ")[1]}</b><small>${P.LEVELS[state.level].hints ? "3 dicas graduadas, −4, −6 e −10 pontos" : "sem dicas"}</small></div></div>
      <h3>O que entregar</h3>
      <ul><li><b>Radionuclídeo</b>: Tc-99m, I-123, I-131, F-18, Cs-137 ou Co-60.</li><li><b>Material da blindagem</b>: água, alumínio, ferro, osso cortical ou chumbo.</li><li><b>Energia da borda Compton</b> da linha principal, lida no espectro (keV).</li><li><b>Largura relativa FWHM/E</b> do fotopico principal (%).</li><li>Três perguntas de conceito: o que decidiu cada resposta.</li></ul>
      <h3>Como o laboratório funciona</h3>
      <ul><li>Em <b>Laboratório: espectro</b> você escolhe o que medir (fonte com 0, 1 ou 2 lâminas, fundo ou calibrador) e por quanto tempo. O espectro chega por contagens de Poisson; cada segundo gasta tempo e dose.</li>
      <li>A <b>ROI</b> dá contagem líquida com incerteza √N, centroide e largura; a <b>calibração em dois pontos</b> converte canal em keV.</li>
      <li>Em <b>Laboratório: atenuação</b>, a mesma ROI em duas medidas dá μ = ln(R₀/R₁)/d, que você compara com a tabela de μ(E) do NIST XCOM.</li>
      <li>Em <b>Entrega</b> você responde, recebe a pontuação detalhada e a auditoria da cadeia física. Pode entregar de novo, com −${P.REDELIVERY_COST} pontos por entrega adicional: a tela mostra só a pontuação por item e <b>quantos conceitos de 3</b> estão certos (não quais). Os números do caso só aparecem com nota ≥ 90 ou na 3ª entrega.</li></ul>
      <h3>Níveis</h3>
      <table><tr><th>nível</th><th>orçamento</th><th>tolerâncias</th><th>fonte</th><th>dicas</th></tr>
      ${[1, 2, 3].map((k) => `<tr${k === state.level ? ' style="background:#f4faef"' : ""}><td>${P.LEVELS[k].name}</td><td>${fmt(P.LEVELS[k].budgetS, 0)} s · ${fmt(P.LEVELS[k].doseMaxUSv, 2)} µSv</td><td>tolerância ×${fmt(P.LEVELS[k].tol, 1)}</td><td>${P.LEVELS[k].rateFactor < 1 ? "atividade reduzida (mais ruído)" : "atividade normal"}</td><td>${P.LEVELS[k].hints ? "sim" : "não"}</td></tr>`).join("")}</table>
      <h3>Pontuação (0 a 100)</h3>
      <table><tr><th>parte</th><th class="num">pontos</th></tr>
      <tr><td>Restrições da missão: radionuclídeo ${W.nuclide}, material ${W.material}, borda Compton ${W.edge}, FWHM/E ${W.fwhm} (perda linear, zero a 25 % de erro)</td><td class="num">40</td></tr>
      <tr><td>Valores calculados: ganho g ${W.gain} e μ medido ${W.mu}</td><td class="num">10</td></tr>
      <tr><td>Previsão registrada antes da primeira aquisição: duas perguntas qualitativas (${P.PRED_PARTS.q1} + ${P.PRED_PARTS.q2}) e a borda numérica de um fóton hipotético (${P.PRED_PARTS.num}; tolerância de 5 %)</td><td class="num">${W.prediction}</td></tr>
      <tr><td>Eficiência: máximo até 50 % do orçamento usado, linear até zero em 100 %, multiplicada pela fração da missão cumprida ao quadrado</td><td class="num">${W.efficiency}</td></tr>
      <tr><td>Justificativa: três perguntas de conceito</td><td class="num">${W.c1 + W.c2 + W.c3}</td></tr>
      <tr><td>Dicas (nível 1): −4, −6 e −10; cada entrega adicional: −${P.REDELIVERY_COST}</td><td class="num">desconto</td></tr></table>
      <div class="limit"><b>Hipóteses e limite do modelo.</b> Os espectros são <b>sintéticos</b>: fotopico gaussiano com resolução <b>empírica</b> R(E) = R₆₆₂·(E/661,7)<sup>−0,23</sup> (didática: 7 % a 661,7 keV, varia de 6,6 % a 7,8 % entre cristais, e ≈ 10 % a 140,5 keV), contínuo Compton pela fórmula de Klein–Nishina, pico de retroespalhamento pequeno (5 % dos eventos fora do fotopico), fundo ambiente e ruído de Poisson. As energias das linhas vêm de tabelas de decaimento; μ/ρ, do NIST XCOM. Geometria pontual, feixe estreito, sem raios X característicos (K<sub>α</sub> do chumbo, 27 keV do ¹²³I), sem soma de coincidências nem empilhamento.</div>`);
    const q = P.predictionFor(state.seed), registered = state.pred !== null, E = q.E, a = E / P.MEC2;
    const open = registered ? `Conta aberta da sua previsão (fóton de ${fmt(E, 0)} keV; Aula 1, mesma conta do exemplo do Tc-99m):<br>E′ = E/(1 + 2E/m<sub>e</sub>c²) = ${fmt(E, 0)}/(1 + ${fmt(2 * a, 3)}) = <b>${fmt(q.bs, 1)} keV</b><br>E<sub>c</sub> = E − E′ = ${fmt(E, 0)} − ${fmt(q.bs, 1)} = <b>${fmt(q.edge, 1)} keV</b> (${q.edge > E / 2 ? "acima" : "abaixo"} de E/2 = ${fmt(E / 2, 1)} keV)<small>exemplo da nota (Tc-99m, 140,5 keV): E′ = 90,7 keV; E<sub>c</sub> = 49,8 keV. m<sub>e</sub>c² = 511 keV; E′ é o retroespalhamento, E<sub>c</sub> a energia máxima do elétron.</small>`
      : "A conta abre quando você registrar a previsão (coluna da esquerda): primeiro as duas escolhas, depois o número.";
    texts({ status: "Missão", detail: `semente ${state.seed} · ${L.name}`,
      prediction: `Fóton de ${fmt(E, 0)} keV: a borda Compton fica acima ou abaixo de E/2? E o retroespalhamento? Responda antes de qualquer conta e registre na coluna da esquerda.`,
      calculation: open,
      metrics: [["orçamento de tempo", `${fmt(L.budgetS, 0)} s`], ["dose máxima", `${fmt(L.doseMaxUSv, 2)} µSv`], ["lâmina", `${fmt(c.plateCm, 2)} cm`], ["canais", "512"], ["calibradores", "Cs-137, Co-60, F-18"], ["nível", L.name.split(" · ")[0]]],
      conceptTitle: "Ideia física", concept: "Um espectro de cintilação mostra três coisas: o fotopico (energia do fóton), o contínuo Compton com sua borda (energia máxima do elétron de recuo, Aula 1) e o retroespalhamento. A atenuação exponencial identifica o material. A largura do fotopico é estatística, não a largura natural do nível (Aula 4). Os espectros são sintéticos; a resolução é uma parametrização empírica didática.",
      prompts: ["Planeje: que aquisições você precisa antes de entregar, e quanto tempo reservar a cada uma?", "Calcule de antemão onde ficam a borda Compton e o retroespalhamento de um fóton de 511 keV.", "Que medida isolada separa dois materiais com μ próximos? Qual a incerteza dessa medida?"] });
  }

  // ---------------------------------------------------------------- 02 · espectro
  function calcRoi(counts) {
    const r = roi(), net = P.roiNet(counts, r.lo, r.hi, 3), fit = net.gross > 40 ? P.fitGauss(counts, r.lo, r.hi) : null;
    return { r, net, fit };
  }
  function lineRefs() { const out = []; P.NUCLIDE_KEYS.forEach((k) => P.NUCLIDES[k].lines.forEach((l) => { if (l.y >= 0.05) out.push({ E: l.E, name: P.NUCLIDES[k].name }); })); return out; }
  function drawSpectrum() {
    const cfg = cfgNow(), lab = state.lab, counts = lab.spectra[cfg], live = lab.live[cfg], w = Number($("smoothSel").value), log = state.log;
    const sm = P.smooth(counts, w), { r, net, fit } = calcRoi(counts), cur = cursor(), cal = state.calib;
    set("roiLoOut", `${r.lo}`); set("roiHiOut", `${r.hi}`); set("curOut", `${cur}`);
    const main = canvas("mainCanvas", .66, 420), SH = main.narrow ? 66 : 84;
    schematic(main, SH, cfg);
    const xmax = Number($("zoomSel").value) || NCH; let mx = 1; for (let i = 6; i < xmax; i += 1) mx = Math.max(mx, counts[i], sm[i]);
    const lin = topAxis(mx, 5), yTop = log ? Math.pow(10, Math.ceil(Math.log10(mx * 1.3))) : lin.top;
    const tr = (v) => (log ? Math.log10(Math.max(v, 0.6)) : v), yMinV = log ? Math.log10(0.6) : 0, yMaxV = log ? Math.log10(yTop) : yTop;
    const yTicks = log ? Array.from({ length: Math.ceil(Math.log10(yTop)) + 1 }, (_, k) => k) : lin.ticks;
    const E0 = cal ? cal.E0 : 0, xTicks = cal ? P.niceTicks(Math.max(0, E0), P.energyOf(cal, xmax), 7).ticks.map((E) => P.channelOf(cal, E)).filter((x) => x >= 0 && x <= xmax) : P.niceTicks(0, xmax, 8).ticks;
    const eDigits = cal ? P.tickDigits(P.niceTicks(Math.max(0, E0), P.energyOf(cal, xmax), 7).step) : 0;
    const ch = axes(main, { x: 0, y: SH, w: main.w, h: main.h - SH }, 0, xmax, yMinV, yMaxV, cal ? "energia (keV)" : "canal", `contagens por canal${log ? " (escala log)" : ""}`,
      { xTicks, xLabels: cal ? (x) => fmt(P.energyOf(cal, x), eDigits) : undefined, yTicks: log ? yTicks : yTicks, yLabels: log ? (y) => fmt(Math.pow(10, y), 0) : undefined });
    // ROI e cursor
    clipRect(ch, ch.X(r.lo), ch.X(r.hi + 1), "rgba(233,162,59,.16)");
    // fundo escalado
    if (cfg !== "bg" && lab.live.bg > 0 && live > 0) { const k = live / lab.live.bg, bgc = P.smooth(lab.spectra.bg, 9); line(ch, Array.from({ length: NCH }, (_, i) => ({ x: i + .5, y: tr(bgc[i] * k) })), C.gray, [5, 4], 1.4, .9); }
    // histograma (passos) e curva suavizada
    clip(ch, (c) => {
      c.fillStyle = "rgba(69,123,157,.20)"; c.beginPath(); c.moveTo(ch.X(0), ch.Y(yMinV));
      for (let i = 0; i < NCH; i += 1) { const y = ch.Y(Math.min(yMaxV, tr(counts[i]))); c.lineTo(ch.X(i), y); c.lineTo(ch.X(i + 1), y); }
      c.lineTo(ch.X(NCH), ch.Y(yMinV)); c.closePath(); c.fill();
      c.strokeStyle = C.blue; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < NCH; i += 1) { const y = ch.Y(Math.min(yMaxV, tr(counts[i]))); i ? c.lineTo(ch.X(i), y) : c.moveTo(ch.X(i), y); c.lineTo(ch.X(i + 1), y); }
      c.stroke();
    });
    if (w > 1) line(ch, Array.from({ length: NCH }, (_, i) => ({ x: i + .5, y: tr(sm[i]) })), C.red, [], 2);
    // linhas da tabela (opcional)
    if (cal && $("linesChk").checked) lineRefs().forEach((l, i) => { const x = P.channelOf(cal, l.E); if (x < 0 || x > NCH) return; const c = main.ctx; c.strokeStyle = "rgba(123,94,167,.55)"; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(ch.X(x), ch.top); c.lineTo(ch.X(x), ch.bottom); c.stroke(); c.setLineDash([]); label(c, `${l.name} ${fmt(l.E, 0)}`, ch.X(x) + 2, ch.top + 10 + (i % 4) * 11, C.violet, "left", "9px Ubuntu, system-ui"); });
    // cursor
    { const c = main.ctx; c.strokeStyle = C.red; c.lineWidth = 1.4; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(ch.X(cur + .5), ch.top); c.lineTo(ch.X(cur + .5), ch.bottom); c.stroke(); c.setLineDash([]);
      const txt = `canal ${cur}${cal ? ` · ${fmt(P.energyOf(cal, cur + .5), 1)} keV` : ""} · ${fmt(counts[cur], 0)} cont.`; const right = ch.X(cur + .5) > ch.right - 170; labelBox(c, txt, ch.X(cur + .5) + (right ? -6 : 6), ch.top + 24, C.red, right ? "right" : "left", "bold 10px Ubuntu, system-ui"); }
    if (state.acq) { const c = main.ctx; label(c, `adquirindo ${state.acq.done}/${state.acq.total} s`, ch.right - 6, ch.bottom - 8, C.green, "right", "bold 12px Ubuntu, system-ui"); }
    if (!state.lab.total(cfg)) labelBox(main.ctx, "sem dados: use “Adquirir”", (ch.left + ch.right) / 2, (ch.top + ch.bottom) / 2, C.gray, "center", "bold 13px Ubuntu, system-ui");
    state.geo = { left: ch.left, right: ch.right };
    // secundário: ROI ampliada com ajuste
    const sec = canvas("secondaryCanvas", .36, 300), pad = Math.max(6, Math.round((r.hi - r.lo) * .6)), a = Math.max(0, r.lo - pad), b = Math.min(NCH - 1, r.hi + pad);
    let mxr = 1; for (let i = a; i <= b; i += 1) mxr = Math.max(mxr, counts[i] + Math.sqrt(counts[i]));
    const yt = topAxis(mxr, 4), cal2 = cal, xt = cal2 ? P.niceTicks(P.energyOf(cal2, a), P.energyOf(cal2, b + 1), 5) : P.niceTicks(a, b + 1, 6);
    const zoom = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, a, b + 1, 0, yt.top, cal2 ? "energia (keV)" : "canal", "contagens por canal",
      { xTicks: cal2 ? xt.ticks.map((E) => P.channelOf(cal2, E)) : xt.ticks, xLabels: cal2 ? (x) => fmt(P.energyOf(cal2, x), P.tickDigits(xt.step)) : undefined, yTicks: yt.ticks });
    clipRect(zoom, zoom.X(r.lo), zoom.X(r.hi + 1), "rgba(233,162,59,.16)");
    for (let i = a; i <= b; i += 1) { const x = zoom.X(i + .5), c = sec.ctx, y = counts[i], s = Math.sqrt(y); c.strokeStyle = "rgba(69,123,157,.7)"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, zoom.Y(Math.max(0, y - s))); c.lineTo(x, zoom.Y(y + s)); c.stroke(); dot(c, x, zoom.Y(y), C.blue, 2.6); }
    if (fit && fit.area > 0) {
      const pts = []; for (let x = a; x <= b + 1; x += .25) { const k = x - fit.lo - .5, t = (k - fit.nroi / 2) / fit.nroi; pts.push({ x, y: fit.b0 + fit.b1 * t + fit.area * Math.exp(-0.5 * ((x - fit.mu) / fit.sigma) ** 2) / (fit.sigma * Math.sqrt(TAU)) }); }
      line(zoom, pts, C.red, [], 2.2);
      const yh = fit.b0 + (fit.area / (fit.sigma * Math.sqrt(TAU))) / 2 + fit.b1 * ((fit.mu - fit.lo - .5 - fit.nroi / 2) / fit.nroi), c = sec.ctx;
      c.strokeStyle = C.green; c.lineWidth = 2; c.beginPath(); c.moveTo(zoom.X(fit.mu - fit.fwhm / 2), zoom.Y(yh)); c.lineTo(zoom.X(fit.mu + fit.fwhm / 2), zoom.Y(yh)); c.stroke();
      labelBox(c, `FWHM = ${cal ? fmt(fit.fwhm * cal.g, 1) + " keV" : fmt(fit.fwhm, 1) + " canais"}`, zoom.X(fit.mu + fit.fwhm / 2) + 6, zoom.Y(yh) - 4, C.green, "left", "bold 10px Ubuntu, system-ui");
    }
    // textos
    const E = fit && cal ? P.energyOf(cal, fit.mu) : null, rate = live > 0 ? net.net / live : null;
    texts({ status: "Laboratório: espectro", detail: `${configLabel(cfg)} · ${fmt(live, 0)} s`, title: `Espectro: ${configLabel(cfg)}`,
      subtitle: state.acq ? `adquirindo… ${state.acq.done}/${state.acq.total} s (o espectro chega por contagens de Poisson)` : `${fmt(live, 0)} s de tempo vivo · ${fmt(lab.total(cfg), 0)} contagens`,
      caption: "Barras azuis: contagens por canal; vermelho: média móvel. A faixa dourada é a ROI; o tracejado cinza é o fundo escalado pelo tempo. Pico estreito à direita: fotopico. Patamar que termina numa queda: contínuo Compton e sua borda. Pico baixo à esquerda: retroespalhamento.",
      secondaryTitle: "ROI ampliada e ajuste gaussiano", secondarySubtitle: "pontos com barras de erro √N; curva: gaussiana + fundo linear",
      secondaryCaption: "A largura a meia altura (FWHM) vem do ajuste. Quanto mais contagens, menores as barras relativas e o centroide fica mais preciso: é o preço do tempo de aquisição.",
      prediction: "Numa fonte pontual, sem blindagem entre ela e o detector, ainda aparece um pico de retroespalhamento? Ele fica acima ou abaixo da borda Compton do mesmo radionuclídeo? Decida antes de adquirir.",
      calculation: cal ? `E = E₀ + g·x = ${fmt(cal.E0, 1)} + ${fmt(cal.g, 3)}·x<br>${fit ? `x<sub>c</sub> = ${fmt(fit.mu, 1)} → <b>E = ${fmt(E, 1)} keV</b>` : "ROI sem contagens suficientes"}<small>σ<sub>N</sub> = √(bruto + fundo) = √${fmt(net.gross, 0)}… = ${fmt(net.sigma, 1)}</small>${fit && E ? `<small>FWHM/E = ${fmt(fit.fwhm * cal.g, 1)}/${fmt(E, 1)} = <b>${fmt(100 * fit.fwhm * cal.g / E, 1)} %</b></small>` : ""}`
        : `Sem calibração: x em canais.<br>${fit ? `centroide x<sub>c</sub> = ${fmt(fit.mu, 1)} canais` : "ROI sem contagens"}<small>σ<sub>N</sub> = √${fmt(net.gross, 0)} = ${fmt(Math.sqrt(net.gross), 1)} (ROI bruta)</small><small>meça dois fotopicos conhecidos e aplique a calibração</small>`,
      metrics: [["líquida na ROI", `${fmt(net.net, 0)} ± ${fmt(net.sigma, 0)}`], ["taxa líquida", rate === null ? "—" : `${fmt(rate, 2)} cps`], ["centroide", fit ? (cal ? `${fmt(E, 1)} keV` : `canal ${fmt(fit.mu, 1)}`) : "—"], ["FWHM (ajuste)", fit ? (cal ? `${fmt(fit.fwhm * cal.g, 1)} keV` : `${fmt(fit.fwhm, 1)} canais`) : "—"], ["FWHM/E", fit && E ? `${fmt(100 * fit.fwhm * cal.g / E, 1)} %` : "—"], ["cursor", `canal ${cur}${cal ? ` · ${fmt(P.energyOf(cal, cur + .5), 0)} keV` : ""}`]],
      concept: "O fotopico é a energia do fóton inteira depositada no cristal; a calibração transforma canal em keV (Aula 1). Contar é amostrar uma distribuição de Poisson: a incerteza é √N, e só melhora com √tempo (Aula 3).",
      prompts: ["Adquira o Cs-137 e o Co-60 (ou F-18), meça cada fotopico com a ROI e aplique a calibração.", "Adquira a fonte: ache o fotopico, a borda Compton e o retroespalhamento. Qual deles muda com a blindagem?", "Dobre o tempo de contagem: a incerteza relativa cai por qual fator?"],
      legend: [[C.blue, "contagens"], [C.red, "média móvel"], [C.gold, "ROI"], [C.gray, "fundo escalado", true]] });
  }
  function clipRect(ch, x0, x1, color) { const c = ch.ctx; c.fillStyle = color; c.fillRect(Math.max(ch.left, x0), ch.top, Math.min(ch.right, x1) - Math.max(ch.left, x0), ch.bottom - ch.top); }

  // ---------------------------------------------------------------- 03 · atenuação
  function attData() {
    const lab = state.lab, r = roi(), out = [];
    [["src0", 0], ["src1", 1], ["src2", 2]].forEach(([cfg, n]) => { const t = lab.live[cfg]; if (!t) return; const nt = P.roiNet(lab.spectra[cfg], r.lo, r.hi, 3); out.push({ cfg, n, t, net: nt.net, sigma: nt.sigma, rate: nt.net / t, rerr: nt.sigma / t }); });
    return out;
  }
  function drawAttenuation() {
    const caso = state.caso, d = caso.plateCm, data = attData(), pair = $("pairSel").value, r = roi(), cal = state.calib;
    const a = data.find((x) => x.n === Number(pair[0])), b = data.find((x) => x.n === Number(pair[1]));
    const fit = state.lab.live.src0 ? P.fitGauss(state.lab.spectra.src0, r.lo, r.hi) : null, E = fit && cal ? P.energyOf(cal, fit.mu) : null;
    set("roiLoOut", `${r.lo}`); set("roiHiOut", `${r.hi}`); set("curOut", `${cursor()}`);
    const dx = d * (Number(pair[1]) - Number(pair[0])), meas = a && b && a.net > 0 && b.net > 0 ? P.muFromNets(a.net, a.sigma, a.t, b.net, b.sigma, b.t, dx) : null;
    html("plateInfo", `d = ${fmt(d, 2)} cm por lâmina. Use a ROI do pico principal da fonte (mesma ROI nas duas medidas) e o mesmo tempo vivo ou compare taxas.`);
    const main = canvas("mainCanvas", .62, 400), SH = main.narrow ? 66 : 84, cfgShow = a ? a.cfg : "src0";
    schematic(main, SH, b ? b.cfg : cfgShow);
    const rates = data.map((x) => x.rate).filter((v) => v > 0), hi = rates.length ? Math.max(...rates) : 1, lo = rates.length ? Math.min(...rates) : .1;
    const yMax = Math.ceil(Math.log10(hi * 1.6)), yMin = Math.floor(Math.log10(Math.max(1e-3, lo / 3)));
    const ch = axes(main, { x: 0, y: SH, w: main.w, h: main.h - SH }, -.3, 2.3, yMin, yMax, "número de lâminas", "taxa líquida na ROI (cps, escala log)", { xTicks: [0, 1, 2], yTicks: Array.from({ length: yMax - yMin + 1 }, (_, k) => yMin + k), yLabels: (y) => fmt(Math.pow(10, y), y < 0 ? -y : 0) });
    if (meas && a && b) { const r0 = a.rate, nA = a.n, y0 = Math.log10(r0); line(ch, [{ x: nA, y: y0 }, { x: 2.3, y: y0 - meas.mu * d * (2.3 - nA) / Math.LN10 }, ], C.red, [6, 4], 1.8); line(ch, [{ x: nA, y: y0 }, { x: Number(pair[1]), y: Math.log10(b.rate) }], C.red, [], 2.4); }
    data.forEach((p) => { const c = main.ctx, x = ch.X(p.n), yy = ch.Y(Math.log10(Math.max(p.rate, 1e-6))), up = ch.Y(Math.log10(Math.max(p.rate + p.rerr, 1e-6))), dn = ch.Y(Math.log10(Math.max(p.rate - p.rerr, 1e-6)));
      c.strokeStyle = C.blue; c.lineWidth = 2; c.beginPath(); c.moveTo(x, up); c.lineTo(x, dn); c.stroke(); dot(c, x, yy, C.blue, 5.5); labelBox(c, `${fmt(p.rate, p.rate < 1 ? 3 : 1)} ± ${fmt(p.rerr, p.rerr < 1 ? 3 : 1)} cps`, x + 9, yy - 8, C.ink, "left", "bold 10px Ubuntu, system-ui"); });
    if (!data.length) labelBox(main.ctx, "sem dados: meça a fonte com 0, 1 e 2 lâminas no espectro", (ch.left + ch.right) / 2, (ch.top + ch.bottom) / 2, C.gray, "center", "bold 12px Ubuntu, system-ui");
    // secundário: μ(E)
    const sec = canvas("secondaryCanvas", .42, 320), lx = (E) => Math.log10(E), xt = [100, 200, 300, 500, 700, 1000, 1500];
    const mc = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, lx(100), lx(1500), -1.5, 1.5, "energia do fóton (keV, escala log)", "μ (1/cm, escala log)", { xTicks: xt.map(lx), xLabels: (x) => fmt(Math.pow(10, x), 0), yTicks: [-1, 0, 1], yLabels: (y) => fmt(Math.pow(10, y), y < 0 ? 1 : 0) });
    P.MATERIAL_KEYS.forEach((k) => { const pts = Array.from({ length: 80 }, (_, i) => { const e = 100 * Math.pow(15, i / 79); return { x: lx(e), y: Math.log10(P.linearAttenuation(k, e)) }; }); line(mc, pts, MAT_COLOR[k], [], 2.2); const lp = pts[pts.length - 1]; label(sec.ctx, P.MATERIALS[k].name, mc.right - 4, mc.Y(Math.min(1.45, lp.y)) - 4 + (k === "bone" ? 11 : 0), MAT_COLOR[k], "right", "10px Ubuntu, system-ui"); });
    if (E) { const c = sec.ctx; c.strokeStyle = C.faint; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(mc.X(lx(E)), mc.top); c.lineTo(mc.X(lx(E)), mc.bottom); c.stroke(); c.setLineDash([]); }
    if (E && meas && meas.mu > 0) { const c = sec.ctx, x = mc.X(lx(E)), y = mc.Y(Math.log10(meas.mu)), yu = mc.Y(Math.log10(meas.mu + meas.sigma)), yd = mc.Y(Math.log10(Math.max(1e-3, meas.mu - meas.sigma))); c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x, yu); c.lineTo(x, yd); c.stroke(); dot(c, x, y, C.ink, 5.5); glow(c, x, y, "rgba(233,162,59,.6)", 14); }
    const tab = E ? P.muTable(E) : null;
    texts({ status: "Laboratório: atenuação", detail: meas ? `μ = ${fmt(meas.mu, 3)} cm⁻¹` : "aguardando medidas", title: "Taxa líquida na ROI contra o número de lâminas",
      subtitle: "reta em escala log: R = R₀e<sup>−μd</sup>; a inclinação mede μ", caption: "Pontos azuis: taxa líquida (contagem líquida na ROI dividida pelo tempo vivo) com incerteza √N. A reta vermelha liga o par escolhido. Os fótons do esquema que ficam retidos na lâmina ilustram a atenuação (a fração que passa é e<sup>−μd</sup>).",
      secondaryTitle: "μ(E) dos cinco materiais (NIST XCOM)", secondarySubtitle: "o ponto preto é o μ medido, na energia do centroide da ROI (precisa de calibração)",
      secondaryCaption: "μ = (μ/ρ)·ρ com μ/ρ do XCOM e as densidades da tabela. Em todas as linhas deste desafio os cinco materiais diferem por mais de 30 %: a barra de erro do ponto preto precisa caber entre duas curvas.",
      prediction: "Se a espessura de uma lâmina dobra, a taxa líquida cai pela metade? Prediga a razão R₂/R₀ se R₁/R₀ = 0,50.",
      calculation: meas ? `μ = ln(R<sub>${pair[0]}</sub>/R<sub>${pair[1]}</sub>)/(${pair[1] - pair[0]}·d) = ln(${fmt(a.rate, 3)}/${fmt(b.rate, 3)})/${fmt(dx, 2)} cm<br><b>μ = ${fmt(meas.mu, 4)} ± ${fmt(meas.sigma, 4)} cm⁻¹</b>${tab ? `<small>E = ${fmt(E, 1)} keV: ${tab.map((m) => `${m.name} ${fmt(m.mu, m.mu < 1 ? 3 : 2)} (${fmt(meas.mu / m.mu, 2)}×)`).join(" · ")}</small>` : "<small>calibre o espectro para localizar a energia e ler a tabela de μ(E)</small>"}`
        : "μ = ln(R₀/R₁)/d<br>meça a fonte com 0 e com 1 lâmina<small>mesma ROI e, de preferência, mesmo tempo vivo</small>",
      metrics: [["R sem lâmina", a && a.n === 0 ? `${fmt(a.rate, 2)} cps` : data.find((x) => x.n === 0) ? `${fmt(data.find((x) => x.n === 0).rate, 2)} cps` : "—"], ["R com 1 lâmina", data.find((x) => x.n === 1) ? `${fmt(data.find((x) => x.n === 1).rate, 2)} cps` : "—"], ["μ medido", meas ? `${fmt(meas.mu, 3)} ± ${fmt(meas.sigma, 3)} cm⁻¹` : "—"], ["energia do pico", E ? `${fmt(E, 1)} keV` : "sem calibração"], ["μd medido por lâmina", meas ? fmt(meas.mu * d, 2) : "—"], ["transmissão (1 lâmina)", meas ? `${fmt(100 * Math.exp(-meas.mu * d), 0)} %` : "—"]],
      concept: "Um feixe estreito de fótons de energia E é atenuado exponencialmente, N = N₀e<sup>−μx</sup>, com μ = (μ/ρ)ρ (Aula 1, dados XCOM). A energia do fotopico não muda: o que muda é quantos fótons chegam. O material sai de μ(E).",
      prompts: ["Meça o par sem lâmina → 1 lâmina e o par 1 → 2: os dois μ concordam dentro da incerteza?", "Qual das duas curvas mais próximas do ponto preto você descarta, e com que margem?", "Dobre o tempo de contagem das duas medidas: a incerteza de μ cai por quanto?"],
      legend: [[C.blue, "taxa líquida"], [C.red, "ajuste do par"], [C.ink, "μ medido"]] });
  }

  // ---------------------------------------------------------------- 04 · entrega
  // a ordem das opções muda por semente e a cada entrega; a letra exibida é a da posição; a escolha anterior é mantida (por conteúdo, não por letra)
  function conceptHtml() {
    return P.CONCEPTS.map((q) => `<fieldset class="concept"><legend>${q.question}</legend>${P.shuffledOptions(state.seed, q, state.deliveries).map(([id, t], k) => `<label><input type="radio" name="${q.id}" value="${id}"${state.picks[q.id] === id ? " checked" : ""}><span><b>${"ABCD"[k]})</b> ${t}</span></label>`).join("")}</fieldset>`).join("");
  }
  function deliverFormHtml() {
    const nuc = P.NUCLIDE_KEYS.map((k) => `<option value="${k}">${nucName(k)}</option>`).join(""), mat = P.MATERIAL_KEYS.map((k) => `<option value="${k}">${P.MATERIALS[k].name}</option>`).join("");
    return `<h2>Entrega</h2><p>Responda com o que você <b>mediu</b>. Pode entregar de novo; cada entrega adicional custa ${P.REDELIVERY_COST} pontos, e a tela só informa quantos dos três conceitos estão certos. A previsão registrada na Missão é pontuada aqui.</p>
      <div class="formrow"><label for="ansNuc">Radionuclídeo</label><select id="ansNuc"><option value="">escolha…</option>${nuc}</select></div>
      <div class="formrow"><label for="ansMat">Material da blindagem</label><select id="ansMat"><option value="">escolha…</option>${mat}</select></div>
      <div class="formrow"><label for="ansEdge">Borda Compton da linha principal (keV)</label><input id="ansEdge" type="number" step="any" min="0"></div>
      <div class="formrow"><label for="ansFwhm">FWHM/E do fotopico principal (%)</label><input id="ansFwhm" type="number" step="any" min="0"></div>
      <div class="formrow"><label for="ansGain">Ganho calibrado g (keV/canal)</label><input id="ansGain" type="number" step="any" min="0"></div>
      <div class="formrow"><label for="ansMu">μ medido na blindagem (cm⁻¹)</label><input id="ansMu" type="number" step="any" min="0"></div>
      <h3>Qual conceito decidiu?</h3><p class="hint">Na folha, escreva a letra marcada e uma frase de razão para cada pergunta: o professor corrige a frase.</p><div id="conceptBox">${conceptHtml()}</div>
      <p><button type="button" class="primary" id="deliverBtn2">Entregar</button></p>
      <div id="deliverResult"></div>`;
  }
  let formBuilt = "";
  function drawDeliver() {
    const key = `${state.seed}|${state.level}`;
    if (formBuilt !== key) { formBuilt = key; html("deliverDoc", deliverFormHtml()); $("deliverBtn2").addEventListener("click", deliver); renderResult(); }
    const lab = state.lab;
    html("deliverSummary", `Aquisições: ${fmt(lab.count, 0)} s no total · uso do orçamento ${fmt(100 * lab.costFraction(), 0)} %<br>Previsão: ${state.pred === null ? "ainda não registrada" : `${fmt(state.pred.num, 0)} keV (borda de um fóton de ${fmt(P.predictionFor(state.seed).E, 0)} keV)`}<br>Dicas usadas: ${state.hints}${state.lab.params.hints ? "" : " (este nível não tem dicas)"}<br>Entregas: ${state.deliveries}`);
    texts({ status: "Entrega", detail: `${state.deliveries} entrega(s) · semente ${state.seed}`, title: "", subtitle: "", caption: "", secondaryTitle: "", secondarySubtitle: "", secondaryCaption: "",
      prediction: "Antes de entregar: a largura natural do nível de 140,5 keV do Tc-99m (ħ/τ ≈ 2×10⁻⁶ eV) é menor que a largura que o NaI mede por um fator de dez, de mil ou de 10¹⁰?",
      calculation: state.deliveries >= 1 ? `Largura natural: ħ/τ = 6,58×10⁻¹⁶ eV·s/0,28 ns = 2,4×10⁻⁶ eV = <b>1,7×10⁻¹¹ de E</b><br>NaI a 140,5 keV: FWHM ≈ 10 % de E ≈ 14 keV (resolução empírica)<br><b>razão ≈ 0,10/1,7×10⁻¹¹ ≈ 6×10⁹ ≈ 10¹⁰</b><small>a largura medida vem da estatística de fotoelétrons e da coleta de luz, não do nível</small>` : "A conta abre depois da primeira entrega.",
      metrics: [["uso do orçamento", `${fmt(100 * lab.costFraction(), 0)} %`], ["tempo gasto", `${fmt(lab.timeS, 0)} s`], ["dose", `${fmt(lab.doseUSv, 4)} µSv`], ["dicas", `${state.hints}`], ["entregas", `${state.deliveries}`], ["calibração", state.calib ? "feita" : "não feita"]],
      concept: "A auditoria mostra a cadeia: calibração, identificação pelo fotopico, borda Compton e retroespalhamento, resolução estatística contra largura natural (Aula 4) e atenuação exponencial. A física é a mesma das aulas; os números são os do seu caso.",
      prompts: ["Reveja o que decidiu cada resposta: foi o fotopico calibrado, ou o pico mais alto?", "Se a borda Compton ficou fora da tolerância, compare com a fórmula E·2α/(1 + 2α).", "Se entregar de novo, o que você mediria a mais, e quanto do orçamento isso custa?"] });
  }
  function deliver() {
    const val = (id) => $(id).value, radio = (n) => { const e = document.querySelector(`input[name="${n}"]:checked`); return e ? e.value : ""; };
    state.deliveries += 1;
    const input = { nuclide: val("ansNuc"), material: val("ansMat"), edgeKeV: val("ansEdge") === "" ? NaN : Number(val("ansEdge")), fwhmPct: val("ansFwhm") === "" ? NaN : Number(val("ansFwhm")), gainKeV: val("ansGain") === "" ? NaN : Number(val("ansGain")), muCm: val("ansMu") === "" ? NaN : Number(val("ansMu")), predQ1: state.pred === null ? "" : state.pred.q1, predQ2: state.pred === null ? "" : state.pred.q2, prediction: state.pred === null ? NaN : state.pred.num, c1: radio("c1"), c2: radio("c2"), c3: radio("c3"), hintsUsed: state.hints, deliveries: state.deliveries };
    state.delivered = { score: P.score(state.caso, state.lab, input), input };
    state.picks = { c1: input.c1, c2: input.c2, c3: input.c3 }; html("conceptBox", conceptHtml());   // nova ordem das opções para a próxima entrega
    syncBudget(); renderResult(); if (view === "deliver") drawDeliver(); const res = $("deliverResult"); if (res && res.scrollIntoView) res.scrollIntoView({ block: "nearest" });
  }
  function renderResult() {
    const box = $("deliverResult"); if (!box) return; const c = state.caso, chain = P.auditChain(c);
    const d = state.delivered, revealed = prof || (d && (d.score.total >= 90 || d.score.deliveries >= 3));
    let h = "";
    if (d) {
      const s = d.score;
      // as notas que deixariam o valor verdadeiro à mostra (diferença em keV, erro relativo) e os conceitos individuais só aparecem na revelação
      const rows = s.parts.filter((p) => p.group !== "concept").map((p) => `<tr><td>${p.label}</td><td>${p.reveals && !revealed ? "pontuação proporcional ao erro" : p.note}</td><td class="num">${fmt(p.pts, 1)} / ${fmt(p.max, 0)}</td></tr>`).join("");
      h += `<h3>Pontuação</h3><div class="score-big"><b>${fmt(s.total, 0)}</b><span>de 100 · entrega nº ${s.deliveries}</span></div>
        <table><tr><th>item</th><th>observação</th><th class="num">pontos</th></tr>${rows}
        <tr><td>Justificativa (três conceitos)</td><td><b>${s.conceptsRight} de 3 conceitos corretos</b></td><td class="num">—</td></tr>
        <tr><td>Dicas</td><td>${state.hints} usada(s)</td><td class="num">−${fmt(s.hintsPenalty, 0)}</td></tr><tr><td>Entregas adicionais</td><td>${s.deliveries - 1}</td><td class="num">−${fmt(s.redeliveryPenalty, 0)}</td></tr></table>`;
      h += `<div class="msg">${s.conceptsRight} de 3 conceitos corretos.${revealed ? ` ${P.CONCEPTS.map((q) => q.lesson).join(". ")}.` : s.conceptsRight === 3 ? "" : " A tela não diz quais: releia as opções e a razão de cada uma."}</div>`;
    }
    if (prof && !d) h += refBox();
    if (d || prof) {
      h += `<h3>Auditoria: a cadeia física</h3>`;
      h += chain.slice(0, 5).map((s) => `<div class="audit"><b>${s.step}</b><code>${s.formula}</code><br>${s.generic}${revealed ? `<br><b>${s.caso}</b>` : ""}</div>`).join("");
      h += revealed ? (prof && d ? refBox() : "") : `<div class="msg">Os números do seu caso aparecem aqui com pontuação ≥ 90 ou depois de três entregas.</div>`;
      h += `<div class="limit"><b>Limite do modelo.</b> ${chain[5].generic} A resolução ∝ √E e a eficiência de pico são parametrizações didáticas; num NaI real há não linearidade, pico de escape de iodo e soma em cascata. Com a fonte e o detector próximos, a soma de coincidências deforma o espectro do Co-60 e do I-131.</div>`;
    }
    box.innerHTML = h;
  }
  function refBox() {
    const c = state.caso, ref = P.solveReference(c), edges = P.acceptedEdges(c.nuclide).map((E) => fmt(E, 1)).join(" ou ");
    return `<div class="refbox"><b>Solução de referência (modo professor).</b> Radionuclídeo ${nucName(c.nuclide)}; material ${P.MATERIALS[c.material].name}; borda Compton ${edges} keV; FWHM/E = ${fmt(P.trueFwhmPct(c), 2)} %; g = ${fmt(c.gain, 3)} keV/canal, E₀ = ${fmt(c.offset, 1)} keV; A = ${fmt(c.activityMBq, 3)} MBq; μ = ${fmt(c.mu, 4)} cm⁻¹, d = ${fmt(c.plateCm, 2)} cm. Previsão da semente: fóton de ${fmt(P.predictionFor(c.seed).E, 0)} keV, borda ${fmt(P.predictionFor(c.seed).edge, 1)} keV (${P.predictionFor(c.seed).q1 === "above" ? "acima" : "abaixo"} de E/2), retroespalhamento ${fmt(P.predictionFor(c.seed).bs, 1)} keV.<br>Solver independente: ${ref.failed ? ref.failed : `${nucName(ref.nuclide)}, ${P.MATERIALS[ref.material].name}, borda ${fmt(ref.edge, 1)} keV, FWHM/E ${fmt(ref.fwhmPct, 2)} %, ${fmt(ref.lab.timeS, 0)} s (${fmt(100 * ref.lab.costFraction(), 0)} % do orçamento), pontuação ${fmt(P.score(c, ref.lab, ref.answers).total, 0)}.`}</div>`;
  }

  // ---------------------------------------------------------------- aquisição e laço de animação
  function startAcq() {
    if (state.acq) return;
    if (state.pred === null) { set("acqState", "Registre antes a previsão da Missão (aba 01): duas escolhas qualitativas e a borda em keV."); switchView("mission"); return; }
    const cfg = cfgNow(), want = Number($("durSel").value), lab = state.lab;
    let ok = 0; while (ok < want && lab.canAcquire(cfg, ok + 1)) ok += 1;
    if (!ok) { set("acqState", "Orçamento de tempo ou de dose esgotado para esta medida."); syncBudget(); return; }
    if (reducedMotion) { lab.acquire(cfg, ok); syncBudget(); render(); return; }
    state.acq = { config: cfg, total: ok, done: 0, carry: 0 }; syncBudget(); kick();
  }
  function stopAcq() { state.acq = null; syncBudget(); render(); }
  let raf = 0;
  function kick() { if (!raf) { state.last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0; const dt = Math.max(0, Math.min(.05, (now - state.last) / 1000)); state.last = now;
    if (state.acq) {
      const a = state.acq; a.carry += dt * Math.max(8, a.total / 3.5);
      while (a.carry >= 1 && a.done < a.total) { a.carry -= 1; if (!state.lab.step(a.config)) { a.done = a.total; break; } a.done += 1; }
      spawnPhotons(dt, a.config); syncBudget();
      if (a.done >= a.total) { state.acq = null; syncBudget(); }
    }
    stepPhotons(dt); render();
    if (state.acq || state.photons.length || state.flashes > 0) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- abas e eventos
  const draws = { mission: drawMission, spectrum: drawSpectrum, attenuation: drawAttenuation, deliver: drawDeliver };
  const render = () => { draws[view](); };
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "mission";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    document.querySelectorAll(".view-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === (view === "mission" ? "mission" : view === "deliver" ? "deliver" : "lab")));
    const slot = view === "spectrum" ? $("slotSpectrum") : view === "attenuation" ? $("slotAtt") : null; if (slot) slot.appendChild($("roiBlock")); $("roiBlock").hidden = !slot;
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* local */ }
    render(); if (state.acq || state.photons.length) kick();
  }
  function buildSelects() {
    $("cfgSel").innerHTML = P.CONFIG_KEYS.map((k) => `<option value="${k}">${configLabel(k)}</option>`).join("");
    const lines = [["Cs-137 661,7 keV", 661.657], ["Co-60 1332,5 keV", 1332.5], ["Co-60 1173,2 keV", 1173.2], ["F-18 511 keV", 511]];
    ["cal1Line", "cal2Line"].forEach((id, i) => { $(id).innerHTML = lines.map(([t, E]) => `<option value="${E}">${t}</option>`).join(""); $(id).selectedIndex = i; });
  }
  function takeRoiCentroid(which) {
    const counts = state.lab.spectra[cfgNow()], r = roi(), fit = P.fitGauss(counts, r.lo, r.hi);
    if (!fit) { set("calState", "A ROI não tem contagens para um ajuste: aumente o tempo ou ajuste a ROI."); return; }
    $(`cal${which}x`).value = fmt(fit.mu, 2).replace(",", ".").replace("−", "-");
  }
  function applyCal() {
    const x1 = Number($("cal1x").value), x2 = Number($("cal2x").value), E1 = Number($("cal1Line").value), E2 = Number($("cal2Line").value);
    const c = $("cal1x").value !== "" && $("cal2x").value !== "" ? P.calibrate(x1, E1, x2, E2) : null;
    if (!c || !(c.g > 0)) { state.calib = null; set("calState", "Calibração inválida: use dois picos diferentes, com canais diferentes e energia crescente."); return; }
    state.calib = c; syncBudget(); render();
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
    document.addEventListener("change", (e) => { if (e.target.name === "pq1" || e.target.name === "pq2") syncPrediction(); });
    $("calPreset").addEventListener("click", () => { if (state.level !== 1) return; state.calib = P.presetCalibration(state.caso); ["cal1x", "cal2x"].forEach((id) => { $(id).value = ""; }); syncBudget(); render(); });
    $("cfgSel").addEventListener("change", () => { syncBudget(); render(); });
    $("calApply").addEventListener("click", applyCal); $("calClear").addEventListener("click", () => { state.calib = null; ["cal1x", "cal2x"].forEach((id) => { $(id).value = ""; }); syncBudget(); render(); });
    document.querySelectorAll("[data-takecal]").forEach((b) => b.addEventListener("click", () => takeRoiCentroid(b.dataset.takecal)));
    $("scaleLin").addEventListener("click", () => { state.log = false; $("scaleLin").classList.add("on"); $("scaleLog").classList.remove("on"); render(); });
    $("scaleLog").addEventListener("click", () => { state.log = true; $("scaleLog").classList.add("on"); $("scaleLin").classList.remove("on"); render(); });
    $("roiPeak").addEventListener("click", () => { // pico mais à direita entre os que têm ≥ 20 % da altura do maior (o fotopico, não o retroespalhamento)
      const cfg = view === "attenuation" ? "src0" : cfgNow(), sm = P.smooth(state.lab.spectra[cfg], 7); let top = 0; for (let i = 24; i < NCH - 8; i += 1) top = Math.max(top, sm[i]);
      if (top < 8) { set("acqState", "Sem dados para achar um pico: adquira primeiro."); return; }
      let best = -1; for (let i = 24; i < NCH - 12; i += 1) { if (sm[i] < 0.2 * top || sm[i] < sm[i - 1] || sm[i] < sm[i + 1]) continue; let ok = true; for (let j = -10; j <= 10; j += 1) if (sm[i + j] > sm[i]) ok = false; if (ok) best = i; }
      if (best < 0) return;
      const fit = P.fitGauss(state.lab.spectra[cfg], best - 14, best + 14); const mu = fit ? fit.mu : best, sg = fit ? fit.sigma : 4;
      $("roiLo").value = Math.max(8, Math.round(mu - 2.2 * sg)); $("roiHi").value = Math.min(503, Math.round(mu + 2.2 * sg)); $("curIn").value = Math.round(mu); render();
    });
    $("roiCursor").addEventListener("click", () => { const c = cursor(); $("roiLo").value = Math.max(8, c - 6); $("roiHi").value = Math.min(503, c + 6); render(); });
    $("goSpec").addEventListener("click", () => switchView("spectrum"));
    document.querySelectorAll("input[type=range], select, input[type=checkbox]").forEach((el) => el.addEventListener("input", () => { if (el.id !== "levelSel") render(); }));
    $("predIn").addEventListener("input", () => { syncPrediction(); });
    $("deliverBtn").addEventListener("click", deliver);
    const mc = $("mainCanvas"), pick = (e) => { if (view !== "spectrum" || !state.geo) return; const rect = mc.getBoundingClientRect(), x = (e.clientX - rect.left - state.geo.left) / (state.geo.right - state.geo.left) * NCH; if (x >= 0 && x < NCH) { $("curIn").value = Math.floor(x); render(); } };
    mc.addEventListener("pointerdown", (e) => { pick(e); mc.setPointerCapture && mc.setPointerCapture(e.pointerId); mc.dataset.drag = "1"; });
    mc.addEventListener("pointermove", (e) => { if (mc.dataset.drag === "1") pick(e); }); mc.addEventListener("pointerup", () => { mc.dataset.drag = ""; });
    document.querySelector(".tabs").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const tabs = [...document.querySelectorAll("[data-view]")], i = tabs.findIndex((t) => t.dataset.view === view), j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view);
    });
    window.addEventListener("resize", render);
  }
  // inicialização: semente, nível e controles pela URL
  buildSelects(); bind();
  newCase(Number(url.get("seed")) || 1, Number(url.get("level")) || 1);
  url.forEach((value, key) => { const el = $(key); if (el && !["seedIn", "levelSel", "predIn"].includes(key) && (el.tagName === "INPUT" || el.tagName === "SELECT") && el.type !== "checkbox") el.value = value; });
  if (url.get("scale") === "log") { state.log = true; $("scaleLog").classList.add("on"); $("scaleLin").classList.remove("on"); }
  if (url.get("pred")) { $("predIn").value = url.get("pred"); syncPrediction(); }
  switchView(view);
})();
