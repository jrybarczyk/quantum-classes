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
  let sub = query.get("sub") === "2" ? 2 : 1;

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
  const state = { seed: 1, level: 2, caso: null, items: null, predQual: {}, predQualLocked: false, revealed: false, pred: "", predLocked: false, predValue: NaN, used: 0, hints: 0, hintTexts: [], log: [], last: null, deliveries: 0, result: null, resultAt: 0, picked: {}, time: 0, message: "" };
  const budgetLeft = () => state.caso.level.budget - state.used;

  // ================================================================ específico do desafio 3
  const MAT_COLOR = { CdSe: "#c65c4b", CdTe: "#7b5ea7", InP: "#457b9d" };
  const LAB_DEFAULTS = { mat: "InP", dia: 5, ml: 3 };
  const labDesign = () => ({ material: $("mat").value, D: v("dia"), ml: v("ml") });
  const sameDesign = (a, b) => a && b && a.material === b.material && Math.abs(a.D - b.D) < 1e-9 && a.ml === b.ml;
  const sub2 = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
  const D = { animated: (w) => !reducedMotion && (w === "lab" || w === "mission" || (w === "deliver" && state.result)) };

  D.budgetName = "Sínteses restantes"; D.runName = "Sintetizar e medir";
  D.numericPred = false;
  D.qualItems = () => P.qualPrediction(state.caso);
  D.qualPayload = () => state.predQual;
  D.predAnswerText = (c) => `o poço infinito dá λ MENOR (E₁ maior que o do finito) e a diferença cresce quando o ponto diminui; para o seu projeto de referência o poço infinito erra E₁ₑ em ${fmt(P.emitter(P.solveReference(c)).errInfE, 0)} %.`;
  D.predSummary = (s) => `(você registrou: ${P.qualPrediction(state.caso).map((q) => { const o = q.options.find((x) => x.id === state.predQual[q.id]); return o ? (o.ok ? "certa" : "errada") : "sem resposta"; }).join(" e ")}; a previsão vale ${fmt(s.parts.previsao, 1)} de 10.)`;
  D.deliverPrompts = ["Qual critério lhe custou mais pontos? Que decisão de projeto o corrige?", "Se você pudesse refazer com 2 sínteses a menos, que cálculo prévio teria evitado as outras?", "O poço infinito teria escolhido o mesmo diâmetro? A auditoria (quando abrir) mostra a diferença."];
  D.resetFields = () => {
    ["ansD", "ansMl", "repLam", "repP", "repEta"].forEach((id) => { $(id).value = ""; });
    $("ansMat").value = "InP";
  };
  D.labDefaults = () => { Object.entries(LAB_DEFAULTS).forEach(([id, value]) => { $(id).value = value; }); };
  D.predQuestion = (c) => state.predQualLocked ? "Previsão qualitativa registrada na aba Missão: ela vale 10 pontos (5 por pergunta). A resposta aparece quando a auditoria for liberada." : "Antes de abrir o Laboratório, responda às duas perguntas de previsão na coluna à esquerda (aba Missão): o poço infinito dá um λ maior ou menor que o finito? E, para um ponto menor, a diferença de cor cresce ou cai?";
  D.predUnit = "";
  D.readAnswer = () => ({ material: $("ansMat").value, D: num("ansD"), ml: num("ansMl"), rep: { lambdaNm: num("repLam"), pOutPct: num("repP"), etaPct: num("repEta") } });
  D.fromLab = () => {
    const l = state.last, d = l ? l.design : labDesign();
    $("ansMat").value = d.material; $("ansD").value = fmt(d.D, 2); $("ansMl").value = String(d.ml);
    if (l && l.em.valid) { $("repLam").value = fmt(l.em.lambdaNm, 0); $("repP").value = fmt(l.em.e.pOut * 100, 1); $("repEta").value = fmt(l.em.eta * 100, 1); }
  };
  D.designText = (d) => `${d.material} · D = ${fmt(d.D, 2)} nm · ${d.ml} ML`;
  D.run = () => {
    const des = labDesign(), em = P.synthesize(des);
    state.used += 1; state.last = { design: des, em, at: state.time };
    state.log.push({ design: des, em });
    state.message = em.valid ? "" : em.reason;
  };
  D.logHtml = () => {
    if (!state.log.length) return "";
    const rows = state.log.slice(-8).map((r, i) => `<tr><td>${esc(r.design.material)} ${fmt(r.design.D, 2)} nm/${r.design.ml}</td>${r.em.valid ? `<td>${fmt(r.em.lambdaNm, 0)}</td><td>${fmt(r.em.eta * 100, 0)}</td><td>${fmt(r.em.tox, 2)}</td><td>${fmt(r.em.Dtot, 1)}</td>` : `<td class="bad" colspan="4">${r.em.limited ? "fora do limite didático" : "sem estado ligado"}</td>`}</tr>`).join("");
    return `<tr><th>projeto</th><th>λ (nm)</th><th>η (%)</th><th>tox.</th><th>D<sub>tot</sub></th></tr>${rows}`;
  };
  // formatação dos componentes de pontuação: [valor, exigido]
  D.fmtComp = (c) => {
    switch (c.key) {
      case "lam": return [`${fmt(c.value, 0)} nm`, `≤ ${fmt(c.limit, 0)} nm`];
      case "eta": return [`${fmt(c.value * 100, 1)} %`, `≥ ${fmt(c.limit * 100, 0)} %`];
      case "tox": return [fmt(c.value, 3), `≤ ${fmt(c.limit, 3)}`];
      case "size": return [`${fmt(c.value, 2)} nm`, `≤ ${fmt(c.limit, 1)} nm`];
      case "rep-lam": return [`${fmt(c.value, 0)} nm`, `${fmt(c.limit, 0)} nm`];
      case "rep-p": return [`${fmt(c.value, 1)} %`, `${fmt(c.limit, 1)} %`];
      default: return [`${fmt(c.value, 1)} %`, `${fmt(c.limit, 1)} %`];
    }
  };
  D.referenceHtml = (caso) => {
    const r = P.solveReference(caso);
    if (!r) return "<p>Sem solução de referência (não deveria ocorrer).</p>";
    const h = caso.hidden;
    return `<div class="ref-box"><b>Solução de referência (modo professor)</b><br>solver: ${esc(r.material)}, D = ${fmt(r.D, 2)} nm, ${r.ml} ML de ZnS · leituras ${fmt(r.rep.lambdaNm, 0)} nm, P<sub>fora</sub> ${fmt(r.rep.pOutPct, 1)} %, η ${fmt(r.rep.etaPct, 1)} %.<br>projeto oculto que gerou o caso: ${esc(h.material)}, D = ${fmt(h.D, 2)} nm, ${h.ml} ML. Previsão: poço infinito dá λ menor; a diferença cresce quando o ponto diminui.</div>`;
  };
  D.referenceAnswer = (caso) => { const r = P.solveReference(caso); return { material: r.material, D: r.D, ml: r.ml, rep: r.rep }; };

  // ---------- régua do espectro (300–1100 nm)
  function ruler(sec, y0, y1, o = {}) {
    const ctx = sec.ctx, x0 = 54, x1 = sec.w - 16, X = (nm) => x0 + (nm - 300) * (x1 - x0) / 800;
    for (let nm = 300; nm < 1100; nm += 2) { ctx.fillStyle = emissionColor(nm); ctx.globalAlpha = nm >= 380 && nm <= 750 ? .8 : .3; ctx.fillRect(X(nm), y0, X(nm + 2) - X(nm) + .5, y1 - y0); }
    ctx.globalAlpha = 1;
    const W = P.WINDOW_NM;
    ctx.strokeStyle = "rgba(97,155,96,.95)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(X(W[0]), y0, X(W[1]) - X(W[0]), y1 - y0); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(97,155,96,.8)"; ctx.fillRect(X(W[0]), y1 + 4, X(W[1]) - X(W[0]), 7);
    label(ctx, "janela óptica do tecido (650–950 nm)", X(W[1]) - 2, y1 + 22, C.green, "right", "10px Ubuntu, system-ui");
    if (o.limit && o.limit < 1100) { // λ > hc/E_g: proibido (o confinamento só aumenta a energia)
      ctx.save(); ctx.beginPath(); ctx.rect(X(o.limit), y0, x1 - X(o.limit), y1 - y0); ctx.clip();
      ctx.fillStyle = "rgba(38,49,45,.55)"; ctx.fillRect(X(o.limit), y0, x1 - X(o.limit), y1 - y0);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; for (let k = -(y1 - y0); k < x1 - X(o.limit); k += 9) { ctx.beginPath(); ctx.moveTo(X(o.limit) + k, y1); ctx.lineTo(X(o.limit) + k + (y1 - y0), y0); ctx.stroke(); }
      ctx.restore();
      label(ctx, sec.narrow ? "proibido" : "proibido: λ > hc/Eg", Math.min(x1 - 4, X(o.limit) + 6), (y0 + y1) / 2 + 4, "#fff", "left", "bold 10px Ubuntu, system-ui");
    }
    if (o.target) {
      const a = X(o.target.nm - o.target.tol), b = X(o.target.nm + o.target.tol), pulse = reducedMotion ? 0 : Math.sin(state.time * 3) * 2;
      ctx.fillStyle = "rgba(131,196,78,.30)"; ctx.fillRect(a, y0 - 4, Math.max(3, b - a), y1 - y0 + 8);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(a, y0 - 4, Math.max(3, b - a), y1 - y0 + 8);
      glow(ctx, X(o.target.nm), (y0 + y1) / 2, "rgba(255,255,255,.7)", 14 + pulse);
      label(ctx, `alvo ${fmt(o.target.nm, 0)} ± ${fmt(o.target.tol, 0)} nm`, X(o.target.nm), y1 + 36, C.ink, "center", "bold 10px Ubuntu, system-ui");
    }
    const occupied = []; // faixas [x0, x1] já ocupadas em cada linha de rótulo
    (o.marks || []).slice().sort((a, b) => a.nm - b.nm).forEach((m) => {
      const x = X(m.nm), nearEdge = x > x1 - 130, text = String(m.text);
      if (m.dash) { ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, y0 - 2); ctx.lineTo(x, y1 + 2); ctx.stroke(); ctx.setLineDash([]); }
      else arrow(ctx, x, y0 - 2, x, y1 - 2, m.color, 3);
      ctx.font = "bold 10px Ubuntu, system-ui"; const w = ctx.measureText(text).width + 8, a0 = nearEdge ? x - 4 - w : x + 4, a1 = a0 + w;
      let row = 0; while (occupied[row] && occupied[row].some(([p, q]) => a0 < q + 4 && a1 > p - 4)) row += 1; (occupied[row] = occupied[row] || []).push([a0, a1]);
      labelBox(ctx, text, x + (nearEdge ? -4 : 4), y0 - 8 - row * 14, m.color, nearEdge ? "right" : "left", "bold 10px Ubuntu, system-ui");
    });
    const stepNm = sec.w < 600 ? 200 : 100;
    for (let nm = 300; nm <= 1100; nm += stepNm) label(ctx, nm === 1100 ? "1100 nm" : `${nm}`, X(nm), y1 + 50, C.gray, nm === 1100 ? "right" : "center", "10px Ubuntu, system-ui");
  }

  // ---------- 01 · missão (régua com o alvo e os limites de cada material)
  D.drawMission = () => {
    const c = state.caso, main = canvas("mainCanvas", .46, 300), ctx = main.ctx;
    const y0 = 70, y1 = Math.min(main.h - 92, y0 + 70);
    ruler(main, y0, y1, { target: { nm: c.targetNm, tol: c.level.tolNm }, marks: P.MATERIAL_KEYS.map((k, i) => ({ nm: P.CATALOG[k].bulkNm, text: `${k}: gap ${fmt(P.CATALOG[k].gapEV, 2)} eV → ${fmt(P.CATALOG[k].bulkNm, 0)} nm`, color: MAT_COLOR[k], dash: true, row: i })) });
    textsOnce({ status: "Missão", detail: `semente ${state.seed} · ${c.level.name}`, title: "A cor-alvo e o que cada material consegue", subtitle: "tracejados: gap volumétrico de cada material (λ máximo); faixa verde: cor-alvo ± tolerância",
      caption: "O confinamento quântico só ACRESCENTA energia ao gap, então um ponto de CdSe nunca emite acima de 713 nm. À direita de cada tracejado a emissão é proibida para aquele material. O gap é condição necessária, não suficiente: com os limites didáticos do desafio (núcleo de CdSe até 8 nm), o CdSe chega a 644 nm. A janela óptica (650–950 nm) é onde a luz atravessa o tecido. Catálogo sintético e didático.",
      prediction: D.predQuestion(c), calculation: `λ<sub>máx</sub> = hc/E<sub>g</sub><br><b>CdSe ${fmt(P.CATALOG.CdSe.bulkNm, 0)} · CdTe ${fmt(P.CATALOG.CdTe.bulkNm, 0)} · InP ${fmt(P.CATALOG.InP.bulkNm, 0)} nm</b><small>alvo ${fmt(c.targetNm, 0)} nm ⇒ materiais possíveis: ${P.reachableMaterials(c.targetNm).join(", ") || "nenhum"}</small>`,
      metrics: [["cor-alvo", `${fmt(c.targetNm, 0)} ± ${fmt(c.level.tolNm, 0)} nm`], ["rendimento mínimo", `${fmt(c.etaMin * 100, 0)} %`], ["toxicidade máxima", fmt(c.toxMax, 3)], ["diâmetro total máx.", `${fmt(c.sizeMax, 1)} nm`], ["sínteses", `${c.level.budget}`], ["nível", c.level.name]],
      conceptTitle: "Ideia física", concept: "Elétron e buraco presos no núcleo comportam-se como partículas num poço (Aulas 5 e 8): quanto menor o núcleo, maior a energia de confinamento e mais azul a luz. A casca de ZnS é uma barreira (Aula 7) que mantém as funções de onda longe da superfície.",
      prompts: ["Quais materiais do catálogo podem, em princípio, emitir no alvo? O que decide?", "Leia as restrições: qual delas empurra a casca para cima? Qual a empurra para baixo?", "Registre a previsão qualitativa (coluna à esquerda) antes de abrir o Laboratório."], legend: [[C.green, "janela óptica"], [C.ink, "cor-alvo"], ["#7a1f1f", "falsa cor: infravermelho invisível"]] });
  };

  // ---------- 02 · laboratório
  function drawDot(main, des, free, em, measured) {
    const ctx = main.ctx, mat = P.CATALOG[des.material], R = des.D / 2, d = free.d, rMax = Math.max(4, Math.ceil((R + d + 1.2) * 2) / 2);
    const eTop = mat.V0e + .45, hBot = -mat.gapEV - mat.V0h - .45, ymax = Math.max(eTop, em && em.valid ? em.infiniteEV.e + .15 : 0);
    const ch = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 0, rMax, hBot, ymax, "raio r (nm), do centro à superfície", "energia (eV; zero = fundo da banda de condução do núcleo)", { padLeft: 58, yTicks: P.niceTicks(hBot, ymax, 6).ticks.filter((t) => t > hBot + .05) });
    const xR = ch.X(R), xS = ch.X(R + d), c = ctx;
    c.fillStyle = "rgba(38,49,45,.07)"; c.fillRect(xS, ch.top, ch.right - xS, ch.bottom - ch.top);
    c.fillStyle = "rgba(170,170,171,.20)"; c.fillRect(xR, ch.top, xS - xR, ch.bottom - ch.top);
    c.fillStyle = MAT_COLOR[des.material] + "26"; c.fillRect(ch.left, ch.top, xR - ch.left, ch.bottom - ch.top);
    label(c, des.material, (ch.left + xR) / 2, ch.top + 12, MAT_COLOR[des.material], "center", "bold 11px Ubuntu, system-ui");
    if (d > 0) label(c, "ZnS", (xR + xS) / 2, ch.top + 12, C.gray, "center", "bold 11px Ubuntu, system-ui");
    label(c, "meio", Math.min(ch.right - 14, xS + 22), ch.top + 12, C.gray, "center", "10px Ubuntu, system-ui");
    // bordas das bandas
    c.lineWidth = 3; c.setLineDash([]);
    c.strokeStyle = C.blue; c.beginPath(); c.moveTo(ch.left, ch.Y(0)); c.lineTo(xR, ch.Y(0)); c.lineTo(xR, ch.Y(mat.V0e)); c.lineTo(xS, ch.Y(mat.V0e)); c.lineTo(xS, ch.top); c.stroke();
    c.strokeStyle = C.red; c.beginPath(); c.moveTo(ch.left, ch.Y(-mat.gapEV)); c.lineTo(xR, ch.Y(-mat.gapEV)); c.lineTo(xR, ch.Y(-mat.gapEV - mat.V0h)); c.lineTo(xS, ch.Y(-mat.gapEV - mat.V0h)); c.lineTo(xS, ch.bottom); c.stroke();
    label(c, `V₀ₑ = ${fmt(mat.V0e, 2)} eV`, xR + 6, ch.Y(mat.V0e) - 6, C.blue, "left", "10px Ubuntu, system-ui");
    label(c, `V₀ₕ = ${fmt(mat.V0h, 2)} eV`, xR + 6, ch.Y(-mat.gapEV - mat.V0h) + 14, C.red, "left", "10px Ubuntu, system-ui");
    // gap volumétrico
    const xg = ch.left + 10; arrow(c, xg, ch.Y(0) + 5, xg, ch.Y(-mat.gapEV) - 5, C.gray, 1.5); arrow(c, xg, ch.Y(-mat.gapEV) - 5, xg, ch.Y(0) + 5, C.gray, 1.5);
    label(c, `Eg = ${fmt(mat.gapEV, 2)} eV`, xg + 6, ch.Y(-mat.gapEV / 2) + 4, C.gray, "left", "10px Ubuntu, system-ui");
    // níveis do poço infinito (estimativa grátis)
    const yInfE = free.infE, yInfH = -mat.gapEV - free.infH;
    clip(ch, (cc) => { cc.strokeStyle = C.gray; cc.setLineDash([5, 4]); cc.lineWidth = 1.6; cc.beginPath(); cc.moveTo(ch.left, ch.Y(yInfE)); cc.lineTo(xR, ch.Y(yInfE)); cc.moveTo(ch.left, ch.Y(yInfH)); cc.lineTo(xR, ch.Y(yInfH)); cc.stroke(); cc.setLineDash([]); });
    if (yInfE < ymax) label(c, `poço infinito: E₁ₑ = ${fmt(free.infE, 2)} eV`, ch.left + 44, ch.Y(yInfE) - 4, C.gray, "left", "10px Ubuntu, system-ui");
    else label(c, `poço infinito: E₁ₑ = ${fmt(free.infE, 2)} eV (acima do quadro)`, ch.left + 44, ch.top + 24, C.gray, "left", "10px Ubuntu, system-ui");
    if (measured && em.valid) {
      const yE = em.e.EV, yH = -mat.gapEV - em.h.EV, uE = (r) => (r <= R ? Math.sin(em.e.z * r / R) ** 2 : Math.sin(em.e.z) ** 2 * Math.exp(-2 * em.ke * (r - R)));
      const uH = (r) => (r <= R ? Math.sin(em.h.z * r / R) ** 2 : Math.sin(em.h.z) ** 2 * Math.exp(-2 * em.kh * (r - R)));
      const maxE = Math.max(...samples(0, R, 80, (r) => uE(r)).map((p) => p.y)), maxH = Math.max(...samples(0, R, 80, (r) => uH(r)).map((p) => p.y)), hs = Math.min(.5, (ymax - hBot) * .1);
      const rEnd = Math.min(rMax, R + d);
      const pe = samples(0, rEnd, 160, (r) => yE + hs * uE(r) / maxE), ph = samples(0, rEnd, 160, (r) => yH - hs * uH(r) / maxH);
      clip(ch, (cc) => {
        cc.fillStyle = "rgba(69,123,157,.28)"; cc.beginPath(); cc.moveTo(ch.X(0), ch.Y(yE)); pe.forEach((p) => cc.lineTo(ch.X(p.x), ch.Y(p.y))); cc.lineTo(ch.X(rEnd), ch.Y(yE)); cc.closePath(); cc.fill();
        cc.fillStyle = "rgba(198,92,75,.28)"; cc.beginPath(); cc.moveTo(ch.X(0), ch.Y(yH)); ph.forEach((p) => cc.lineTo(ch.X(p.x), ch.Y(p.y))); cc.lineTo(ch.X(rEnd), ch.Y(yH)); cc.closePath(); cc.fill();
        cc.strokeStyle = C.blue; cc.lineWidth = 2; cc.beginPath(); pe.forEach((p, i) => (i ? cc.lineTo(ch.X(p.x), ch.Y(p.y)) : cc.moveTo(ch.X(p.x), ch.Y(p.y)))); cc.stroke();
        cc.strokeStyle = C.red; cc.beginPath(); ph.forEach((p, i) => (i ? cc.lineTo(ch.X(p.x), ch.Y(p.y)) : cc.moveTo(ch.X(p.x), ch.Y(p.y)))); cc.stroke();
        cc.lineWidth = 2.2; cc.strokeStyle = C.blue; cc.beginPath(); cc.moveTo(ch.left, ch.Y(yE)); cc.lineTo(xR, ch.Y(yE)); cc.stroke();
        cc.strokeStyle = C.red; cc.beginPath(); cc.moveTo(ch.left, ch.Y(yH)); cc.lineTo(xR, ch.Y(yH)); cc.stroke();
      });
      label(c, `E₁ₑ = ${fmt(em.e.EV, 3)} eV (finito)`, ch.left + 44, ch.Y(yE) + 14, C.blue, "left", "bold 10px Ubuntu, system-ui");
      label(c, `E₁ₕ = ${fmt(em.h.EV, 3)} eV`, ch.left + 44, ch.Y(yH) - 6, C.red, "left", "bold 10px Ubuntu, system-ui");
      // portadores oscilando, recombinação periódica e fóton saindo
      const t = state.time, cyc = (t - (state.last ? state.last.at : 0)) % 4.2, rec = cyc > 2.6 ? Math.min(1, (cyc - 2.6) / .5) : 0, emit = cyc > 3.1 ? (cyc - 3.1) / 1.1 : -1;
      const rE = R * (.5 + .42 * Math.sin(t * 2.1)) * (1 - rec * .5), rH = R * (.5 + .42 * Math.sin(t * 1.7 + 2)) * (1 - rec * .5);
      const yeP = ch.Y(yE) + (ch.Y(yH) - ch.Y(yE)) * rec, yhP = ch.Y(yH);
      glow(c, ch.X(rE), yeP, "rgba(69,123,157,.5)", 12); dot(c, ch.X(rE), yeP, C.blue, 5); label(c, "e⁻", ch.X(rE) + 8, yeP - 6, C.blue, "left", "10px Ubuntu, system-ui");
      glow(c, ch.X(rH), yhP, "rgba(198,92,75,.5)", 12); dot(c, ch.X(rH), yhP, C.red, 5); label(c, "h⁺", ch.X(rH) + 8, yhP + 14, C.red, "left", "10px Ubuntu, system-ui");
      const col = emissionColor(em.lambdaNm), xm = ch.X(R * .5), ym = (ch.Y(yE) + ch.Y(yH)) / 2;
      arrow(c, xm, ch.Y(yE) + 8, xm, ch.Y(yH) - 8, C.ink, 1.6);
      { const txt = `E = ${fmt(em.photonEV, 3)} eV · λ = ${fmt(em.lambdaNm, 0)} nm`; c.font = "bold 10px Ubuntu, system-ui"; const flip = xm + 8 + c.measureText(txt).width > ch.right - 4; labelBox(c, txt, flip ? xm - 8 : xm + 8, ym, C.ink, flip ? "right" : "left", "bold 10px Ubuntu, system-ui"); }
      if (emit >= 0) { const x0 = ch.X(R * .5), len = (ch.right - x0 - 6) * Math.min(1, emit); c.strokeStyle = col; c.lineWidth = 2.6; c.beginPath(); for (let s = 0; s <= len; s += 2) { const yy = ym + 7 * Math.sin(s / 5 - state.time * 12), xx = x0 + s; s ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); glow(c, x0 + len, ym, col, 11); }
      // elétrons que vazam: fração ∝ fuga (tunelamento pela casca)
      const nLeak = Math.round(Math.min(1, em.leakE * 12) * 12);
      for (let i = 0; i < nLeak; i += 1) { const ph1 = (t * .5 + i / 12) % 1, rr = R + (d + 1.0) * ph1; c.globalAlpha = 1 - ph1; dot(c, ch.X(Math.min(rMax, rr)), ch.Y(yE) - 4 - 14 * ph1, C.blue, 3); c.globalAlpha = 1; }
      if (nLeak) label(c, "elétrons que escapam", ch.right - 6, ch.Y(yE) - 20, C.blue, "right", "10px Ubuntu, system-ui");
    }
    // inset: seção do nanocristal
    const rad = Math.max(20, Math.min(54, main.w * .075)), cx = ch.right - rad - 10, cy = Math.min(ch.bottom - rad - 24, (ch.Y(-mat.gapEV) + ch.bottom) / 2);
    const scaleTot = rad / Math.max(free.Dtot / 2, 5);
    c.save(); c.globalAlpha = .96; c.fillStyle = "rgba(251,252,250,.9)"; c.fillRect(cx - rad - 8, cy - rad - 8, 2 * rad + 16, 2 * rad + 34); c.restore();
    dot(c, cx, cy, "#d5dbd5", free.Dtot / 2 * scaleTot); dot(c, cx, cy, "#b8bdb8", d > 0 ? free.Dtot / 2 * scaleTot - 1 : 0);
    const col2 = measured && em.valid ? emissionColor(em.lambdaNm) : MAT_COLOR[des.material];
    dot(c, cx, cy, MAT_COLOR[des.material], des.D / 2 * scaleTot); if (measured && em.valid) glow(c, cx, cy, col2, des.D / 2 * scaleTot * (1.6 + .25 * Math.sin(state.time * 4)));
    label(c, `D total = ${fmt(free.Dtot, 1)} nm`, cx, cy + rad + 16, C.ink, "center", "bold 10px Ubuntu, system-ui");
    return ch;
  }
  function drawBars(sec, em, measured, y0, free) {
    const ctx = sec.ctx, x0 = sec.narrow ? 112 : 150, x1 = sec.w - 56, Xl = (pct) => x0 + (Math.log10(Math.max(pct, .1)) + 1) * (x1 - x0) / 3;
    [0.1, 1, 10, 100].forEach((p) => { ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Xl(p), y0 - 4); ctx.lineTo(Xl(p), y0 + 4 * 24 + 2); ctx.stroke(); label(ctx, `${fmt(p, p < 1 ? 1 : 0)} %`, Xl(p), y0 + 4 * 24 + 16, C.gray, "center", "10px Ubuntu, system-ui"); });
    const rows = measured && em.valid ? [["fração fora (e⁻)", em.e.pOut * 100, C.blue], ["exp(−2κd) (e⁻)", em.escE * 100, C.violet], ["fuga total (e⁻ + h⁺)", em.leak * 100, C.red], ["rendimento η", em.eta * 100, C.green]] : [["fração fora (e⁻)", NaN, C.blue], ["exp(−2κd) (e⁻)", NaN, C.violet], ["fuga total (e⁻ + h⁺)", NaN, C.red], ["rendimento η", NaN, C.green]];
    rows.forEach(([name, pct, color], i) => {
      const y = y0 + i * 24; label(ctx, name, x0 - 8, y + 14, C.ink, "right", "10px Ubuntu, system-ui");
      ctx.fillStyle = "#eef2ee"; ctx.fillRect(x0, y + 3, x1 - x0, 15);
      if (Number.isFinite(pct)) { ctx.fillStyle = color; const w = Math.max(2, Xl(pct) - x0) * (reducedMotion ? 1 : Math.min(1, (state.time - (state.last ? state.last.at : 0)) * 2 + .05)); ctx.fillRect(x0, y + 3, w, 15); label(ctx, `${fmt(pct, pct < 1 ? 2 : 1)} %`, x1 + 6, y + 15, C.ink, "left", "bold 10px Ubuntu, system-ui"); }
      else label(ctx, "sintetize para medir", x0 + 8, y + 15, C.gray, "left", "10px Ubuntu, system-ui");
    });
    // tamanho total (escala linear, 0–16 nm): extravasamento/biodistribuição (EPR) e o limiar renal hidrodinâmico de 5,5 nm
    const ys = y0 + 4 * 24 + 40, XL = (nm) => x0 + nm * (x1 - x0) / 16, c = state.caso;
    label(ctx, "tamanho total (EPR)", x0 - 8, ys + 14, C.ink, "right", "10px Ubuntu, system-ui");
    ctx.fillStyle = "#eef2ee"; ctx.fillRect(x0, ys + 3, x1 - x0, 15);
    ctx.fillStyle = C.gold; ctx.fillRect(x0, ys + 3, Math.max(2, XL(free.Dtot) - x0), 15); label(ctx, `${fmt(free.Dtot, 1)} nm`, x1 + 6, ys + 15, C.ink, "left", "bold 10px Ubuntu, system-ui");
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(XL(c.sizeMax), ys - 1); ctx.lineTo(XL(c.sizeMax), ys + 21); ctx.stroke(); label(ctx, `limite ${fmt(c.sizeMax, 1)}`, XL(c.sizeMax) + 3, ys - 4, C.ink, XL(c.sizeMax) > x1 - 70 ? "right" : "left", "10px Ubuntu, system-ui");
    ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(XL(5.5), ys - 1); ctx.lineTo(XL(5.5), ys + 21); ctx.stroke(); ctx.setLineDash([]); label(ctx, "limiar renal 5,5 (hidrodinâmico)", XL(5.5) - 3, ys - 4, C.red, "right", "10px Ubuntu, system-ui");
    [0, 4, 8, 12, 16].forEach((nm) => label(ctx, `${nm}`, XL(nm), ys + 34, C.gray, "center", "10px Ubuntu, system-ui")); label(ctx, "nm", x1 + 6, ys + 34, C.gray, "left", "10px Ubuntu, system-ui");
  }
  D.drawLab = () => {
    const c = state.caso, des = labDesign(), free = P.freeEstimate(des), last = state.last, measured = !!last && sameDesign(last.design, des), em = measured ? last.em : null;
    const dmax = P.CATALOG[$("mat").value].dMaxNm; if (Number($("dia").max) !== dmax) { $("dia").max = dmax; if (v("dia") > dmax) $("dia").value = dmax; }
    des.D = Math.min(des.D, dmax); set("diaOut", `${fmt(des.D, 2)} nm (máx. ${fmt(dmax, 0)} nm)`); set("mlOut", `${des.ml} ML = ${fmt(des.ml * P.ML_NM, 2)} nm (máx. ${P.ML_MAX})`);
    const main = canvas("mainCanvas", .62, 360);
    drawDot(main, des, free, em, measured);
    const sec = canvas("secondaryCanvas", .55, 420), L = c.level.tolNm;
    const marks = [{ nm: free.lambdaInfNm, text: `poço infinito: ${fmt(free.lambdaInfNm, 0)} nm`, color: C.gray, dash: true, row: 0 }];
    if (measured && em.valid) marks.push({ nm: em.lambdaNm, text: `poço finito: ${fmt(em.lambdaNm, 0)} nm`, color: C.ink, row: 1 });
    const y0 = 54, y1 = y0 + 42;
    ruler(sec, y0, y1, { target: { nm: c.targetNm, tol: L }, limit: free.bulkNm, marks });
    label(sec.ctx, "cor emitida contra o alvo", 54, 14, C.gray, "left", "bold 11px Ubuntu, system-ui");
    drawBars(sec, em, measured, y1 + 78, free);
    const mat = P.CATALOG[des.material], R = des.D / 2;
    const z0e = R * Math.sqrt(mat.V0e / (P.HBAR2_OVER_2ME_EV_NM2 / mat.me));
    const calc = measured && em.valid
      ? `z₀ = R√(2mV₀)/ħ = ${fmt(R, 2)}·√(${fmt(mat.V0e, 2)}/(0,0381/${fmt(mat.me, 2)})) = <b>${fmt(em.e.z0, 3)}</b><br>−cot z = √(z₀²/z² − 1) ⇒ z = ${fmt(em.e.z, 3)}<br>E₁ₑ = (ħ²/2m)(z/R)² = <b>${fmt(em.e.EV, 3)} eV</b> · E₁ₕ = ${fmt(em.h.EV, 3)} eV<br>E = ${fmt(mat.gapEV, 2)} + ${fmt(em.e.EV, 3)} + ${fmt(em.h.EV, 3)} = ${fmt(em.photonEV, 3)} eV ⇒ λ = <b>${fmt(em.lambdaNm, 0)} nm</b><small>P<sub>fora</sub>(e) = ${fmt(em.e.pOut * 100, 1)} % · e<sup>−2κd</sup> = ${sci(em.escE, 2)} (κ = ${fmt(em.ke, 2)} nm⁻¹, d = ${fmt(em.d, 2)} nm)</small><small>η = 0,90/(1 + ${sci(em.leak, 2)}/0,05) = ${fmt(em.eta * 100, 1)} %</small>`
      : `estimativa de bolso (poço infinito): E₁ = π²ħ²/(2mR²)<br>elétron: ${fmt(free.infE, 3)} eV · buraco: ${fmt(free.infH, 3)} eV<br>E = ${fmt(mat.gapEV, 2)} + ${fmt(free.infE + free.infH, 3)} = ${fmt(free.photonInfEV, 3)} eV ⇒ λ = <b>${fmt(free.lambdaInfNm, 0)} nm</b><small>${last && !measured ? "A medida acima é de outro projeto: sintetize este para ver o poço finito." : `z₀ do elétron = ${fmt(z0e, 2)}${z0e > Math.PI / 2 ? "" : " ≤ π/2: sem estado ligado (Aula 8)"}. A síntese revela o poço finito, a fuga e o rendimento.`}</small>`;
    const status = last && !last.em.valid && measured ? `Sem estado ligado: ${last.em.reason}` : "";
    textsOnce({ status: "Laboratório", detail: `${des.material} · D = ${fmt(des.D, 2)} nm · ${des.ml} ML`, title: "Banda, função de onda e fuga pela casca", subtitle: measured && em.valid ? "linhas cheias: poço finito (medido) · tracejado cinza: poço infinito (grátis)" : "tracejado cinza: estimativa grátis do poço infinito; sintetize para ver o poço finito",
      caption: `Energia contra o raio. Azul: elétron na banda de condução; vermelho: buraco na banda de valência (a energia do buraco cresce para baixo). A casca de ZnS é a degrau mais alto (Aula 7): a função de onda decai ali como e<sup>−κr</sup>. ${status}`,
      secondaryTitle: "Cor emitida, brilho e tamanho", secondarySubtitle: "régua do espectro com o alvo e o limite do gap; barras de probabilidade em escala logarítmica; tamanho total em escala linear",
      secondaryCaption: "Cinza hachurado: comprimentos de onda acima de hc/E<sub>g</sub>, que o material não pode emitir. Tracejado cinza: poço infinito (estimativa grátis); seta: poço finito (o que a síntese mede). P<sub>fora</sub> é a fração do elétron fora do núcleo; a casca a reduz por e<sup>−2κd</sup>; a fuga restante decide o rendimento. O tamanho total D + 2d é o tamanho para extravasamento e biodistribuição (EPR): o limiar renal de 5,5 nm é hidrodinâmico (com ligante e proteínas o ponto passa de 15 nm), e nenhum projeto cumpre a depuração renal.",
      prediction: D.predQuestion(c),
      calculation: calc,
      metrics: [["D total (D + 2d, EPR)", `${fmt(free.Dtot, 2)} nm`], ["toxicidade (índice)", fmt(free.tox, 3)], ["λ máx. (gap volumétrico)", `${fmt(free.bulkNm, 0)} nm`], ["λ, poço infinito (grátis)", `${fmt(free.lambdaInfNm, 0)} nm`], ["λ, poço finito (medido)", measured && em.valid ? `${fmt(em.lambdaNm, 0)} nm` : "—"], ["rendimento η (medido)", measured && em.valid ? `${fmt(em.eta * 100, 1)} %` : "—"]],
      conceptTitle: "Ideia física", concept: "No poço finito a função de onda vaza para a barreira: a curvatura é menor que no poço infinito e a energia sobe menos (Aula 8). A casca de ZnS é uma barreira de espessura d: a fração que a atravessa cai como e<sup>−2κd</sup> (Aula 7), o que protege o elétron dos estados de superfície, mas engorda o ponto.",
      prompts: ["Compare o λ do poço infinito (grátis) com o do finito (síntese): em que sentido e por quantos nm eles diferem?", "Aumente a casca de 0 a 8 ML: como variam P<sub>fora</sub>, a fuga e o rendimento? E o diâmetro total?", "Troque o material mantendo D: o que muda na cor, mesmo com o mesmo tamanho?"],
      legend: [[C.blue, "elétron"], [C.red, "buraco"], [C.gray, "poço infinito", true], ["#8a8d8a", "ZnS"]] });
  };

  // ---------- documentos (missão e entrega)
  D.docMission = () => {
    const c = state.caso, L = c.level;
    const cat = P.MATERIAL_KEYS.map((k) => { const m = P.CATALOG[k]; return `<tr><td>${k}</td><td class="num">${fmt(m.gapEV, 2)}</td><td class="num">${fmt(m.bulkNm, 0)}</td><td class="num">${fmt(m.me, 2)} · ${fmt(m.mh, 2)}</td><td class="num">${fmt(m.V0e, 2)} · ${fmt(m.V0h, 2)}</td><td class="num">${fmt(m.mismatchPct, 1)} %</td><td>${m.toxElement}</td></tr>`; }).join("");
    const levels = Object.values(P.LEVELS).map((l) => `<div class="level-card ${l.id === state.level ? "on" : ""}"><b>${esc(l.name)}</b> — tolerância de cor ±${fmt(l.tolNm, 0)} nm, ${l.budget} sínteses${l.hints ? ", três dicas graduadas (−4, −6, −10 pontos)" : ""}.${l.id === 3 ? " Restrições de brilho, toxicidade e tamanho bem mais justas." : ""}</div>`).join("");
    return `<h2>Briefing</h2>
      <p>A imagem por fluorescência no infravermelho próximo enxerga mais fundo porque, entre ≈ 650 e 950 nm, a hemoglobina e a água absorvem pouco (janela óptica do tecido). Você é a pessoa responsável pelo projeto de um <b>ponto quântico núcleo/casca</b> que será estudado como marcador. A cor é escolhida pelo material e pelo diâmetro do núcleo; o brilho e a toxicidade, pela casca de ZnS.</p>
      <h3>Missão</h3>
      <p>Escolha o <b>material</b>, o <b>diâmetro D do núcleo</b> e a <b>espessura da casca</b> (monocamadas de 0,31 nm, de 0 a ${P.ML_MAX}) para que o ponto:</p>
      <table><tr><th>restrição</th><th class="num">valor da sua semente (${state.seed})</th></tr>
        <tr><td>emita na cor-alvo (dentro da janela óptica)</td><td class="num"><b>${fmt(c.targetNm, 0)} nm</b> ± ${fmt(L.tolNm, 0)} nm</td></tr>
        <tr><td>brilhe: rendimento quântico η</td><td class="num">≥ ${fmt(c.etaMin * 100, 0)} %</td></tr>
        <tr><td>seja pouco tóxico (índice de íons liberáveis, milhares)</td><td class="num">≤ ${fmt(c.toxMax, 3)}</td></tr>
        <tr><td>tenha diâmetro total D + 2d (tamanho para extravasamento e biodistribuição, EPR)</td><td class="num">≤ ${fmt(c.sizeMax, 1)} nm</td></tr>
        <tr><td>orçamento de sínteses de teste (cada "Sintetizar e medir" gasta 1)</td><td class="num">${L.budget}</td></tr></table>
      <p class="note">O gap volumétrico, a tabela abaixo, a estimativa de bolso do poço infinito (Aula 5), o diâmetro total e a toxicidade são grátis. O que custa uma síntese é a medida real: poço finito, fuga pela casca e rendimento. Primeiro olhe a tabela do gap, depois registre a previsão qualitativa (coluna à esquerda), só então abra o Laboratório.</p>
      <h3>Catálogo de materiais (valores sintéticos e didáticos)</h3>
      <table><tr><th>núcleo</th><th class="num">E<sub>g</sub> (eV)</th><th class="num">λ máx. = hc/E<sub>g</sub> (nm)</th><th class="num">m*ₑ · m*ₕ (mₑ)</th><th class="num">V₀ₑ · V₀ₕ (eV)</th><th class="num">descasamento de rede com ZnS</th><th>íon tóxico</th></tr>${cat}</table>
      <p class="note">Casca de ZnS: E<sub>g</sub> = 3,6 eV, m*ₑ = 0,28 mₑ, m*ₕ = 0,50 mₑ, a = 0,541 nm; V₀ pela regra de Anderson. Os valores de memória (afinidades, massas do CdTe e do ZnS, gap do CdSe em wurtzita com rede de blenda) são <b>didáticos, com incerteza de ≈ ±0,3 eV</b> em V₀. Fontes: Ioffe Institute, Vurgaftman, Meyer e Ram-Mohan, J. Appl. Phys. 89, 5815 (2001), e Adachi, <i>Properties of Group-IV, III-V and II-VI Semiconductors</i> (2005). O confinamento só aumenta a energia: o gap volumétrico é o limite inferior de energia, ou superior de comprimento de onda, de cada material.</p>
      <p class="note"><b>Limites do desafio.</b> Cascas grossas de ZnS sobre núcleos com descasamento de rede de 8 a 16 % exigem camadas intermediárias (CdS, ZnSe), que o modelo não tem: casca de 0 a ${P.ML_MAX} monocamadas. Os maiores pontos de CdSe reais emitem com ≈ 6 a 8 nm: núcleo de CdSe de até ${fmt(P.CATALOG.CdSe.dMaxNm, 0)} nm (emite até 644 nm, abaixo da janela). O tamanho D + 2d é o inorgânico; o limiar de depuração renal é de 5,5 nm hidrodinâmico (Choi et al., 2007), e nenhum projeto aqui o cumpre. Nenhum ponto quântico de Cd está aprovado para uso humano (Nobel de Química de 2023: Ekimov, Brus, Bawendi).</p>
      <h3>Níveis</h3>${levels}
      <h3>Como é pontuado (0 a 100)</h3>
      <table><tr><th>parte</th><th class="num">pontos</th></tr><tr><td>acerto: 40 de restrições (cor, brilho, toxicidade, tamanho) e 10 de leituras</td><td class="num">50</td></tr><tr><td>previsão qualitativa, registrada antes do Laboratório (5 por pergunta)</td><td class="num">10</td></tr><tr><td>eficiência: cheia até usar metade das sínteses; cai linearmente até zero com o orçamento esgotado (multiplicada pelo quadrado da fração da missão cumprida)</td><td class="num">15</td></tr><tr><td>justificativa: três perguntas de conceito (8 + 8 + 9)</td><td class="num">25</td></tr><tr><td>dicas (nível 1): −4, −6 e −10; entrega adicional: −5 cada</td><td class="num">negativo</td></tr></table>
      <p class="note">Depois de entregar você vê a pontuação por parte e, nas reentregas, só quantos conceitos acertou ("n de 3"). Os números do caso e a auditoria completa aparecem com nota ≥ 90 ou na 3ª entrega.</p>
      <div class="limit-band"><b>Limite do modelo.</b> ${pretty(P.LIMITS.replace(/^Limite do modelo: /, ""))}</div>
      ${PROF ? D.referenceHtml(c) : ""}`;
  };
  D.checklistHtml = () => {
    const c = state.caso;
    return `<h2>Antes de entregar</h2><table><tr><td>previsão qualitativa</td><td class="num">${state.predQualLocked ? "registrada" : "ainda não (aba Missão)"}</td></tr><tr><td>sínteses usadas</td><td class="num">${state.used} de ${c.level.budget}</td></tr><tr><td>dicas pedidas</td><td class="num">${state.hints}</td></tr><tr><td>entregas já feitas</td><td class="num">${state.deliveries}</td></tr></table>
      <p>Preencha o projeto, as três leituras e as três perguntas à esquerda. Você pode entregar de novo (−5 pontos cada), mas a auditoria e os números do caso só aparecem com nota ≥ 90 ou na 3ª entrega; antes disso você vê só "n de 3 conceitos corretos".</p>${PROF ? D.referenceHtml(c) : ""}`;
  };

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
      prediction: D.predQuestion(c), calculation: `nota = acerto + previsão + eficiência·(missão cumprida)² + justificativa − dicas − 5·reentregas<br><b>${r ? fmt(r.score.total, 1) : "—"}</b> de 100<small>sínteses restantes: ${left} de ${c.level.budget}</small>`,
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
