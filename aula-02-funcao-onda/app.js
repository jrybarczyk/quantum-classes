(function () {
  "use strict";
  const P = window.WavePhysics;
  const $ = (id) => document.getElementById(id);
  // A moldura segue a marca do laboratório; as curvas usam a paleta conceitual dos slides.
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", gray: "#6f7171", grid: "#dce5dc", blue: "#3b6ea5", faint: "#c9d3c9" };
  const VIEWS = ["plane", "build", "packet", "born", "schrodinger"];
  let view = new URLSearchParams(location.search).get("view") || "plane";
  if (!VIEWS.includes(view)) view = "plane";

  // ---------- estado que não vive nos controles ----------
  const state = {
    playing: null,                       // id do slider de tempo em animação
    marks: { plane: [], packet: [] },    // instantes marcados para medir velocidades
    bornSamples: [],                     // posições sorteadas na estação de Born
    challenge: { plane: null, packet: null } // valores ocultos dos desafios
  };

  // ---------- utilidades de texto ----------
  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n });
  const sci = (x, n = 3) => { if (!Number.isFinite(x) || x === 0) return f(x, n); const e = Math.floor(Math.log10(Math.abs(x))); return `${f(x / 10 ** e, n)}×10<sup>${e}</sup>`; };
  const v = (id) => +$(id).value;
  function set(id, text) { $(id).textContent = text; }
  function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function legend(rows) { html("legend", rows.map(([color, label, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-style:dashed" : ""}"></i>${label}</span>`).join("")); }
  function showSecondary(show) { document.querySelector(".secondary-panel").hidden = !show; }

  // ---------- desenho ----------
  function canvasFor(id, aspect = 590 / 1100) {
    const e = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = w * aspect;
    e.width = w * ratio; e.height = h * ratio;
    const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h);
    return { c, w, h };
  }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }
  // Eixos, grade e séries. Devolve as funções de mapeamento para desenhar marcadores por cima.
  function plot(d, series, min, max, ymin, ymax, xlabel, ylabel) {
    const { c, w, h } = d, l = 58, r = w - 20, t = 25, b = h - 52;
    const X = (x) => l + (x - min) * (r - l) / (max - min), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    c.strokeStyle = C.grid; c.lineWidth = 1; c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui";
    for (let i = 0; i <= 5; i += 1) {
      const x = min + i * (max - min) / 5, y = ymin + i * (ymax - ymin) / 5;
      c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke();
      c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke();
      c.textAlign = "center"; c.fillText(f(x, 1), X(x), b + 16);
      c.textAlign = "right"; c.fillText(f(y, 1), l - 7, Y(y) + 3);
    }
    c.strokeStyle = C.gray; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(xlabel, (l + r) / 2, h - 10);
    c.save(); c.translate(13, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore();
    c.save(); c.beginPath(); c.rect(l, t, r - l, b - t); c.clip();
    series.forEach((s) => {
      if (s.fill) { c.fillStyle = s.fill; c.beginPath(); c.moveTo(X(s.points[0].x), Y(0)); s.points.forEach(p => c.lineTo(X(p.x), Y(p.y))); c.lineTo(X(s.points[s.points.length - 1].x), Y(0)); c.closePath(); c.fill(); }
      c.strokeStyle = s.color; c.lineWidth = s.width || 2.6; c.setLineDash(s.dash || []);
      c.beginPath(); s.points.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke(); c.setLineDash([]);
    });
    c.restore();
    return { X, Y, l, r, t, b, c };
  }
  function marker(m, x, color, label, yTop = m.t) {
    const px = m.X(x); if (px < m.l || px > m.r) return;
    m.c.strokeStyle = color; m.c.lineWidth = 1.6; m.c.setLineDash([4, 4]); m.c.beginPath(); m.c.moveTo(px, yTop); m.c.lineTo(px, m.b); m.c.stroke(); m.c.setLineDash([]);
    m.c.fillStyle = color; m.c.beginPath(); m.c.moveTo(px, yTop); m.c.lineTo(px - 6, yTop - 10); m.c.lineTo(px + 6, yTop - 10); m.c.closePath(); m.c.fill();
    m.c.font = "bold 11px Ubuntu,system-ui"; m.c.textAlign = "center"; m.c.fillText(label, px, yTop - 13);
  }
  function shade(m, a, b, color) { m.c.fillStyle = color; m.c.fillRect(m.X(a), m.t, m.X(b) - m.X(a), m.b - m.t); }
  // Curva de |Ψ|² pintada pela fase complexa (matiz = arg Ψ).
  function phaseStrip(m, pts, phases) {
    for (let i = 1; i < pts.length; i += 1) {
      m.c.strokeStyle = `hsl(${((phases[i] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * 180 / Math.PI} 65% 45%)`; m.c.lineWidth = 6;
      m.c.beginPath(); m.c.moveTo(m.X(pts[i - 1].x), m.Y(pts[i - 1].y)); m.c.lineTo(m.X(pts[i].x), m.Y(pts[i].y)); m.c.stroke();
    }
  }

  // ---------- animação ----------
  let lastFrame = 0;
  function frame(now) {
    if (!state.playing) return;
    const slider = $(state.playing), dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    let t = +slider.value + dt * 0.6;
    if (t > +slider.max) { if (slider.dataset.loop) t = +slider.min; else { t = +slider.max; stopPlaying(); } }
    slider.value = t.toFixed(3); render();
    if (state.playing) requestAnimationFrame(frame);
  }
  function startPlaying(id, loop) { state.playing = id; $(id).dataset.loop = loop ? "1" : ""; lastFrame = performance.now(); document.querySelectorAll("[data-play]").forEach(b => b.classList.toggle("on", b.dataset.play === id)); document.querySelectorAll("[data-play]").forEach(b => { if (b.dataset.play === id) b.textContent = "⏸ Pausar"; }); requestAnimationFrame(frame); }
  function stopPlaying() { state.playing = null; document.querySelectorAll("[data-play]").forEach(b => { b.classList.remove("on"); b.textContent = "▶ Tocar"; }); }

  // ---------- marcação de instantes (medida de velocidade) ----------
  function marksTable(key, columns, rows, expected) {
    const section = $("marksSection"); section.hidden = rows.length === 0; if (!rows.length) { html("marks", ""); return; }
    let body = `<thead><tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach(r => { body += `<tr>${r.map(x => `<td>${x}</td>`).join("")}</tr>`; });
    body += "</tbody>";
    if (rows.length >= 2) body += `<tfoot>${expected}</tfoot>`;
    html("marks", body);
  }

  // ======================================================================
  // Estação 1 — onda plana
  // ======================================================================
  function drawPlane() {
    const k = state.challenge.plane ?? v("planeK"), t = v("planeT"), omega = P.freeOmega(k), hidden = state.challenge.plane !== null;
    const d = canvasFor("mainCanvas");
    const re = samples(0, 2 * Math.PI, 300, (x) => P.plane(x, t, k, omega).re), im = samples(0, 2 * Math.PI, 300, (x) => P.plane(x, t, k, omega).im);
    const m = plot(d, [
      { points: re, color: C.green }, { points: im, color: C.blue, dash: [6, 4], width: 1.8 },
      { points: samples(0, 2 * Math.PI, 2, () => 1), color: C.red, dash: [8, 5] }
    ], 0, 2 * Math.PI, -1.1, 1.25, "posição x", "amplitude / densidade");
    phaseStrip(m, samples(0, 2 * Math.PI, 160, () => 1.14), samples(0, 2 * Math.PI, 160, (x) => P.plane(x, t, k, omega).phase).map(p => p.y));
    const crest = P.crestPosition(t, k, omega, 0);
    marker(m, crest, C.gold, `crista · x=${f(crest, 2)}`);
    legend([[C.green, "Re Ψ"], [C.blue, "Im Ψ", true], [C.red, "|Ψ|²", true], ["#999", "faixa: fase de Ψ (cor)"]]);
    set("planeKOut", hidden ? "?" : f(k, 2)); set("planeTOut", f(t, 2)); set("planeLambdaOut", `${f(v("planeLambda"), 2)} nm`);
    set("statusTitle", "Onda plana"); set("statusDetail", `k = ${hidden ? "?" : f(k, 2)} · t = ${f(t, 2)}`);
    set("mainTitle", "Onda plana e densidade"); set("mainSubtitle", "Re e Im oscilam em quadratura; |Ψ|² permanece constante");
    set("caption", "A faixa colorida mostra a fase complexa girando ao longo de x: é ela, e não a parte real, que carrega a informação da onda. O marcador segue uma crista, que avança com v_f=ω/k. Eixo de 0 a 2π.");
    set("prediction", "Se t mudar, |Ψ|² muda de forma ou apenas a fase? A crista anda com a velocidade clássica v=ħk/m ou com metade dela?");
    const si = P.electronSI(v("planeLambda") * 1e-9);
    html("calculation", hidden
      ? `k oculto: conte os períodos em 0≤x≤2π.<small>k = 2π/λ = número de períodos que cabem no eixo.</small>`
      : `ω = k²/2 = ${f(omega, 3)}<small>v_f = ω/k = ${f(k / 2, 3)} · v_g = dω/dk = ${f(k, 3)}</small><small>Em SI, elétron com λ=${f(v("planeLambda"), 2)} nm: k=${sci(si.k, 3)} m⁻¹, E=${f(si.energyEV, 1)} eV (tensão de aceleração ${f(si.voltage, 1)} V), v_g=${sci(si.groupVelocity, 3)} m/s, v_f=${sci(si.phaseVelocity, 3)} m/s, v_g/c=${f(si.beta, 4)}</small>`);
    metrics(hidden ? [["k", "oculto"], ["|Ψ|²", "constante"]] : [["ω", f(omega)], ["v_f", f(k / 2)], ["v_g", f(k)], ["v_f/v_g", "0,500"], ["|Ψ|²", "constante"]]);
    set("conceptTitle", "Momento definido não localiza"); set("conceptText", "A uniformidade de |Ψ|² é a contrapartida espacial de Δp=0: para localizar, precisamos superpor muitos k (estação 2).");
    prompts(["Toque a animação e marque dois instantes: a velocidade medida da crista é ω/k ou k? Compare com v_g=k, que só aparece num pacote (estação 3).", "Mude λ do elétron na tradução em SI e verifique que E cresce como 1/λ².", "Ative o desafio e descubra k contando períodos no eixo."]);
    const rows = state.marks.plane.map((r, i) => [i + 1, f(r.t, 2), f(r.x, 3)]);
    const rate = P.measuredCrestVelocity(state.marks.plane, k, omega), periodTime = 4 * Math.PI / (k * k);
    const rateCell = rate === null ? `— <small>marque instantes com Δt &lt; ${hidden ? "um período" : f(periodTime, 2)}: a crista não pode ter andado um λ inteiro entre duas marcas</small>` : f(rate, 3);
    marksTable("plane", ["#", "t", "x da crista"], rows, `<tr><td colspan="2">velocidade medida Δx/Δt</td><td>${rateCell}</td></tr><tr><td colspan="2">v_f = ω/k previsto</td><td>${hidden ? "?" : f(k / 2, 3)}</td></tr>`);
  }

  // ======================================================================
  // Estação 2 — construtor de pacote
  // ======================================================================
  function drawBuild() {
    const N = v("buildN"), dk = v("buildDk"), k0 = v("buildK0"), t = v("buildT"), show = $("buildShow").checked;
    const comps = P.superpositionComponents(N, k0, dk), span = 16, xs = [-span, span];
    const d = canvasFor("mainCanvas");
    const series = [];
    if (show && N > 1) comps.forEach(c => series.push({ points: samples(xs[0], xs[1], 700, (x) => c.w * N * 0.35 * Math.cos(c.k * x - c.omega * t) - 1.6), color: C.faint, width: 1 }));
    series.push({ points: samples(xs[0], xs[1], 900, (x) => P.superposition(x, t, comps).re), color: C.gold, dash: [6, 4], width: 1.6 });
    series.push({ points: samples(xs[0], xs[1], 900, (x) => P.superposition(x, t, comps).density), color: C.green, fill: "rgba(97,155,96,.12)" });
    const m = plot(d, series, xs[0], xs[1], -2.3, 1.25, "posição x", "|Ψ|², Re Ψ e componentes (abaixo)");
    const spacing = P.replicaSpacing(dk), center = k0 * t;
    if (N > 1) { marker(m, center, C.green, `centro · v_g·t=${f(center, 2)}`); if (spacing < 2 * span) marker(m, center + spacing, C.gray, `réplica em +2π/Δk`); }
    legend([[C.green, "|Ψ|² da soma"], [C.gold, "Re Ψ da soma", true], [C.faint, "componentes individuais (deslocadas para baixo)"]]);
    set("buildNOut", N); set("buildDkOut", f(dk, 2)); set("buildK0Out", f(k0, 1)); set("buildTOut", f(t, 2));
    set("statusTitle", "Construir um pacote"); set("statusDetail", `N=${N} · Δk=${f(dk, 2)}`);
    set("mainTitle", N === 1 ? "Uma onda plana: nada de localização" : `Soma de ${N} ondas planas`); set("mainSubtitle", N === 1 ? "|Ψ|² é uniforme" : "as fases coincidem no centro e se cancelam longe dele");
    set("caption", "Cada componente cinza é uma onda plana com número de onda k_j e frequência ω_j=k_j²/2. A soma (verde) só é grande onde as cristas estão alinhadas. Como a soma é finita, o padrão se repete a cada 2π/Δk_passo; no limite contínuo as réplicas vão para o infinito e sobra um único pacote.");
    set("prediction", "Ao dobrar N com o mesmo Δk_passo, o pacote fica mais estreito ou mais largo? E ao dobrar Δk_passo com o mesmo N?");
    const kSpread = dk * (N - 1);
    html("calculation", `faixa de k: k₀ ± ${f(kSpread / 2, 2)}<small>N=${N}, Δk_passo=${f(dk, 2)} ⇒ largura total em k ≈ ${f(kSpread, 2)}</small><small>réplicas a cada 2π/Δk_passo = ${f(spacing, 2)} · largura do pacote ~ 1/(faixa de k) ≈ ${kSpread > 0 ? f(2 / kSpread, 2) : "∞"}</small>`);
    metrics([["N", N], ["faixa em k", f(kSpread, 2)], ["espaço entre réplicas", f(spacing, 2)], ["centro (v_g t)", f(center, 2)], ["v_g = k₀", f(k0, 2)]]);
    set("conceptTitle", "Superposição localiza"); set("conceptText", "Localizar em x custa uma faixa de k: quanto mais estreito o pacote, mais componentes de números de onda diferentes ele exige. É a relação de incerteza nascendo da soma de ondas.");
    prompts(["Comece em N=1 e vá a N=3, 9 e 21: registre a largura do pacote em cada caso.", "Fixe N=9 e dobre Δk_passo: a largura em x cai à metade? E o espaçamento das réplicas?", "Toque a animação com N=9: o centro anda com v_g=k₀, e as cristas internas com v_f=k₀/2. O pacote alarga porque as componentes têm v_g diferentes."]);
    $("marksSection").hidden = true;
  }

  // ======================================================================
  // Estação 3 — pacote gaussiano e dispersão
  // ======================================================================
  function drawPacket() {
    const sigma = state.challenge.packet ?? v("packetSigma"), k0 = v("packetK"), t = v("packetT"), hidden = state.challenge.packet !== null;
    const rigid = $("packetMode").value === "rigid", packet = rigid ? P.rigidPacket : P.gaussian;
    const state0 = packet(0, t, sigma, k0), span = Math.max(4, 4.2 * state0.width), xMin = state0.center - span, xMax = state0.center + span;
    const densityPeak = 1 / (Math.sqrt(2 * Math.PI) * state0.width), wavePeak = Math.sqrt(densityPeak), main = canvasFor("mainCanvas");
    const m = plot(main, [
      { points: samples(xMin, xMax, 340, x => packet(x, t, sigma, k0).density), color: C.green, fill: "rgba(97,155,96,.12)" },
      { points: samples(xMin, xMax, 340, x => packet(x, t, sigma, k0).re), color: C.gold, dash: [7, 4] }
    ], xMin, xMax, -1.12 * wavePeak, Math.max(1.12 * densityPeak, 1.12 * wavePeak), "posição x", "ρ e Re Ψ");
    // crista exata (fase nula); no modo dispersivo, k₀t/2 fica como referência de onda plana
    const crest = rigid ? state0.center : P.packetCrest(t, sigma, k0);
    marker(m, state0.center, C.green, `centro · x=${f(state0.center, 2)}`);
    if (!rigid && crest !== null) {
      if (t > 0) marker(m, (k0 / 2) * t, C.faint, `k₀t/2 (onda plana)`, m.t + 72);
      marker(m, crest, C.gold, `crista · x=${f(crest, 2)}`, m.t + 40);
    }
    // largura a meia altura (para o desafio de σ)
    const half = state0.width * 2.3548; m.c.strokeStyle = C.red; m.c.lineWidth = 1.4; m.c.setLineDash([3, 3]);
    m.c.beginPath(); m.c.moveTo(m.X(state0.center - half / 2), m.Y(densityPeak / 2)); m.c.lineTo(m.X(state0.center + half / 2), m.Y(densityPeak / 2)); m.c.stroke(); m.c.setLineDash([]);
    m.c.fillStyle = C.red; m.c.font = "10px Ubuntu,system-ui"; m.c.textAlign = "left"; m.c.fillText("largura a meia altura = 2,355·Δx", m.X(state0.center + half / 2) + 4, m.Y(densityPeak / 2) + 3);
    const deltaK = 1 / (2 * sigma), kSpan = Math.max(3, 4.2 * deltaK), momentumPeak = 1 / (Math.sqrt(2 * Math.PI) * deltaK);
    const secondary = canvasFor("secondaryCanvas", .34);
    plot(secondary, [{ points: samples(k0 - kSpan, k0 + kSpan, 340, k => P.momentumGaussian(k, sigma, k0)), color: C.red, fill: "rgba(198,92,75,.12)" }], k0 - kSpan, k0 + kSpan, 0, momentumPeak * 1.12, "número de onda k", "|Φ(k)|²");
    legend([[C.green, "|Ψ(x)|²"], [C.gold, "Re Ψ", true], [C.red, "|Φ(k)|² abaixo"]]);
    set("secondaryTitle", "Distribuição em número de onda"); set("secondarySubtitle", "a largura Δk não muda durante a evolução livre");
    set("secondaryCaption", "Estreitar o pacote em x exige uma distribuição mais larga em k. Note que os eixos são diferentes: Δx e Δk não se comparam diretamente.");
    set("packetSigmaOut", hidden ? "?" : f(sigma, 2)); set("packetKOut", f(k0, 2)); set("packetTOut", f(t, 2));
    set("statusTitle", "Pacote gaussiano"); set("statusDetail", `${rigid ? "sem dispersão" : "dispersivo"} · t=${f(t, 2)}`);
    set("mainTitle", rigid ? "Pacote em meio sem dispersão (ω=ck)" : "Pacote viajante e dispersivo (ω=ħk²/2m)");
    set("mainSubtitle", rigid ? "translada rígido: todas as componentes têm a mesma velocidade" : "os eixos acompanham o centro e a largura");
    set("caption", rigid
      ? "Com ω linear em k, todas as componentes viajam com a mesma velocidade c e o pacote não alarga. Compare com o caso quântico: a diferença está apenas na curvatura de ω(k)."
      : "Os limites do gráfico se ajustam ao movimento e à dispersão. Em t>0 a fase ganha um termo quadrático: a frente do pacote oscila mais rápido que a cauda, porque as componentes de k maior se adiantam. O marcador dourado segue a crista que partiu de x=0 (fase nula); o cinza, a previsão de onda plana k₀t/2. Em pacotes largos eles coincidem; em pacotes estreitos a crista começa mais rápida (fase de Gouy, −½·arctan τ) e depois se atrasa, porque fica atrás do centro, onde o número de onda local é menor.");
    set("prediction", "Diminuir σ estreita ou alarga a distribuição em k? Um pacote mais estreito alarga mais rápido ou mais devagar? O produto Δx₀Δp pode ficar menor que ħ/2?");
    html("calculation", hidden
      ? `σ oculto: meça a largura a meia altura L em t=0.<small>Para uma gaussiana, L = 2,355·σ ⇒ σ = L/2,355.</small>`
      : rigid
        ? `σ(t) = σ₀ = ${f(sigma, 3)}<small>centro x(t) = c·t = ${f(state0.center, 3)}, c = k₀/m</small>`
        : `σ(t)=√[σ₀²+t²/(4σ₀²)]<br><b>= ${f(state0.width, 3)}</b><small>Δk=1/(2σ₀)=${f(deltaK, 3)} · Δx₀Δp=0,500 ħ · centro x(t)=k₀t=${f(state0.center, 3)}</small>`);
    metrics(hidden ? [["σ", "oculto"], ["centro x(t)", f(state0.center)]] : [["centro x(t)", f(state0.center)], ["Δx(t)", f(state0.width)], ["Δk", f(deltaK)], ["Δx₀Δp/ħ", "0,500"], ["v_g = k₀", f(k0)], ["v_f = k₀/2", f(k0 / 2)]]);
    set("conceptTitle", "Dispersão é curvatura de ω(k)"); set("conceptText", "A faixa de números de onda produz uma envoltória localizada; como v_g=dω/dk varia com k, as componentes se separam e o pacote alarga. Num meio com ω=ck isso não acontece.");
    prompts(["Com σ=1,8, marque t=0 e t=3: compare a velocidade do centro (v_g) com a da crista (v_f). Repita com σ=0,4: a crista ainda anda com k₀/2?", "Compare σ=0,4 e σ=1,2 em t=3: qual alarga mais, em termos relativos?", "Troque para ω=ck e repita: o que muda e o que permanece?"]);
    const rows = state.marks.packet.map((r, i) => [i + 1, f(r.t, 2), f(r.center, 3), r.crest === null ? "—" : f(r.crest, 3)]);
    let foot = "";
    if (rows.length >= 2) { const a = state.marks.packet[0], b = state.marks.packet[state.marks.packet.length - 1], dt = b.t - a.t; foot = `<tr><td colspan="2">velocidade medida Δx/Δt</td><td>${dt ? f((b.center - a.center) / dt, 3) : "—"}</td><td>${dt && a.crest !== null && b.crest !== null ? f((b.crest - a.crest) / dt, 3) : "—"}</td></tr><tr><td colspan="2">previsto</td><td>v_g=${f(k0, 3)}</td><td>${rigid ? "c=" + f(k0, 3) : "v_f=" + f(k0 / 2, 3) + " (onda plana)"}</td></tr>`; }
    marksTable("packet", ["#", "t", "x do centro", "x da crista"], rows, foot);
  }

  // ======================================================================
  // Estação 4 — Born e interferência com detector
  // ======================================================================
  function drawBorn() {
    const phase = v("bornPhase"), ratio = v("bornRatio"), a = Math.min(v("bornLeft"), v("bornRight")), b = Math.max(v("bornLeft"), v("bornRight"));
    const d = canvasFor("mainCanvas"), n = state.bornSamples.length, bins = 48;
    const hist = P.histogram(state.bornSamples, bins, 0, 2 * Math.PI), top = P.bornDensity(phase / 2, phase, ratio) * 1.35;
    const m = plot(d, [{ points: samples(0, 2 * Math.PI, 300, (x) => P.bornDensity(x, phase, ratio)), color: C.green }], 0, 2 * Math.PI, 0, Math.max(top, 0.05), "posição x (k=1, logo kx=x)", "densidade de probabilidade ρ(x)");
    shade(m, a, b, "rgba(233,162,59,.16)");
    if (n) { m.c.fillStyle = "rgba(59,110,165,.45)"; hist.forEach(h => { const y = m.Y(Math.min(h.density, top)); m.c.fillRect(m.X(h.x0) + 1, y, m.X(h.x1) - m.X(h.x0) - 2, m.b - y); }); }
    // último sorteio como "impacto" no detector
    if (n) { const last = state.bornSamples[n - 1]; m.c.fillStyle = C.red; m.c.beginPath(); m.c.arc(m.X(last), m.b - 6, 4, 0, 2 * Math.PI); m.c.fill(); }
    marker(m, a, C.gold, `a=${f(a, 2)}`); marker(m, b, C.gold, `b=${f(b, 2)}`);
    legend([[C.green, "ρ=|Ψ|² normalizada"], [C.blue, `histograma de ${n} medições`], [C.gold, "intervalo [a,b]"]]);
    const probability = P.bornInterval(a, b, phase, ratio), observed = P.fractionInInterval(state.bornSamples, a, b);
    set("bornPhaseOut", `${f(phase / Math.PI, 2)}π`); set("bornRatioOut", f(ratio, 2)); set("bornLeftOut", f(a, 2)); set("bornRightOut", f(b, 2));
    set("statusTitle", "Born e interferência"); set("statusDetail", `φ=${f(phase / Math.PI, 2)}π · r=${f(ratio, 2)} · N=${n}`);
    set("mainTitle", n ? `Detector: ${n} partículas medidas` : "Densidade de probabilidade"); set("mainSubtitle", n ? "o histograma converge para |Ψ|² quando N cresce" : "amplitudes somam antes do módulo ao quadrado");
    set("caption", "Cada medição de posição dá um único ponto; a função de onda só prevê a estatística de muitas medições. A fase relativa φ desloca as franjas; a fase global não aparece. Com r≠1 o termo cruzado 2r·cos(2x−φ) não cancela os termos diretos e as franjas não chegam a zero.");
    set("prediction", "Com 10 medições o histograma vai parecer |Ψ|²? E com 1000? Aumentar φ muda a probabilidade em [a,b] ou só desloca as franjas?");
    html("calculation", `P(a≤x≤b) = ∫<sub>a</sub><sup>b</sup> ρ dx = <b>${f(probability, 3)}</b><small>fração observada em [a,b]: ${n ? `${state.bornSamples.filter(x => x >= a && x <= b).length}/${n} = ${f(observed, 3)}` : "— (meça primeiro)"}</small><small>|Ψ|²/|A|² = 1 + r² + 2r·cos(2x−φ); máximo (1+r)²=${f((1 + ratio) ** 2, 2)}, mínimo (1−r)²=${f((1 - ratio) ** 2, 2)}</small><small>Normalização em um período: ∫₀^{2π}|Ψ|²dx=1 ⇒ |A|²=1/[2π(1+r²)]. Na reta inteira esta Ψ não é normalizável.</small>`);
    metrics([["P(a,b) exata", f(probability, 3)], ["fração observada", n ? f(observed, 3) : "—"], ["N medições", n], ["máximos em", `x = φ/2 + nπ = ${f(phase / 2, 2)} + nπ`], ["fase global", "não observável"]]);
    set("conceptTitle", "Born transforma amplitude em estatística"); set("conceptText", "|Ψ|² não diz onde a partícula está: diz com que frequência cada posição aparece ao repetir a medida em sistemas preparados do mesmo modo. A interferência sobrevive porque as amplitudes somam antes do quadrado.");
    prompts(["Meça 1 partícula de cada vez: dá para prever onde ela cai?", "Meça 1000 e compare a fração em [a,b] com P(a,b). Repita com φ=π/2.", "Ponha r=2 (o exercício A·e^{ikx}+2A·e^{−ikx}): localize máximos e mínimos e explique por que não há zeros."]);
    $("marksSection").hidden = true;
  }

  // ======================================================================
  // Estação 5 — teste de Schrödinger por diferenças finitas
  // ======================================================================
  function drawSchrodinger() {
    const kind = $("schrodingerCandidate").value, k = v("schrodingerK"), mass = v("schrodingerM"), t = v("schrodingerT"), omega = v("schrodingerOmega");
    const free = P.freeOmega(k, mass), isGauss = kind === "gaussian", sigma = 0.7;
    $("schrodingerOmega").disabled = isGauss;
    const xs = isGauss ? Array.from({ length: 261 }, (_, i) => k * t / mass - 4 + i * 8 / 260) : Array.from({ length: 261 }, (_, i) => i * 2 * Math.PI / 260);
    const test = P.schrodingerTest(kind, xs, t, { k, mass, omega, sigma });
    const scale = Math.max(...test.rows.map(r => Math.max(Math.abs(r.lhs.re), Math.abs(r.rhs.re), r.residual))) * 1.15 || 1;
    const d = canvasFor("mainCanvas");
    plot(d, [
      { points: test.rows.map(r => ({ x: r.x, y: r.lhs.re })), color: C.green },
      { points: test.rows.map(r => ({ x: r.x, y: r.rhs.re })), color: C.gold, dash: [7, 4] },
      { points: test.rows.map(r => ({ x: r.x, y: r.residual })), color: C.red, width: 2 }
    ], xs[0], xs[xs.length - 1], -scale, scale, "posição x", "lados da equação (ℏ=1)");
    legend([[C.green, "Re[iℏ∂ₜΨ]"], [C.gold, "Re[−ℏ²∂ₓ²Ψ/2m]", true], [C.red, "|residual| = |iℏ∂ₜΨ + ℏ²∂ₓ²Ψ/2m|"]]);
    set("schrodingerKOut", f(k, 2)); set("schrodingerMOut", f(mass, 2)); set("schrodingerTOut", f(t, 2)); set("schrodingerOmegaOut", isGauss ? "—" : f(omega, 2));
    const ok = test.relative < 1e-3, names = { complex: "onda complexa", real: "onda real", gaussian: "pacote gaussiano" };
    set("statusTitle", "Teste de Schrödinger"); set("statusDetail", `${names[kind]} · residual ${f(100 * test.relative, 1)}%`);
    set("mainTitle", ok ? `${names[kind]}: satisfaz a equação` : `${names[kind]}: não satisfaz a equação com estes parâmetros`);
    set("mainSubtitle", ok ? "as duas curvas coincidem e o residual é nulo em todo x" : "o residual (vermelho) não se anula");
    set("caption", kind === "real"
      ? "Para Ψ=cos(kx−ωt), iℏ∂ₜΨ é puramente imaginário enquanto −ℏ²∂ₓ²Ψ/2m é real: nenhum ω faz os dois lados coincidirem. A equação de Schrödinger exige uma função de onda complexa; a parte real sozinha não é solução."
      : isGauss ? "O pacote gaussiano com a fase exata (termo quadrático incluído) satisfaz a equação em todo x e t, com qualquer massa: é uma superposição de ondas planas, cada uma com seu ω=k²/2m."
        : "As derivadas são calculadas numericamente, sem usar a relação de dispersão. Aplicar iℏ∂ₜ e −ℏ²∂ₓ²/(2m) a e^{i(kx−ωt)} produz ℏωΨ e (ℏ²k²/2m)Ψ: só coincidem quando ω=ℏk²/(2m), isto é, E=p²/(2m).");
    set("prediction", kind === "real" ? "Existe algum ω que zere o residual da onda real?" : "Se ω for 30% maior que ħk²/(2m), qual dos dois lados muda e qual permanece? O residual depende de t?");
    html("calculation", isGauss
      ? `residual rms / máx|lado direito| = <b>${f(100 * test.relative, 2)}%</b><small>Ψ(x,t) = pacote da estação 3 com k₀=${f(k, 2)}, σ₀=0,70, m=${f(mass, 2)}</small>`
      : `iℏ∂<sub>t</sub>Ψ ${kind === "real" ? "= iω·sin(kx−ωt) (imaginário puro)" : "= ℏωΨ, ω = " + f(omega, 3)}<br>−ℏ²∂<sub>x</sub>²Ψ/(2m) = (ℏ²k²/2m)·${kind === "real" ? "cos(kx−ωt) (real)" : "Ψ"}, k²/2m = ${f(free, 3)}<br><b>residual relativo = ${f(100 * test.relative, 2)}%</b><small>${kind === "real" ? "" : `ω − k²/2m = ${f(omega - free, 3)}`}</small>`);
    metrics([["ω escolhido", isGauss ? "—" : f(omega)], ["ℏk²/(2m)", f(free)], ["E=ℏω", isGauss ? "—" : f(omega)], ["p=ℏk", f(k)], ["residual relativo", `${f(100 * test.relative, 2)}%`]]);
    set("conceptTitle", "Motivação não é dedução"); set("conceptText", "As correspondências E→iℏ∂ₜ e p→−iℏ∂ₓ motivam a equação; sua validade é um postulado testado experimentalmente. O residual nulo confirma a relação de dispersão da partícula livre e mostra por que Ψ precisa ser complexa.");
    prompts(["Com a onda complexa, varie ω até zerar o residual e compare o valor encontrado com ħk²/(2m). Repita com outra massa.", "Troque para a onda real: tente qualquer ω. Por que falha? (Compare as partes real e imaginária dos dois lados.)", "Troque para o pacote gaussiano e toque a animação: o residual continua nulo enquanto o pacote alarga."]);
    $("marksSection").hidden = true;
  }

  // ---------- desafios de valor oculto ----------
  function startChallenge(key, sliderId, min, max, step) {
    const value = Math.round((min + Math.random() * (max - min)) / step) * step;
    state.challenge[key] = +value.toFixed(2); $(key + "ChallengeBox").hidden = false; $(key + "Feedback").textContent = "Valor oculto. Meça no gráfico e responda."; $(key + "Answer").value = ""; $(sliderId).disabled = true;
    if (key === "packet") { $("packetT").value = 0; }
    render();
  }
  function checkChallenge(key, sliderId, tolerance) {
    const guess = +$(key + "Answer").value, truth = state.challenge[key]; if (truth === null || !Number.isFinite(guess)) return;
    const err = Math.abs(guess - truth) / truth;
    $(key + "Feedback").textContent = err <= tolerance ? `Correto: o valor era ${f(truth, 2)} (erro de ${f(100 * err, 1)}%).` : `Ainda não: erro de ${f(100 * err, 1)}%. Tente outra medida.`;
    if (err <= tolerance) { $(sliderId).value = truth; state.challenge[key] = null; $(sliderId).disabled = false; $(key + "ChallengeBox").hidden = true; render(); }
  }

  // ---------- roteamento ----------
  function render() {
    showSecondary(view === "packet");
    ({ plane: drawPlane, build: drawBuild, packet: drawPacket, born: drawBorn, schrodinger: drawSchrodinger })[view]();
  }
  function switchView(next) {
    stopPlaying();
    view = VIEWS.includes(next) ? next : "plane";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) {}
    render();
  }
  const defaults = { plane: ["planeK", 2, "planeT", 0, "planeLambda", .1], build: ["buildN", 1, "buildDk", .3, "buildK0", 2, "buildT", 0], packet: ["packetSigma", .7, "packetK", 2, "packetT", 0], born: ["bornPhase", 0, "bornRatio", 1, "bornLeft", 0, "bornRight", 3.14], schrodinger: ["schrodingerK", 2, "schrodingerM", 1, "schrodingerT", 1, "schrodingerOmega", 2] };

  // ---------- eventos ----------
  document.querySelector(".tabs").addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = [...document.querySelectorAll("[data-view]")], current = tabs.findIndex(tab => tab.dataset.view === view), index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; event.preventDefault(); tabs[index].focus(); switchView(tabs[index].dataset.view); });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((e) => e.addEventListener("input", render));
  document.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.set).value = b.dataset.value; render(); }));
  document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => { if (state.playing === b.dataset.play) stopPlaying(); else startPlaying(b.dataset.play, b.dataset.loop === "1"); }));
  document.querySelectorAll("[data-zero]").forEach((b) => b.addEventListener("click", () => { stopPlaying(); $(b.dataset.zero).value = 0; render(); }));
  document.querySelectorAll("[data-mark]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.mark;
    if (key === "plane") { const k = state.challenge.plane ?? v("planeK"), t = v("planeT"); state.marks.plane.push({ t, x: P.crestPosition(t, k, P.freeOmega(k), 0) }); }
    else { const sigma = state.challenge.packet ?? v("packetSigma"), k0 = v("packetK"), t = v("packetT"), rigid = $("packetMode").value === "rigid"; const s = (rigid ? P.rigidPacket : P.gaussian)(0, t, sigma, k0); state.marks.packet.push({ t, center: s.center, crest: rigid ? s.center : P.packetCrest(t, sigma, k0) }); }
    if (state.marks[key].length > 6) state.marks[key].shift();
    render();
  }));
  $("bornSample1").addEventListener("click", () => { state.bornSamples.push(...P.sampleBorn(1, v("bornPhase"), v("bornRatio"))); render(); });
  $("bornSample100").addEventListener("click", () => { state.bornSamples.push(...P.sampleBorn(100, v("bornPhase"), v("bornRatio"))); render(); });
  $("bornSample1000").addEventListener("click", () => { state.bornSamples.push(...P.sampleBorn(1000, v("bornPhase"), v("bornRatio"))); render(); });
  $("bornClear").addEventListener("click", () => { state.bornSamples = []; render(); });
  // mudar φ ou r invalida as medições anteriores: o estado preparado mudou
  ["bornPhase", "bornRatio"].forEach(id => $(id).addEventListener("input", () => { state.bornSamples = []; }));
  $("schrodingerFree").addEventListener("click", () => { $("schrodingerOmega").value = P.freeOmega(v("schrodingerK"), v("schrodingerM")).toFixed(3); render(); });
  $("planeChallenge").addEventListener("click", () => startChallenge("plane", "planeK", 1, 5, .5));
  $("planeCheck").addEventListener("click", () => checkChallenge("plane", "planeK", .06));
  $("packetChallenge").addEventListener("click", () => startChallenge("packet", "packetSigma", .3, 1.6, .05));
  $("packetCheck").addEventListener("click", () => checkChallenge("packet", "packetSigma", .1));
  $("resetBtn").addEventListener("click", () => {
    stopPlaying(); const d = defaults[view]; for (let i = 0; i < d.length; i += 2) { $(d[i]).value = d[i + 1]; $(d[i]).disabled = false; }
    if (view === "plane" || view === "packet") { state.marks[view] = []; state.challenge[view] = null; $(view + "ChallengeBox").hidden = true; $(view + "Feedback").textContent = ""; }
    if (view === "packet") $("packetMode").value = "free";
    if (view === "born") state.bornSamples = [];
    if (view === "build") $("buildShow").checked = true;
    if (view === "schrodinger") $("schrodingerCandidate").value = "complex";
    render();
  });
  // Estado inicial por URL: ?view=build&buildN=9&buildT=1.5 ; ?view=born&bornN=1000 pré-sorteia medições.
  (function applyUrlState() {
    const params = new URLSearchParams(location.search);
    params.forEach((value, key) => { const e = $(key); if (e && (e.tagName === "INPUT" || e.tagName === "SELECT") && key !== "view") { if (e.type === "checkbox") e.checked = value !== "0"; else e.value = value; } });
    const n = +params.get("bornN"); if (n > 0) state.bornSamples = P.sampleBorn(Math.min(n, 20000), v("bornPhase"), v("bornRatio"));
  })();
  window.addEventListener("resize", render);
  switchView(view);
})();
