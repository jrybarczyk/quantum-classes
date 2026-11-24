(function () {
  "use strict";
  // Núcleo comum dos desafios: desenho, estado do caso, previsão, orçamento, dicas, entrega e auditoria.
  // O que é específico de cada desafio fica no objeto D (abaixo do marcador "específico do desafio").
  const P = window.DesafioPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9", violet: "#7b5ea7" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["mission", "lab", "deliver"];
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const query = new URLSearchParams(location.search);
  const PROF = query.get("prof") === "1";
  const RESERVED = ["view", "seed", "level", "prof", "sub"];
  let view = VIEWS.includes(query.get("view")) ? query.get("view") : "mission";
  let sub = query.get("sub") === "2" ? 2 : 1; // 1 = depleção e C–V (comece aqui), 2 = portadores e janela

  const fmt = (x, n = 2) => P.formatPt(x, n);
  const sci = (x, n = 1) => P.formatSci(x, n);
  const set = (id, text) => { $(id).textContent = text; };
  const html = (id, content) => { $(id).innerHTML = content; };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Aceita vírgula ou ponto decimal; vazio ou texto vira NaN.
  const num = (id) => { const t = String($(id).value).trim().replace(",", "."); return t === "" ? NaN : Number(t); };
  const v = (id) => Number($(id).value);
  const samples = (a, b, n, fn) => Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; });

  // ---------------------------------------------------------------- desenho
  // Em telas estreitas (< 600 px) a altura tem um mínimo, para os gráficos não ficarem espremidos.
  function canvas(id, aspect, minNarrow) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, h = Math.max(w * aspect, w < 600 ? (minNarrow ?? (id === "mainCanvas" ? 330 : 300)) : 0);
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, ratio, el, narrow: w < 600 };
  }
  // Marcas "bonitas" (P.niceTicks) ou lista explícita (o.xTicks, o.yTicks); rótulos com as casas do passo.
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + (o.padLeft ?? 52), right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    const nx = Math.max(2, Math.min(o.ticks ?? 5, Math.floor((right - left) / 58))), ny = Math.max(2, Math.min(o.ticks ?? 5, Math.floor((bottom - top) / 34)));
    const xs = o.xTicks || P.niceTicks(xMin, xMax, nx).ticks, ys = o.yTicks || P.niceTicks(yMin, yMax, ny).ticks, xd = P.listDigits(xs), yd = P.listDigits(ys);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1; ctx.strokeStyle = C.grid;
    ctx.beginPath(); xs.forEach((x) => { ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); }); ys.forEach((y) => { ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); }); ctx.stroke();
    ctx.fillStyle = C.gray;
    if (!o.noX) { ctx.textAlign = "center"; xs.forEach((x) => ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, xd), X(x), bottom + 14)); }
    if (!o.noY) { ctx.textAlign = "right"; ys.forEach((y) => ctx.fillText(o.yLabels ? o.yLabels(y) : fmt(y, yd), left - 6, Y(y) + 3)); }
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(String(xLabel).replace(/_/g, ""), (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(yLabel).replace(/_/g, ""), 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  // No canvas não há subscrito: "N_D" vira "ND" (os textos HTML usam <sub>).
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(String(text).replace(/_/g, ""), x, y); }
  // Rótulo com fundo claro (não se perde sobre curvas e linhas).
  function labelBox(ctx, text, x, y, color, align = "left", font = "10px Ubuntu, system-ui") {
    text = String(text).replace(/_/g, ""); ctx.font = font; const w = ctx.measureText(text).width, x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    ctx.fillStyle = "rgba(251,252,250,.88)"; ctx.fillRect(x0 - 2, y - 10, w + 4, 14); label(ctx, text, x, y, color, align, font);
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
  function arrow(ctx, x1, y1, x2, y2, color, width = 3) {
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = 9; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)); ctx.lineTo(x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
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
  // Infravermelho próximo é invisível: acima de 700 nm usamos falsa cor (do vermelho ao magenta) e dizemos isso na legenda.
  function emissionColor(nm) {
    if (nm <= 700) return spectralColor(nm);
    const t = Math.min(1, (nm - 700) / 250), r = Math.round(230 - 40 * t), g = Math.round(40 + 10 * t), b = Math.round(40 + 160 * t);
    return `rgb(${r},${g},${b})`;
  }
  // Pequeno gerador de ruído visual (apenas para partículas decorativas; a física não usa).
  const wob = (i, t, k = 1) => Math.sin(i * 12.9898 + t * k) * 43758.5453 % 1;

  // Texto HTML da física: ^{…} e _{…} viram sobrescrito e subscrito; _palavra vira subscrito (V_dep, E_g).
  const sx = (s) => String(s ?? "").replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>").replace(/_\{([^}]*)\}/g, "<sub>$1</sub>").replace(/_([A-Za-zÀ-ÿ]+)/g, "<sub>$1</sub>");
  function texts(d) {
    set("statusTitle", d.status); set("statusDetail", d.detail);
    set("mainTitle", String(d.title).replace(/_/g, "")); html("mainSubtitle", sx(d.subtitle)); html("caption", sx(d.caption));
    if (d.secondaryTitle !== undefined) { set("secondaryTitle", String(d.secondaryTitle).replace(/_/g, "")); html("secondarySubtitle", sx(d.secondarySubtitle)); html("secondaryCaption", sx(d.secondaryCaption)); }
    html("prediction", sx(d.prediction)); html("calculation", sx(d.calculation));
    html("metrics", d.metrics.map(([a, b]) => `<div><dt>${sx(a)}</dt><dd>${sx(b)}</dd></div>`).join(""));
    set("conceptTitle", d.conceptTitle || "Ideia física"); html("conceptText", sx(d.concept));
    html("prompts", d.prompts.map((p) => `<li>${sx(p)}</li>`).join(""));
    html("legend", (d.legend || []).map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-top-style:dashed" : ""}"></i>${text}</span>`).join(""));
  }

  // ---------------------------------------------------------------- estado do caso
  const state = { seed: 1, level: 2, caso: null, items: null, predQual: {}, predQualLocked: false, pred: "", predLocked: false, predValue: NaN, used: 0, hints: 0, hintTexts: [], log: [], last: null, deliveries: 0, result: null, resultAt: 0, picked: {}, revealed: false, time: 0, message: "" };
  const budgetLeft = () => state.caso.level.budget - state.used;

  // ================================================================ específico do desafio 5
  const LAB_DEFAULTS = { tk: 77, lnd: 10, vv: 2000 };
  const labDesign = () => ({ T: v("tk"), ND: 10 ** v("lnd"), V: v("vv") });
  const logT = (T) => Math.log10(T);
  const T_TICKS = [10, 20, 30, 50, 100, 200, 300];
  const sup = (n) => P.superscript(n);
  const D = { animated: (w) => !reducedMotion && (w === "lab" || w === "mission" || (w === "deliver" && state.result)) };
  state.dKnown = null; state.dBound = 0; state.lastC = null; state.cache = {};
  D.budgetName = "Ensaios C–V restantes"; D.runName = "Rodar ensaio C–V";
  D.predUnit = "K";
  D.numericPred = true;
  D.predAnswerText = (c) => `a corrente de geração do cristal-exemplo vale ${fmt(c.level.iMaxPA, 0)} pA em ${fmt(c.predAnswerK, 0)} K; nᵢ cai por mais de dez ordens de grandeza de 300 K a 77 K.`;
  D.predSummary = (s) => `(${Number.isFinite(state.predValue) ? "você registrou " + fmt(state.predValue, 1) + " K" : "sem registro numérico"}; a previsão vale ${fmt(s.parts.previsao, 1)} de 10.)`;
  D.deliverPrompts = ["Qual critério lhe custou mais pontos? Que decisão de projeto o corrige?", "Esfriar mais sempre ajuda? Dê as duas razões que limitam o frio: uma de física do cristal e uma de orçamento.", "Que temperatura teria sido ótima se o orçamento de refrigeração fosse metade? E o dobro?"];
  D.qualItems = () => [P.qualPrediction(state.caso)];
  D.qualPayload = () => state.predQual.qual;
  D.predQuestion = (c) => `Depois da escolha qualitativa: para um cristal-exemplo de ${fmt(c.predVolume, 0)} cm³ (não é o seu) e τ = 1 ms, a corrente de geração I_ger = e·nᵢ·V/2τ vale ${fmt(c.level.iMaxPA, 0)} pA em que temperatura? Leia nᵢ(T) no gráfico da aba Portadores e responda em kelvin.`;
  D.resetFields = () => {
    ["ansT", "ansND", "ansV", "repD", "repV", "repI"].forEach((id) => { $(id).value = ""; });
    state.dKnown = null; state.dBound = 0; state.lastC = null; state.cache = {};
  };
  D.labDefaults = () => { Object.entries(LAB_DEFAULTS).forEach(([id, value]) => { $(id).value = value; }); };
  D.readAnswer = () => ({ T: num("ansT"), ND: num("ansND") * 1e10, V: num("ansV"), rep: { d: num("repD"), vdep: num("repV"), logI: num("repI") } });
  D.fromLab = () => {
    const d = labDesign(); $("ansT").value = fmt(d.T, 0); $("ansND").value = fmt(d.ND / 1e10, 3); $("ansV").value = fmt(d.V, 0);
    if (state.dKnown) $("repD").value = fmt(state.dKnown, 2);
    const ev = P.evaluateDesign(state.caso, d);
    if (ev.valid && state.dKnown) { $("repV").value = fmt(ev.vdep, 0); }
    if (ev.valid && state.dKnown) $("repI").value = fmt(Math.log10(Math.max(P.generationCurrentPA(d.T, P.crystalVolumeCm3(state.dKnown)), 1e-300)), 1);
  };
  D.run = () => {
    const c = state.caso, des = labDesign(), cr = P.carriers(des.T, des.ND), valid = cr.ratioNi <= 0.1 && cr.fraction >= 0.9;
    const vdep = P.depletionVoltage(des.ND, c.d), saturated = vdep <= c.Vmax;
    const vTop = saturated ? Math.min(c.Vmax, P.niceTicks(0, 3 * vdep, 4).ticks.slice(-1)[0] || c.Vmax) : c.Vmax;
    const curve = samples(0, vTop, 80, (V) => P.capacitancePF(Math.max(V, vTop / 400), des.ND, c.d)).map((p) => ({ V: p.x, C: p.y }));
    const Csat = P.capacitancePF(c.Vmax, des.ND, c.d), d = valid && saturated ? P.thicknessFromCapacitanceCm(Csat) : null;
    if (d) state.dKnown = d; else if (valid) state.dBound = Math.max(state.dBound, P.depletionWidthCm(c.Vmax, des.ND, 100));
    state.used += 1; // cada ensaio C–V gasta 1 do orçamento (a versão anterior não contava)
    state.lastC = { design: des, valid, saturated, curve, vTop, Csat, d, vdep, at: state.time };
    state.log.push(state.lastC);
    state.cache = {};
  };
  D.logHtml = () => {
    if (!state.log.length) return "";
    const rows = state.log.slice(-8).map((r) => `<tr><td>${fmt(r.design.T, 0)} K · ${sci(r.design.ND, 1)}</td><td class="${r.valid ? "" : "bad"}" colspan="2">${!r.valid ? "inválido (congelado ou intrínseco)" : r.saturated ? `C<sub>sat</sub> = ${fmt(r.Csat, 1)} pF` : "não saturou até V<sub>máx</sub>"}</td></tr>`).join("");
    return `<tr><th>T · N_D (cm⁻³)</th><th colspan="2">resultado</th></tr>${rows}`;
  };
  D.fmtComp = (c) => {
    switch (c.key) {
      case "gen": return [`${sci(c.value, 1)} pA`, `≤ ${fmt(c.limit, 0)} pA`];
      case "ion": return [`${fmt(c.value * 100, 2)} %`, `≥ ${fmt(c.limit * 100, 1)} %`];
      case "depl": return [`${fmt(c.value, 0)} V`, `≥ ${fmt(c.limit, 0)} V`];
      case "vmax": return [`${fmt(c.value, 0)} V`, `≤ ${fmt(c.limit, 0)} V`];
      case "cool": return [`${fmt(c.value, 1)} W`, `≤ ${fmt(c.limit, 0)} W`];
      case "rep-d": return [`${fmt(c.value, 2)} cm`, `${fmt(c.limit, 2)} cm`];
      case "rep-v": return [`${fmt(c.value, 0)} V`, `${fmt(c.limit, 0)} V`];
      case "rep-i": return [fmt(c.value, 1), fmt(c.limit, 1)];
      default: return [fmt(c.value, 1), fmt(c.limit, 1)];
    }
  };
  D.referenceHtml = (caso) => {
    const r = P.solveReference(caso);
    if (!r) return "<p>Sem solução de referência.</p>";
    const h = caso.hidden;
    return `<div class="ref-box"><b>Solução de referência (modo professor)</b><br>solver: T = ${fmt(r.T, 1)} K, N_D = ${sci(r.ND, 2)} cm⁻³, V = ${fmt(r.V, 0)} V; janela de T para essa dopagem: ${fmt(r.window.Tlow, 0)}–${fmt(r.window.Thigh, 0)} K (T<sub>f</sub> = ${fmt(r.window.Tf, 0)} K, T<sub>refrig.</sub> = ${fmt(r.window.Tc, 0)} K, T<sub>ger</sub> = ${fmt(r.window.Tg, 0)} K).<br>cristal: d = ${fmt(caso.d, 1)} cm, V<sub>máx</sub> = ${fmt(caso.Vmax, 0)} V, P<sub>máx</sub> = ${fmt(caso.Pmax, 0)} W${caso.kind === "rich" ? " (criostato folgado: tentação de esfriar até congelar)" : caso.kind === "ln2" ? " (cabe o N₂ líquido de 77 K)" : " (orçamento curto: 77 K não cabe)"}. Leituras: d = ${fmt(r.rep.d, 1)} cm, V<sub>dep</sub> = ${fmt(r.rep.vdep, 0)} V, log(I<sub>ger</sub>/pA) = ${fmt(r.rep.logI, 1)}.<br>Resposta da previsão: ${fmt(caso.predAnswerK, 0)} K (cristal-exemplo de ${fmt(caso.predVolume, 0)} cm³). Projeto oculto: N_D = ${sci(h.ND, 2)}, T = ${fmt(h.T, 0)} K.</div>`;
  };
  D.referenceAnswer = (caso) => { const r = P.solveReference(caso); return { T: r.T, ND: r.ND, V: r.V, rep: r.rep }; };

  // ---------- curvas em cache
  function carriersCurve(ND) {
    const key = "c" + ND.toFixed(0) + "|" + state.caso.seed; if (state.cache[key]) return state.cache[key];
    const pts = samples(1, Math.log10(300), 90, (lt) => { const T = 10 ** lt, c = P.carriers(T, ND); return c; }).map((p) => ({ x: p.x, T: 10 ** p.x, c: p.y }));
    return (state.cache[key] = pts);
  }
  // O limite superior T_ger depende do volume (de d): sem o ensaio C–V ele não é conhecido e a janela não é desenhada.
  function windowMap() {
    const c = state.caso, key = "m" + c.seed + "|" + c.levelId + "|" + (state.dKnown || 0); if (state.cache[key]) return state.cache[key];
    const rows = []; for (let x = 9; x <= 12.5 + 1e-9; x += 0.1) { const ND = 10 ** x, Tf = P.freezeTemperature(ND, c.level.fMin), Tc = P.coolingMinTemperatureK(c.Pmax), Tlow = Math.max(Tf, Tc), Tg = state.dKnown ? P.temperatureForGeneration(c.level.iMaxPA, P.crystalVolumeCm3(state.dKnown)) : NaN; rows.push({ x, ND, Tf, Tg, Tlow, ok: Number.isFinite(Tg) && Tlow < Tg }); }
    return (state.cache[key] = rows);
  }
  const NMAX = () => (state.dKnown ? P.maxDoping(state.caso.Vmax, state.dKnown, state.caso.level.over) : null);
  const yLabelsLog = (y) => `10${sup(Math.round(y))}`;

  // ---------- inset: doadores neutros (elétron preso) ou ionizados (elétron livre)
  function donorInset(ctx, x0, y0, w, h, frac, T) {
    ctx.save(); ctx.fillStyle = "rgba(251,252,250,.92)"; ctx.strokeStyle = C.grid; ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h); ctx.restore();
    const n = 10, cols = 5, t = state.time, speed = Math.sqrt(T / 300);
    for (let i = 0; i < n; i += 1) {
      const cx = x0 + 14 + (i % cols) * ((w - 28) / (cols - 1)), cy = y0 + 34 + Math.floor(i / cols) * ((h - 50) / 1.5), neutral = (i + 0.5) / n >= frac;
      dot(ctx, cx, cy, neutral ? C.gray : C.red, 4.2); label(ctx, neutral ? "As" : "As⁺", cx, cy + 14, C.gray, "center", "8px Ubuntu, system-ui");
      if (neutral) { const a = t * 2.4 + i; dot(ctx, cx + 8 * Math.cos(a), cy + 5 * Math.sin(a), C.blue, 2.2); }
      else { const a = t * 1.6 * speed + i * 1.7; dot(ctx, cx + 14 * Math.sin(a * 1.3 + i) + 6, cy - 10 + 6 * Math.sin(a * 2.1), C.blue, 2.4); }
    }
    label(ctx, `doadores: ${fmt(frac * 100, 1)} % ionizados`, x0 + w / 2, y0 + 11, C.ink, "center", "bold 9px Ubuntu, system-ui");
  }

  // ---------- 01 · missão
  // A tela da Missão não entrega a previsão: só mostra banhos de referência, sem faixas de congelamento ou de nᵢ.
  D.drawMission = () => {
    const c = state.caso, main = canvas("mainCanvas", .46, 300), ctx = main.ctx, x0 = 40, x1 = main.w - 24, y0 = 74, y1 = Math.min(main.h - 84, y0 + 70);
    const X = (T) => x0 + (logT(T) - logT(4)) * (x1 - x0) / (logT(300) - logT(4));
    const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, "#9fb8d6"); g.addColorStop(.5, "#e8eee8"); g.addColorStop(1, "#e9a23b"); ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    label(ctx, "janela de operação: a descobrir (aba Laboratório)", (x0 + x1) / 2, (y0 + y1) / 2 + 4, C.green, "center", "bold 12px Ubuntu, system-ui");
    [[4, "He líquido 4 K"], [77, "N₂ líquido 77 K"], [195, "gelo seco 195 K"], [300, "ambiente 300 K"]].forEach(([T, name], i) => {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(T), y0 - 6 - (i % 2) * 14); ctx.lineTo(X(T), y1); ctx.stroke(); ctx.setLineDash([]);
      labelBox(ctx, name, X(T) + (T > 250 ? -3 : 3), y0 - 8 - (i % 2) * 14, C.ink, T > 250 ? "right" : "left", "10px Ubuntu, system-ui");
    });
    T_TICKS.concat([4]).forEach((T) => label(ctx, `${T}`, X(T), y1 + 14, C.gray, "center", "10px Ubuntu, system-ui")); label(ctx, "temperatura T (K, escala logarítmica)", (x0 + x1) / 2, y1 + 30, C.gray, "center", "11px Ubuntu, system-ui");
    // gama chegando ao cristal (decorativo)
    const cy = y1 + 64, cw = Math.min(180, (x1 - x0) * .4), cx0 = x0 + 10;
    if (cy + 26 < main.h) { ctx.fillStyle = "#cfd8d2"; ctx.fillRect(cx0, cy - 14, cw, 30); ctx.strokeStyle = C.ink; ctx.strokeRect(cx0, cy - 14, cw, 30); label(ctx, "cristal de Ge (d desconhecida)", cx0 + cw / 2, cy + 5, C.ink, "center", "10px Ubuntu, system-ui");
      for (let i = 0; i < 3; i += 1) { const ph = (state.time * .8 + i / 3) % 1; ctx.globalAlpha = 1 - ph * .6; dot(ctx, cx0 - 30 + ph * 60, cy - 30 + ph * 28, C.gold, 3.2); ctx.globalAlpha = 1; } }
    textsOnce({ status: "Missão", detail: `semente ${state.seed} · ${c.level.name}`, title: "Temperaturas de trabalho e as duas pressões sobre T", subtitle: "um limite pelo lado quente, outro pelo lado frio: onde fica a janela depende do seu cristal e do seu orçamento",
      caption: "Detectores de germânio operam refrigerados. Esfriar tem um benefício e dois custos: o benefício é reduzir a corrente de geração térmica (que vira ruído); os custos são o congelamento dos doadores e a potência do refrigerador. A escala acima só marca banhos de referência; a janela de operação do seu caso você descobre no Laboratório. Dados sintéticos e didáticos (veja o limite do modelo).",
      prediction: state.predQualLocked ? "Sua previsão qualitativa está registrada. A previsão numérica vem no Laboratório, antes do primeiro ensaio." : D.qualItems()[0].q + " Escolha na coluna à esquerda e registre antes de abrir o Laboratório.",
      calculation: `I<sub>ger</sub> = e·n<sub>i</sub>·V/(2τ), V = A·d, τ = 1 ms<br>n<sub>i</sub> = √(N<sub>c</sub>N<sub>v</sub>) exp(−E<sub>g</sub>/2k<sub>B</sub>T)<br><b>V<sub>dep</sub> = eN<sub>D</sub>d²/(2ε)</b><small>P<sub>el</sub> = Q<sub>p</sub>(300 − T)/(φT), Q<sub>p</sub> = 2 W, φ = 0,1</small>`,
      metrics: [["V máx.", `${fmt(c.Vmax, 0)} V`], ["P máx. de refrigeração", `${fmt(c.Pmax, 0)} W`], ["I_ger máx.", `${fmt(c.level.iMaxPA, 0)} pA`], ["fração ionizada mín.", `${fmt(c.level.fMin * 100, 1)} %`], ["ensaios C–V", `${c.level.budget}`], ["espessura d", "desconhecida"]],
      conceptTitle: "Ideia física", concept: "Um doador raso é uma delta atrativa (Aula 9): ele prende o elétron com E_b = 12,7 meV, e o fator de Boltzmann e^{−E_b/k_B T} (Aula 10) diz quanto da carga está livre em cada T. O gap volumétrico fixa quando os pares térmicos aparecem; a corrente de geração é o que os pares térmicos fazem no detector.",
      prompts: ["Antes do Laboratório, registre a previsão qualitativa: o que o frio faz com os pares térmicos?", "Por que uma dopagem alta não é solução? Que grandeza do cristal você precisa conhecer antes de escolher V?", "Faça o ensaio C–V primeiro (aba Laboratório, painel Depleção e C–V): tudo o mais depende de d."], legend: [[C.green, "janela (a descobrir)"]] });
  };

  // ---------- 02 · laboratório
  function drawCarriers(des, c, ev) {
    const main = canvas("mainCanvas", .6, 360), ctx = main.ctx, curve = carriersCurve(des.ND), d = state.dKnown, win = ev.valid && d ? P.operatingWindow(des.ND, c, d) : null, Tf = P.freezeTemperature(des.ND, c.level.fMin), Tc = P.coolingMinTemperatureK(c.Pmax);
    const YMIN = -8, ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, logT(10), logT(300), YMIN, 16, "temperatura T (K, escala logarítmica)", "concentração (cm⁻³)", { padLeft: 58, xTicks: T_TICKS.map(logT), xLabels: (x) => fmt(10 ** x, 0), yTicks: [-8, -4, 0, 4, 8, 12, 16], yLabels: yLabelsLog });
    if (win && win.ok) { const a = Math.max(10, win.Tlow), b = Math.min(300, win.Thigh); if (b > a) { ctx.fillStyle = "rgba(131,196,78,.20)"; ctx.fillRect(ch.X(logT(a)), ch.top, ch.X(logT(b)) - ch.X(logT(a)), ch.bottom - ch.top); const wb = ch.X(logT(b)) - ch.X(logT(a)); label(ctx, wb > 120 ? "janela de operação" : wb > 55 ? "janela" : "", (ch.X(logT(a)) + ch.X(logT(b))) / 2, ch.top + 14, C.green, "center", "bold 11px Ubuntu, system-ui"); } }
    if (Tf > 10) { ctx.fillStyle = "rgba(69,123,157,.14)"; ctx.fillRect(ch.left, ch.top, ch.X(logT(Math.min(300, Tf))) - ch.left, ch.bottom - ch.top); label(ctx, "congelado", ch.left + 6, ch.top + 14, C.blue, "left", "bold 10px Ubuntu, system-ui"); }
    if (win && win.Tg < 300) { ctx.fillStyle = "rgba(198,92,75,.14)"; ctx.fillRect(ch.X(logT(win.Tg)), ch.top, ch.right - ch.X(logT(win.Tg)), ch.bottom - ch.top); label(ctx, `I_ger > ${fmt(c.level.iMaxPA, 0)} pA`, ch.right - 6, ch.top + 14, C.red, "right", "bold 10px Ubuntu, system-ui"); }
    if (Tc > 10 && Tc < 300) { ctx.strokeStyle = C.gray; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ch.X(logT(Tc)), ch.top); ctx.lineTo(ch.X(logT(Tc)), ch.bottom); ctx.stroke(); ctx.setLineDash([]); label(ctx, "limite do orçamento", ch.X(logT(Tc)) + 4, ch.top + 28, C.gray, "left", "9px Ubuntu, system-ui"); }
    const ys = (f) => curve.map((p) => ({ x: p.x, y: Math.max(YMIN, Math.log10(Math.max(f(p), 1e-300))) }));
    line(ch, [{ x: logT(10), y: Math.log10(des.ND) }, { x: logT(300), y: Math.log10(des.ND) }], C.gold, [7, 5], 2.2);
    line(ch, ys((p) => p.c.ni), C.red, [6, 4], 2.4); line(ch, ys((p) => p.c.n), C.blue, [], 3); line(ch, ys((p) => p.c.ionized), C.violet, [2, 3], 1.5, .8);
    label(ctx, `N_D = ${sci(des.ND, 1)}`, ch.right - 6, ch.Y(Math.log10(des.ND)) - 6, C.gold, "right", "bold 10px Ubuntu, system-ui");
    // com d conhecida: a densidade nᵢ que dá I_ger = I_máx e a temperatura T_ger correspondente
    if (d) { const nlim = 2 * P.TAU_GEN_S * c.level.iMaxPA * 1e-12 / (P.E_CHARGE_C * P.crystalVolumeCm3(d)), Tg = P.temperatureForGeneration(c.level.iMaxPA, P.crystalVolumeCm3(d));
      line(ch, [{ x: logT(10), y: Math.log10(nlim) }, { x: logT(300), y: Math.log10(nlim) }], C.red, [2, 3], 1.8); labelBox(ctx, `nᵢ para I_ger = ${fmt(c.level.iMaxPA, 0)} pA: ${sci(nlim, 1)} cm⁻³`, ch.left + 8, ch.Y(Math.log10(nlim)) - 6, C.red, "left", "10px Ubuntu, system-ui");
      if (Tg >= 10 && Tg <= 300) { dot(ctx, ch.X(logT(Tg)), ch.Y(Math.log10(nlim)), C.red, 4.5); labelBox(ctx, `T_ger = ${fmt(Tg, 0)} K`, ch.X(logT(Tg)) - 8, ch.Y(Math.log10(nlim)) + 16, C.red, "right", "bold 10px Ubuntu, system-ui"); } }
    else labelBox(ctx, "o limite pelo lado quente (I_ger) depende de d: faça o ensaio C–V", ch.left + 8, ch.bottom - 22, C.gray, "left", "10px Ubuntu, system-ui");
    // marcador da temperatura atual
    const pulse = reducedMotion ? 0 : Math.sin(state.time * 4) * 1.5, xT = ch.X(logT(des.T)), yT = ch.Y(Math.max(YMIN, Math.log10(Math.max(ev.valid ? ev.carriers.n : 1, 1e-300))));
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xT, ch.top); ctx.lineTo(xT, ch.bottom); ctx.stroke(); ctx.setLineDash([]);
    glow(ctx, xT, yT, "rgba(69,123,157,.5)", 14 + pulse); dot(ctx, xT, yT, C.blue, 5.5);
    labelBox(ctx, `T = ${fmt(des.T, 0)} K`, xT + (xT > ch.right - 90 ? -6 : 6), ch.bottom - 22, C.ink, xT > ch.right - 90 ? "right" : "left", "bold 10px Ubuntu, system-ui");
    if (ev.valid) donorInset(ctx, ch.right - (main.narrow ? 126 : 172), ch.bottom - (main.narrow ? 92 : 100), main.narrow ? 120 : 166, main.narrow ? 86 : 94, ev.carriers.fraction, des.T);
    return ch;
  }
  function drawWindowMap(des, c, ev) {
    const sec = canvas("secondaryCanvas", .5, 340), ctx = sec.ctx, rows = windowMap(), d = state.dKnown;
    const ch = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, logT(10), logT(300), 9, 12.5, "temperatura T (K, escala logarítmica)", "dopagem de doadores (cm⁻³)", { padLeft: 58, xTicks: T_TICKS.map(logT), xLabels: (x) => fmt(10 ** x, 0), yTicks: [9, 10, 11, 12], yLabels: yLabelsLog });
    const nmax = NMAX(), yMax = nmax ? Math.min(12.5, Math.log10(nmax)) : 12.5;
    if (d) clip(ch, (cc) => {
      cc.fillStyle = "rgba(131,196,78,.30)"; cc.beginPath();
      let started = false; rows.forEach((r) => { if (r.x > yMax || !r.ok) return; const x = ch.X(logT(Math.max(10, r.Tlow))), y = ch.Y(r.x); if (!started) { cc.moveTo(x, y); started = true; } else cc.lineTo(x, y); });
      for (let i = rows.length - 1; i >= 0; i -= 1) { const r = rows[i]; if (r.x > yMax || !r.ok) continue; cc.lineTo(ch.X(logT(Math.min(300, r.Tg))), ch.Y(r.x)); }
      cc.closePath(); cc.fill();
    });
    line(ch, rows.map((r) => ({ x: logT(Math.min(300, Math.max(10, r.Tf))), y: r.x })), C.blue, [], 2.2);
    if (d) { const Tg = rows[0].Tg; line(ch, [{ x: logT(Math.min(300, Tg)), y: 9 }, { x: logT(Math.min(300, Tg)), y: 12.5 }], C.red, [], 2.2); label(ctx, `T_ger = ${fmt(Tg, 0)} K`, ch.X(logT(Math.min(300, Tg))) - 4, ch.top + 12, C.red, "right", "bold 9px Ubuntu, system-ui"); }
    else label(ctx, "T_ger (I_ger = I_máx) depende de d: faça o ensaio C–V", ch.right - 6, ch.top + 12, C.red, "right", "bold 10px Ubuntu, system-ui");
    const Tc = P.coolingMinTemperatureK(c.Pmax); if (Tc > 10) line(ch, [{ x: logT(Tc), y: 9 }, { x: logT(Tc), y: 12.5 }], C.gray, [3, 4], 2);
    if (nmax) { line(ch, [{ x: logT(10), y: Math.log10(nmax) }, { x: logT(300), y: Math.log10(nmax) }], C.gold, [7, 4], 2.4); if (Math.log10(nmax) < 12.5) { clip(ch, (cc) => { cc.fillStyle = "rgba(233,162,59,.18)"; cc.fillRect(ch.left, ch.top, ch.right - ch.left, ch.Y(Math.log10(nmax)) - ch.top); }); label(ctx, `V_dep > V_máx acima de ${sci(nmax, 1)}`, ch.left + 8, ch.Y(Math.log10(nmax)) - 6, C.gold, "left", "bold 10px Ubuntu, system-ui"); } }
    label(ctx, "congelamento", ch.left + 6, ch.bottom - 8, C.blue, "left", "bold 10px Ubuntu, system-ui"); if (d) label(ctx, "I_ger alto", ch.right - 6, ch.bottom - 8, C.red, "right", "bold 10px Ubuntu, system-ui");
    if (Tc > 10 && Tc < 300) label(ctx, "limite de refrigeração", ch.X(logT(Tc)) + 4, ch.top + 26, C.gray, "left", "9px Ubuntu, system-ui");
    const px = ch.X(logT(des.T)), py = ch.Y(Math.log10(des.ND)); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py); ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 12); ctx.stroke();
    glow(ctx, px, py, "rgba(255,255,255,.8)", 10 + (reducedMotion ? 0 : Math.sin(state.time * 4) * 2)); dot(ctx, px, py, !d ? C.gray : ev.valid && ev.checks.slice(0, 2).concat(ev.checks[4]).every((k) => k.ok) ? C.green : C.red, 4.5);
    return nmax;
  }
  function drawDepletion(des, c, ev) {
    const main = canvas("mainCanvas", .46, 330), ctx = main.ctx, d = state.dKnown, cr = ev.valid ? ev.carriers : P.carriers(des.T, des.ND), nEff = des.ND;
    const xd = P.depletionWidthCm(des.V, nEff, d || 100), span = d ? d * 1.12 : 3.4, x0 = 40, x1 = main.w - 36, X = (cm) => x0 + cm * (x1 - x0) / span, y0 = 64, y1 = Math.min(main.h - 70, y0 + Math.max(140, main.h * .5));
    const xs = d ? Math.min(d, xd) : xd, dead = d ? d - xs : 0;
    ctx.fillStyle = "rgba(69,123,157,.20)"; ctx.fillRect(X(0), y0, X(xs) - X(0), y1 - y0);
    if (d && dead > 1e-9) { ctx.fillStyle = "rgba(170,170,171,.30)"; ctx.fillRect(X(xs), y0, X(d) - X(xs), y1 - y0); label(ctx, "zona neutra (morta)", (X(xs) + X(d)) / 2, (y0 + y1) / 2, C.gray, "center", "bold 11px Ubuntu, system-ui"); }
    if (!d) { const g = ctx.createLinearGradient(X(2.6), 0, X(span), 0); g.addColorStop(0, "rgba(251,252,250,0)"); g.addColorStop(1, "rgba(251,252,250,1)"); ctx.fillStyle = g; ctx.fillRect(X(2.6), y0 - 2, X(span) - X(2.6), y1 - y0 + 4); label(ctx, "d = ? (faça o ensaio C–V)", X(span) - 8, y0 - 8, C.gray, "right", "bold 10px Ubuntu, system-ui"); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(X(0), y0, X(d || span) - X(0), y1 - y0);
    ctx.fillStyle = C.red; ctx.fillRect(X(0) - 9, y0, 9, y1 - y0); ctx.fillStyle = C.blue; if (d) ctx.fillRect(X(d), y0, 9, y1 - y0);
    label(ctx, "p⁺ (−)", X(0) - 4, y0 - 8, C.red, "left", "bold 10px Ubuntu, system-ui"); if (d) label(ctx, "n⁺ (+)", X(d) + 4, y0 - 8, C.blue, "right", "bold 10px Ubuntu, system-ui");
    // régua em cm
    const ticks = P.niceTicks(0, d || span, 6).ticks; ticks.forEach((t) => { ctx.strokeStyle = C.faint; ctx.beginPath(); ctx.moveTo(X(t), y1); ctx.lineTo(X(t), y1 + 5); ctx.stroke(); label(ctx, fmt(t, P.listDigits(ticks)), X(t), y1 + 17, C.gray, "center", "10px Ubuntu, system-ui"); }); label(ctx, "profundidade x (cm)", (x0 + x1) / 2, y1 + 32, C.gray, "center", "11px Ubuntu, system-ui");
    // cargas fixas (doadores ionizados) e campo
    const nSites = 26;
    for (let i = 0; i < nSites; i += 1) { const x = X(0) + 14 + (X(xs) - X(0) - 28) * ((i % 13) + .5) / 13, y = y0 + 22 + Math.floor(i / 13) * (y1 - y0 - 44), ion = (i + .5) / nSites < cr.fraction; if (X(xs) - X(0) > 40) label(ctx, ion ? "+" : "○", x, y + 4, ion ? C.red : C.gray, "center", "bold 12px Ubuntu, system-ui"); }
    if (xs > 0.02) for (let i = 0; i < 6; i += 1) { const x = X(0) + (X(xs) - X(0)) * (i + .5) / 6, y = (y0 + y1) / 2; arrow(ctx, x + 10, y, x - 10, y, "rgba(97,155,96,.8)", 2); }
    // pares térmicos (∝ nᵢ/N_D) vagando
    const nTherm = Math.min(40, Math.round(10 * Math.log10(1 + cr.ratioNi * 300)));
    for (let i = 0; i < nTherm; i += 1) { const x = X(xs * (.05 + .9 * (.5 + .5 * Math.sin(i * 7.3 + state.time * .9)))), y = y0 + 8 + (y1 - y0 - 16) * (.5 + .5 * Math.sin(i * 3.1 + state.time * 1.3)); dot(ctx, x, y, i % 2 ? C.blue : C.red, 2.3); }
    if (nTherm) label(ctx, "pares térmicos (corrente de fuga)", X(xs) - 4, y1 - 6, C.red, "right", "10px Ubuntu, system-ui");
    // fótons gama e pares elétron-buraco: derivam só onde há campo
    const period = 2.6;
    for (let k = 0; k < 4; k += 1) {
      const t = (state.time + k * period / 4) % period, ev0 = Math.floor((state.time + k * period / 4) / period), depth = (.12 + .8 * (.5 + .5 * Math.sin(ev0 * 12.9898 + k * 4.1))) * Math.min(span * .9, xs > 0 ? Math.max(xs, .3) * 1.15 : .6), yy = y0 + 30 + 80 * (.5 + .5 * Math.sin(ev0 * 5.7 + k)) % (y1 - y0 - 40);
      const inside = depth <= xs, travel = Math.min(1, t / .5);
      if (t < .5) { ctx.strokeStyle = C.gold; ctx.lineWidth = 2.4; ctx.beginPath(); for (let s = 0; s <= 40 * travel; s += 2) { const px = X(0) - 30 + (X(depth) - X(0) + 30) * s / 40, py = yy - 24 + 24 * s / 40 + 3 * Math.sin(s); s ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
      else { const u = Math.min(1, (t - .5) / 1.6), drift = inside ? u * (X(xs) - X(depth)) * .98 : 0, driftH = inside ? u * (X(depth) - X(0)) * .98 : 0, a = inside ? 1 - Math.max(0, u - .85) * 6 : 1 - u;
        ctx.globalAlpha = Math.max(0, a); glow(ctx, X(depth), yy, "rgba(233,162,59,.6)", 12 * (1 - u * .5)); dot(ctx, X(depth) + drift, yy - 3, C.blue, 3.6); dot(ctx, X(depth) - driftH, yy + 3, C.red, 3.6); ctx.globalAlpha = 1; }
    }
    label(ctx, inside(xs) ? `região depletada x = ${fmt(xs, 2)} cm` : "", X(xs / 2), y0 + 14, C.blue, "center", "bold 10px Ubuntu, system-ui");
    return { xs, d };
    function inside(v1) { return v1 > 0.01; }
  }
  function drawCV(des, c, ev) {
    const sec = canvas("secondaryCanvas", .5, 520), ctx = sec.ctx, wide = !sec.narrow, last = state.lastC, nmax = NMAX();
    const boxA = wide ? { x: 0, y: 0, w: sec.w * .5, h: sec.h } : { x: 0, y: 0, w: sec.w, h: sec.h * .5 }, boxB = wide ? { x: sec.w * .5, y: 0, w: sec.w * .5, h: sec.h } : { x: 0, y: sec.h * .5, w: sec.w, h: sec.h * .5 };
    const vTop = last && last.valid ? last.vTop : c.Vmax;
    if (last && last.valid) {
      const cmax = Math.max(...last.curve.map((p) => p.C)), cTop = Math.max(5, Math.ceil(Math.min(cmax, last.Csat * 8) / 5) * 5);
      const a = axes(sec, boxA, 0, vTop, 0, cTop, "tensão V (V)", "capacitância C (pF)", { padLeft: 46 });
      line(a, last.curve.filter((p) => p.C <= cTop * 1.05).map((p) => ({ x: p.V, y: Math.min(cTop, p.C) })), C.blue, [], 2.8);
      const Vk = Math.min(last.vdep, c.Vmax);
      if (last.saturated) { line(a, [{ x: last.vdep, y: 0 }, { x: last.vdep, y: cTop }], C.gold, [5, 4], 2); line(a, [{ x: 0, y: last.Csat }, { x: vTop, y: last.Csat }], C.green, [5, 4], 1.8); label(ctx, `C_sat = ${fmt(last.Csat, 1)} pF`, a.right - 4, a.Y(last.Csat) - 6, C.green, "right", "bold 10px Ubuntu, system-ui"); label(ctx, `V_dep = ${fmt(last.vdep, 0)} V`, a.X(last.vdep) + 4, a.top + 12, C.gold, "left", "bold 10px Ubuntu, system-ui"); }
      else label(ctx, "C não saturou até V_máx: reduza N_D", a.left + 8, a.top + 14, C.red, "left", "bold 10px Ubuntu, system-ui");
      if (!reducedMotion) { const u = (state.time - last.at) * .5; if (u < 1) dot(ctx, a.X(u * vTop), a.Y(Math.min(cTop, P.capacitancePF(Math.max(u * vTop, vTop / 400), last.design.ND, c.d))), C.ink, 4.5); }
    } else {
      const a = axes(sec, boxA, 0, vTop, 0, 10, "tensão V (V)", "capacitância C (pF)", { padLeft: 46, noY: true });
      label(ctx, last ? "ensaio inválido: T fora da janela extrínseca" : "rode um ensaio C–V (custa 1)", (a.left + a.right) / 2, (a.top + a.bottom) / 2, last ? C.red : C.gray, "center", "bold 12px Ubuntu, system-ui");
      if (last) label(ctx, "congelado ou intrínseco: a capacitância não mede d", (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 16, C.gray, "center", "10px Ubuntu, system-ui");
    }
    // V_dep contra N_D (precisa de d)
    const b = axes(sec, boxB, 9, 12.5, 1, 5, "dopagem N_D (cm⁻³)", "tensão de depleção (V)", { padLeft: 46, xTicks: [9, 10, 11, 12], xLabels: yLabelsLog, yTicks: [1, 2, 3, 4, 5], yLabels: (y) => (y === 5 ? "10⁵" : y === 1 ? "10" : `10${sup(Math.round(y))}`) });
    if (state.dKnown) {
      const d = state.dKnown; line(b, samples(9, 12.5, 60, (x) => Math.log10(Math.max(1, P.depletionVoltage(10 ** x, d)))).map((p) => ({ x: p.x, y: p.y })), C.blue, [], 2.8);
      line(b, [{ x: 9, y: Math.log10(c.Vmax) }, { x: 12.5, y: Math.log10(c.Vmax) }], C.red, [6, 4], 2); label(ctx, `V_máx = ${fmt(c.Vmax, 0)} V`, b.right - 4, b.Y(Math.log10(c.Vmax)) - 5, C.red, "right", "bold 10px Ubuntu, system-ui");
      if (nmax) { line(b, [{ x: Math.log10(nmax), y: 1 }, { x: Math.log10(nmax), y: 5 }], C.gold, [4, 3], 2); clip(b, (cc) => { cc.fillStyle = "rgba(233,162,59,.18)"; cc.fillRect(b.X(Math.log10(nmax)), b.top, b.right - b.X(Math.log10(nmax)), b.bottom - b.top); }); label(ctx, `N_máx = ${sci(nmax, 1)}`, b.X(Math.log10(nmax)) - 4, b.top + 12, C.gold, "right", "bold 10px Ubuntu, system-ui"); }
      dot(ctx, b.X(Math.log10(des.ND)), b.Y(Math.log10(Math.max(1, P.depletionVoltage(des.ND, d)))), C.ink, 5);
    } else label(ctx, "precisa de d (ensaio C–V)", (b.left + b.right) / 2, (b.top + b.bottom) / 2, C.gray, "center", "bold 11px Ubuntu, system-ui");
  }
  D.drawLab = () => {
    const c = state.caso, des = labDesign(), ev = P.evaluateDesign(c, des);
    set("tkOut", `${fmt(des.T, 0)} K`); set("lndOut", `${sci(des.ND, 1)} cm⁻³`); set("vvOut", `${fmt(des.V, 0)} V`);
    document.querySelectorAll("[data-sub]").forEach((b) => { const on = Number(b.dataset.sub) === sub; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    const p = P.coolingPowerW(des.T), cr = P.carriers(des.T, des.ND), d = state.dKnown, win = d ? P.operatingWindow(des.ND, c, d) : null;
    set("powerText", `Refrigeração: ${fmt(p, 1)} W de ${fmt(c.Pmax, 0)} W${p > c.Pmax ? " (acima do orçamento)" : ""} · a 77 K: ${fmt(P.coolingPowerW(77), 1)} W ≈ ${fmt(P.ln2LitersPerDay(), 1)} L/dia de N₂ (calor latente; real: 1 a 3 L/dia, com o dewar)`);
    $("powerFill").style.width = `${Math.min(100, 100 * p / c.Pmax)}%`; $("powerMeter").classList.toggle("low", p > c.Pmax);
    let nmaxTxt = "—";
    const iger = d ? P.generationCurrentPA(des.T, P.crystalVolumeCm3(d)) : NaN;
    const common = { status: "Laboratório", detail: `T = ${fmt(des.T, 0)} K · N_D = ${sci(des.ND, 1)} · V = ${fmt(des.V, 0)} V`, prediction: state.predLocked ? `Sua previsão numérica (travada): ${fmt(state.predValue, 0)} K. A resposta aparece quando a auditoria for liberada.` : D.predQuestion(c) };
    const metrics = [["fração ionizada", `${fmt(cr.fraction * 100, 2)} %`], ["nᵢ", `${sci(cr.ni, 1)} cm⁻³`], ["I_ger (cristal de d)", d ? `${sci(iger, 1)} pA` : "precisa de d"], ["janela de T (esta N_D)", !d ? "precisa de d" : win.ok ? `${fmt(win.Tlow, 0)}–${fmt(win.Thigh, 0)} K` : "sem janela"], ["V_dep", d ? `${fmt(P.depletionVoltage(des.ND, d), 0)} V` : "precisa de d"], ["espessura d (C–V)", d ? `${fmt(d, 2)} cm` : "ainda não medida"]];
    if (sub === 2) {
      drawCarriers(des, c, ev); nmaxTxt = drawWindowMap(des, c, ev);
      textsOnce({ ...common, title: "Portadores livres: congelamento, extrínseco e intrínseco", subtitle: "azul: elétrons livres n(T) · vermelho tracejado: nᵢ(T) · dourado: N_D",
        caption: `Em baixas temperaturas o fator e^{−E_b/k_B T} prende os elétrons nos doadores neutros (congelamento, à esquerda); no platô n ≈ N_D todos os doadores estão ionizados; em altas temperaturas os pares do gap passam a dominar. Leia o gráfico antes dos números: quantas ordens de grandeza nᵢ cai entre 300 K e 77 K? O quadro de doadores mostra a fração ionizada. ${d ? "" : "O limite pelo lado quente (I_ger) só aparece depois do ensaio C–V, porque depende do volume do cristal."}`,
        secondaryTitle: "Janela de operação no plano temperatura × dopagem", secondarySubtitle: "verde: congelamento, corrente de geração e refrigeração satisfeitos · azul: limite de congelamento · vermelho: limite de I_ger",
        secondaryCaption: `A curva azul é T_f(N_D) (ionização ≥ ${fmt(c.level.fMin * 100, 1)} %); a vertical vermelha é T_ger (I_ger = ${fmt(c.level.iMaxPA, 0)} pA, só depende de d); a linha cinza tracejada é o limite do orçamento de refrigeração (${fmt(c.Pmax, 0)} W). ${d ? "A faixa dourada acima de N_máx marca onde a depleção exigiria mais que V_máx." : "O limite superior de N_D (V_dep ≤ V_máx) e T_ger dependem de d: faça o ensaio C–V."} A cruz é o seu ponto atual.`,
        calculation: `n<sub>i</sub> = √(N<sub>c</sub>N<sub>v</sub>) exp(−E<sub>g</sub>(T)/2k<sub>B</sub>T)<br>E<sub>g</sub>(${fmt(des.T, 0)} K) = ${fmt(P.gapEV(des.T), 4)} eV · n<sub>i</sub> = <b>${sci(cr.ni, 2)} cm⁻³</b><br>e<sup>−E<sub>b</sub>/k<sub>B</sub>T</sup> = e<sup>−12,7 meV/${fmt(P.KB_EV_K * des.T * 1000, 2)} meV</sup> = <b>${fmt(P.boltzmannDonor(des.T), des.T < 60 ? 6 : 4)}</b>${d ? `<br>I<sub>ger</sub> = e·n<sub>i</sub>·V/(2τ) = 1,602×10⁻¹⁹ × ${sci(cr.ni, 2)} × ${fmt(P.crystalVolumeCm3(d), 1)} / (2×10⁻³) = <b>${sci(iger, 2)} pA</b>` : ""}<small>fração ionizada = ${fmt(cr.fraction * 100, 3)} % · nᵢ/N_D = ${sci(cr.ratioNi, 2)}</small>`,
        metrics, conceptTitle: "Ideia física", concept: "Um doador de As é a delta atrativa da Aula 9: E_b = 12,7 meV, κ = 0,200 nm⁻¹, σₓ = 3,54 nm. O fator de Boltzmann da Aula 10 compara E_b com k_B T e diz quando o doador ioniza (0,61 a 300 K, 0,15 a 77 K). O gap volumétrico fixa o outro lado: nᵢ, e com ele a corrente de geração, despenca ao esfriar.",
        prompts: ["Leia no gráfico, antes dos números: em quantas ordens de grandeza nᵢ cai de 300 K para 77 K? Depois confirme na conta aberta.", "Desça T até a fração ionizada cair: em que T os doadores congelam? Aumente N_D e veja o que muda. Quanto custa, em watts, chegar lá?", "Com d conhecida, ache T_ger e a janela. Mantendo T = 77 K, varie N_D: a janela do mapa continua cobrindo o seu ponto?"],
        legend: [[C.blue, "n(T)"], [C.red, "nᵢ(T)", true], [C.gold, "N_D", true], [C.green, "janela"]] });
    } else {
      const g = drawDepletion(des, c, ev); drawCV(des, c, ev);
      const vd = d ? P.depletionVoltage(des.ND, d) : null, last = state.lastC;
      textsOnce({ ...common, title: "Depleção: campo, carga espacial e coleta de carga", subtitle: d ? `d = ${fmt(d, 2)} cm (medida pelo ensaio C–V)` : "a espessura d ainda é desconhecida: o ensaio C–V a revela (comece por aqui)",
        caption: `Os doadores ionizados (+) formam a carga espacial; o campo cresce com V e a região depletada x = √(2εV/(eN_D)) avança do contato p⁺ até cobrir d. Só ali um fóton gama cria pares que derivam até os contatos (pontos azuis: elétrons; vermelhos: buracos); na zona neutra os pares recombinam. Pontos vagando são pares térmicos (corrente de geração).`,
        secondaryTitle: "Ensaio C–V e tensão de depleção contra a dopagem", secondarySubtitle: "C = εA/x(V) satura em C_sat = εA/d quando a depleção cobre o cristal; V_dep ∝ N_D",
        secondaryCaption: "À esquerda, o último ensaio: C cai como 1/√V até V_dep e depois fica constante; d = εA/C_sat, com ε = 16ε₀ e A = 10 cm². À direita, V_dep = eN_D d²/(2ε) contra N_D, a tensão máxima e o N_D máximo que o seu cristal admite.",
        calculation: d ? `V<sub>dep</sub> = eN<sub>D</sub>d²/(2ε)<br>= 1,602×10⁻¹⁹ × ${sci(des.ND * 1e6, 2)} m⁻³ × (${fmt(d * 1e-2, 4)} m)² / (2·16·8,854×10⁻¹²)<br><b>= ${fmt(vd, 0)} V</b><small>x(V) = √(2εV/(eN<sub>D</sub>)) = ${fmt(P.depletionWidthCm(des.V, des.ND, 100), 2)} cm para V = ${fmt(des.V, 0)} V${des.V >= vd ? " ≥ d: cobre o cristal" : " < d: depleção parcial"}</small>${last && last.d ? `<small>d = εA/C<sub>sat</sub> = 16·8,854×10⁻¹²·10⁻³ F·m / ${fmt(last.Csat, 1)} pF = ${fmt(last.d, 2)} cm</small>` : ""}` : `x(V) = √(2εV/(eN<sub>D</sub>)) = <b>${fmt(P.depletionWidthCm(des.V, des.ND, 100), 2)} cm</b> para V = ${fmt(des.V, 0)} V<small>Sem d não dá para dizer se isso cobre o cristal. V<sub>dep</sub> = 565 V × (N<sub>D</sub>/10¹⁰) × (d/1 cm)² (exemplo da aula 9).</small>`,
        metrics, conceptTitle: "Ideia física", concept: "A carga que blinda o campo vem dos doadores ionizados, e cada doador é uma delta (Aula 9). Quanto mais doadores, maior a carga espacial e mais tensão para depletar: V_dep ∝ N_D d². Por isso uma dopagem alta esbarra na tensão máxima do isolamento; e d também fixa o volume, logo a corrente de geração.",
        prompts: ["Rode o ensaio com N_D baixo e T moderada: C satura? Leia C_sat e calcule d.", "Rode com T = 10 K: por que o ensaio é inválido?", "Com d conhecida, ache o maior N_D com V_dep ≤ V_máx e compare com a marca dourada."],
        legend: [[C.blue, "elétron (deriva)"], [C.red, "buraco / doador +"], [C.gold, "fóton gama"], [C.green, "campo"]] });
    }
  };

  // ---------- documentos
  D.docMission = () => {
    const c = state.caso, L = c.level;
    const levels = Object.values(P.LEVELS).map((l) => `<div class="level-card ${l.id === state.level ? "on" : ""}"><b>${esc(l.name)}</b> — I_ger ≤ ${fmt(l.iMaxPA, 0)} pA, ionização ≥ ${fmt(l.fMin * 100, 1)} %${l.over ? ", V ≥ 1,10 V_dep (sobretensão de 10 %)" : ""}, ${l.budget} ensaios C–V${l.hints ? ", três dicas graduadas (−4, −6, −10 pontos)" : ""}.</div>`).join("");
    return `<h2>Briefing</h2>
      <p>Um espectrômetro de germânio hiperpuro (HPGe) separa as linhas gama de radionuclídeos usados em medicina nuclear e em controle de qualidade de radiofármacos. Para funcionar, o cristal precisa estar <b>depletado</b> em toda a espessura <b>d</b> (os pares criados pelo fóton são coletados), com <b>pouquíssima corrente de geração térmica</b>, que vira ruído. Você deve escolher a <b>temperatura de operação</b>, a <b>dopagem N_D</b> de arsênio (impureza rasa) e a <b>tensão V</b>.</p>
      <h3>Missão</h3>
      <table><tr><th>restrição</th><th class="num">valor da sua semente (${state.seed})</th></tr>
        <tr><td>corrente de geração: I_ger = e·nᵢ·V/(2τ) ≤ I_máx, com V = A·d (volume do cristal) e τ = 1 ms</td><td class="num">≤ ${fmt(L.iMaxPA, 0)} pA (d desconhecida: meça por C–V)</td></tr>
        <tr><td>doadores não congelados: fração ionizada</td><td class="num">≥ ${fmt(L.fMin * 100, 1)} %</td></tr>
        <tr><td>depleção cobre d: V ≥ V_dep ${L.over ? "× 1,10" : ""}</td><td class="num">d desconhecida: meça por C–V</td></tr>
        <tr><td>dopagem possível: 10⁹ ≤ N_D ≤ 3×10¹² cm⁻³ (o germânio mais puro tem ≈ 10⁹ cm⁻³; N_D é a impureza líquida)</td><td class="num">controle de N_D</td></tr>
        <tr><td>isolamento: V ≤ V_máx</td><td class="num"><b>${fmt(c.Vmax, 0)} V</b></td></tr>
        <tr><td>refrigeração elétrica: P(T) = Q_p(300 − T)/(φT) ≤ P_máx, com Q_p = 2 W e φ = 0,1</td><td class="num"><b>${fmt(c.Pmax, 0)} W</b></td></tr>
        <tr><td>orçamento: ensaios C–V (cada um gasta 1)</td><td class="num">${L.budget}</td></tr></table>
      <p class="note">O cristal tem espessura d entre 0,5 e 3 cm, que você descobre por um ensaio de capacitância: com N_D baixo e T moderada, C cai como 1/√V até a depleção cobrir o cristal e depois satura em C_sat = εA/d (ε = 16ε₀, A = ${P.AREA_CM2} cm²). Comece por esse ensaio: sem d você não conhece V_dep, o volume nem o limite de T. Um ensaio fora da região extrínseca e ionizada (congelado ou intrínseco) não mede d, mas custa igual. A escolha qualitativa (coluna à esquerda) é registrada antes do Laboratório; a previsão numérica, antes do primeiro ensaio.</p>
      <h3>Dados do germânio e do doador (valores de tabela; didáticos)</h3>
      <table><tr><th>grandeza</th><th class="num">valor</th><th>fonte / observação</th></tr>
        <tr><td>E_g(T)</td><td class="num">0,744 − 4,774×10⁻⁴ T²/(T + 235) eV</td><td>Varshni; Thurmond (1975); 0,664 eV a 300 K</td></tr>
        <tr><td>N_c, N_v a 300 K (∝ T^{3/2})</td><td class="num">1,04×10¹⁹ · 6,0×10¹⁸ cm⁻³</td><td>Sze, <i>Physics of Semiconductor Devices</i></td></tr>
        <tr><td>ε</td><td class="num">16 ε₀</td><td>Sze</td></tr>
        <tr><td>doador As: E_b, κ, σₓ</td><td class="num">12,7 meV · 0,200 nm⁻¹ · 3,54 nm</td><td>Aula 9 (delta com m* = 0,12 mₑ); o hidrogenoide dá 6,4 meV e a* = 7,1 nm, que não é a previsão da delta</td></tr>
        <tr><td>tempo de vida de geração τ</td><td class="num">1 ms</td><td>valor didático (extensão; Knoll, cap. 11)</td></tr></table>
      <h3>Níveis</h3>${levels}
      <h3>Como é pontuado (0 a 100)</h3>
      <table><tr><th>parte</th><th class="num">pontos</th></tr><tr><td>acerto: 40 de restrições e 10 de leituras</td><td class="num">50</td></tr><tr><td>previsão (40 % qualitativa, antes do Laboratório; 60 % numérica, antes do primeiro ensaio)</td><td class="num">10</td></tr><tr><td>eficiência: cheia até usar metade dos ensaios; cai linearmente até zero com o orçamento esgotado (multiplicada pelo quadrado da fração da missão cumprida)</td><td class="num">15</td></tr><tr><td>justificativa: três perguntas de conceito (8 + 8 + 9)</td><td class="num">25</td></tr><tr><td>dicas (nível 1): −4, −6 e −10; entrega adicional: −5 cada</td><td class="num">negativo</td></tr></table>
      <p class="note">Depois de entregar você vê a pontuação por parte e, nas reentregas, só quantos conceitos acertou ("n de 3"). Os números do caso e a auditoria completa aparecem com nota ≥ 90 ou na 3ª entrega.</p>
      <div class="limit-band"><b>Limite do modelo.</b> ${pretty(P.LIMITS.replace(/^Limite do modelo: /, ""))}</div>
      ${PROF ? D.referenceHtml(c) : ""}`;
  };
  D.checklistHtml = () => {
    const c = state.caso;
    return `<h2>Antes de entregar</h2><table><tr><td>previsão qualitativa</td><td class="num">${state.predQualLocked ? "registrada" : "ainda não (aba Missão)"}</td></tr><tr><td>previsão numérica</td><td class="num">${state.predLocked ? `${fmt(state.predValue, 0)} K` : "ainda não (digite no Laboratório antes do primeiro ensaio)"}</td></tr><tr><td>ensaios usados</td><td class="num">${state.used} de ${c.level.budget}</td></tr><tr><td>espessura d medida</td><td class="num">${state.dKnown ? "sim" : "não"}</td></tr><tr><td>dicas pedidas</td><td class="num">${state.hints}</td></tr><tr><td>entregas já feitas</td><td class="num">${state.deliveries}</td></tr></table>
      <p>Preencha T, N_D (em unidades de 10¹⁰ cm⁻³), V, as três leituras e as três perguntas à esquerda. Você pode entregar de novo (−5 pontos cada), mas a auditoria e os números do caso só aparecem com nota ≥ 90 ou na 3ª entrega; antes disso você vê só "n de 3 conceitos corretos".</p>${PROF ? D.referenceHtml(c) : ""}`;
  };
  document.querySelectorAll("[data-sub]").forEach((b) => b.addEventListener("click", () => { sub = Number(b.dataset.sub); lastTexts.key = ""; updateUrl(); render(); kick(); }));

  // ================================================================ núcleo: ciclo de vida, entrega e auditoria
  // Texto da física → HTML: ^{…} e _{…} viram sobrescrito e subscrito; _palavra vira subscrito (ex.: V_dep, E_g).
  const pretty = (s) => esc(s).replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>").replace(/_\{([^}]*)\}/g, "<sub>$1</sub>").replace(/_([A-Za-zÀ-ÿ]+)/g, "<sub>$1</sub>");
  const lastTexts = {};
  const textsOnce = (d) => { const key = JSON.stringify(d); if (lastTexts.key === key) return; lastTexts.key = key; texts(d); };

  function buildConceptItems() {
    html("conceptItems", state.items.map((it) => `<fieldset class="choice"><legend>${pretty(it.q)}</legend>${it.options.map((o, i) => `<label><input type="radio" name="c-${it.id}" value="${o.id}" data-item="${it.id}"${state.picked[it.id] === o.id ? " checked" : ""}><span>${"ABCD"[i]}. ${pretty(o.text)}</span></label>`).join("")}</fieldset>`).join(""));
    document.querySelectorAll("[data-item]").forEach((el) => el.addEventListener("change", () => { state.picked[el.dataset.item] = el.value; }));
  }
  // ---------- previsão qualitativa (aba Missão): escolha registrada antes de qualquer conta
  const qualAnswered = () => D.qualItems().every((it) => state.predQual[it.id]);
  function updateQualUi() {
    $("qualBtn").disabled = state.predQualLocked || !qualAnswered();
    set("qualState", state.predQualLocked ? "Previsão qualitativa registrada: não muda mais." : qualAnswered() ? "Clique em Registrar para travar a escolha." : "Responda a todas as perguntas para registrar.");
  }
  function buildQual() {
    html("qualBox", D.qualItems().map((it) => `<fieldset class="choice"><legend>${pretty(it.q)}</legend>${it.options.map((o, i) => `<label><input type="radio" name="q-${it.id}" value="${o.id}" data-qual="${it.id}"${state.predQual[it.id] === o.id ? " checked" : ""}${state.predQualLocked ? " disabled" : ""}><span>${"ABCD"[i]}. ${pretty(o.text)}</span></label>`).join("")}</fieldset>`).join(""));
    document.querySelectorAll("[data-qual]").forEach((el) => el.addEventListener("change", () => { state.predQual[el.dataset.qual] = el.value; updateQualUi(); }));
    updateQualUi();
  }
  function lockQual() {
    if (state.predQualLocked || !qualAnswered()) return false;
    state.predQualLocked = true; buildQual(); lastTexts.key = ""; updateLabUi(); render(); return true;
  }
  function resetCaseState() {
    Object.assign(state, { items: state.caso.items, predQual: {}, predQualLocked: false, pred: "", predLocked: false, predValue: NaN, used: 0, hints: 0, hintTexts: [], log: [], last: null, deliveries: 0, result: null, revealed: false, picked: {}, message: "" });
    if ($("predInput")) { $("predInput").value = ""; $("predInput").disabled = false; }
    D.resetFields(); D.labDefaults(); buildConceptItems(); buildQual();
  }
  function updateUrl() {
    try { const u = new URL(location.href); u.searchParams.set("seed", state.seed); u.searchParams.set("level", state.level); u.searchParams.set("view", view); if (u.searchParams.has("sub") || sub === 2) u.searchParams.set("sub", sub); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
  }
  function newCase(seed, level) {
    state.seed = P.parseSeed(seed); state.level = [1, 2, 3].includes(Number(level)) ? Number(level) : 2;
    state.caso = P.makeCase(state.seed, state.level);
    $("seedInput").value = String(state.seed);
    resetCaseState(); updateUrl(); refreshAll();
  }
  function updateLabUi() {
    const c = state.caso, left = budgetLeft(), total = c.level.budget;
    set("budgetText", `${D.budgetName}: ${left} de ${total}`);
    $("budgetFill").style.width = `${100 * left / total}%`; $("budgetMeter").classList.toggle("low", left <= Math.max(1, Math.floor(total / 4)));
    $("runBtn").disabled = left <= 0; $("runBtn").textContent = left > 0 ? `${D.runName} (−1)` : "Orçamento esgotado";
    html("predQuestion", sx(D.predQuestion(c)));
    set("predState", !state.predQualLocked ? "Antes de simular, registre a previsão qualitativa na aba Missão." : D.numericPred ? (state.predLocked ? `Previsão numérica travada: ${fmt(state.predValue, 1)} ${D.predUnit}.` : "Digite um número; ele trava na primeira simulação.") : "Previsão qualitativa registrada na aba Missão.");
    $("synthLog").innerHTML = D.logHtml();
    $("hintBlock").hidden = !c.level.hints;
    html("hintList", state.hintTexts.map((t) => `<div class="hintbox">${pretty(t)}</div>`).join(""));
    $("hintBtn").disabled = state.hints >= 3; $("hintBtn").textContent = state.hints >= 3 ? "Sem mais dicas" : `Pedir dica ${state.hints + 1} (−${P.HINT_COST[state.hints]} pontos)`;
    document.querySelectorAll("[data-level]").forEach((b) => { const on = Number(b.dataset.level) === state.level; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    set("deliverHint", state.deliveries ? `Entrega nº ${state.deliveries}. Cada entrega adicional custa 5 pontos${state.revealed ? "." : "; a auditoria abre com nota ≥ 90 ou na 3ª entrega."}` : "Você pode entregar mais de uma vez, mas cada entrega adicional custa 5 pontos. A auditoria e os números do caso só abrem com nota ≥ 90 ou na 3ª entrega.");
  }
  function guardRun() {
    if (!state.predQualLocked) {
      if (!qualAnswered()) { set("predState", "Registre a previsão qualitativa na aba Missão antes de simular."); return false; }
      lockQual();
    }
    if (D.numericPred && !state.predLocked) {
      const p = num("predInput");
      if (!Number.isFinite(p)) { set("predState", "Digite uma previsão numérica antes de simular."); $("predInput").focus(); return false; }
      state.predLocked = true; state.predValue = p; $("predInput").disabled = true;
    }
    if (budgetLeft() <= 0) return false;
    return true;
  }
  function doRun() { if (!guardRun()) { updateLabUi(); return; } D.run(); updateLabUi(); render(); kick(); }
  function askHint() {
    if (state.hints >= 3) return;
    state.hintTexts.push(P.hintsFor(state.caso)[state.hints]); state.hints += 1; updateLabUi();
  }

  // ---------- entrega
  function deliver() {
    state.answer = D.readAnswer();
    const prediction = D.numericPred ? (state.predLocked ? state.predValue : num("predInput")) : undefined;
    state.result = P.scoreAnswer(state.caso, state.answer, { used: state.used, hints: state.hints, picked: state.picked, prediction, predQual: D.qualPayload(), deliveryNumber: state.deliveries + 1 });
    state.deliveries += 1; state.resultAt = state.time;
    state.revealed = state.revealed || P.revealPolicy(state.result.score.total, state.deliveries, PROF);
    state.items = P.conceptItems(state.caso, state.deliveries + 1); buildConceptItems(); // a ordem das opções muda a cada entrega
    updateLabUi(); renderDoc(); render(); kick();
    $("docPanel").scrollIntoView && $("docPanel").scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
  }
  function scoreTable(r) {
    const s = r.score, W = P.WEIGHTS, row = (name, got, max) => `<tr><td>${name}</td><td class="num">${fmt(got, 1)} de ${max}</td></tr>`;
    return `<table><tr><th>parte</th><th class="num">pontos</th></tr>${row("acerto do projeto e das leituras", s.parts.acerto, W.acerto)}${row("previsão registrada", s.parts.previsao, W.previsao)}${row(`eficiência (${state.used} de ${state.caso.level.budget} no orçamento)`, s.parts.eficiencia, W.eficiencia)}${row("justificativa (conceitos)", s.parts.justificativa, W.justificativa)}<tr><td>dicas (${state.hints})</td><td class="num">−${fmt(s.dicas, 0)}</td></tr><tr><td>entregas adicionais (${Math.max(0, state.deliveries - 1)} × 5)</td><td class="num">−${fmt(s.reentrega, 0)}</td></tr></table>`;
  }
  // Antes da liberação (nota ≥ 90 ou 3ª entrega) a tabela omite a coluna "exigido": ela revelaria os números do caso.
  function componentTable(r) {
    if (!r.ev.components.length) return `<p class="bad">Projeto fora dos limites do modelo: ${pretty(r.ev.design.reason || "valores inválidos")}. Acerto = 0.</p>`;
    const open = state.revealed;
    const rows = r.ev.components.map((c) => { const [val, lim] = D.fmtComp(c); return `<tr><td>${pretty(c.label)}</td><td class="num">${val}</td>${open ? `<td class="num">${lim}</td>` : ""}<td class="${c.ok ? "ok" : "bad"}">${c.ok ? "atende" : "não atende"}</td><td class="num">${fmt(c.got ?? c.max * (c.frac || 0), 1)} de ${c.max}</td></tr>`; }).join("");
    return `<table><tr><th>critério</th><th class="num">seu valor</th>${open ? '<th class="num">exigido</th>' : ""}<th>situação</th><th class="num">pontos</th></tr>${rows}</table>`;
  }
  function conceptTable(r) {
    return `<table>${state.caso.items.map((it) => { const o = it.options.find((x) => x.id === state.picked[it.id]); return `<tr><td>${pretty(it.q)}</td><td class="${o && o.ok ? "ok" : "bad"}">${!o ? "sem resposta" : o.ok ? "certa" : "revise o conceito"}</td></tr>`; }).join("")}</table>`;
  }
  function auditHtml(answer) {
    const rows = P.auditRows(state.caso, answer).map((a) => `<div class="audit-row"><b>${pretty(a.titulo)}</b><span class="f">${pretty(a.formula)}</span><span class="c">${pretty(a.conta)}</span></div>`).join("");
    return `<h3>Auditoria: a cadeia física com os números do caso</h3>${rows}<div class="limit-band"><b>Limite do modelo.</b> ${pretty(P.LIMITS.replace(/^Limite do modelo: /, ""))}</div>`;
  }
  function resultHtml() {
    const r = state.result, c = state.caso, s = r.score, open = state.revealed, nOk = P.conceptsCorrect(c.items, state.picked);
    const concepts = open ? conceptTable(r) : `<p><b>${nOk} de ${c.items.length} conceitos corretos.</b> Reflita e reentregue (−5 pontos) se quiser tentar de novo: a ordem das opções muda a cada entrega e a tela não diz quais estão certas.</p>`;
    const pred = open ? `Previsão: ${D.predAnswerText(c)} ${D.predSummary(s)}` : `Previsão: vale ${fmt(s.parts.previsao, 1)} de 10. A resposta de referência abre com nota ≥ 90 ou na 3ª entrega.`;
    const audit = open ? auditHtml(state.answer) : `<div class="note"><b>Auditoria bloqueada.</b> A cadeia física com os números do seu caso, os limites exatos e os conceitos certos abrem com nota ≥ 90 ou na 3ª entrega (cada entrega adicional custa 5 pontos). Revise o que não atendeu e o que a Missão já informa.</div>`;
    return `<h2>Resultado · entrega nº ${state.deliveries}</h2>
      <div class="score-big"><strong>${fmt(s.total, 1)}</strong><span>de 100 pontos · semente ${state.seed} · ${esc(c.level.name)}</span></div>
      ${scoreTable(r)}<h3>Critérios do projeto</h3>${componentTable(r)}<h3>Conceitos</h3>${concepts}
      <p class="note">${pred}</p>
      ${audit}${PROF ? D.referenceHtml(c) : ""}`;
  }
  function renderDoc() {
    const el = $("docPanel");
    if (view === "mission") el.innerHTML = sx(D.docMission());
    else if (view === "deliver") {
      if (state.result) el.innerHTML = resultHtml();
      else if (PROF) { const ref = D.referenceAnswer(state.caso); el.innerHTML = D.checklistHtml() + auditHtml(ref); }
      else el.innerHTML = D.checklistHtml();
    }
  }
  // ---------- canvas da entrega: barras da pontuação
  function drawDeliver() {
    const main = canvas("mainCanvas", .42, 300), ctx = main.ctx, r = state.result, c = state.caso;
    const x0 = 150, x1 = main.w - 70, rows = r ? [["acerto", r.score.parts.acerto, 50, C.green], ["previsão", r.score.parts.previsao, 10, C.gold], ["eficiência", r.score.parts.eficiencia, 15, C.blue], ["justificativa", r.score.parts.justificativa, 25, C.violet]] : [["acerto", 0, 50, C.green], ["previsão", 0, 10, C.gold], ["eficiência", 0, 15, C.blue], ["justificativa", 0, 25, C.violet]];
    const prog = r && !reducedMotion ? Math.min(1, (state.time - state.resultAt) * 1.4) : 1, ease = 1 - (1 - prog) ** 3, rowH = Math.min(46, (main.h - 70) / 5);
    rows.forEach(([name, got, max, color], i) => {
      const y = 22 + i * rowH;
      label(ctx, name, x0 - 12, y + 18, C.ink, "right", "12px Ubuntu, system-ui");
      ctx.fillStyle = "#eef2ee"; ctx.fillRect(x0, y + 4, x1 - x0, 20);
      ctx.fillStyle = color; ctx.fillRect(x0, y + 4, (x1 - x0) * (got / max) * ease, 20);
      label(ctx, r ? `${fmt(got * ease, 1)} / ${max}` : `— / ${max}`, x1 + 8, y + 19, C.ink, "left", "bold 11px Ubuntu, system-ui");
    });
    const yT = 22 + 4 * rowH + 10;
    label(ctx, r ? `total ${fmt(r.score.total * ease, 1)}${r.score.dicas + r.score.reentrega ? ` (descontos −${fmt(r.score.dicas + r.score.reentrega, 0)})` : ""}` : "aguardando a entrega", x0, yT + 18, r ? C.green : C.gray, "left", "bold 20px Ubuntu, system-ui");
    if (r && r.score.total >= 90 && !reducedMotion) for (let i = 0; i < 18; i += 1) { const t = (state.time * .6 + i * .37) % 1; ctx.globalAlpha = 1 - t; dot(ctx, x0 + 40 + (i * 53) % (x1 - x0 - 40), yT + 40 - t * 40, [C.lime, C.gold, C.blue][i % 3], 2.5); ctx.globalAlpha = 1; }
    const left = budgetLeft();
    textsOnce({ status: "Entrega", detail: r ? `entrega nº ${state.deliveries} · ${fmt(r.score.total, 1)} pontos` : "aguardando a entrega", title: "Pontuação detalhada", subtitle: "acerto 50 · previsão 10 · eficiência 15 · justificativa 25 · descontos de dicas e reentregas",
      caption: r ? "As barras mostram quanto de cada parte você ganhou. A auditoria abaixo mostra, passo a passo, a física do seu projeto com os números do caso e o limite do modelo." : "Preencha o projeto, as leituras e as perguntas de conceito à esquerda e clique em Entregar. A eficiência só conta na proporção do acerto.",
      prediction: D.predQuestion(c), calculation: `nota = acerto + previsão + eficiência·(missão cumprida)² + justificativa − dicas − 5·reentregas<br><b>${r ? fmt(r.score.total, 1) : "—"}</b> de 100<small>ensaios restantes: ${left} de ${c.level.budget}</small>`,
      metrics: [["entregas", state.deliveries], ["acerto", r ? `${fmt(r.score.parts.acerto, 1)} / 50` : "—"], ["previsão", r ? `${fmt(r.score.parts.previsao, 1)} / 10` : "—"], ["eficiência", r ? `${fmt(r.score.parts.eficiencia, 1)} / 15` : "—"], ["justificativa", r ? `${fmt(r.score.parts.justificativa, 1)} / 25` : "—"], ["descontos (dicas e reentregas)", `−${fmt(r ? r.score.dicas + r.score.reentrega : P.HINT_COST.slice(0, state.hints).reduce((a, b) => a + b, 0), 0)}`]],
      conceptTitle: "Decidir é a tarefa", concept: "Cada critério corresponde a uma decisão de projeto e a um conceito das aulas. A pontuação premia quem decide com a física (poucas medidas, previsão registrada, justificativa) e não só quem acerta por tentativa.",
      prompts: D.deliverPrompts, legend: [[C.green, "acerto"], [C.gold, "previsão"], [C.blue, "eficiência"], [C.violet, "justificativa"]] });
  }

  // ---------------------------------------------------------------- vistas, animação e eventos
  function showPanels() {
    $("docPanel").hidden = view === "lab"; $("mainPanel").hidden = false; $("secPanel").hidden = view !== "lab";
    $("profBadge").hidden = !PROF;
  }
  function render() {
    if (!state.caso) return;
    if (view === "mission") D.drawMission(); else if (view === "lab") D.drawLab(); else drawDeliver();
  }
  function refreshAll() { showPanels(); updateLabUi(); renderDoc(); render(); kick(); }
  let raf = 0;
  function kick() { if (!raf && D.animated(view)) raf = requestAnimationFrame(frame); }
  function frame(now) { raf = 0; state.time = now / 1000; render(); if (D.animated(view)) raf = requestAnimationFrame(frame); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "mission";
    document.querySelectorAll("[data-view]").forEach((b) => { const a = b.dataset.view === view; b.classList.toggle("active", a); b.setAttribute("aria-selected", String(a)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    lastTexts.key = ""; updateUrl(); refreshAll();
  }
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll("[data-view]")], i = tabs.findIndex((t) => t.dataset.view === view);
    const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[j].focus(); switchView(tabs[j].dataset.view);
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => newCase(state.seed, Number(b.dataset.level))));
  $("seedApply").addEventListener("click", () => newCase($("seedInput").value, state.level));
  $("seedInput").addEventListener("keydown", (e) => { if (e.key === "Enter") newCase($("seedInput").value, state.level); });
  $("newCase").addEventListener("click", () => newCase(1 + Math.floor(Math.random() * 9999), state.level));
  $("runBtn").addEventListener("click", doRun);
  $("qualBtn").addEventListener("click", lockQual);
  $("hintBtn").addEventListener("click", askHint);
  $("deliverBtn").addEventListener("click", deliver);
  $("fromLab").addEventListener("click", () => { D.fromLab(); });
  $("resetLab").addEventListener("click", () => { D.labDefaults(); render(); });
  document.querySelectorAll("#simulador input[type=range], #simulador select").forEach((el) => el.addEventListener("input", () => { if (view === "lab") render(); }));
  let resetArmed = 0;
  $("resetBtn").addEventListener("click", () => {
    if (!resetArmed) { resetArmed = setTimeout(() => { resetArmed = 0; $("resetBtn").textContent = "Reiniciar"; }, 3500); $("resetBtn").textContent = "Confirmar"; return; }
    clearTimeout(resetArmed); resetArmed = 0; $("resetBtn").textContent = "Reiniciar"; newCase(state.seed, state.level);
  });
  window.addEventListener("resize", render);
  state.time = performance.now() / 1000;
  newCase(query.get("seed") ?? 1, query.get("level") ?? 2);
  query.forEach((value, key) => { const el = $(key); if (el && !RESERVED.includes(key) && (el.tagName === "INPUT" || el.tagName === "SELECT") && el.type !== "radio") el.value = value; });
  switchView(view);
})();
