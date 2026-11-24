(function () {
  "use strict";
  // Coordena controles, canvas e textos do Desafio 4. A física, o caso por semente e a pontuação estão em physics.js.
  const P = window.UltrasoundPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", violet: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["missao", "lab", "entrega", "bonus"];
  const params = new URLSearchParams(location.search);
  const PROF = params.get("prof") === "1";
  const fmt = (x, n = 2) => P.formatPt(x, n);
  const sci = (x, n = 2) => P.sciPt(x, n);
  // sig: algarismos significativos, científica fora de [10⁻³, 10⁵)
  const sig = (x, n = 3) => { if (!Number.isFinite(x) || x === 0) return fmt(x, 1); const a = Math.abs(x); if (a < 1e-3 || a >= 1e5) return sci(x, n - 1); return fmt(x, Math.max(0, n - 1 - Math.floor(Math.log10(a)))); };
  const tex = (t) => String(t).replace(/\^\(([^)]*)\)/g, "<sup>$1</sup>").replace(/(\S)_([A-Za-zçíóáéãõ±]+)/g, "$1<sub>$2</sub>");
  const set = (id, text) => { $(id).innerHTML = tex(text); };
  const parseNum = (s) => { const t = String(s ?? "").trim().replace(",", "."); return t === "" ? NaN : Number(t); };
  const samples = (a, b, n, fn) => Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; });
  const CAT = P.CATALOG;

  // ---------------------------------------------------------------- caso e estado
  let view = VIEWS.includes(params.get("view")) ? params.get("view") : "missao";
  let seed = Math.max(1, Math.min(999999, Math.floor(Number(params.get("seed"))) || 1));
  let level = [1, 2, 3].includes(Number(params.get("level"))) ? Number(params.get("level")) : 2;
  let cs = P.makeCase(seed, level), lv = P.LEVELS[level];
  let state = freshState();
  function freshState() { return { used: 0, sweeps: 0, direct: false, pred: { value: NaN, locked: false, trueT0: NaN }, hints: [false, false, false], deliveries: 0, shown: null, anim: null, revealed: false, unlocked: false, last: null, lastCfg: null, bonusPts: 0, bonusDone: false }; }
  const storeKey = () => `desafio04-${seed}-${level}`;
  function save() {
    try { sessionStorage.setItem(storeKey(), JSON.stringify({ used: state.used, sweeps: state.sweeps, direct: state.direct, pred: state.pred, hints: state.hints, deliveries: state.deliveries, revealed: state.revealed, unlocked: state.unlocked, lastCfg: state.lastCfg, bonusPts: state.bonusPts, bonusDone: state.bonusDone, ans: readAnswers(), ctl: readCfgRaw(), pr: $("pred").value })); } catch (_) { /* sem armazenamento */ }
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem(storeKey()); if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(state, { used: d.used, sweeps: d.sweeps, direct: d.direct, pred: d.pred, hints: d.hints, deliveries: d.deliveries, revealed: d.revealed, unlocked: !!d.unlocked, lastCfg: d.lastCfg, bonusPts: d.bonusPts || 0, bonusDone: !!d.bonusDone });
      buildConcepts();   // a ordem das opções depende do nº de entregas já feitas
      if (d.pr) $("pred").value = d.pr;
      if (d.ctl) writeCfgRaw(d.ctl);
      if (d.ans) { ["ansT", "ansBw", "ansGain"].forEach((id, i) => { $(id).value = d.ans.raw[i] || ""; }); setTimeout(() => { (d.ans.concepts || []).forEach((v, i) => { const r = document.querySelector(`input[name="cq${i}"][value="${v}"]`); if (r) r.checked = true; }); }, 0); }
      if (state.lastCfg && state.sweeps > 0) state.shown = sweep(state.lastCfg, true);
    } catch (_) { /* estado corrompido: começa do zero */ }
  }

  // ---------------------------------------------------------------- controles
  const DEFAULTS = { nLayers: "1", mat1: "5", d1: 125, mat2: "1", d2: 100, fView: 5 };
  function fillMaterials() {
    const opts = cs.catalogIds.map((i) => `<option value="${i}">${CAT[i].name} — ${fmt(CAT[i].Z, 1)} MRayl, ${CAT[i].c} m/s, custo ${fmt(CAT[i].cost, 1)}</option>`).join("");
    ["mat1", "mat2"].forEach((id) => { $(id).innerHTML = opts; });
    DEFAULTS.mat1 = String(cs.catalogIds.includes(5) ? 5 : cs.catalogIds[cs.catalogIds.length - 2]); DEFAULTS.mat2 = String(cs.catalogIds.includes(1) ? 1 : cs.catalogIds[0]);
  }
  function readCfgRaw() { return { nLayers: $("nLayers").value, mat1: $("mat1").value, d1: $("d1").value, mat2: $("mat2").value, d2: $("d2").value, fView: $("fView").value }; }
  function writeCfgRaw(c) { Object.entries(c).forEach(([k, v]) => { if ($(k)) $(k).value = v; }); }
  function readCfg() { const n = Number($("nLayers").value), layers = []; if (n >= 1) layers.push({ mat: Number($("mat1").value), d: Number($("d1").value) }); if (n >= 2) layers.push({ mat: Number($("mat2").value), d: Number($("d2").value) }); return { layers }; }
  function readAnswers() {
    const raw = ["ansT", "ansBw", "ansGain"].map((id) => $(id).value), v = raw.map(parseNum);
    const concepts = [0, 1, 2].map((i) => { const r = document.querySelector(`input[name="cq${i}"]:checked`); return r ? Number(r.value) : -1; });
    return { raw, values: { tMeanPct: v[0], bwMHz: v[1], gainDB: v[2] }, concepts };
  }

  // ---------------------------------------------------------------- desenho (padrão das aulas 4–10)
  function canvas(id, aspect, minNarrow = 260) {
    const el = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = el.clientWidth || 900, narrow = w < 600, h = narrow ? Math.max(w * aspect, minNarrow) : w * aspect;
    el.width = w * ratio; el.height = h * ratio;
    const ctx = el.getContext("2d"); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#fbfcfa"; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h, narrow };
  }
  function axes(target, box, xMin, xMax, yMin, yMax, xLabel, yLabel, o = {}) {
    const ctx = target.ctx, left = box.x + 54, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - (o.noXLabel ? 22 : 38);
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    const n = o.ticks ?? 5, nx = P.niceTicks(xMin, xMax, o.xTarget ?? Math.min(n, box.w < 420 ? 4 : n)), ny = P.niceTicks(yMin, yMax, n);
    const xt = o.xTicks || nx.ticks, yt = o.yTicks || ny.ticks;
    xt.forEach((x) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? nx.decimals), X(x), bottom + 14); });
    yt.forEach((y) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "right"; ctx.fillText(o.yLabels ? o.yLabels(y) : fmt(y, o.yDigits ?? ny.decimals), left - 6, Y(y) + 3); });
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; if (!o.noXLabel) ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top - 2, ch.right - ch.left, ch.bottom - ch.top + 2); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.6, alpha = 1) { clip(ch, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); }); }
  function vline(ch, x, color, dash = [5, 4], width = 1.4) { clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.X(x), ch.top); c.lineTo(ch.X(x), ch.bottom); c.stroke(); }); }
  function hline(ch, y, color, dash = [5, 4], width = 1.4) { clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.left, ch.Y(y)); c.lineTo(ch.right, ch.Y(y)); c.stroke(); }); }
  function band(ch, x0, x1, color) { clip(ch, (c) => { c.fillStyle = color; c.fillRect(ch.X(x0), ch.top, ch.X(x1) - ch.X(x0), ch.bottom - ch.top); }); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function texts(d) {
    set("statusTitle", d.status); set("statusDetail", d.detail);
    if (d.title !== undefined) { set("mainTitle", d.title); set("mainSubtitle", d.subtitle); set("caption", d.caption); set("secondaryTitle", d.secondaryTitle); set("secondarySubtitle", d.secondarySubtitle); set("secondaryCaption", d.secondaryCaption); $("legend").innerHTML = d.legend.map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-top-style:dashed" : ""}"></i>${tex(text)}</span>`).join(""); }
    set("prediction", d.prediction); $("calculation").innerHTML = tex(d.calculation);
    $("metrics").innerHTML = d.metrics.map(([a, b]) => `<div><dt>${tex(a)}</dt><dd>${tex(b)}</dd></div>`).join("");
    set("conceptTitle", "Ideia física"); set("conceptText", d.concept);
    $("prompts").innerHTML = d.prompts.map((p) => `<li>${tex(p)}</li>`).join("");
  }
  const LIMIT = `<div class="limit">Limite do modelo: incidência normal, sem absorção nem difração, camadas planas e sem perdas, impedâncias independentes da frequência (valores didáticos de resinas carregadas e tecidos de tabela; catálogo e custos são didáticos, não de um transdutor comercial). Não há ressonância do próprio transdutor. O gel só elimina o ar (R ≈ 0,999 sem ele); o descasamento PZT–tecido é o das camadas de casamento do transdutor, e é esse que se projeta aqui.</div>`;
  const DB = "dB = 10 log₁₀ da razão de intensidades: +3 dB = 2×, +6 dB = 4×. Largura a −3 dB: faixa em torno do pico em que T ≥ T_pico/2.";

  // ---------------------------------------------------------------- varredura T(f)
  const FS = Array.from({ length: 285 }, (_, i) => 0.3 + 0.05 * i);
  function sweep(cfg, instant) {
    const ev = P.evaluate(cs, cfg), ts = FS.map((f) => P.transmission(ev.layers, cs.tissue.Z, f));
    return { cfg: JSON.parse(JSON.stringify(cfg)), ev, ts, done: instant ? FS.length : 0 };
  }
  const finished = (sh) => sh && sh.done >= FS.length;
  const stackText = (cfg) => (cfg.layers.length ? cfg.layers.map((l, i) => `${i + 1}: ${CAT[l.mat].name} (${fmt(CAT[l.mat].Z, 1)} MRayl), ${l.d} µm`).join(" · ") : "sem camada (acoplamento direto)");
  const tissueZ = () => (state.direct ? cs.tissue.Z : null);   // impedância do tecido só é "conhecida" depois da medida direta
  const f0 = () => (cs.band.lo + cs.band.hi) / 2;

  // ================================================================ 01 · Missão
  function renderMissao() {
    set("briefSub", `${lv.name} · semente ${seed}`);
    $("briefBody").innerHTML = tex(`
      <p>Um serviço de ultrassom quer trocar o acoplamento de um transdutor de <b>PZT</b> (cerâmica piezoelétrica, Z₁ ≈ 33 MRayl) por uma ou duas <b>camadas de casamento</b> que levem mais intensidade ao <b>tecido</b> (Z₂ entre 1,3 e 1,8 MRayl; qual é, só a medida diz). O exame usa a banda <b>${cs.band.label}</b>: o que importa é a transmissão de intensidade <b>média</b> sobre a banda, não o valor numa frequência só.</p>
      <p>Você escolhe o número de camadas (0, 1 ou 2), o material de cada uma no <b>catálogo</b> e a espessura (5 a 400 µm). A impedância e a velocidade do material vêm do catálogo; a do tecido você mede. A varredura T(f) gasta <b>tempo de bancada</b>.</p>
      <div class="box"><b>Antes de medir</b>, responda no roteiro, sem calcular, a pergunta qualitativa da barra à direita; no Laboratório, digite a sua <b>previsão numérica</b>: que fração da intensidade atravessa <b>sem camada</b>? Ela trava na primeira medida e vale pontos. A pilha que você monta é conhecida (espessura, custo); a transmissão só aparece depois da varredura.</div>`);
    const cat = cs.catalogIds.map((i) => `<tr><td>${CAT[i].name}</td><td class="num">${fmt(CAT[i].Z, 1)}</td><td class="num">${CAT[i].c}</td><td class="num">${fmt(CAT[i].cost, 1)}</td></tr>`).join("");
    const tis = P.TISSUES.map((t) => `<tr><td>${t.name}</td><td class="num">${fmt(t.Z, 2)}</td><td class="num">${t.c}</td></tr>`).join("");
    $("constraintBody").innerHTML = tex(`<table><tr><th>restrição</th><th class="num">limite</th><th>o que a viola</th></tr>
      <tr><td>transmissão média na banda ${cs.band.lo}–${cs.band.hi} MHz</td><td class="num">T̄ ≥ ${fmt(cs.tMinMean * 100, 0)} %</td><td>Z_m longe de √(Z₁Z₂), espessura fora do quarto de onda, banda estreita</td></tr>
      <tr><td>espessura total das camadas</td><td class="num">≤ ${cs.dMaxUm} µm</td><td>camadas grossas demais</td></tr>
      <tr><td>custo do material</td><td class="num">≤ ${fmt(cs.costMax, 1)} u.c.</td><td>materiais muito densos (Z alto) em duas camadas</td></tr></table>
      <p><b>Tecidos possíveis</b> (tabela; um deles é o do seu caso, e só a medida direta diz qual):</p><table><tr><th>tecido</th><th class="num">Z (MRayl)</th><th class="num">c (m/s)</th></tr>${tis}</table>
      <p><b>Catálogo disponível</b> (valores didáticos de resinas carregadas; tungstênio em % de volume, regra das misturas, c ≈ 2100 m/s):</p><table><tr><th>material</th><th class="num">Z (MRayl)</th><th class="num">c (m/s)</th><th class="num">custo</th></tr>${cat}</table>
      <p><b>Tempo de bancada:</b> ${fmt(cs.benchMin, 0)} min no total. Medir o acoplamento direto gasta ${P.DIRECT_MIN} min e cada varredura T(f) gasta ${P.SWEEP_MIN} min.</p>`);
    $("scoreRules").innerHTML = tex(`<table><tr><th>parte</th><th class="num">pontos</th><th>critério</th></tr>
      <tr><td>Acerto técnico</td><td class="num">50</td><td>40 pelas restrições (T̄ 22, espessura 10, custo 8; perde pontos linearmente com a violação, zero a 25 %) + 10 pelos valores T̄, banda −3 dB e ganho em dB que você calcula (tolerância ${Math.round(lv.tol * 100)} %)</td></tr>
      <tr><td>Previsão</td><td class="num">10</td><td>T sem camada previsto contra a medida (cheio dentro de 20 %)</td></tr>
      <tr><td>Eficiência</td><td class="num">15</td><td>cheia até 50 % do tempo de bancada usado, linear até zero em 100 %; multiplicada pelo quadrado da fração da missão cumprida</td></tr>
      <tr><td>Justificativa</td><td class="num">25</td><td>três perguntas "qual conceito decidiu?" (8 + 8 + 9); no roteiro, uma frase de razão por letra</td></tr>
      <tr><td>Descontos</td><td class="num">−</td><td>${lv.hints ? "dicas: 4, 6 e 10 pontos; " : "sem dicas neste nível; "}5 pontos por entrega adicional</td></tr></table>
      <p>A estação extra (aba 04) não vale pontos. O tecido, o Z medido e os conceitos certos só aparecem com nota ≥ 90 ou na 3ª entrega; antes, a tela diz só "n de 3 conceitos corretos". A referência é a pilha de menor custo que cumpre as restrições; outra pilha que cumpra também vale.</p>`);
    $("profCard").hidden = !PROF;
    if (PROF) {
      const sol = P.solve(cs), ev = sol ? P.evaluate(cs, sol.cfg) : null, b = cs.bonus;
      $("profBody").innerHTML = tex(`<p>Tecido: <b>${cs.tissue.name}</b> (Z = ${cs.tissue.Z} MRayl, c = ${cs.tissue.c} m/s) · T₀ = ${fmt(P.FREE_TISSUE_T(cs.tissue), 4)} · banda ${cs.band.lo}–${cs.band.hi} MHz · Z_m ideal (1 camada) = ${fmt(P.quarterWaveZ(P.Z1, cs.tissue.Z), 2)} MRayl.</p>
        <p>Limites: T̄ ≥ ${fmt(cs.tMinMean, 2)}, d ≤ ${cs.dMaxUm} µm, custo ≤ ${cs.costMax}; melhor T̄ do catálogo = ${fmt(cs.bestMean, 3)}.</p>
        ${sol ? `<p>Solução de menor custo (busca exaustiva, passo 10 µm): ${stackText(sol.cfg)} → T̄ = ${fmt(ev.tMean, 3)}, ganho ${fmt(ev.gainDB, 2)} dB, banda −3 dB ${fmt(ev.bw.lo, 2)}–${fmt(ev.bw.hi, 2)} MHz, custo ${fmt(ev.cost, 1)}.</p>` : ""}
        <p>Estação extra: emissor-alvo <b>${P.EMITTERS[b.target].name}</b>, T½ do modelo = ${sig(b.tHalfDays, 3)} d, janela ${sig(b.windowLo, 2)}–${sig(b.windowHi, 2)} d.</p>`);
    }
    texts({ status: "Missão", detail: `${lv.name.split(" — ")[0]} · semente ${seed}`,
      prediction: "O gel entre o transdutor e a pele só elimina o ar (sem ele, R ≈ 0,999). Mesmo sem ar, o PZT (33 MRayl) encosta num tecido de impedância bem menor: a maior parte da intensidade atravessa ou é refletida? E o que as camadas de casamento do transdutor mudariam? Responda no roteiro antes de calcular.",
      calculation: `R = ((Z₁ − Z₂)/(Z₁ + Z₂))² · T = 1 − R<br>camada λ/4: Z_m = √(Z₁Z₂) · d = c_m/(4f₀)<br>T(f) por matriz de transferência<br>ganho (dB) = 10 log₁₀(T̄/T₀)<small>${DB} É a mesma conta do degrau da Aula 7, com k → Z. Os números do seu caso só aparecem depois da medida direta no Laboratório.</small>${LIMIT}`,
      metrics: [["Z₁ (PZT)", "33 MRayl"], ["Z do tecido (tabela)", "1,38 a 1,70 MRayl"], ["banda", `${cs.band.lo}–${cs.band.hi} MHz`], ["camadas", "0, 1 ou 2"], ["materiais no catálogo", String(cs.catalogIds.length)], ["tempo de bancada", `${fmt(cs.benchMin, 0)} min`]],
      concept: "A transmissão de uma interface é a mesma álgebra do degrau de potencial da Aula 7, com k → Z: continuidade de pressão e de velocidade. Uma camada de espessura λ/4 faz a ressonância da barreira (Aula 7, qa = nπ) e anula a reflexão numa frequência; T é razão de correntes (Aula 3).",
      prompts: ["Depois da previsão qualitativa, calcule T sem camada para Z₂ = 1,63 MRayl (tabela): ele cai ou sobe se o tecido for gordura (1,38)?", "Que impedância tem a camada ideal e por que não é a média aritmética de 33 e do tecido?", "Por que a espessura de λ/4 usa a velocidade do material da camada?"] });
  }

  // ================================================================ 02 · Laboratório
  function updateHud() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), rem = Math.max(0, cs.benchMin - state.used), sh = state.shown;
    $("hudCase").textContent = `${seed} · nível ${level}`;
    $("hudBar").style.width = `${Math.max(0, Math.min(100, 100 * rem / cs.benchMin))}%`;
    $("hudSession").textContent = `${fmt(rem, 1)} de ${fmt(cs.benchMin, 0)} min`;
    $("hudAcq").textContent = `${state.sweeps} varreduras${state.direct ? " + acoplamento direto" : ""}`;
    const mark = (id, text, bad) => { const e = $(id); e.textContent = text; e.className = bad ? "bad" : "ok"; };
    mark("hudTime", `${ev.thickness} / ${cs.dMaxUm} µm`, ev.thickness > cs.dMaxUm);
    mark("hudCost", `${fmt(ev.cost, 1)} / ${fmt(cs.costMax, 1)} u.c.`, ev.cost > cs.costMax);
    if (sh && finished(sh)) mark("hudSnr", `${fmt(sh.ev.tMean * 100, 1)} % / ≥ ${fmt(cs.tMinMean * 100, 0)} %`, sh.ev.tMean < cs.tMinMean); else mark("hudSnr", `— / ≥ ${fmt(cs.tMinMean * 100, 0)} %`, false);
  }
  function refreshButtons() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), rem = cs.benchMin - state.used, busy = !!state.anim;
    const predOk = state.pred.locked || parseNum($("pred").value) > 0, n = Number($("nLayers").value);
    $("box1").hidden = n < 1; $("box2").hidden = n < 2;
    $("pred").disabled = state.pred.locked;
    $("predState").textContent = state.pred.locked ? `Previsão travada: T = ${fmt(state.pred.value, 3)}.` : (parseNum($("pred").value) > 0 ? "Previsão pronta: ela trava na primeira medida." : "Digite a previsão (número positivo) para liberar as medidas.");
    let why = "";
    if (!predOk) why = "Registre a previsão para liberar as medidas.";
    else if (rem < P.SWEEP_MIN - 1e-9) why = "Tempo de bancada insuficiente para outra varredura.";
    $("sweepBtn").disabled = busy || !!why; $("sweepBtn").textContent = `Varrer T(f) (−${P.SWEEP_MIN} min)`;
    $("directBtn").disabled = busy || !predOk || state.direct || rem < P.DIRECT_MIN; $("directBtn").textContent = state.direct ? `T sem camada medido: ${fmt(state.pred.trueT0, 3)}` : `Medir sem camada (−${P.DIRECT_MIN} min)`;
    $("acqHint").textContent = why || (ev.thickness > cs.dMaxUm ? `A pilha passa do limite de espessura (${cs.dMaxUm} µm).` : "");
    $("hintBox").hidden = !lv.hints;
    document.querySelectorAll("[data-hint]").forEach((b) => { const i = Number(b.dataset.hint); b.textContent = `Dica ${i + 1} (−${P.HINT_PENALTY[i]})`; b.disabled = state.hints[i]; });
    $("hintList").innerHTML = state.hints.map((u, i) => (u ? `<li>${tex(P.hints(cs)[i].replace(/^Dica \d \(−\d+\): /, ""))}</li>` : "")).join("");
    $("deliverHint").textContent = state.sweeps === 0 ? "Faça ao menos uma varredura no Laboratório antes de entregar." : (state.deliveries ? `Entregas feitas: ${state.deliveries}.` : "");
    $("deliverBtn").disabled = state.sweeps === 0;
  }
  function designLines(cfg) {
    if (!cfg.layers.length) return "sem camada: T = 4Z₁Z₂/(Z₁+Z₂)² (meça o acoplamento direto para obter Z₂)";
    const fz = f0(), zt = tissueZ(), zid = zt === null ? NaN : P.quarterWaveZ(P.Z1, zt);
    return cfg.layers.map((l, i) => { const m = CAT[l.mat], dq = P.quarterWaveUm(m.c, fz); return `camada ${i + 1}: Z = ${fmt(m.Z, 1)} MRayl, λ/4 em f₀ = ${fmt(fz, 1)} MHz: c/(4f₀) = ${m.c}/(4×${fmt(fz, 1)}×10⁶) = <b>${fmt(dq, 0)} µm</b> (você usou ${l.d} µm = ${fmt(l.d / dq, 2)}·λ/4)`; }).join("<br>") + (zt === null ? `<br>Z_m ideal (1 camada) = √(Z₁Z₂) = √(33 × Z₂): meça o acoplamento direto para obter Z₂` : `<br>Z_m ideal (1 camada) = √(Z₁Z₂) = √(33 × ${fmt(zt, 2)}) = <b>${fmt(zid, 2)} MRayl</b>`);
  }
  function drawLab() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), sh = state.shown, fresh = finished(sh);
    $("d1Out").textContent = fmt(Number($("d1").value), 0); $("d2Out").textContent = fmt(Number($("d2").value), 0); $("fOut").textContent = fmt(Number($("fView").value), 1);
    updateHud(); refreshButtons();
    const main = canvas("mainCanvas", .42, 300);
    const A = axes(main, { x: 0, y: 0, w: main.w, h: main.h }, 0, 14, 0, 1.05, "frequência f (MHz)", "transmissão de intensidade T", { ticks: 5, xTicks: [0, 2, 4, 6, 8, 10, 12, 14], yTicks: [0, .2, .4, .6, .8, 1] });
    band(A, cs.band.lo, cs.band.hi, "rgba(233,162,59,.16)");
    label(main.ctx, `banda do exame ${cs.band.lo}–${cs.band.hi} MHz`, A.X(cs.band.lo) + 4, A.top + 12, "#a66c17", "left", "bold 10px Ubuntu, system-ui");
    if (state.direct) hline(A, state.pred.trueT0, C.gray, [2, 4], 1.6);
    if (state.direct) label(main.ctx, `sem camada: T = ${fmt(state.pred.trueT0, 3)}`, A.right - 4, A.Y(state.pred.trueT0) - 5, C.gray, "right", "10px Ubuntu, system-ui");
    if (sh) {
      const upto = sh.done, pts = FS.slice(0, upto).map((f, i) => ({ x: f, y: sh.ts[i] }));
      line(A, pts, C.red, [], 2.8);
      if (fresh) {
        clip(A, (c) => { c.strokeStyle = C.blue; c.lineWidth = 2.2; c.setLineDash([7, 4]); c.beginPath(); c.moveTo(A.X(cs.band.lo), A.Y(sh.ev.tMean)); c.lineTo(A.X(cs.band.hi), A.Y(sh.ev.tMean)); c.stroke(); });
        label(main.ctx, `T̄ = ${fmt(sh.ev.tMean * 100, 1)} %`, A.X(cs.band.hi) + 6, A.Y(sh.ev.tMean) + 4, C.blue, "left", "bold 11px Ubuntu, system-ui");
        const b = sh.ev.bw; vline(A, b.lo, C.violet, [3, 3], 1.4); vline(A, b.hi, C.violet, [3, 3], 1.4);
        label(main.ctx, `−3 dB: ${fmt(b.lo, 1)}–${fmt(b.hi, 1)} MHz`, (A.X(b.lo) + A.X(b.hi)) / 2, A.bottom - 8, C.violet, "center", "bold 10px Ubuntu, system-ui");
      } else label(main.ctx, "varrendo a banda…", A.left + 10, A.top + 28, C.violet, "left", "bold 11px Ubuntu, system-ui");
    } else label(main.ctx, "Use “Varrer T(f)” para medir a transmissão da pilha", (A.left + A.right) / 2, (A.top + A.bottom) / 2, C.gray, "center", "11px Ubuntu, system-ui");
    drawSecondary(0);
    const gain = fresh ? `${fmt(sh.ev.gainDB, 2)} dB` : "—";
    texts({ status: "Laboratório", detail: `${ev.thickness} µm · custo ${fmt(ev.cost, 1)}`,
      title: "Transmissão de intensidade da pilha na banda do exame", subtitle: sh ? `última varredura: ${stackText(sh.cfg)}` : "nenhuma varredura ainda",
      caption: "T(f) é a razão entre o fluxo de intensidade transmitido e o incidente. Uma camada de quarto de onda dá T = 1 numa frequência f₀ (e nos múltiplos ímpares 3f₀, 5f₀…, a ressonância da Aula 7, qa = nπ); confira o que acontece em 2f₀ depois da sua previsão. A faixa dourada é a banda; a linha azul tracejada é o T médio. " + DB,
      secondaryTitle: "Impedâncias, frente de onda e pressão", secondarySubtitle: "acima: blocos de impedância e a frente de onda (dourada) com os ecos de primeira ordem (vermelho) · abaixo: pressão p(x) na frequência f",
      secondaryCaption: "A pressão no transdutor é incidente + refletida (a envoltória tracejada oscila: onda estacionária); no tecido só há onda transmitida. A pilha é a varrida por último; mude f para ver como a reflexão depende da frequência. Os ecos múltiplos dentro das camadas não são desenhados na frente de onda.",
      legend: [[C.red, "T(f)"], [C.gold, "banda"], [C.blue, "T̄", true], [C.violet, "−3 dB", true], [C.gray, "sem camada", true]],
      prediction: "Antes de medir, registre no roteiro: sem camada, a maior parte da intensidade do PZT atravessa até o tecido ou é refletida? Só então digite a estimativa de T (0 a 1) no campo à esquerda. Depois de varrer uma pilha, preveja antes de mexer em f: T(2f₀) sobe, cai ou fica igual ao valor em f₀?",
      calculation: `${designLines(cfg)}<br>espessura total = ${ev.thickness} µm (limite ${cs.dMaxUm}) · custo = ${fmt(ev.cost, 1)} (limite ${fmt(cs.costMax, 1)})<br>${state.direct ? `T sem camada = ${fmt(state.pred.trueT0, 4)} → R = ${fmt(1 - state.pred.trueT0, 4)} → Z do tecido = Z₁(1−√R)/(1+√R) = ${fmt(measuredZ(), 2)} MRayl` : "meça o acoplamento direto para obter Z do tecido"}<small>${DB} Pulso-eco: o feixe cruza a pilha na ida e na volta, então o eco carrega ≈ T² (média de T² na banda).</small>${LIMIT}`,
      metrics: [["T sem camada", state.direct ? fmt(state.pred.trueT0, 3) : "—"], ["Z do tecido (medido)", state.direct ? `${fmt(measuredZ(), 2)} MRayl` : "—"], ["T̄ na banda (pulso-eco T²)", fresh ? `${fmt(sh.ev.tMean * 100, 1)} % (${fmt(sh.ev.tEcho * 100, 1)} %)` : "—"], ["largura a −3 dB", fresh ? `${fmt(sh.ev.bw.width, 2)} MHz` : "—"], ["ganho sobre o direto", gain], ["espessura · custo", `${ev.thickness} µm · ${fmt(ev.cost, 1)}`]],
      concept: "A pilha de camadas é uma barreira com ressonâncias (Aula 7): cada camada tem condições de contorno de pressão e velocidade contínuas, e T(f) sai do produto das matrizes de transferência. O casamento ideal vale numa frequência, e a banda mede-se por T(f). T é razão de correntes de intensidade (Aula 3), por isso R + T = 1.",
      prompts: ["Monte uma camada única com Z perto de √(Z₁Z₂) e d = c/(4f₀): T(f₀) chega a 1? E T̄ na banda?", "Troque para a média aritmética de Z (17 MRayl) ou para um Z baixo: o que sobra do ganho?", "Compare 1 e 2 camadas: a largura a −3 dB cresce? O que isso custa em espessura e em material?"] });
  }
  function measuredZ() { const R = Math.max(0, 1 - state.pred.trueT0), r = Math.sqrt(R); return P.Z1 * (1 - r) / (1 + r); }
  const ZCOL = (Z) => `hsl(${205 - Math.min(1, Math.log10(Z / 1.3) / Math.log10(33 / 1.3)) * 170},45%,${78 - Math.min(1, Math.log10(Z / 1.3) / Math.log10(33 / 1.3)) * 28}%)`;
  // Frente de onda em primeira ordem: pulso transmitido (dourado) e ecos de cada interface (vermelho), sem reflexões múltiplas.
  function pulses(layers, Zt, ct, xMin, tau) {
    const media = [{ Z: P.Z1, c: P.C1 }, ...layers.map((l) => ({ Z: l.Z, c: l.c })), { Z: Zt, c: ct }], X = [0]; layers.forEach((l) => X.push(X[X.length - 1] + l.d));
    const n = layers.length, T = [-xMin / P.C1], A = [1];
    for (let k = 0; k < n; k += 1) { T.push(T[k] + layers[k].d / layers[k].c); }
    for (let k = 0; k <= n; k += 1) A.push(A[k] * 2 * media[k + 1].Z / (media[k].Z + media[k + 1].Z));
    const out = [];
    // principal: posição pelo tempo (c em µm/µs = m/s)
    let x = null, amp = 1, mi = 0;
    if (tau < T[0]) { x = xMin + P.C1 * tau; amp = 1; }
    else { for (let k = 0; k <= n; k += 1) { const end = k < n ? T[k + 1] : Infinity; if (tau >= T[k] && tau < end) { x = X[k] + media[k + 1].c * (tau - T[k]); amp = A[k + 1]; mi = k + 1; break; } } }
    if (x !== null) out.push({ x, amp, color: C.gold, c: media[mi].c });
    for (let k = 0; k <= n; k += 1) {
      if (tau < T[k]) continue;
      const r = (media[k + 1].Z - media[k].Z) / (media[k].Z + media[k + 1].Z), a = A[k] * Math.abs(r); let dt = tau - T[k], pos = X[k], m = k;
      while (m >= 0) { const len = m === 0 ? pos - xMin : layers[m - 1].d, tc = len / media[m].c; if (dt <= tc) { pos -= media[m].c * dt; break; } dt -= tc; pos -= len; m -= 1; }
      if (m >= 0) out.push({ x: pos, amp: a, color: C.red, c: media[m].c });
    }
    return out;
  }
  function drawSecondary(tMs) {
    const sec = canvas("secondaryCanvas", .62, 420), ctx = sec.ctx, sh = state.shown, cfg = sh ? sh.cfg : readCfg(), ev = P.evaluate(cs, cfg), L = ev.layers, D = ev.thickness;
    const xMin = -300, xMax = D + 500, h1 = sec.h * .36, f = Number($("fView").value);
    const R1 = axes(sec, { x: 0, y: 0, w: sec.w, h: h1 }, xMin, xMax, 0, 1, "", "impedância Z", { noXLabel: true, ticks: 2, yTicks: [], xTicks: [] });
    // blocos de impedância
    const bx = [{ x0: xMin, x1: 0, Z: P.Z1, name: `PZT ${P.Z1}` }]; let xx = 0; L.forEach((l, i) => { bx.push({ x0: xx, x1: xx + l.d, Z: l.Z, name: `${fmt(l.Z, 1)}` }); xx += l.d; }); bx.push({ x0: D, x1: xMax, Z: cs.tissue.Z, name: state.direct || state.unlocked || PROF ? `tecido ${fmt(cs.tissue.Z, 2)}` : "tecido" });
    bx.forEach((b) => { const x0 = R1.X(b.x0), x1 = R1.X(b.x1); ctx.fillStyle = ZCOL(b.Z); ctx.fillRect(x0, R1.top + 4, x1 - x0, R1.bottom - R1.top - 8); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x0, R1.top + 4, x1 - x0, R1.bottom - R1.top - 8); if (x1 - x0 > 34) label(ctx, b.name, (x0 + x1) / 2, (R1.top + R1.bottom) / 2 + 4, C.ink, "center", "bold 10px Ubuntu, system-ui"); });
    L.forEach((l, i) => { const x0 = R1.X(bx[i + 1].x0), x1 = R1.X(bx[i + 1].x1); if (x1 - x0 > 30) label(ctx, `${cfg.layers[i].d} µm`, (x0 + x1) / 2, R1.bottom + 2, C.gray, "center", "9px Ubuntu, system-ui"); });
    // frente de onda
    const trav = 300 / P.C1 + L.reduce((a, l) => a + l.d / l.c, 0) + 500 / cs.tissue.c, tau = ((tMs / 3500) % 1.25) * trav;
    pulses(L, cs.tissue.Z, cs.tissue.c, xMin, tau).forEach((p) => {
      const sw = Math.max(5, p.c * 0.03), x = R1.X(p.x), wpx = Math.max(4, sw / (xMax - xMin) * (R1.right - R1.left)), al = Math.min(1, 0.25 + 0.75 * p.amp);
      const g = ctx.createLinearGradient(x - wpx, 0, x + wpx, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, p.color); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = g; ctx.fillRect(x - wpx, R1.top + 4, 2 * wpx, R1.bottom - R1.top - 8); ctx.restore();
    });
    // pressão
    const R2 = axes(sec, { x: 0, y: h1, w: sec.w, h: sec.h - h1 }, xMin, xMax, -2.2, 2.2, "posição x (µm; 0 = face do transdutor)", "pressão p (rel. à incidente)", { ticks: 5, yTicks: [-2, -1, 0, 1, 2], yDigits: 0 });
    let acc = 0; [0, ...L.map((l) => (acc += l.d))].forEach((x, i) => { if (i === 0 || i <= L.length) vline(R2, x, C.faint, [3, 3], 1); }); vline(R2, D, C.faint, [3, 3], 1);
    if (sh && finished(sh)) {
      const w = P.pressureField(sh.ev.layers, cs.tissue.Z, f, cs.tissue.c), ph = TAU * 0.35 * (tMs / 1000), cph = [Math.cos(ph), -Math.sin(ph)];
      const pts = samples(xMin, xMax, 360, (x) => { const p = w.p(x); return p[0] * cph[0] - p[1] * cph[1]; }), env = samples(xMin, xMax, 360, (x) => { const p = w.p(x); return Math.hypot(p[0], p[1]); });
      line(R2, env, C.gray, [4, 4], 1.2); line(R2, env.map((q) => ({ x: q.x, y: -q.y })), C.gray, [4, 4], 1.2); line(R2, pts, C.blue, [], 2.4);
      label(ctx, `f = ${fmt(f, 1)} MHz · T = ${fmt(w.T, 3)} · R = ${fmt(w.R, 3)}`, R2.left + 8, R2.top + 12, C.ink, "left", "bold 11px Ubuntu, system-ui");
      label(ctx, `|p| incidente = 1 · refletida = ${fmt(w.refAmp, 2)} · transmitida = ${fmt(w.transAmp, 2)}`, R2.left + 8, R2.top + 26, C.gray, "left", "10px Ubuntu, system-ui");
    } else label(ctx, "Varra T(f) para ver a pressão ao longo da pilha", (R2.left + R2.right) / 2, (R2.top + R2.bottom) / 2, C.gray, "center", "11px Ubuntu, system-ui");
  }

  // ---------------------------------------------------------------- ações do laboratório
  function lockPrediction() { if (!state.pred.locked) state.pred = { value: parseNum($("pred").value), locked: true, trueT0: P.FREE_TISSUE_T(cs.tissue) }; }
  function measureDirect() { if ($("directBtn").disabled) return; lockPrediction(); state.direct = true; state.used += P.DIRECT_MIN; save(); render(); }
  function startSweep() {
    if ($("sweepBtn").disabled) return;
    lockPrediction(); const cfg = readCfg();
    state.sweeps += 1; state.used += P.SWEEP_MIN; state.lastCfg = cfg; state.shown = sweep(cfg, false); state.anim = state.shown; save(); render();
  }
  function useHint(i) { if (!lv.hints || state.hints[i]) return; state.hints[i] = true; save(); render(); }

  // ================================================================ 03 · Entrega
  function renderEntrega() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), sh = state.shown;
    $("finalCfg").innerHTML = tex(`<p><b>Pilha dos controles:</b> ${stackText(cfg)} · espessura ${ev.thickness} µm · custo ${fmt(ev.cost, 1)}.</p>
      <p>${sh && finished(sh) ? `A última varredura foi de: ${stackText(sh.cfg)}. Entregue a pilha que você varreu.` : "Faça uma varredura da pilha que pretende entregar."} Confira a banda ${cs.band.lo}–${cs.band.hi} MHz e a largura a −3 dB (faixa contígua em torno do pico dentro da banda do exame em que T ≥ T<sub>pico</sub>/2).</p>`);
    refreshButtons(); updateHud();
    texts({ status: "Entrega", detail: state.deliveries ? `${state.deliveries} entrega(s)` : "ainda não entregue",
      prediction: "Antes de entregar: o que decidiu a espessura, o que decidiu o material, e o que significa T? Se a banda é larga, uma camada basta?",
      calculation: `${designLines(cfg)}<br>espessura total = ${ev.thickness} µm · custo = ${fmt(ev.cost, 1)}${LIMIT}`,
      metrics: [["pilha", cfg.layers.length ? `${cfg.layers.length} camada(s)` : "nenhuma"], ["limites", `T̄ ≥ ${fmt(cs.tMinMean * 100, 0)} % · ${cs.dMaxUm} µm · ${fmt(cs.costMax, 1)}`], ["T̄ da varredura", sh && finished(sh) ? `${fmt(sh.ev.tMean * 100, 1)} %` : "—"], ["entregas", String(state.deliveries)], ["dicas usadas", String(state.hints.filter(Boolean).length)], ["estação extra", state.bonusDone ? "conferida (sem pontos)" : "não feita"]],
      concept: "Entregar é decidir com a física das três aulas: o quarto de onda no material da camada e Z_m = √(Z₁Z₂) (ressonância da barreira, Aula 7), T como razão de correntes (Aula 3) e a amplitude de pressão como o ψ da onda (Aula 2).",
      prompts: ["Copie T̄, a largura a −3 dB e o ganho da varredura e confira o ganho com 10 log₁₀(T̄/T₀).", "Marque o conceito que decidiu cada ponto, não o mais sofisticado.", "Depois da entrega, leia a auditoria: onde a sua pilha ficou fora do quarto de onda ou do Z ideal?"] });
  }
  const concepts = () => P.makeConcepts(seed, state.deliveries);   // ordem das opções: muda a cada entrega
  function buildConcepts() {
    $("conceptQs").innerHTML = concepts().map((q, i) => `<div class="cq"><p>${i + 1}. ${tex(q.q)}</p>${q.opts.map((o, j) => `<label><input type="radio" name="cq${i}" value="${j}"><span><b>${"ABCD"[j]})</b> ${tex(o)}</span></label>`).join("")}</div>`).join("");
  }
  function deliver() {
    if (state.sweeps === 0) return;
    state.deliveries += 1;
    const a = readAnswers(), cfg = readCfg();
    const res = P.score(cs, { cfg, values: a.values, concepts: a.concepts, predT0: state.pred.value, predTrueT0: state.pred.trueT0, benchUsedMin: state.used, hintsUsed: state.hints, deliveryNumber: state.deliveries });
    const open = P.revealCase(res.total, state.deliveries, PROF);
    state.last = res; state.revealed = true; if (open) state.unlocked = true; save();
    $("resultCard").hidden = false; $("auditCard").hidden = false;
    $("bigScore").innerHTML = `${fmt(res.total, 1)}<small> / 100</small>`;
    set("resultSub", `entrega nº ${state.deliveries} · ${res.feasible ? "a pilha cumpre a missão" : "a pilha NÃO cumpre toda a missão"} · ${res.nConcepts} de 3 conceitos corretos`);
    // Antes de liberar o caso, os três conceitos entram numa só linha: "n de 3 corretos", sem dizer quais.
    const items = res.items.filter((it) => !it.name.startsWith("Conceito")), cons = res.items.filter((it) => it.name.startsWith("Conceito"));
    const row = (it) => `<tr><td>${tex(it.name)}</td><td class="num ${it.got >= it.max - 1e-9 ? "ok" : (it.got <= 0 ? "bad" : "")}">${fmt(it.got, 1)} / ${it.max}</td><td>${tex(it.note)}</td></tr>`;
    const consRows = open ? cons.map(row).join("") : `<tr><td>Justificativa (3 conceitos)</td><td class="num">—</td><td>${res.nConcepts} de 3 conceitos corretos (o tecido, o Z medido e os conceitos certos aparecem com nota ≥ 90 ou na 3ª entrega)</td></tr>`;
    $("scoreTable").innerHTML = `<table><tr><th>item</th><th class="num">pontos</th><th>observação</th></tr>${items.map(row).join("")}${consRows}
      <tr><td>Dicas usadas</td><td class="num">−${fmt(res.hintPenalty, 0)}</td><td></td></tr><tr><td>Entregas adicionais</td><td class="num">−${fmt(res.redeliveryPenalty, 0)}</td><td>${state.deliveries} entrega(s)</td></tr>
      <tr><th>Total</th><th class="num">${fmt(res.total, 1)}</th><th></th></tr></table>`;
    $("auditBody").innerHTML = tex(auditHtml(cfg, res, open));
    buildConcepts();   // nova ordem das opções para uma eventual reentrega
    render(); $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function auditHtml(cfg, res, open) {
    const ev = res.ev, zt = cs.tissue.Z, fz = f0(), ok = (b) => (b ? '<span class="ok">cumpre</span>' : '<span class="bad">não cumpre</span>');
    const known = open || state.direct;   // T₀ e Z do tecido: do aluno só se ele mediu o acoplamento direto
    const R0 = P.acousticR(P.Z1, zt), T0 = P.acousticT(P.Z1, zt), zid = P.quarterWaveZ(P.Z1, zt);
    const layerLis = cfg.layers.map((l, i) => { const m = CAT[l.mat], dq = P.quarterWaveUm(m.c, fz); return `<li>camada ${i + 1} (${m.name}): Z = ${fmt(m.Z, 1)} MRayl, c = ${m.c} m/s; λ/4 em f₀ = ${fmt(fz, 1)} MHz é c/(4f₀) = ${fmt(dq, 1)} µm; você usou ${l.d} µm = ${fmt(l.d / dq, 2)}·λ/4 (fase kd = ${fmt(TAU * fz * 1e6 * l.d * 1e-6 / m.c, 2)} rad; ressonância em kd = π/2).</li>`; }).join("");
    let h = `<ol>
      <li><b>Interface sem camada (Aula 7).</b> ${known ? `R = ((Z₁ − Z₂)/(Z₁ + Z₂))² = ((33 − ${fmt(zt, 2)})/(33 + ${fmt(zt, 2)}))² = ${fmt(R0, 4)}; T = 1 − R = ${fmt(T0, 4)}. Só ${fmt(T0 * 100, 1)} % atravessa: é a mesma conta do degrau com k → Z.` : "R = ((Z₁ − Z₂)/(Z₁ + Z₂))² e T = 1 − R: os números do tecido aparecem depois da medida direta, ou com nota ≥ 90, ou na 3ª entrega."}</li>
      <li><b>Camada ideal (ressonância da barreira, Aula 7).</b> Uma camada única de λ/4 anula a reflexão em f₀ se Z_m = √(Z₁Z₂)${known ? ` = √(33 × ${fmt(zt, 2)}) = ${fmt(zid, 2)} MRayl (média geométrica; a aritmética daria ${fmt((P.Z1 + zt) / 2, 1)})` : " (média geométrica de Z₁ e Z₂, não a aritmética)"}. A espessura usa a velocidade no material: d = c_m/(4f₀).</li>
      ${layerLis}
      <li><b>Sua pilha.</b> ${stackText(cfg)}: T̄ na banda = ${fmt(ev.tMean * 100, 1)} % (alvo ${fmt(cs.tMinMean * 100, 0)} %): ${ok(ev.tMean >= cs.tMinMean)}; ganho = 10 log₁₀(T̄/T₀) = 10 log₁₀(${fmt(ev.tMean, 3)}/${known ? fmt(ev.tDirect, 3) : "T₀"}) = ${fmt(ev.gainDB, 2)} dB; largura a −3 dB = ${fmt(ev.bw.lo, 2)}–${fmt(ev.bw.hi, 2)} MHz = ${fmt(ev.bw.width, 2)} MHz (pico em ${fmt(ev.bw.peakF, 2)} MHz, T = ${fmt(ev.bw.peakT, 3)}). No pulso-eco a pilha é cruzada duas vezes: ⟨T²⟩ = ${fmt(ev.tEcho * 100, 1)} %.</li>
      <li><b>T é razão de correntes (Aula 3).</b> T = (Z₁/Z_t)|p_t/p_i|², não |p_t/p_i|²; R + T = 1 vale com esse fator. O casamento ideal vale numa frequência: fora de f₀ a camada deixa T cair, e duas camadas alargam a banda.</li>
      <li><b>Limites.</b> Espessura ${ev.thickness} µm (máx. ${cs.dMaxUm}): ${ok(ev.thickness <= cs.dMaxUm)}. Custo ${fmt(ev.cost, 1)} (máx. ${fmt(cs.costMax, 1)}): ${ok(ev.cost <= cs.costMax)}.${open ? ` O tecido deste caso é ${cs.tissue.name} (Z = ${zt} MRayl).` : ""}</li></ol>
      <p>Há mais de uma pilha válida: a referência é a de menor custo que cumpre as restrições.</p>
      <div class="box limit"><b>Limite do modelo.</b> Incidência normal, sem absorção nem difração, camadas planas sem perdas, impedâncias independentes da frequência; PZT tratado como meio semi-infinito de 33 MRayl (sem ressonância do transdutor); catálogo e custos didáticos. O gel só elimina o ar; o descasamento PZT–tecido é resolvido pelas camadas de casamento do transdutor.</div>`;
    if (open) { const cq = P.makeConcepts(seed, state.deliveries - 1).map((q) => `<li>${tex(q.q)} <b>${tex(q.opts[q.correct])}</b></li>`).join(""); h += `<p><b>Conceitos corretos:</b></p><ul>${cq}</ul>`; }
    else h += `<p><b>Conceitos:</b> ${res.nConcepts} de 3 corretos. Releia as perguntas e responda de novo (a ordem das opções mudou); a entrega adicional custa 5 pontos.</p>`;
    if (PROF) { const sol = P.solve(cs); h += sol ? `<div class="box"><b>Modo professor — solução de referência:</b> ${stackText(sol.cfg)}.</div>` : ""; }
    return h;
  }

  // ================================================================ 04 · Estação extra (sem pontos)
  const emitter = () => P.EMITTERS[Number($("bonusSel").value)];
  function fillBonus() {
    const b = cs.bonus, names = b.cands.map((i) => `<option value="${i}">${P.EMITTERS[i].name} → filho Z = ${P.EMITTERS[i].Zd}, E_α = ${fmt(P.EMITTERS[i].E, 3)} MeV</option>`).join("");
    $("bonusSel").innerHTML = names; $("bonusPick").innerHTML = `<option value="-1">escolha…</option>${b.cands.map((i) => `<option value="${i}">${P.EMITTERS[i].name}</option>`).join("")}`;
    const order = P.rngFor(seed, 71), idx = [0, 1, 2, 3]; for (let i = 3; i > 0; i -= 1) { const j = Math.floor(order() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    $("bonusSens").innerHTML = `<option value="-1">escolha…</option>${idx.map((i) => `<option value="${i}">${P.SENS_OPTS[i]}</option>`).join("")}`;
    $("bonusSel").value = String(b.cands[0]);
    setR(P.contactRadiusFm(emitter().Ad));
  }
  const setR = (r) => { $("bR").value = String(Math.round(r * 10) / 10); };
  function drawBonus() {
    const em = emitter(), R = Number($("bR").value), b = cs.bonus, Rc = P.contactRadiusFm(em.Ad), EM = em.E, Z = em.Zd;
    $("bROut").textContent = fmt(R, 1);
    const bPt = P.turningPointFm(EM, Z), G = P.gamowExponent(EM, R, Z), rate = P.assaultRatePerS(EM, R), th = P.alphaHalfLifeDays(EM, R, Z), lam = Math.LN2 / (th * 86400);
    const sec = canvas("bonusCanvas", .4, 300), ctx = sec.ctx;
    const lo = Math.log10(b.windowLo), hi = Math.log10(b.windowHi), ys = [7, 9, 11].map((r) => Math.log10(P.alphaHalfLifeDays(EM, r, Z))), yMin = Math.floor(Math.min(lo - 1, ...ys)) - 1, yMax = Math.ceil(Math.max(hi + 1, ...ys)) + 1;
    const A = axes(sec, { x: 0, y: 0, w: sec.w, h: sec.h }, 7, 11, yMin, yMax, "raio de contato R (fm)", "log₁₀(T½ / dias)", { ticks: 5, xTicks: [7, 8, 9, 10, 11], yDigits: 0 });
    clip(A, (c) => { c.fillStyle = "rgba(233,162,59,.20)"; c.fillRect(A.left, A.Y(hi), A.right - A.left, A.Y(lo) - A.Y(hi)); });
    label(ctx, `meia-vida alvo: ${sig(b.windowLo, 2)}–${sig(b.windowHi, 2)} dias`, A.left + 8, A.Y(hi) - 5, "#a66c17", "left", "bold 11px Ubuntu, system-ui");
    line(A, samples(7, 11, 120, (r) => Math.log10(P.alphaHalfLifeDays(EM, r, Z))), C.red, [], 2.8);
    vline(A, Rc, C.gray, [4, 4], 1.4); label(ctx, `R de contato = ${fmt(Rc, 2)} fm`, A.X(Rc) + 5, A.bottom - 8, C.gray, "left", "10px Ubuntu, system-ui");
    clip(A, (c) => { c.fillStyle = C.blue; c.beginPath(); c.arc(A.X(R), A.Y(Math.log10(th)), 5.5, 0, TAU); c.fill(); });
    label(ctx, `${em.name}: T½ = ${sig(th, 3)} d em R = ${fmt(R, 1)} fm`, A.right - 8, A.top + 14, C.blue, "right", "bold 11px Ubuntu, system-ui");
    const ratio = P.alphaHalfLifeDays(EM, R + 0.1, Z) / th;
    $("bonusBrief").innerHTML = tex(`<p>Para <b>terapia alfa dirigida</b> é preciso escolher o emissor pela <b>meia-vida</b>: o caso pede <b>${sig(b.windowLo, 2)} a ${sig(b.windowHi, 2)} dias</b> (meia-vida do modelo de Gamow da Aula 7, não a medida). Entre os quatro candidatos, só um cai na janela (a janela pode ir de microssegundos a eras: escolha o emissor).</p>
      <p>Use o gráfico: a curva vermelha é T½(R) do candidato selecionado; a faixa dourada é a janela. Escolha o emissor, estime log₁₀(T½/dias) no raio de contato e diga como T½ responde a um aumento de 0,1 fm em R. Os valores medidos aparecem como contexto na tabela de métricas.</p>
      <p><b>Ligação com o ultrassom (Aula 7).</b> A barreira do ultrassom é a impedância Z: o degrau em Z reflete e transmite como o degrau em V. A do núcleo é o potencial V da barreira coulombiana, e o fator de Gamow e<sup>−G</sup> é o T de uma barreira larga. Esta estação não vale pontos.</p>`);
    texts({ status: "Estação extra", detail: em.name,
      prediction: "A barreira de Coulomb é a mesma para todos os candidatos, mas T½ varia por muitas ordens de grandeza. Que grandeza do emissor mais pesa: E_α, o raio R ou a carga Z do filho? E 0,1 fm a mais em R muda T½ por fator perto de 1,5, 10 ou 100?",
      calculation: `b = 2Z e²/(4πε₀E_α) = 2×${Z}×1,44/${fmt(EM, 3)} = <b>${fmt(bPt, 1)} fm</b><br>G = (2b√(2m_αE_α)/ħ)[arccos√(R/b) − √((R/b)(1−R/b))] = <b>${fmt(G, 2)}</b><br>v/2R = ${sci(rate, 2)} s⁻¹ · λ = (v/2R)e<sup>−G</sup> = ${sci(lam, 2)} s⁻¹<br>T½ = ln 2/λ = <b>${sig(th, 3)} dias</b> (medida: ${em.measured})<small>T½(R + 0,1 fm)/T½(R) = ${fmt(ratio, 2)}</small><div class="limit">Limite do modelo: barreira puramente coulombiana (onda s), sem momento angular, sem fator de formação de partícula alfa nem deformação nuclear; erra por fatores de 1,3 a 11 nos oito emissores (pior caso: ²²⁷Th, 1,7 d contra 18,7 d medidos); para o ²²³Ra dá 8,4 d com R = 9,138 fm e 9,7 d com R = 9,1 fm (medido 11,4 d). R = 1,2(A<sup>1/3</sup> + 4<sup>1/3</sup>) fm é uma convenção.</div>`,
      metrics: [["ponto de saída b", `${fmt(bPt, 1)} fm`], ["expoente de Gamow G", fmt(G, 2)], ["e^(−G)", sci(Math.exp(-G), 2)], ["frequência de colisão v/2R", `${sci(rate, 2)} s⁻¹`], ["T½ do modelo", `${sig(th, 3)} d`], ["T½ medida", em.measured]],
      concept: "A meia-vida alfa é um problema de tunelamento (Aula 7): o fator de Gamow e^(−G) é exponencial em R e em 1/√E_α, e por isso 0,1 fm em R muda T½ por um fator ≈ 1,5 e 1 MeV em E_α muda por muitas ordens de grandeza.",
      prompts: ["Selecione cada candidato com R de contato: qual cai na faixa dourada?", "Mova R em 0,1 fm: por quanto T½ é multiplicado? Isso é sensibilidade exponencial.", "Compare ²¹⁰Po e ²²³Ra: E_α parecida, T½ diferente. Por quê? (carga Z do filho e R)"] });
    $("bonusTitle").textContent = "Meia-vida pelo fator de Gamow em função de R"; $("bonusSubtitle").textContent = `candidato: ${em.name} · ponto azul: R atual · tracejado: R de contato`;
    $("bonusCaption").textContent = "A curva é T½(R) = ln 2 /[(v/2R) e^(−G)]. A janela alvo é fixa; só um dos candidatos a cruza perto do R de contato.";
    $("bonusResultSub").textContent = state.bonusDone ? `conferido: ${state.bonusPts} de 10 (autoavaliação, sem pontos na nota)` : "ainda não conferido";
  }
  function registerBonus() {
    const pick = Number($("bonusPick").value), sens = Number($("bonusSens").value), logT = parseNum($("bonusLog").value);
    if (pick < 0 || sens < 0 || !Number.isFinite(logT)) { $("bonusResult").innerHTML = '<p class="warn">Escolha o emissor, preveja log₁₀(T½/dias) e escolha a sensibilidade.</p>'; return; }
    const r = P.scoreBonus(cs, { pick, logT, sens }); state.bonusPts = r.pts; state.bonusDone = true; save();
    const b = cs.bonus;
    $("bonusResult").innerHTML = tex(`<table><tr><th>item</th><th class="num">acerto</th><th>observação</th></tr>
      <tr><td>Emissor na janela</td><td class="num">${r.ok ? 6 : 0} / 6</td><td>${r.ok ? "correto" : "incorreto"}: o alvo era ${P.EMITTERS[b.target].name}</td></tr>
      <tr><td>log₁₀(T½) previsto</td><td class="num">${r.logOk ? 2 : 0} / 2</td><td>valor do modelo: ${fmt(Math.log10(b.tHalfDays), 2)} (tolerância ±0,5)</td></tr>
      <tr><td>Sensibilidade a R</td><td class="num">${r.sens ? 2 : 0} / 2</td><td>${r.sens ? "correto" : "incorreto"}: ≈ 1,5 vezes por 0,1 fm (exponencial em R)</td></tr></table><p>Autoavaliação: <b>${r.pts}</b> de 10. A estação extra não entra na nota.</p>`);
    render();
  }

  // ---------------------------------------------------------------- coordenação
  function render() {
    document.querySelectorAll("[data-stage]").forEach((s) => s.classList.toggle("active", s.dataset.stage === view));
    if (view === "missao") { updateHud(); refreshButtons(); renderMissao(); }
    else if (view === "lab") drawLab();
    else if (view === "entrega") renderEntrega();
    else { updateHud(); refreshButtons(); drawBonus(); }
  }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "missao";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    updateUrl(); render();
  }
  function updateUrl() { try { const u = new URL(location.href); u.searchParams.set("view", view); u.searchParams.set("seed", String(seed)); u.searchParams.set("level", String(level)); history.replaceState(null, "", u); } catch (_) { /* file:// */ } }
  function newCaseState(nextSeed, nextLevel) {
    seed = nextSeed; level = nextLevel; cs = P.makeCase(seed, level); lv = P.LEVELS[level];
    state = freshState(); $("seedIn").value = seed; $("levelSel").value = String(level);
    $("pred").value = ""; ["ansT", "ansBw", "ansGain", "bonusLog"].forEach((id) => { $(id).value = ""; });
    $("resultCard").hidden = true; $("auditCard").hidden = true; $("bonusResult").innerHTML = "";
    fillMaterials(); buildConcepts(); fillBonus(); writeCfgRaw(DEFAULTS); restore(); updateUrl(); render();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("levelSel").addEventListener("change", () => newCaseState(seed, Number($("levelSel").value)));
  $("seedApply").addEventListener("click", () => newCaseState(Math.max(1, Math.min(999999, Math.floor(Number($("seedIn").value)) || 1)), Number($("levelSel").value)));
  $("newCase").addEventListener("click", () => newCaseState(1 + Math.floor(Math.random() * 9999), Number($("levelSel").value)));
  $("sweepBtn").addEventListener("click", startSweep);
  $("directBtn").addEventListener("click", measureDirect);
  $("deliverBtn").addEventListener("click", deliver);
  $("bonusBtn").addEventListener("click", registerBonus);
  $("bRdef").addEventListener("click", () => { setR(P.contactRadiusFm(emitter().Ad)); render(); });
  $("bonusSel").addEventListener("change", () => { setR(P.contactRadiusFm(emitter().Ad)); render(); });
  document.querySelectorAll("[data-hint]").forEach((b) => b.addEventListener("click", () => useHint(Number(b.dataset.hint))));
  document.querySelectorAll("input, select").forEach((e) => { if (!["levelSel", "seedIn", "bonusSel"].includes(e.id)) e.addEventListener("input", () => { save(); render(); }); });
  $("resetBtn").addEventListener("click", () => {
    if (view === "lab") writeCfgRaw(DEFAULTS);
    if (view === "entrega") { ["ansT", "ansBw", "ansGain"].forEach((id) => { $(id).value = ""; }); document.querySelectorAll(".cq input").forEach((r) => { r.checked = false; }); }
    if (view === "bonus") setR(P.contactRadiusFm(emitter().Ad));
    render();
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });

  let lastFrame = 0;
  function frame(now) {
    if (view === "lab") {
      const sh = state.shown;
      if (state.anim && sh && !finished(sh)) {
        sh.done = Math.min(FS.length, sh.done + 8); drawLab();
        if (finished(sh)) { state.anim = null; save(); drawLab(); }
      } else if (now - lastFrame > 50) { lastFrame = now; drawSecondary(now); }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- partida
  fillMaterials(); buildConcepts(); fillBonus(); writeCfgRaw(DEFAULTS);
  for (const [key, value] of params.entries()) { const el = $(key); if (el && !["view", "seed", "level", "prof"].includes(key) && (el.tagName === "INPUT" || el.tagName === "SELECT") && !["seedIn", "levelSel"].includes(key)) el.value = value; }
  $("seedIn").value = seed; $("levelSel").value = String(level);
  restore();
  switchView(view);
  requestAnimationFrame(frame);
})();
