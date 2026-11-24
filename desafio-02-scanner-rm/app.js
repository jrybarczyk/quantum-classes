(function () {
  "use strict";
  // Coordena controles, canvas e textos do Desafio 2. A física, o caso por semente e a pontuação estão em physics.js.
  const P = window.ScannerPhysics;
  const $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", violet: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d", faint: "#c9d3c9" };
  const TAU = 2 * Math.PI;
  const VIEWS = ["missao", "lab", "entrega"];
  const params = new URLSearchParams(location.search);
  const PROF = params.get("prof") === "1";
  const fmt = (x, n = 2) => P.formatPt(x, n);
  const sci = (x, n = 2) => P.sciPt(x, n);
  // TeX cru → HTML só nos textos da página: k_max → k<sub>max</sub>, e^(…) → e<sup>…</sup>
  const tex = (t) => String(t).replace(/\^\(([^)]*)\)/g, "<sup>$1</sup>").replace(/(\S)_([A-Za-zçíóáéãõ±]+)/g, "$1<sub>$2</sub>");
  const set = (id, text) => { $(id).innerHTML = tex(text); };
  const parseNum = (s) => { const t = String(s ?? "").trim().replace(",", "."); return t === "" ? NaN : Number(t); };
  const samples = (a, b, n, fn) => Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; });

  // ---------------------------------------------------------------- caso e estado
  let view = VIEWS.includes(params.get("view")) ? params.get("view") : "missao";
  let seed = Math.max(1, Math.min(999999, Math.floor(Number(params.get("seed"))) || 1));
  let level = [1, 2, 3].includes(Number(params.get("level"))) ? Number(params.get("level")) : 2;
  let cs = P.makeCase(seed, level), lv = P.LEVELS[level];
  let bands = P.phantom(cs.LCm, cs.sMm);
  let state = freshState();
  function freshState() { return { used: 0, acqCount: 0, locDone: false, pred: { value: NaN, locked: false, trueDx: NaN }, hints: [false, false, false], deliveries: 0, shown: null, anim: null, revealed: false, unlocked: false, last: null, lastCfg: null }; }
  const storeKey = () => `desafio02-${seed}-${level}`;
  function save() {
    try { sessionStorage.setItem(storeKey(), JSON.stringify({ used: state.used, acqCount: state.acqCount, locDone: state.locDone, pred: state.pred, hints: state.hints, deliveries: state.deliveries, revealed: state.revealed, unlocked: state.unlocked, lastCfg: state.lastCfg, ans: readAnswers(), ctl: readCfg(), pr: $("pred").value })); } catch (_) { /* sem armazenamento */ }
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem(storeKey()); if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(state, { used: d.used, acqCount: d.acqCount, locDone: d.locDone, pred: d.pred, hints: d.hints, deliveries: d.deliveries, revealed: d.revealed, unlocked: !!d.unlocked, lastCfg: d.lastCfg });
      buildConcepts();   // a ordem das opções depende do nº de entregas já feitas
      if (d.pr) $("pred").value = d.pr;
      if (d.ctl) writeCfg(d.ctl);
      if (d.ans) { ["ansDx", "ansFov", "ansSnr", "ansT"].forEach((id, i) => { $(id).value = d.ans.raw[i] || ""; }); setTimeout(() => { (d.ans.concepts || []).forEach((v, i) => { const r = document.querySelector(`input[name="cq${i}"][value="${v}"]`); if (r) r.checked = true; }); }, 0); }
      if (state.lastCfg && state.acqCount > 0) state.shown = simulate(state.lastCfg, state.acqCount, true);
    } catch (_) { /* estado corrompido: começa do zero */ }
  }

  // ---------------------------------------------------------------- controles
  const DEFAULTS = { B0: "1.5", G: 10, S: 100, tRead: 4, Nidx: 4, NEX: 1 };
  function readCfg() { return { B0: Number($("B0").value), G: Number($("G").value), S: Number($("S").value), t: Number($("tRead").value), N: P.NS[Number($("Nidx").value)], NEX: Number($("NEX").value) }; }
  function writeCfg(c) { $("B0").value = String(c.B0); $("G").value = c.G; $("S").value = c.S ?? DEFAULTS.S; $("tRead").value = c.t; $("Nidx").value = Math.max(0, P.NS.indexOf(c.N)); $("NEX").value = c.NEX; }
  function readAnswers() {
    const raw = ["ansDx", "ansFov", "ansSnr", "ansT"].map((id) => $(id).value), v = raw.map(parseNum);
    const concepts = [0, 1, 2].map((i) => { const r = document.querySelector(`input[name="cq${i}"]:checked`); return r ? Number(r.value) : -1; });
    return { raw, values: { dxMm: v[0], fovCm: v[1], snr: v[2], tMin: v[3] }, concepts };
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
    const ctx = target.ctx, left = box.x + 54, right = box.x + box.w - 14, top = box.y + 18, bottom = box.y + box.h - 38;
    const X = (x) => left + (x - xMin) * (right - left) / (xMax - xMin), Y = (y) => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui"; ctx.lineWidth = 1;
    const n = o.ticks ?? 5, nx = P.niceTicks(xMin, xMax, o.xTarget ?? Math.min(n, box.w < 420 ? 4 : n)), ny = P.niceTicks(yMin, yMax, n);
    const xt = o.xTicks || nx.ticks, yt = o.yTicks || ny.ticks;
    xt.forEach((x) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(o.xLabels ? o.xLabels(x) : fmt(x, o.xDigits ?? nx.decimals), X(x), bottom + 14); });
    yt.forEach((y) => { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke(); ctx.fillStyle = C.gray; ctx.textAlign = "right"; ctx.fillText(fmt(y, o.yDigits ?? ny.decimals), left - 6, Y(y) + 3); });
    ctx.strokeStyle = C.gray; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, box.y + box.h - 6);
    ctx.save(); ctx.translate(box.x + 12, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }
  function clip(ch, draw) { const c = ch.ctx; c.save(); c.beginPath(); c.rect(ch.left, ch.top - 2, ch.right - ch.left, ch.bottom - ch.top + 2); c.clip(); draw(c); c.restore(); }
  function line(ch, pts, color, dash = [], width = 2.6, alpha = 1) { clip(ch, (c) => { c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(ch.X(p.x), ch.Y(p.y)) : c.moveTo(ch.X(p.x), ch.Y(p.y)))); c.stroke(); }); }
  function area(ch, pts, color, base = 0) { clip(ch, (c) => { c.fillStyle = color; c.beginPath(); c.moveTo(ch.X(pts[0].x), ch.Y(base)); pts.forEach((p) => c.lineTo(ch.X(p.x), ch.Y(p.y))); c.lineTo(ch.X(pts[pts.length - 1].x), ch.Y(base)); c.closePath(); c.fill(); }); }
  function vline(ch, x, color, dash = [5, 4], width = 1.4) { clip(ch, (c) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(ch.X(x), ch.top); c.lineTo(ch.X(x), ch.bottom); c.stroke(); }); }
  function label(ctx, text, x, y, color = C.gray, align = "left", font = "11px Ubuntu, system-ui") { ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y); }
  function hatch(ch, x0, x1, color) {
    clip(ch, (c) => {
      const a = ch.X(x0), b = ch.X(x1); c.save(); c.beginPath(); c.rect(a, ch.top, b - a, ch.bottom - ch.top); c.clip();
      c.fillStyle = "rgba(198,92,75,.10)"; c.fillRect(a, ch.top, b - a, ch.bottom - ch.top); c.strokeStyle = color; c.lineWidth = 1; c.setLineDash([]);
      for (let x = a - (ch.bottom - ch.top); x < b; x += 9) { c.beginPath(); c.moveTo(x, ch.bottom); c.lineTo(x + (ch.bottom - ch.top), ch.top); c.stroke(); }
      c.restore();
    });
  }
  function texts(d) {
    set("statusTitle", d.status); set("statusDetail", d.detail);
    if (d.title !== undefined) { set("mainTitle", d.title); set("mainSubtitle", d.subtitle); set("caption", d.caption); set("secondaryTitle", d.secondaryTitle); set("secondarySubtitle", d.secondarySubtitle); set("secondaryCaption", d.secondaryCaption); $("legend").innerHTML = d.legend.map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-top-style:dashed" : ""}"></i>${tex(text)}</span>`).join(""); }
    set("prediction", d.prediction); $("calculation").innerHTML = tex(d.calculation);
    $("metrics").innerHTML = d.metrics.map(([a, b]) => `<div><dt>${tex(a)}</dt><dd>${tex(b)}</dd></div>`).join("");
    set("conceptTitle", "Ideia física"); set("conceptText", d.concept);
    $("prompts").innerHTML = d.prompts.map((p) => `<li>${tex(p)}</li>`).join("");
  }

  // ---------------------------------------------------------------- simulação da aquisição
  // Sorteia o ruído de k-espaço (σ_k tal que o pixel de tecido tenha SNR = ρ_tecido/σ) e soma a reconstrução discreta
  // ρ(x) = Δk Σ S(k_j) cos(2πk_j x), de forma incremental (a animação preenche o espaço k do centro para fora).
  const WIDE_HALF_M = 0.20, ZOOM_HALF_M = 8e-3, NWIDE = 480, NZOOM = 320;
  function simulate(cfg, idx, instant) {
    const ev = P.evaluate(cs, cfg), N = cfg.N, dk = ev.dkPerM;
    const { ks, S } = P.kSamples(bands, N, dk), rng = P.rngFor(seed, 1000 + idx);
    const sigImg = 0.5 / ev.snr, sigK = sigImg * Math.SQRT2 / (dk * Math.sqrt(N));
    const noisy = S.map((s) => s + sigK * P.gaussian(rng));
    const half = Math.min(ev.fovCm * 1e-2 / 2, WIDE_HALF_M);
    const wideX = samples(-half, half, NWIDE, (x) => x).map((p) => p.x), zoomX = samples(-ZOOM_HALF_M, ZOOM_HALF_M, NZOOM, (x) => x).map((p) => p.x);
    const order = ks.map((k, i) => i).sort((a, b) => Math.abs(ks[a]) - Math.abs(ks[b]) || a - b);
    const sim = { cfg, ev, idx, ks, S, noisy, dk, order, done: 0, wideX, zoomX, wideC: new Array(NWIDE).fill(0), wideN: new Array(NWIDE).fill(0), zoomC: new Array(NZOOM).fill(0), zoomN: new Array(NZOOM).fill(0), half, t0: performance.now(), instant: !!instant };
    if (instant) advance(sim, N);
    return sim;
  }
  function advance(sim, count) {
    const end = Math.min(sim.order.length, sim.done + count);
    for (let q = sim.done; q < end; q += 1) {
      const i = sim.order[q], k = sim.ks[i], sc = sim.S[i] * sim.dk, sn = sim.noisy[i] * sim.dk;
      for (let m = 0; m < NWIDE; m += 1) { const c = Math.cos(TAU * k * sim.wideX[m]); sim.wideC[m] += sc * c; sim.wideN[m] += sn * c; }
      for (let m = 0; m < NZOOM; m += 1) { const c = Math.cos(TAU * k * sim.zoomX[m]); sim.zoomC[m] += sc * c; sim.zoomN[m] += sn * c; }
    }
    sim.done = end;
  }
  const finished = (sim) => sim && sim.done >= sim.order.length;

  // ================================================================ 01 · Missão
  const money = (x) => fmt(x, 1);
  function renderMissao() {
    const d = cs.design, m = (e) => fmt(1 / (1 - e), 2);
    set("briefSub", `${lv.name} · semente ${seed}`);
    $("briefBody").innerHTML = tex(`
      <p>Uma equipe de pesquisa precisa de um protocolo de <b>ressonância magnética</b> (perfil unidimensional ao longo do gradiente de leitura) que consiga <b>separar duas lesões pequenas</b> dentro de um objeto de teste sintético (tecido de comprimento L). Você <b>não sabe</b> nem a distância s entre as lesões (entre 1,5 e 6 mm) nem o comprimento L do objeto (entre 12 e 30 cm): só o <b>localizador</b> dá uma estimativa de L (com erro de até ±${Math.round(lv.locErr * 100)} %) e a própria imagem mostra se as lesões se separam.</p>
      <p>Você controla o campo B₀ (0,5; 1,5; 3 ou 7 T), o gradiente G (1 a 40 mT/m; 40 é o limite do <b>hardware</b>), a taxa de variação S (50 a 200 T/m/s), a janela de leitura t_read, o número de amostras N e o número de médias NEX. Cada aquisição de teste consome tempo da <b>sessão de magneto</b>; o protocolo final tem de caber no tempo e no custo de um exame real.</p>
      <div class="box"><b>Margem do localizador.</b> Como L_loc pode errar até ${Math.round(lv.locErr * 100)} % neste nível, use <b>FOV ≥ L_loc/(1 − erro) = ${m(lv.locErr)} × L_loc</b> (as margens dos níveis 1, 2 e 3 são 1,03; 1,05 e 1,09). A margem de 1,08 só vale para erros de 8 %.</div>
      <div class="box"><b>Antes de abrir o Laboratório</b> (a conta aparece lá), responda no roteiro, sem calcular: dobrando G com t_read e N fixos, o que acontece com Δx e com o FOV? E qual controle muda o SNR sem mudar Δx, o FOV nem o tempo de exame? No Laboratório, digite também a sua <b>previsão numérica</b> de Δx para o primeiro protocolo: ela trava na primeira aquisição e vale pontos. O que o aparelho mostra ao vivo (SNR, tempo, custo${lv.showDerived ? ", Δx, FOV" : ""}) é conta, não medida: só a imagem e o veredito "lesões separadas?" custam sessão.</div>
      ${lv.showDerived ? "" : '<div class="box"><b>Nível 3:</b> o aparelho não mostra Δx nem FOV. Calcule-os na conta aberta (as fórmulas estão lá, sem os números).</div>'}`);
    $("constraintBody").innerHTML = tex(`<table><tr><th>restrição</th><th class="num">limite</th><th>o que a viola</th></tr>
      <tr><td>lesões separadas na imagem</td><td class="num">Δx ≤ Δx_crit (escondido)</td><td>k_max pequeno (G·t_read baixo)</td></tr>
      <tr><td>sem aliasing</td><td class="num">FOV ≥ L</td><td>Δk grande (N pequeno para esse G·t_read)</td></tr>
      <tr><td>SNR</td><td class="num">≥ ${fmt(cs.snrMin, 0)}</td><td>voxel pequeno, B₀ baixo, poucas médias, banda larga</td></tr>
      <tr><td>tempo de exame</td><td class="num">≤ ${fmt(cs.tMaxMin, 1)} min</td><td>N grande, NEX grande</td></tr>
      <tr><td>custo do exame</td><td class="num">≤ ${fmt(cs.costMax, 0)} u.c.</td><td>B₀ alto, exame longo</td></tr>
      <tr><td>estimulação periférica</td><td class="num">dB/dt = S·r ≤ ${fmt(cs.dBdtMaxTs, 0)} T/s (S ≤ ${fmt(cs.slewMaxTmS, 0)} T/m/s)</td><td>S alto. A estimulação depende de dB/dt (taxa de variação × distância ao isocentro, r = 0,25 m), não de G; G ≤ 40 mT/m é só o limite do hardware</td></tr></table>
      <p>Custo do exame = aluguel do magneto (0,5 T: 1; 1,5 T: 3; 3 T: 6; 7 T: 14 u.c.) + 0,4 u.c. por minuto. <b>Sessão de magneto:</b> ${fmt(cs.sessionMin, 0)} min no total; o localizador gasta ${fmt(P.LOCALIZER_MIN, 1)} min e cada aquisição gasta o tempo de exame do protocolo. A rampa do gradiente (2G/S) entra no TR, mas com TR₀ = 600 ms pesa menos de 0,3 %: um S baixo quase não custa tempo; o limite que importa é o de estimulação.</p>
      <p>Tabela técnico ↔ aluno e a conta do SNR estão no Laboratório e na Entrega.</p>`);
    $("scoreRules").innerHTML = tex(`<table><tr><th>parte</th><th class="num">pontos</th><th>critério</th></tr>
      <tr><td>Acerto técnico</td><td class="num">50</td><td>40 pelas restrições (perde pontos linearmente com a violação, zero a 25 %) + 10 pelos valores Δx, FOV, SNR e tempo que você calcula (tolerância ${Math.round(lv.tol * 100)} %)</td></tr>
      <tr><td>Previsão</td><td class="num">10</td><td>Δx previsto contra o Δx da primeira aquisição (cheio dentro de 15 %)</td></tr>
      <tr><td>Eficiência</td><td class="num">15</td><td>cheia até 50 % da sessão usada, linear até zero em 100 %; multiplicada pelo quadrado da fração da missão cumprida</td></tr>
      <tr><td>Justificativa</td><td class="num">25</td><td>três perguntas "qual conceito decidiu?" (8 + 8 + 9); no roteiro, uma frase de razão por letra</td></tr>
      <tr><td>Descontos</td><td class="num">−</td><td>${lv.hints ? "dicas: 4, 6 e 10 pontos; " : "sem dicas neste nível; "}5 pontos por entrega adicional</td></tr></table>
      <p>Os números do caso (s, L, Δx_crit) e os conceitos corretos só aparecem com nota ≥ 90 ou na 3ª entrega; antes, a tela diz só "n de 3 conceitos corretos". Há mais de uma resposta válida: um protocolo robusto que cumpre todas as restrições (por exemplo N = 512, NEX = 4) não é errado, só custa mais tempo e dinheiro.</p>`);
    $("profCard").hidden = !PROF;
    if (PROF) {
      const sol = P.solve(cs), ev = sol ? P.evaluate(cs, sol.cfg) : null;
      $("profBody").innerHTML = tex(`<p>s = <b>${fmt(cs.sMm, 1)} mm</b> · L = <b>${cs.LCm} cm</b> · Δx_crit = <b>${fmt(cs.dxCritMm, 3)} mm</b> (separa para Δx ≤ s/${fmt(cs.sMm / cs.dxCritMm, 2)}; regra segura s/1,55) · localizador diz ${cs.locEst} cm.</p>
        <p>Limites: SNR ≥ ${cs.snrMin}, t ≤ ${cs.tMaxMin} min, custo ≤ ${cs.costMax}, dB/dt ≤ ${cs.dBdtMaxTs} T/s (S ≤ ${cs.slewMaxTmS} T/m/s), sessão ${cs.sessionMin} min.</p>
        <p>Protocolo de projeto (garante solução): B₀ = ${d.B0} T, G = ${d.G} mT/m, S = ${d.S} T/m/s, t_read = ${d.t} ms, N = ${d.N}, NEX = ${d.NEX}.</p>
        ${sol ? `<p>Solução de menor custo (busca exaustiva): B₀ = <b>${sol.cfg.B0} T</b>, G = <b>${sol.cfg.G} mT/m</b>, S = <b>${sol.cfg.S} T/m/s</b>, t_read = <b>${sol.cfg.t} ms</b>, N = <b>${sol.cfg.N}</b>, NEX = <b>${sol.cfg.NEX}</b> → Δx = ${fmt(ev.dxMm, 2)} mm, FOV = ${fmt(ev.fovCm, 1)} cm, SNR = ${fmt(ev.snr, 1)}, ${fmt(ev.tMin, 2)} min, custo ${fmt(ev.cost, 2)}.</p>` : ""}`);
    }
    const cfg = readCfg(), ev = P.evaluate(cs, cfg);
    texts({ status: "Missão", detail: `${lv.name.split(" — ")[0]} · semente ${seed}`,
      prediction: "Preveja no roteiro, antes de abrir o Laboratório e sem calcular: (1) dobrando G com t_read e N fixos, o que acontece com Δx e com o FOV? (2) Qual controle muda o SNR sem mudar Δx, o FOV nem o tempo de exame?",
      calculation: `ν₀ = γ̄B₀ = 42,577 MHz/T × 1,5 T = ${fmt(P.larmorHz(1.5) / 1e6, 2)} MHz<br>ΔE = hν₀ = ${sci(P.zeemanEV(1.5), 2)} eV<br>P = ΔE/(2k_BT) = ${sci(P.polarization(1.5), 2)} a 310 K (excesso de spins alinhados, Aula 4)<small>As fórmulas do espaço k (k_max, Δx, Δk, FOV) e a conta do SNR ficam no Laboratório.</small><div class="limit">Limite do modelo: perfil 1D de um objeto sintético, sem relaxação (T₁, T₂) nem seleção de corte, polarização linear em B₀, ruído branco. O SNR, o tempo e o custo são didáticos, não de um scanner real.</div>`,
      metrics: [["frequência de Larmor ν₀ (1,5 T)", `${fmt(P.larmorHz(1.5) / 1e6, 2)} MHz`], ["ΔE de Zeeman (1,5 T)", `${sci(P.zeemanEV(1.5), 2)} eV`], ["polarização P (1,5 T)", sci(P.polarization(1.5), 2)], ["sessão de magneto", `${fmt(cs.sessionMin, 0)} min`], ["restrições", "6"], ["protocolo atual", `${fmt(ev.tMin, 1)} min · ${fmt(ev.cost, 1)} u.c.`]],
      concept: "Três aulas se encontram aqui: a frequência de Larmor ν₀ = γ̄B₀ e a polarização minúscula do ensemble (Aula 4), a imagem como expansão truncada em ondas planas e^(2πikx), cortada em k_max e amostrada em passos Δk (Aula 6), e o ruído como estatística de contagem, 1/√N (Aulas 2 e 6).",
      prompts: ["Sem calcular: o que na imagem depende de quanto do espaço k você mede, e o que depende do espaçamento entre as amostras?", "O que muda quando B₀ sobe de 1,5 para 3 T: Δx, FOV, SNR, tempo de exame?", "Quando vale gastar 0,5 min no localizador? Com a margem do nível, qual FOV mínimo você quer depois dele?"] });
  }

  // ================================================================ 02 · Laboratório
  function updateHud() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), rem = Math.max(0, cs.sessionMin - state.used);
    $("hudCase").textContent = `${seed} · nível ${level}`;
    $("hudBar").style.width = `${Math.max(0, Math.min(100, 100 * rem / cs.sessionMin))}%`;
    $("hudSession").textContent = `${fmt(rem, 1)} de ${fmt(cs.sessionMin, 0)} min`;
    $("hudAcq").textContent = `${state.acqCount} aquisições${state.locDone ? " + localizador" : ""}`;
    const mark = (id, text, bad) => { const e = $(id); e.textContent = text; e.className = bad ? "bad" : "ok"; };
    mark("hudTime", `${fmt(ev.tMin, 1)} / ${fmt(cs.tMaxMin, 1)} min`, ev.tMin > cs.tMaxMin);
    mark("hudCost", `${fmt(ev.cost, 1)} / ${fmt(cs.costMax, 0)} u.c.`, ev.cost > cs.costMax);
    mark("hudSnr", `${fmt(ev.snr, 1)} / ≥ ${fmt(cs.snrMin, 0)}`, ev.snr < cs.snrMin);
  }
  const predReady = () => state.pred.locked || parseNum($("pred").value) > 0;
  // Δx, k_max, Δk e FOV ficam como "?" até a previsão numérica ser digitada (e sempre no nível 3): nada na tela entrega a previsão.
  const derivedHidden = () => !lv.showDerived || !predReady();
  function lockedMsg() {
    if (state.pred.locked) return `Previsão travada: Δx = ${fmt(state.pred.value, 2)} mm (primeira aquisição).`;
    const v = parseNum($("pred").value);
    return v > 0 ? "Previsão pronta: ela trava ao adquirir." : "Digite a previsão (número positivo, em mm) para liberar a aquisição.";
  }
  function refreshButtons() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), rem = cs.sessionMin - state.used, busy = !!state.anim;
    const predOk = state.pred.locked || parseNum($("pred").value) > 0;
    $("pred").disabled = state.pred.locked; $("predState").textContent = lockedMsg();
    let why = "";
    if (!predOk) why = "Registre a previsão para liberar a aquisição.";
    else if (!ev.stimOK) why = `Limite de estimulação: dB/dt = S·r = ${fmt(ev.dBdtTs, 1)} T/s passa de ${fmt(cs.dBdtMaxTs, 0)} T/s; reduza S para ${fmt(cs.slewMaxTmS, 0)} T/m/s ou menos.`;
    else if (ev.tMin > rem + 1e-9) why = `Esta aquisição gastaria ${fmt(ev.tMin, 1)} min e restam ${fmt(Math.max(0, rem), 1)} min.`;
    $("acqBtn").disabled = busy || !!why; $("acqBtn").textContent = `Adquirir (−${fmt(ev.tMin, 1)} min)`;
    $("locBtn").disabled = busy || state.locDone || rem < P.LOCALIZER_MIN; $("locBtn").textContent = state.locDone ? `Localizador: L ≈ ${cs.locEst} cm` : `Localizador (−${fmt(P.LOCALIZER_MIN, 1)} min)`;
    $("acqHint").textContent = why;
    $("hintBox").hidden = !lv.hints;
    document.querySelectorAll("[data-hint]").forEach((b) => { const i = Number(b.dataset.hint); b.textContent = `Dica ${i + 1} (−${P.HINT_PENALTY[i]})`; b.disabled = state.hints[i]; });
    $("hintList").innerHTML = state.hints.map((u, i) => (u ? `<li>${tex(P.hints(cs)[i].replace(/^Dica \d \(−\d+\): /, ""))}</li>` : "")).join("");
    $("deliverHint").textContent = state.acqCount === 0 ? "Faça ao menos uma aquisição no Laboratório antes de entregar." : (state.deliveries ? `Entregas feitas: ${state.deliveries}.` : "");
    $("deliverBtn").disabled = state.acqCount === 0;
  }
  function readoutLines(cfg, ev, hide) {
    const q = (v) => (hide ? "?" : v), rp = ev.P / P.polarization(1.5), ex = P.evaluate(cs, { B0: 1.5, G: 10, S: 100, t: 2, N: 256, NEX: 1 });
    return `ν₀ = γ̄B₀ = 42,577 MHz/T × ${fmt(cfg.B0, 1)} T = <b>${fmt(ev.nuMHz, 2)} MHz</b> · ΔE = hν₀ = ${sci(ev.zeemanEV, 2)} eV · P = ΔE/(2k_BT) = ${sci(ev.P, 2)}<br>
      k_max = γ̄·G·t_read/2 = 42,577×10⁶ × ${fmt(cfg.G / 1000, 4)} × ${sci(cfg.t / 1000, 1)} / 2 = <b>${q(fmt(ev.kMax, 1) + " m⁻¹")}</b><br>
      Δx = 1/(2k_max) = <b>${q(fmt(ev.dxMm, 3) + " mm")}</b><br>
      Δk = 2k_max/N = ${q(fmt(ev.dkPerM, 2) + " m⁻¹")} → FOV = 1/Δk = N·Δx = <b>${q(fmt(ev.fovCm, 1) + " cm")}</b><br>
      BW total = N/t_read = ${cfg.N}/${sci(cfg.t / 1000, 1)} s = <b>${fmt(ev.bwHz / 1000, 1)} kHz</b> (±${fmt(ev.bwHz / 2000, 1)} kHz) · BW/pixel = 1/t_read = <b>${fmt(ev.bwPerPixelHz, 0)} Hz</b> · G = BW/(γ̄·FOV)<br>
      SNR = 8·R_P·Δx·√NEX·√(τ/4)·√(256/N) = 8 × ${fmt(rp, 2)} × ${q(fmt(ev.dxMm, 3))} × √${cfg.NEX} × √(${fmt(cfg.t, 1)}/4) × √(256/${cfg.N}) = <b>${fmt(ev.snr, 1)}</b><br>
      TR = 600 + t_read + 2G/S = 600 + ${fmt(cfg.t, 1)} + 2×${fmt(cfg.G, 1)}/${fmt(cfg.S, 0)} = ${fmt(ev.trMs, 1)} ms · t_exame = NEX·N·TR = <b>${fmt(ev.tMin, 2)} min</b> · custo = <b>${fmt(ev.cost, 2)}</b><br>
      dB/dt = S·r = ${fmt(cfg.S, 0)} × 0,25 m = <b>${fmt(ev.dBdtTs, 1)} T/s</b> (limite ${fmt(cs.dBdtMaxTs, 0)} T/s)
      <small>R_P = P(B₀)/P(1,5 T): quantas vezes a polarização supera a de 1,5 T (P = ΔE/(2k_BT), Aula 4). τ = t_read em ms; τ/4 e 256/N normalizam pelo protocolo de referência (4 ms, 256 amostras, SNR = 8, constante calibrada, não derivada). Técnico ↔ aluno: BW = N/t_read, G = BW/(γ̄·FOV).</small>
      <small>Exemplo resolvido (não é o seu caso): B₀ = 1,5 T, G = 10 mT/m, S = 100, t_read = 2 ms, N = 256, NEX = 1 → k_max = ${fmt(ex.kMax, 0)} m⁻¹, Δx = ${fmt(ex.dxMm, 2)} mm, FOV = 256 × ${fmt(ex.dxMm, 2)} = ${fmt(ex.fovCm, 1)} cm, SNR = 8 × 1 × ${fmt(ex.dxMm, 2)} × 1 × √(2/4) × 1 = ${fmt(ex.snr, 1)}, t_exame = 256 × ${fmt(ex.trMs, 1)} ms = ${fmt(ex.tMin, 2)} min.</small>`;
  }
  const LIMIT = `<div class="limit">Limite do modelo: perfil 1D de um objeto sintético, sem relaxação (T₁, T₂) nem seleção de corte; polarização linear em B₀ (P ≈ ΔE/2k_BT para ~10¹⁹–10²¹ prótons por voxel); ruído branco, sorteado como estatística de contagem, não um receptor real. O SNR didático é o de um perfil 1D (∝ Δx); a nota da Aula 6 (§7) usa (Δx)², a área do voxel num corte, e o tempo usa N linhas de fase: a inconsistência é declarada. A constante 8 é calibrada, não derivada. Na prática T₁ e TR dependem do campo, e o ganho de 7 T é menor. A estimulação dB/dt = S·r (r = 0,25 m) é um limite didático.</div>`;

  function drawLab() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg), sh = state.shown, fresh = sh && finished(sh);
    $("GOut").textContent = fmt(cfg.G, 1); $("SOut").textContent = `${fmt(cfg.S, 0)} (dB/dt ${fmt(ev.dBdtTs, 1)} T/s)`; $("tOut").textContent = fmt(cfg.t, 1); $("NOut").textContent = String(cfg.N); $("NEXOut").textContent = String(cfg.NEX);
    updateHud(); refreshButtons();
    const showTrue = (state.unlocked || PROF) && sh, hide = derivedHidden();   // o objeto verdadeiro (s, L) só aparece com nota ≥ 90, 3ª entrega ou ?prof=1
    const main = canvas("mainCanvas", .5, 540), stack = main.narrow, wL = stack ? main.w : main.w * .4, hL = stack ? main.h * .46 : main.h;
    // ---- esquerda: visão geral (FOV)
    const ctx = main.ctx;
    const A = axes(main, { x: 0, y: 0, w: wL, h: hL }, -20, 20, -.25, 1.5, "posição x (cm)", "densidade ρ (relativa)", { ticks: 4, xTicks: [-20, -10, 0, 10, 20], yTicks: [0, .5, 1] });
    if (!hide) {
      clip(A, (c) => { c.fillStyle = "rgba(69,123,157,.10)"; c.fillRect(A.X(-ev.fovCm / 2), A.top, A.X(ev.fovCm / 2) - A.X(-ev.fovCm / 2), A.bottom - A.top); });
      vline(A, -ev.fovCm / 2, C.blue, [6, 4], 1.8); vline(A, ev.fovCm / 2, C.blue, [6, 4], 1.8);
      label(ctx, `FOV atual = ${fmt(ev.fovCm, 1)} cm`, A.left + 6, A.top + 12, C.blue, "left", "bold 10px Ubuntu, system-ui");
    } else label(ctx, "FOV: digite a previsão de Δx para ver", A.left + 6, A.top + 12, C.gray, "left", "10px Ubuntu, system-ui");
    if (state.locDone) { clip(A, (c) => { c.strokeStyle = C.gray; c.lineWidth = 5; c.setLineDash([]); c.beginPath(); c.moveTo(A.X(-cs.locEst / 2), A.Y(-.15)); c.lineTo(A.X(cs.locEst / 2), A.Y(-.15)); c.stroke(); }); label(ctx, `objeto ≈ ${cs.locEst} cm (localizador)`, A.left + 6, A.Y(-.15) - 8, C.gray, "left", "10px Ubuntu, system-ui"); }
    if (showTrue) { area(A, [{ x: -cs.LCm / 2, y: 0 }, { x: -cs.LCm / 2, y: .5 }, { x: cs.LCm / 2, y: .5 }, { x: cs.LCm / 2, y: 0 }], "rgba(111,113,113,.20)"); }
    if (sh) {
      const wx = sh.wideX.map((x) => x * 100);
      if (sh.ev.aliased && fresh) { const w = Math.min((cs.LCm - sh.ev.fovCm) / 2, sh.ev.fovCm / 2), f2 = sh.ev.fovCm / 2; hatch(A, -f2, -f2 + w, C.red); hatch(A, f2 - w, f2, C.red); label(ctx, "aliasing", A.X(0), A.top + 26, C.red, "center", "bold 10px Ubuntu, system-ui"); }
      line(A, wx.map((x, i) => ({ x, y: sh.wideN[i] })), C.gold, [], 1.4, .95);
      line(A, wx.map((x, i) => ({ x, y: sh.wideC[i] })), C.red, [], 1.8);
    } else label(ctx, "Adquira para formar a imagem", (A.left + A.right) / 2, (A.top + A.bottom) / 2, C.gray, "center", "11px Ubuntu, system-ui");
    // ---- direita: zoom nas lesões
    const Rbox = stack ? { x: 0, y: hL, w: main.w, h: main.h - hL } : { x: wL, y: 0, w: main.w - wL, h: main.h };
    const Z = axes(main, Rbox, -8, 8, -.3, 1.7, "posição x (mm)", "densidade de prótons ρ (relativa)", { ticks: 5, xTicks: stack ? [-8, -4, 0, 4, 8] : [-8, -6, -4, -2, 0, 2, 4, 6, 8] });
    if (showTrue) area(Z, samples(-8, 8, 800, (x) => P.rho(bands, x * 1e-3)), "rgba(111,113,113,.22)");
    if (sh) {
      const zx = sh.zoomX.map((x) => x * 1e3);
      line(Z, zx.map((x, i) => ({ x, y: sh.zoomN[i] })), C.gold, [], 1.5, .95);
      line(Z, zx.map((x, i) => ({ x, y: sh.zoomC[i] })), C.red, [], 2.6);
      if (lv.showDerived || state.revealed) {
        const yb = 1.55, xr = 7.6, dxm = sh.ev.dxMm, tooLong = dxm > 15, xl = tooLong ? -7.6 : xr - dxm;
        clip(Z, (c) => { c.strokeStyle = C.blue; c.lineWidth = 3; c.setLineDash([]); c.beginPath(); c.moveTo(Z.X(xl), Z.Y(yb)); c.lineTo(Z.X(xr), Z.Y(yb)); c.stroke(); });
        label(ctx, tooLong ? `Δx = ${fmt(dxm, 2)} mm (régua maior que a janela)` : `Δx = ${fmt(dxm, 2)} mm`, Z.X(xr), Z.Y(yb) - 7, C.blue, "right", "bold 11px Ubuntu, system-ui");
      }
      if (fresh) {
        const ok = sh.ev.resolvedOK && !sh.ev.aliased, txt = sh.ev.aliased ? (sh.ev.resolvedOK ? "lesões separadas, mas a imagem dobrou" : "imagem dobrada (aliasing), lesões não separadas") : (sh.ev.resolvedOK ? "lesões SEPARADAS: sim" : "lesões separadas: NÃO");
        label(ctx, txt, Z.left + 8, Z.top + 14, sh.ev.resolvedOK ? C.green : C.red, "left", "bold 12px Ubuntu, system-ui");
        if (!ok && sh.ev.aliased) label(ctx, `FOV ${fmt(sh.ev.fovCm, 1)} cm < objeto`, Z.left + 8, Z.top + 30, C.red, "left", "11px Ubuntu, system-ui");
      } else label(ctx, "adquirindo: o espaço k preenche do centro para fora…", Z.left + 8, Z.top + 14, C.violet, "left", "bold 11px Ubuntu, system-ui");
    } else label(ctx, "Adquira para formar a imagem", (Z.left + Z.right) / 2, (Z.top + Z.bottom) / 2, C.gray, "center", "11px Ubuntu, system-ui");
    drawSecondary(cfg, ev);
    const fromAcq = sh ? `última aquisição: B₀ = ${fmt(sh.cfg.B0, 1)} T, G = ${fmt(sh.cfg.G, 1)} mT/m, t_read = ${fmt(sh.cfg.t, 1)} ms, N = ${sh.cfg.N}, NEX = ${sh.cfg.NEX}` : "nenhuma aquisição ainda";
    texts({ status: "Laboratório", detail: `${fmt(ev.tMin, 1)} min · ${fmt(ev.cost, 1)} u.c.`,
      title: "A imagem, o campo de visão e o espaço k", subtitle: `esquerda: visão geral e FOV · direita: zoom nas lesões · ${fromAcq}`,
      caption: "Vermelho: reconstrução sem ruído; dourado: com o ruído estatístico do protocolo. O campo de visão (faixa azul) é 1/Δk: se o objeto passa dele, o excedente dobra para dentro da imagem (aliasing). A réguaazul mostra o menor detalhe Δx = 1/(2k_max).".replace("réguaazul", "régua azul") + (showTrue ? " Cinza: o objeto verdadeiro." : ""),
      secondaryTitle: "Espaço k amostrado e hélice de fase", secondarySubtitle: "pontos: |S(k_j)|/S(0) medidos (escala log), j de −N/2 a N/2−1 · azul: ±k_max · tracejado: ruído",
      secondaryCaption: "O gradiente enrola a fase dos spins ao longo de x (hélice à direita): uma volta a cada 1/k. Cada amostra mede uma onda plana do objeto, de −k_max a +k_max em passos Δk; o que está acima de k_max se perde. Onde o sinal desce até o nível de ruído (tracejado), a amostra só carrega ruído.",
      legend: [[C.red, "reconstrução sem ruído"], [C.gold, "com ruído"], [C.violet, "amostras S(k)"], [C.blue, "±k_max e FOV"], [C.gray, "objeto (localizador)"]],
      prediction: "Registre no roteiro, sem calcular: com o protocolo que pretende rodar primeiro, Δx fica acima ou abaixo de 1 mm, e o FOV passa do objeto? Só então digite a previsão numérica de Δx (mm) no campo à esquerda: as leituras Δx e FOV aparecem depois disso. Para conferir o veredito: a regra segura é Δx ≤ s/1,55.",
      calculation: readoutLines(cfg, ev, hide) + LIMIT,
      metrics: [["Δx", !lv.showDerived ? "calcule" : hide ? "?" : `${fmt(ev.dxMm, 2)} mm`], ["FOV", !lv.showDerived ? "calcule" : hide ? "?" : `${fmt(ev.fovCm, 1)} cm`], ["SNR", fmt(ev.snr, 1)], ["tempo · custo", `${fmt(ev.tMin, 2)} min · ${fmt(ev.cost, 2)} u.c.`], ["BW total · BW/pixel", `±${fmt(ev.bwHz / 2000, 1)} kHz · ${fmt(ev.bwPerPixelHz, 0)} Hz`], ["dB/dt = S·r", `${fmt(ev.dBdtTs, 1)} T/s (máx. ${fmt(cs.dBdtMaxTs, 0)})`]],
      concept: "A resolução vem de k_max = γ̄Gt_read/2 (quanto do espaço k você mede), o campo de visão vem de Δk (quão denso você amostra), e o SNR vem de P ∝ B₀, do volume do voxel e da estatística de contagem: a RM é a expansão de ρ(x) em e^(2πikx) da Aula 6, com a polarização da Aula 4 e o ruído 1/√N da Aula 2.",
      prompts: ["Dobre G mantendo t_read e N: o que acontece com Δx, FOV e SNR? Dobre depois só o B₀: quais dos três mudam?", "Com o L do localizador e a margem do nível, que N dá o FOV mínimo para o seu Δx?", "Suba S até o limite de dB/dt: o tempo de exame muda? E se você subir G com S fixo?"] });
  }
  function kMaxLabel(ctx, x0, y, k, color, side) {
    const f1 = "bold 11px Ubuntu, system-ui", f2 = "bold 8px Ubuntu, system-ui", pre = "k", sub = "max", post = ` = ${fmt(k, 0)} m⁻¹`;
    ctx.font = f1; const w1 = ctx.measureText(pre).width, w3 = ctx.measureText(post).width; ctx.font = f2; const w2 = ctx.measureText(sub).width, tot = w1 + w2 + w3;
    const x = side < 0 ? x0 - tot : x0;
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.font = f1; ctx.fillText(pre, x, y); ctx.font = f2; ctx.fillText(sub, x + w1, y + 3); ctx.font = f1; ctx.fillText(post, x + w1 + w2, y);
  }
  function drawHelix(ctx, box, kS, kMax, t) {
    const x0 = box.x + 14, x1 = box.x + box.w - 14, yc = box.y + box.h / 2, amp = Math.min(box.h * 0.28, 60);
    ctx.save(); ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    const XM = 6e-3, toX = (x) => (x0 + x1) / 2 + x / XM * (x1 - x0) / 2;
    ctx.strokeStyle = C.violet; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i <= 160; i += 1) { const x = -XM + 2 * XM * i / 160, y = yc - amp * Math.sin(TAU * kS * x); i ? ctx.lineTo(toX(x), y) : ctx.moveTo(toX(x), y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(123,94,167,.28)"; ctx.beginPath();
    for (let i = 0; i <= 160; i += 1) { const x = -XM + 2 * XM * i / 160, y = yc - amp * Math.cos(TAU * kS * x) * 0.5; i ? ctx.lineTo(toX(x), y) : ctx.moveTo(toX(x), y); }
    ctx.stroke();
    for (let i = 0; i < 13; i += 1) {
      const x = -XM + 2 * XM * i / 12, ph = TAU * kS * x, px = toX(x), r = 9;
      ctx.strokeStyle = C.gray; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, yc, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `hsl(${(200 + 360 * ((ph / TAU) % 1 + 1)) % 360},55%,45%)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, yc); ctx.lineTo(px + r * Math.cos(ph), yc - r * Math.sin(ph)); ctx.stroke();
    }
    ctx.restore();
    label(ctx, "fase dos spins em x (−6 a +6 mm)", (x0 + x1) / 2, box.y + 14, C.gray, "center", "10px Ubuntu, system-ui");
    label(ctx, !predReady() ? "k cresce de 0 até k_max (escala após a previsão)" : kS > 1 ? `k = ${fmt(kS, 0)} m⁻¹ · 1/k = ${fmt(1000 / kS, 2)} mm` : "k ≈ 0", (x0 + x1) / 2, box.y + box.h - 10, C.violet, "center", "bold 11px Ubuntu, system-ui");
  }
  function drawSecondary(cfg, ev, tNow) {
    const sec = canvas("secondaryCanvas", .3, 420), stack = sec.narrow, ctx = sec.ctx, sh = state.shown;
    const wA = stack ? sec.w : sec.w * .66, hA = stack ? sec.h * .6 : sec.h, kShow = !predReady() ? 1000 : Math.max(ev.kMax, sh ? sh.ev.kMax : 0) * 1.18;   // sem previsão digitada o eixo é fixo: a escala não entrega k_max
    const LOGMIN = -5, lg = (v) => Math.max(LOGMIN, Math.log10(Math.max(Math.abs(v), 1e-12)));
    const S = axes(sec, { x: 0, y: 0, w: wA, h: hA }, -kShow, kShow, LOGMIN, 0.4, "frequência espacial k (m⁻¹)", "log₁₀ |S(k)| / S(0)", { ticks: 4, yTicks: [-5, -4, -3, -2, -1, 0], yDigits: 0, xTarget: stack ? 4 : 6 });
    const hid = !predReady();
    if (!hid) {
      clip(S, (c) => { c.fillStyle = "rgba(69,123,157,.12)"; c.fillRect(S.X(-ev.kMax), S.top, S.X(ev.kMax) - S.X(-ev.kMax), S.bottom - S.top); });
      vline(S, -ev.kMax, C.blue, [], 1.6); vline(S, ev.kMax, C.blue, [], 1.6);
    }
    if (!hid) kMaxLabel(ctx, Math.min(S.right - 6, S.X(ev.kMax) + 6), S.top + 12, ev.kMax, C.blue, S.X(ev.kMax) + 150 > S.right ? -1 : 1);
    if (hid) {
      label(ctx, "k_max, Δk e as amostras aparecem depois da previsão de Δx", S.left + 8, S.top + 28, C.violet, "left", "10px Ubuntu, system-ui");
    } else if (sh && sh.cfg.N === cfg.N && Math.abs(sh.ev.kMax - ev.kMax) < 1e-9) {
      const s0 = P.signal(bands, 0), dots = sh.cfg.N <= 192, upto = sh.done, base = S.Y(LOGMIN);
      clip(S, (c) => {
        c.strokeStyle = C.violet; c.fillStyle = C.violet; c.lineWidth = 1;
        for (let q = 0; q < upto; q += 1) { const i = sh.order[q], x = S.X(sh.ks[i]), y = S.Y(lg(sh.noisy[i] / s0)); if (dots) { c.beginPath(); c.moveTo(x, base); c.lineTo(x, y); c.stroke(); c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill(); } else c.fillRect(x - .6, y - .6, 1.4, 1.4); }
      });
      const sigK = 0.5 / sh.ev.snr * Math.SQRT2 / (sh.dk * Math.sqrt(sh.cfg.N)), yFloor = lg(sigK / s0);
      clip(S, (c) => { c.strokeStyle = C.gold; c.lineWidth = 1.6; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(S.left, S.Y(yFloor)); c.lineTo(S.right, S.Y(yFloor)); c.stroke(); });
      label(ctx, "nível de ruído", S.left + 8, S.Y(yFloor) - 5, C.gold, "left", "bold 10px Ubuntu, system-ui");
    } else {
      clip(S, (c) => { c.fillStyle = C.violet; for (let j = 0; j < cfg.N; j += 1) { const k = (j - cfg.N / 2) * ev.dkPerM, x = S.X(k); if (cfg.N <= 192) c.fillRect(x - .8, S.Y(LOGMIN) - 8, 1.6, 8); else if (j % Math.ceil(cfg.N / 192) === 0) c.fillRect(x - .5, S.Y(LOGMIN) - 5, 1, 5); } });
      label(ctx, "marcas: posições k = jΔk que serão amostradas", S.left + 8, S.top + 28, C.violet, "left", "10px Ubuntu, system-ui");
    }
    label(ctx, hid ? `N = ${cfg.N} amostras (k_max e Δk: digite a previsão de Δx)` : `Δk = ${fmt(ev.dkPerM, 2)} m⁻¹ · N = ${cfg.N} amostras`, S.left + 8, S.top + 12, C.ink, "left", "bold 10px Ubuntu, system-ui");
    // hélice
    const Hbox = stack ? { x: 0, y: hA, w: sec.w, h: sec.h - hA } : { x: wA, y: 0, w: sec.w - wA, h: sec.h };
    let kS = ev.kMax * (((tNow ?? 0) / 4000) % 1);
    if (state.anim && sh && !finished(sh)) { const k = sh.order[Math.min(sh.order.length - 1, sh.done)]; kS = Math.abs(sh.ks[k]); }
    drawHelix(ctx, Hbox, kS, ev.kMax, tNow || 0);
  }

  // ---------------------------------------------------------------- ações do laboratório
  function startAcquisition() {
    if ($("acqBtn").disabled) return;
    const cfg = readCfg(), ev = P.evaluate(cs, cfg);
    if (!state.pred.locked) { state.pred = { value: parseNum($("pred").value), locked: true, trueDx: ev.dxMm }; }
    state.acqCount += 1; state.used += ev.tMin; state.lastCfg = cfg;
    state.shown = simulate(cfg, state.acqCount, false); state.anim = state.shown;
    save(); render();
  }
  function useLocalizer() { if ($("locBtn").disabled) return; state.locDone = true; state.used += P.LOCALIZER_MIN; save(); render(); }
  function useHint(i) { if (!lv.hints || state.hints[i]) return; state.hints[i] = true; save(); render(); }

  // ================================================================ 03 · Entrega
  const concepts = () => P.makeConcepts(seed, state.deliveries);   // ordem das opções: muda a cada entrega
  const bridgeTable = (cfg, ev) => `<table><tr><th>o técnico do magneto diz</th><th>o aluno controla</th><th>no seu protocolo</th></tr>
      <tr><td>largura de banda do receptor ±BW/2</td><td>BW = N/t_read</td><td class="num">±${fmt(ev.bwHz / 2000, 1)} kHz</td></tr>
      <tr><td>largura de banda por pixel</td><td>BW/pixel = 1/t_read</td><td class="num">${fmt(ev.bwPerPixelHz, 0)} Hz</td></tr>
      <tr><td>campo de visão FOV e gradiente de leitura</td><td>G = BW/(γ̄·FOV) e FOV = N·Δx</td><td class="num">${lv.showDerived ? `${fmt(ev.fovCm, 1)} cm · ${fmt(cfg.G, 1)} mT/m` : `calcule · ${fmt(cfg.G, 1)} mT/m`}</td></tr></table>
      <p>Para quem pensa em deslocamento químico: água e gordura diferem 3,5 ppm, ≈ 220 Hz a 1,5 T; com BW/pixel = 155 Hz (t_read ≈ 6,5 ms) o desvio é ≈ 1,4 pixel.</p>`;
  function renderEntrega() {
    const cfg = readCfg(), ev = P.evaluate(cs, cfg);
    $("finalCfg").innerHTML = tex(`<table><tr><th>B₀</th><th>G</th><th>S</th><th>t_read</th><th>N</th><th>NEX</th></tr><tr><td>${fmt(cfg.B0, 1)} T</td><td>${fmt(cfg.G, 1)} mT/m</td><td>${fmt(cfg.S, 0)} T/m/s</td><td>${fmt(cfg.t, 1)} ms</td><td>${cfg.N}</td><td>${cfg.NEX}</td></tr></table>
      <p>Este é o protocolo dos controles do Laboratório. Calcule com ele o <b>Δx</b>, o <b>FOV</b>, o <b>SNR</b> e o <b>tempo de exame</b>${lv.showDerived ? " (os valores ao vivo ajudam; confira a conta aberta)" : " (neste nível o aparelho não mostra Δx nem FOV)"}.</p>`);
    $("bridgeBody").innerHTML = tex(bridgeTable(cfg, ev));
    refreshButtons(); updateHud();
    texts({ status: "Entrega", detail: state.deliveries ? `${state.deliveries} entrega(s)` : "ainda não entregue",
      prediction: "Antes de entregar: qual conceito foi o gargalo do seu protocolo, k_max, Δk, SNR ou B₀? E qual deles, sozinho, nunca melhorou a resolução? Escreva a razão de cada letra no roteiro.",
      calculation: readoutLines(cfg, ev, !lv.showDerived) + LIMIT,
      metrics: [["B₀", `${fmt(cfg.B0, 1)} T`], ["G · S · t_read", `${fmt(cfg.G, 1)} mT/m · ${fmt(cfg.S, 0)} T/m/s · ${fmt(cfg.t, 1)} ms`], ["N · NEX", `${cfg.N} · ${cfg.NEX}`], ["limites", `SNR ≥ ${fmt(cs.snrMin, 0)} · ${fmt(cs.tMaxMin, 1)} min · ${fmt(cs.costMax, 0)} u.c. · ${fmt(cs.dBdtMaxTs, 0)} T/s`], ["entregas", String(state.deliveries)], ["dicas usadas", String(state.hints.filter(Boolean).length)]],
      concept: "Entregar é decidir com a física das três aulas: k_max e Δk (Aula 6) decidem resolução e FOV; P ∝ B₀ (Aula 4) e a estatística de contagem (Aulas 2 e 6) decidem o SNR; o orçamento decide o que é viável.",
      prompts: ["Confira Δx, FOV, SNR e tempo com a conta aberta antes de digitar.", "Marque o conceito que decidiu cada ponto, não o que parece mais sofisticado; a ordem das opções muda a cada entrega.", "Depois da entrega, leia a auditoria: onde o seu protocolo ficou abaixo do limite, e por quê?"] });
  }
  function buildConcepts() {
    $("conceptQs").innerHTML = concepts().map((q, i) => `<div class="cq"><p>${i + 1}. ${tex(q.q)}</p>${q.opts.map((o, j) => `<label><input type="radio" name="cq${i}" value="${j}"><span><b>${"ABCD"[j]})</b> ${tex(o)}</span></label>`).join("")}</div>`).join("");
  }
  function deliver() {
    if (state.acqCount === 0) return;
    state.deliveries += 1;
    const a = readAnswers(), cfg = readCfg();
    const res = P.score(cs, { cfg, values: a.values, concepts: a.concepts, predDxMm: state.pred.value, predTrueDxMm: state.pred.trueDx, sessionUsedMin: state.used, hintsUsed: state.hints, deliveryNumber: state.deliveries });
    const open = P.revealCase(res.total, state.deliveries, PROF);
    state.last = res; state.revealed = true; if (open) state.unlocked = true; save();
    $("resultCard").hidden = false; $("auditCard").hidden = false;
    $("bigScore").innerHTML = `${fmt(res.total, 1)}<small> / 100</small>`;
    set("resultSub", `entrega nº ${state.deliveries} · ${res.feasible ? "o protocolo cumpre a missão" : "o protocolo NÃO cumpre toda a missão"} · ${res.nConcepts} de 3 conceitos corretos`);
    // Antes de liberar os números do caso, os três conceitos entram numa só linha: "n de 3 corretos", sem dizer quais.
    const items = res.items.filter((it) => !it.name.startsWith("Conceito")), cons = res.items.filter((it) => it.name.startsWith("Conceito"));
    const row = (it) => `<tr><td>${it.name}</td><td class="num ${it.got >= it.max - 1e-9 ? "ok" : (it.got <= 0 ? "bad" : "")}">${fmt(it.got, 1)} / ${it.max}</td><td>${tex(it.note)}</td></tr>`;
    const consRows = open ? cons.map(row).join("") : `<tr><td>Justificativa (3 conceitos)</td><td class="num">—</td><td>${res.nConcepts} de 3 conceitos corretos (os números do caso e os conceitos certos aparecem com nota ≥ 90 ou na 3ª entrega)</td></tr>`;
    $("scoreTable").innerHTML = `<table><tr><th>item</th><th class="num">pontos</th><th>observação</th></tr>${items.map(row).join("")}${consRows}
      <tr><td>Dicas usadas</td><td class="num">−${fmt(res.hintPenalty, 0)}</td><td></td></tr><tr><td>Entregas adicionais</td><td class="num">−${fmt(res.redeliveryPenalty, 0)}</td><td>${state.deliveries} entrega(s)</td></tr>
      <tr><th>Total</th><th class="num">${fmt(res.total, 1)}</th><th></th></tr></table>`;
    $("auditBody").innerHTML = tex(auditHtml(cfg, res, open));
    buildConcepts();   // nova ordem das opções para uma eventual reentrega
    render(); $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function auditHtml(cfg, res, open) {
    const ev = res.ev, ok = (b) => (b ? '<span class="ok">cumpre</span>' : '<span class="bad">não cumpre</span>');
    const cn = open ? "" : " Os números do caso (s, L, Δx_crit) aparecem com nota ≥ 90 ou na 3ª entrega.";
    let h = `<ol>
      <li><b>Larmor e polarização (Aula 4).</b> ν₀ = γ̄B₀ = 42,577 MHz/T × ${fmt(cfg.B0, 1)} T = ${fmt(ev.nuMHz, 2)} MHz; ΔE = hν₀ = ${sci(ev.zeemanEV, 2)} eV; P = ΔE/(2k_BT) = ${sci(ev.P, 2)} a 310 K. B₀ entra só no sinal.</li>
      <li><b>Resolução (Aula 6).</b> k_max = γ̄·G·t_read/2 = ${fmt(ev.kMax, 1)} m⁻¹; Δx = 1/(2k_max) = ${fmt(ev.dxMm, 3)} mm. ${open ? `As lesões estão a s = ${fmt(cs.sMm, 1)} mm: o vale persiste para Δx ≤ ${fmt(cs.dxCritMm, 2)} mm (≈ s/${fmt(cs.sMm / cs.dxCritMm, 2)}; o limiar exato varia de s/1,42 a s/1,54 e a regra segura é Δx ≤ s/1,55).` : "O vale entre as lesões persiste para Δx abaixo de um limite escondido do caso."} Seu Δx ${ok(ev.resolvedOK)}.${cn}</li>
      <li><b>Campo de visão (Aula 6, exercício de Física Médica).</b> Δk = 2k_max/N = ${fmt(ev.dkPerM, 2)} m⁻¹; FOV = 1/Δk = N·Δx = ${fmt(ev.fovCm, 1)} cm${open ? ` contra L = ${cs.LCm} cm (o localizador disse ${cs.locEst})` : " contra o L escondido"}. Seu FOV ${ok(!ev.aliased)}${ev.aliased ? ": o excedente dobra para dentro da imagem" : ""}.</li>
      <li><b>SNR (Aulas 2, 4 e 6).</b> SNR = 8·R_P·Δx[mm]·√NEX·√(τ/4)·√(256/N) = ${fmt(ev.snr, 1)}, com R_P = P(B₀)/P(1,5 T) = ${fmt(ev.P / P.polarization(1.5), 2)}; mínimo ${fmt(cs.snrMin, 0)}. ${ok(ev.snr >= cs.snrMin)}. A banda N/t_read = ${fmt(ev.bwHz / 1000, 1)} kHz (${fmt(ev.bwPerPixelHz, 0)} Hz por pixel) sobe o ruído; as NEX médias o reduzem como 1/√NEX (estatística de contagem).</li>
      <li><b>Tempo e custo.</b> TR = 600 + ${fmt(cfg.t, 1)} + 2·${fmt(cfg.G, 1)}/${fmt(cfg.S, 0)} = ${fmt(ev.trMs, 1)} ms; t_exame = NEX·N·TR = ${cfg.NEX}×${cfg.N}×${fmt(ev.trMs, 1)} ms = ${fmt(ev.tMin, 2)} min (máx. ${fmt(cs.tMaxMin, 1)}): ${ok(ev.tMin <= cs.tMaxMin)}. Custo = ${fmt(P.COST_B0[cfg.B0], 0)} + 0,4×${fmt(ev.tMin, 2)} = ${fmt(ev.cost, 2)} (máx. ${fmt(cs.costMax, 0)}): ${ok(ev.cost <= cs.costMax)}.</li>
      <li><b>Estimulação.</b> dB/dt = S·r = ${fmt(cfg.S, 0)} T/m/s × 0,25 m = ${fmt(ev.dBdtTs, 1)} T/s contra o limite ${fmt(cs.dBdtMaxTs, 0)} T/s: ${ok(ev.stimOK)}. O limite é de dB/dt, não de G: G = ${fmt(cfg.G, 1)} mT/m é só uma questão de hardware (máx. 40). Subir G com t_read fixo dá Δx menor, mas derruba o FOV e o SNR; não é de graça.</li></ol>
      <p>Há mais de uma resposta válida: a referência é a de menor custo; um protocolo robusto que cumpra todas as restrições (por exemplo N = 512, NEX = 4) não é errado, só gasta mais sessão (eficiência) e, se passar do orçamento, perde na restrição de custo ou de tempo.</p>
      <div class="box limit"><b>Limite do modelo.</b> Perfil 1D de um objeto sintético, sem relaxação (T₁, T₂) nem seleção de corte; polarização linear em B₀ e ensemble de ~10¹⁹–10²¹ prótons por voxel; ruído branco; SNR didático de um perfil 1D (SNR_ref = 8 em 1,5 T, 1 mm, 4 ms, N = 256, constante calibrada), enquanto a nota da Aula 6 usa (Δx)² para a área do voxel. Na prática T₁ e TR dependem do campo. O sinal de RM é o valor esperado da magnetização, não uma medida projetiva.</div>`;
    if (open) { const cq = P.makeConcepts(seed, state.deliveries - 1).map((q) => `<li>${q.q} <b>${tex(q.opts[q.correct])}</b></li>`).join(""); h += `<p><b>Conceitos corretos:</b></p><ul>${cq}</ul>`; }
    else h += `<p><b>Conceitos:</b> ${res.nConcepts} de 3 corretos. Releia as perguntas e responda de novo (a ordem das opções mudou); a entrega adicional custa 5 pontos.</p>`;
    if (PROF) { const sol = P.solve(cs); h += sol ? `<div class="box"><b>Modo professor — solução de referência:</b> B₀ = ${sol.cfg.B0} T, G = ${sol.cfg.G} mT/m, S = ${sol.cfg.S} T/m/s, t_read = ${sol.cfg.t} ms, N = ${sol.cfg.N}, NEX = ${sol.cfg.NEX}.</div>` : ""; }
    return h;
  }

  // ---------------------------------------------------------------- coordenação
  function render() {
    document.querySelectorAll("[data-stage]").forEach((s) => s.classList.toggle("active", s.dataset.stage === view));
    if (view === "missao") { updateHud(); refreshButtons(); renderMissao(); }
    else if (view === "lab") drawLab();
    else renderEntrega();
  }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "missao";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    updateUrl();
    render();
  }
  function updateUrl() {
    try { const u = new URL(location.href); u.searchParams.set("view", view); u.searchParams.set("seed", String(seed)); u.searchParams.set("level", String(level)); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
  }
  function newCaseState(nextSeed, nextLevel) {
    seed = nextSeed; level = nextLevel; cs = P.makeCase(seed, level); lv = P.LEVELS[level]; bands = P.phantom(cs.LCm, cs.sMm);
    state = freshState(); $("seedIn").value = seed; $("levelSel").value = String(level);
    $("pred").value = ""; ["ansDx", "ansFov", "ansSnr", "ansT"].forEach((id) => { $(id).value = ""; });
    $("resultCard").hidden = true; $("auditCard").hidden = true; buildConcepts(); writeCfg(DEFAULTS);
    restore(); updateUrl(); render();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("levelSel").addEventListener("change", () => newCaseState(seed, Number($("levelSel").value)));
  $("seedApply").addEventListener("click", () => newCaseState(Math.max(1, Math.min(999999, Math.floor(Number($("seedIn").value)) || 1)), Number($("levelSel").value)));
  $("newCase").addEventListener("click", () => newCaseState(1 + Math.floor(Math.random() * 9999), Number($("levelSel").value)));
  $("acqBtn").addEventListener("click", startAcquisition);
  $("locBtn").addEventListener("click", useLocalizer);
  $("deliverBtn").addEventListener("click", deliver);
  document.querySelectorAll("[data-hint]").forEach((b) => b.addEventListener("click", () => useHint(Number(b.dataset.hint))));
  document.querySelectorAll("input, select").forEach((e) => { if (!["levelSel", "seedIn"].includes(e.id)) e.addEventListener("input", () => { save(); render(); }); });
  $("resetBtn").addEventListener("click", () => { if (view === "lab") writeCfg(DEFAULTS); if (view === "entrega") { ["ansDx", "ansFov", "ansSnr", "ansT"].forEach((id) => { $(id).value = ""; }); document.querySelectorAll(".cq input").forEach((r) => { r.checked = false; }); } render(); });
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });

  // laço de animação: avança a aquisição e gira a hélice enquanto o Laboratório está aberto
  let lastHelix = 0;
  function frame(now) {
    if (view === "lab") {
      const sh = state.shown;
      if (state.anim && sh && !finished(sh)) {
        const frames = 70, chunk = Math.max(1, Math.ceil(sh.order.length / frames));
        advance(sh, chunk); drawLab();
        if (finished(sh)) { state.anim = null; save(); drawLab(); }
      } else if (now - lastHelix > 50) { lastHelix = now; const cfg = readCfg(); drawSecondary(cfg, P.evaluate(cs, cfg), now); }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- partida
  buildConcepts();
  for (const [key, value] of params.entries()) { const el = $(key); if (el && !["view", "seed", "level", "prof"].includes(key) && (el.tagName === "INPUT" || el.tagName === "SELECT") && !["seedIn", "levelSel"].includes(key)) el.value = value; }
  $("seedIn").value = seed; $("levelSel").value = String(level);
  restore();
  switchView(view);
  requestAnimationFrame(frame);
})();
