(function () {
  "use strict";
  const P = window.FiniteWellPhysics, $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", purple: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", shade: "rgba(111,113,113,.13)" };
  const VIEWS = ["grafica", "autofuncoes", "limite", "cdse"];
  let view = new URLSearchParams(location.search).get("view") || "grafica";
  // A "Ideia física" (frase conclusiva) só aparece depois do primeiro movimento
  // de controle em cada estação, para não responder a previsão antes do aluno.
  const touched = { grafica: false, autofuncoes: false, limite: false, cdse: false };
  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n }).replace("-", "−");
  const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function set(id, text) { $(id).textContent = text; } function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function legend(rows) { html("legend", rows.map(([color, label]) => `<span><i style="border-color:${color}"></i>${label}</span>`).join("")); }
  function concept(title, text) {
    const box = $("conceptBox"), ready = touched[view];
    box.classList.toggle("pending", !ready);
    set("conceptTitle", ready ? title : "Ideia física (após a previsão)");
    set("conceptText", ready ? text : "Escreva a previsão no roteiro e mova o controle: a ideia física desta estação aparece depois do primeiro movimento.");
  }
  function canvas() { const e = $("mainCanvas"), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = w * 590 / 1100; e.width = w * ratio; e.height = h * ratio; const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h); return { c, w, h }; }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }

  // Eixos com grade; series: [{points, color, dash, width}] (y = NaN quebra a curva);
  // marks: [{x | y, color, dash, label}]; shades: [{x0, x1, color}]; dots: [{x, y, color, r}].
  function plot(c, w, h, opt) {
    const l = 60, r = w - 20, t = 25, b = h - 52, { xmin, xmax, ymin, ymax } = opt;
    const X = (x) => l + (x - xmin) * (r - l) / (xmax - xmin), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    (opt.shades || []).forEach((s) => { c.fillStyle = s.color || C.shade; c.fillRect(X(s.x0), t, X(s.x1) - X(s.x0), b - t); });
    c.strokeStyle = C.grid; c.lineWidth = 1; c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui";
    const nx = opt.xticks || 5, ny = opt.yticks || 5;
    for (let i = 0; i <= nx; i += 1) { const x = xmin + i * (xmax - xmin) / nx; c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke(); c.textAlign = "center"; c.fillText(opt.xfmt ? opt.xfmt(x) : f(x, 2), X(x), b + 16); }
    for (let i = 0; i <= ny; i += 1) { const y = ymin + i * (ymax - ymin) / ny; c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke(); c.textAlign = "right"; c.fillText(f(y, 2), l - 7, Y(y) + 3); }
    (opt.marks || []).forEach((m) => {
      c.strokeStyle = m.color || C.gray; c.lineWidth = m.width || 1.2; c.setLineDash(m.dash || [4, 4]); c.beginPath();
      if (m.x !== undefined) { c.moveTo(X(m.x), t); c.lineTo(X(m.x), b); } else { c.moveTo(l, Y(m.y)); c.lineTo(r, Y(m.y)); }
      c.stroke(); c.setLineDash([]);
      if (m.label) { c.fillStyle = m.color || C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "left"; if (m.x !== undefined) c.fillText(m.label, X(m.x) + 4, t + 11); else c.fillText(m.label, l + 4, Y(m.y) - 4); }
    });
    c.strokeStyle = C.gray; c.lineWidth = 1; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(opt.xlabel, (l + r) / 2, h - 10);
    c.save(); c.translate(13, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(opt.ylabel, 0, 0); c.restore();
    c.save(); c.beginPath(); c.rect(l, t, r - l, b - t); c.clip();
    (opt.series || []).forEach((s) => {
      c.strokeStyle = s.color; c.lineWidth = s.width || 2.4; c.setLineDash(s.dash || []); c.beginPath(); let pen = false;
      s.points.forEach((p) => { if (!Number.isFinite(p.y)) { pen = false; return; } if (pen) c.lineTo(X(p.x), Y(p.y)); else c.moveTo(X(p.x), Y(p.y)); pen = true; });
      c.stroke(); c.setLineDash([]);
    });
    (opt.dots || []).forEach((d) => { c.fillStyle = d.color; c.beginPath(); c.arc(X(d.x), Y(d.y), d.r || 5, 0, 2 * Math.PI); c.fill(); if (d.label) { c.font = "bold 10px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(d.label, X(d.x), Y(d.y) - 9); } });
    c.restore();
    return { X, Y, l, r, t, b };
  }

  // ---------- Estação 1: solução gráfica ----------
  function drawGrafica() {
    const z0 = +$("grafZ0").value, roots = P.rootsZ(z0), N = roots.length, ready = touched.grafica;
    // Eixos reescalados para poços rasos: em z₀ = 0,3 o único cruzamento fica em
    // (0,288; 0,29) e sumia no canto com xmax = 2, ymax = 6 (parecer prof-didatica A1).
    const shallow = z0 < 1.7;
    const xmax = shallow ? Math.max(0.5, 1.2 * z0) : Math.max(2, z0 * 1.08), ymax = shallow ? clamp(2 * z0, 1, 6) : 6, d = canvas();
    const series = [], marks = [];
    const branches = Math.ceil(xmax / P.HALF_PI);
    for (let j = 0; j < branches; j += 1) {
      const lo = j * P.HALF_PI, hi = (j + 1) * P.HALF_PI, even = j % 2 === 0;
      series.push({ points: samples(lo + 1e-4, hi - 1e-4, 220, (z) => { const y = even ? Math.tan(z) : -1 / Math.tan(z); return y >= 0 && y <= ymax * 1.2 ? y : NaN; }), color: even ? C.blue : C.purple, dash: even ? [] : [7, 4], width: 2 });
      if (j > 0) marks.push({ x: lo, color: C.gray, dash: [2, 5], label: j === 1 ? "π/2" : `${j}π/2` });
    }
    series.push({ points: samples(1e-3, z0 - 1e-6, 400, (z) => { const y = P.rhsZ(z, z0); return y <= ymax * 1.2 ? y : NaN; }), color: C.red, width: 2.8 });
    marks.push({ x: z0, color: C.gold, dash: [], width: 2, label: "z₀" });
    const dots = roots.map((r) => ({ x: r.z, y: r.parity === "par" ? Math.tan(r.z) : -1 / Math.tan(r.z), color: C.gold, r: 6, label: `z${sub(r.n)}` }));
    plot(d.c, d.w, d.h, { xmin: 0, xmax, ymin: 0, ymax, xlabel: "z = ka", ylabel: "tan z, −cot z, √(z₀²/z² − 1)", series, marks, dots });
    legend([[C.blue, "tan z (par)"], [C.purple, "−cot z (ímpar, tracejado)"], [C.red, "√(z₀²/z² − 1)"], [C.gold, "interseções zₙ"]]);
    set("grafZ0Out", f(z0, 2));
    set("statusTitle", ready ? `${N} estado${N > 1 ? "s" : ""} ligado${N > 1 ? "s" : ""}` : "mova z₀ para contar os estados"); set("statusDetail", `z₀ = ${f(z0, 2)}`);
    set("mainTitle", "Solução gráfica das equações de quantização"); set("mainSubtitle", "os dois lados de tan z = √(z₀²/z² − 1) (par) e −cot z = √(z₀²/z² − 1) (ímpar)");
    set("caption", `Eixo x: z = ka; eixo y: os dois lados das equações. Curva vermelha: lado direito √(z₀²/z² − 1), que chega a zero em z = z₀ (linha dourada vertical). Azul: tan z (ramo par); roxo tracejado: −cot z (ramo ímpar); pontos dourados: cruzamentos zₙ.${shallow ? " Eixos reescalados para z₀ < 1,7." : ""}`);
    set("prediction", "Um poço muito raso (z₀ = 0,3) tem algum estado ligado? E quantos estados aparecem quando z₀ chega a 2? Preveja antes de mover.");
    const first = roots[0], en = P.energyFromZ(first.z, z0);
    html("calculation", `<b>z₁ = ${f(first.z, 3)} (par): tan z₁ = ${f(Math.tan(first.z), 3)} = √(z₀²/z₁² − 1) = ${f(P.rhsZ(first.z, z0), 3)}</b><br>(E₁ + V₀)/V₀ = z₁²/z₀² = ${f(first.z ** 2, 3)}/${f(z0 ** 2, 3)} = ${f(en.aboveBottom, 3)}<br>E₁ = ${f(en.energy, 3)} V₀ (do topo) ⇔ E₁ + V₀ = ${f(en.aboveBottom, 3)} V₀ (do fundo)<small>E é negativa porque o zero está no topo do poço; E + V₀ é a altura acima do fundo, a que se compara com o poço infinito.</small>`);
    const rows = [["estados ligados N", ready ? String(N) : "mova z₀ para ler"]];
    if (ready) roots.slice(0, 5).forEach((r) => rows.push([`z${sub(r.n)} (${r.parity === "par" ? "par" : "ímpar"})`, `${f(r.z, 3)} · (E+V₀)/V₀ = ${f(P.energyFromZ(r.z, z0).aboveBottom, 3)}`]));
    metrics(rows);
    concept("Quantização e número finito de estados", "As condições de continuidade de ψ e ψ′ em x = a viram uma equação transcendental: só valores discretos de z satisfazem tan z = √(z₀²/z² − 1) ou −cot z = √(z₀²/z² − 1), e só há raízes enquanto z < z₀. Em 1D, por mais raso que seja, o poço atrativo sempre tem ao menos um estado par: a curva vermelha parte de +∞ e tan z parte de 0, logo se cruzam antes de z₀. Um novo cruzamento surge cada vez que z₀ ultrapassa um múltiplo de π/2 (em nπ/2 exato o candidato tem κ = 0 e não é normalizável).");
    prompts(["Leve z₀ de 0,3 até 8 e anote em que valores aparece um novo cruzamento (compare com π/2 ≈ 1,571, π, 3π/2, ...).", "Com z₀ = 2, leia z₁ e z₂ e confira (E+V₀)/V₀ = 0,265 e 0,898, os números da nota.", "Com z₀ = 1 só existe a raiz par z = 0,739: por que a curva vermelha não alcança o ramo de −cot z?"]);
  }

  // ---------- Estação 2: autofunções e caudas ----------
  function drawAutofuncoes() {
    const z0 = +$("autoZ0").value, roots = P.rootsZ(z0), N = roots.length;
    const nCtl = $("autoN"); nCtl.max = String(N); if (+nCtl.value > N) nCtl.value = String(N);
    const n = Math.max(1, Math.min(N, +nCtl.value)), r = roots[n - 1];
    const ka = P.kappaA(r.z, z0), A2 = P.normalization(r.z, z0, r.parity), pf = P.outsideProbability(r.z, z0, r.parity), en = P.energyFromZ(r.z, z0);
    // Janela adaptativa: ±3a mostrava só 39,7 % da densidade em z₀ = 0,3 (d_p = 11,7a).
    const xmax = Math.min(15, Math.max(3, 2 + 2 / ka)), frac = P.probabilityInWindow(r, z0, xmax), reach = 1 + 1 / ka, reachInside = reach <= xmax;
    const psi = samples(-xmax, xmax, 800, (x) => P.wavefunctionRoot(x, r, z0)), dens = samples(-xmax, xmax, 800, (x) => P.wavefunctionRoot(x, r, z0) ** 2);
    const amp = Math.max(1.05, Math.sqrt(A2) * 1.15), d = canvas();
    const marks = [{ y: 0, color: C.gray, dash: [] }, { x: -1, color: C.green, dash: [], width: 2 }, { x: 1, color: C.green, dash: [], width: 2, label: "x = a" }];
    if (reachInside) marks.push({ x: reach, color: C.gold, dash: [3, 4], label: "a + 1/κ" });
    plot(d.c, d.w, d.h, { xmin: -xmax, xmax, ymin: -amp, ymax: amp, xticks: 6, xlabel: "x / a", ylabel: "ψ √a,  |ψ|² a",
      shades: [{ x0: -xmax, x1: -1 }, { x0: 1, x1: xmax }], marks,
      series: [{ points: dens, color: C.gold, dash: [6, 4], width: 1.8 }, { points: psi, color: r.parity === "par" ? C.blue : C.purple }] });
    legend([[r.parity === "par" ? C.blue : C.purple, `ψ${sub(n)}(x) (${r.parity === "par" ? "par" : "ímpar"})`], [C.gold, "|ψ|²"], [C.green, "bordas do poço ±a"], [C.gray, "região proibida"]]);
    set("autoZ0Out", f(z0, 2)); set("autoNOut", `${n} de ${N}`);
    set("statusTitle", `ψ${sub(n)}: ${r.parity === "par" ? "par" : "ímpar"}`); set("statusDetail", `z₀ = ${f(z0, 2)} · P_fora = ${f(100 * pf, 1)} %`);
    set("mainTitle", `Autofunção normalizada ψ${sub(n)}(x) sobre o poço`); set("mainSubtitle", "dentro: cos(kx) ou sen(kx); fora: cauda e^(−κ(|x|−a)), região sombreada");
    set("caption", `Eixo x em unidades de a; eixo y: ψ√a (linha cheia) e |ψ|²a (dourado tracejado). Verde: bordas ±a; sombreado: região classicamente proibida. ${reachInside ? "Linha dourada vertical: a + 1/κ, um alcance d_p além da borda." : `a + 1/κ = ${f(reach, 1)} a (fora da janela).`} A janela ±${f(xmax, 1)} a mostra ${f(100 * frac, 1)} % da probabilidade.`);
    set("prediction", "P_fora cresce ou diminui quando E se aproxima de zero (estado mais alto do poço)? E o estado fundamental de um poço raso (z₀ = 0,3): fica mais dentro ou mais fora?");
    html("calculation", `κa = √(z₀² − zₙ²) = √(${f(z0 ** 2, 3)} − ${f(r.z ** 2, 3)}) = ${f(ka, 3)} → d_p/a = 1/κa = ${f(1 / ka, 3)}<br><b>A${r.parity === "par" ? "₊" : "₋"}⁻²/a = 1 ${r.parity === "par" ? "+" : "−"} sen(2z)/(2z) + ${r.parity === "par" ? "cos²z" : "sen²z"}/κa = ${f(1 / A2, 3)}</b><br>P_fora = A² ${r.parity === "par" ? "cos²(ka)" : "sen²(ka)"}/κ = ${f(A2, 3)} × ${f(r.parity === "par" ? Math.cos(r.z) ** 2 : Math.sin(r.z) ** 2, 3)} / ${f(ka, 3)} = ${f(pf, 3)}<br>forma fechada (Griffiths 2.30): A⁻²/a = 1 + 1/κa = ${f(P.normalizationClosed(r.z, z0) ** -1, 3)};  P_fora = (z²/z₀²)/(1 + κa) = ${f(en.aboveBottom, 3)}/${f(1 + ka, 3)} = ${f(P.outsideProbabilityClosed(r.z, z0), 3)}`);
    metrics([["zₙ = kₙa", f(r.z, 3)], ["(Eₙ + V₀)/V₀", f(en.aboveBottom, 3)], ["κa", f(ka, 3)], ["d_p/a = 1/κa", f(1 / ka, 3)], ["P_fora", `${f(100 * pf, 1)} %`], ["paridade", r.parity === "par" ? "par (cos)" : "ímpar (sen)"]]);
    concept("Penetração na região proibida", "Fora do poço a energia cinética seria negativa, mas ψ não se anula: decai como e^(−κ|x|) com alcance d_p = 1/κ. Quanto mais perto do topo (E → 0⁻), menor κ, mais longa a cauda e maior P_fora. \"Ligado\" quer dizer E < 0 e ψ normalizável — nada obriga a partícula a estar em |x| < a. Essa cauda é o que distingue o poço finito do infinito e o que, na Aula 7, virou tunelamento.");
    prompts(["Fixe z₀ = 8 e suba n de 1 a 6: anote P_fora e d_p/a a cada nível.", "Volte a n = 1 e reduza z₀ até 0,3: quanto da partícula fica fora do poço? Compare com o estado mais alto de z₀ = 8.", "Conte na curva os nós de cada ψₙ dentro do poço (a tela não os conta) e relacione com a paridade (cos ou sen)."]);
  }

  // ---------- Estação 3: limite do poço infinito ----------
  function drawLimite() {
    const z0 = +$("limZ0").value, roots = P.rootsZ(z0), N = roots.length;
    const finite = roots.map((r) => ({ x: r.n, y: r.z ** 2 })), inf = roots.map((r) => ({ x: r.n, y: P.infiniteWellZ(r.n) ** 2 }));
    const ymax = Math.max(P.infiniteWellZ(N) ** 2 * 1.05, 3), d = canvas();
    plot(d.c, d.w, d.h, { xmin: 0, xmax: N + 1, ymin: 0, ymax, xticks: Math.min(N + 1, 7), xfmt: (x) => f(x, 0), xlabel: "n", ylabel: "zₙ² = 2ma²(Eₙ + V₀)/ħ²",
      marks: [{ y: z0 ** 2, color: C.red, dash: [5, 4], label: "z₀² (topo do poço)" }],
      series: [{ points: inf, color: C.gray, dash: [5, 4], width: 1.6 }, { points: finite, color: C.green, width: 1.6 }],
      dots: [...inf.map((p) => ({ ...p, color: C.gray, r: 4 })), ...finite.map((p) => ({ ...p, color: C.green, r: 5 }))] });
    legend([[C.green, "poço finito zₙ²"], [C.gray, "poço infinito (nπ/2)²"], [C.red, "z₀²"]]);
    set("limZ0Out", f(z0, 1));
    const ratio = (r) => r.z ** 2 / P.infiniteWellZ(r.n) ** 2, r1 = roots[0], rN = roots[N - 1];
    set("statusTitle", `${N} estados · z₁²/(π/2)² = ${f(ratio(r1), 3)}`); set("statusDetail", `z₀ = ${f(z0, 1)}`);
    set("mainTitle", "Energias do poço finito contra o poço infinito de largura 2a"); set("mainSubtitle", "ambas medidas a partir do fundo: Eₙ + V₀ = ħ²zₙ²/(2ma²)");
    set("caption", "Eixo x: número do nível n; eixo y: zₙ², proporcional a Eₙ + V₀. Pontos verdes: poço finito; pontos cinzas (tracejado): poço infinito de mesma largura, (nπ/2)²; linha vermelha tracejada: z₀², o topo do poço — nenhuma raiz passa dela.");
    set("prediction", "O poço finito tem energias maiores ou menores que o poço infinito de mesma largura 2a? A diferença é maior para n pequeno ou para n perto do topo?");
    html("calculation", `z₁ = ${f(r1.z, 3)} → z₁² = ${f(r1.z ** 2, 3)};  (π/2)² = ${f(P.infiniteWellZ(1) ** 2, 3)}<br><b>z₁²/(π/2)² = ${f(ratio(r1), 3)}  →  (E₁ + V₀)_finito = ${f(ratio(r1), 3)} × π²ħ²/(8ma²)</b><br>n = ${N}: z${sub(N)}²/(${N}π/2)² = ${f(rN.z ** 2, 2)}/${f(P.infiniteWellZ(N) ** 2, 2)} = ${f(ratio(rN), 3)}<small>estimativa do poço profundo (n fixo, z₀ grande): razão ≈ 1 − 2/z₀ = ${f(1 - 2 / z0, 3)} (boa a 1 % para z₀ ≳ 20)</small>`);
    const rows = [["estados ligados N", String(N)], ["z₁ / (π/2)", f(r1.z / P.infiniteWellZ(1), 4)], ["razão n = 1", f(ratio(r1), 4)]];
    if (N > 1) rows.push(["razão n = 2", f(ratio(roots[1]), 4)]);
    rows.push([`razão n = ${N} (topo)`, f(ratio(rN), 4)], ["(E₁ + V₀)/V₀", f(P.energyFromZ(r1.z, z0).aboveBottom, 4)]);
    metrics(rows);
    concept("O poço infinito como limite", "Os pontos verdes ficam sempre abaixo dos cinzas: a cauda evanescente dá à função de onda mais espaço, k diminui e a energia acima do fundo cai. Quando V₀ → ∞, κ → ∞, as caudas somem e as condições viram cos(ka) = 0 ou sen(ka) = 0: kₙ → nπ/(2a), as paredes rígidas da Aula 5, com erro de primeira ordem 2/z₀. Os níveis baixos colam no infinito; o do topo, perto de z₀², nunca cola. O poço finito é sempre um pouco mais \"folgado\".");
    prompts(["Com z₀ = 2 leia a razão z₁²/(π/2)²; depois suba a 8, 20 e 40: como ela se aproxima de 1?", "Em z₀ = 40, compare a razão para n = 1 e para o último n: por que o nível do topo nunca cola no infinito?", "Estime quantos estados cabem em z₀ = 40 antes de olhar (N = ⌈2z₀/π⌉)."]);
  }

  // ---------- Estação 4: ponto quântico de CdSe ----------
  function rgbFromLambda(l) { // apenas para a faixa de cor desenhada no canvas
    let r = 0, g = 0, b = 0;
    if (l < 440) { r = -(l - 440) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = -(l - 510) / 20; } else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = -(l - 645) / 65; } else { r = 1; }
    const fade = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 700 ? Math.max(0.25, 1 - (l - 700) / 100) : 1;
    return `rgb(${Math.round(255 * r * fade)},${Math.round(255 * g * fade)},${Math.round(255 * b * fade)})`;
  }
  function drawCdse() {
    const D = +$("cdseD").value, V0 = +$("cdseV0").value, dot = P.dotLevelsEV(D, V0), a = dot.aNm, N = dot.count;
    const useHole = $("cdseHole").checked, useSphere = $("cdseSphere").checked;
    const E1 = dot.levels[0].aboveBottomEV, inf = P.infiniteWellGroundEV(a);
    // Modelo da nota: só o elétron, 1D. Extensões (fora da nota): buraco no mesmo
    // poço (m_h* = 0,45) e esfera (ramo ímpar com a = R; sem estado se z₀ < π/2).
    const eConf = useSphere ? P.sphereGroundEV(D, V0) : E1;
    const hConf = useHole ? (useSphere ? P.sphereGroundEV(D, V0, P.CDSE.mHole) : P.dotLevelsEV(D, V0, P.CDSE.mHole).levels[0].aboveBottomEV) : 0;
    const noState = eConf === null || hConf === null;
    const Eph = noState ? NaN : P.photonEV(eConf + hConf), lam = noState ? NaN : P.lambdaNm(Eph), color = noState ? "sem estado ligado" : P.colorName(lam);
    const modelName = useSphere ? (useHole ? "esfera + buraco" : "esfera, só e⁻") : (useHole ? "1D + buraco" : "modelo 1D");
    const modelWhere = useSphere || useHole ? `na extensão "${modelName}"` : "no modelo 1D";
    const xmax = a + 2, ymin = -V0 * 1.12, ymax = Math.max(0.35, inf - V0 + 0.25), d = canvas();
    const wellPts = [{ x: -xmax, y: 0 }, { x: -a, y: 0 }, { x: -a, y: -V0 }, { x: a, y: -V0 }, { x: a, y: 0 }, { x: xmax, y: 0 }];
    const levelSeries = dot.levels.map((lv) => ({ points: [{ x: -a, y: lv.energyEV }, { x: a, y: lv.energyEV }], color: lv.parity === "par" ? C.blue : C.purple, dash: lv.parity === "par" ? [] : [7, 4], width: 2.2 }));
    levelSeries.push({ points: [{ x: -a, y: inf - V0 }, { x: a, y: inf - V0 }], color: C.gray, dash: [5, 4], width: 1.6 });
    const g = plot(d.c, d.w, d.h, { xmin: -xmax, xmax, ymin, ymax, xticks: 6, xlabel: "x (nm)", ylabel: "E (eV)", shades: [{ x0: -xmax, x1: -a }, { x0: a, x1: xmax }],
      marks: [{ y: 0, color: C.gray, dash: [] }], series: [{ points: wellPts, color: C.green, width: 2.6 }, ...levelSeries] });
    const c = d.c;
    // Seta vertical do fundo (−V₀) até E₁, rotulada E₁ + V₀: a energia de confinamento.
    const ax = g.X(-a / 2), y0 = g.Y(-V0), y1 = g.Y(E1 - V0);
    c.strokeStyle = C.red; c.fillStyle = C.red; c.lineWidth = 1.8; c.beginPath(); c.moveTo(ax, y0); c.lineTo(ax, y1); c.stroke();
    c.beginPath(); c.moveTo(ax, y1); c.lineTo(ax - 4, y1 + 7); c.lineTo(ax + 4, y1 + 7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(ax - 5, y0); c.lineTo(ax + 5, y0); c.stroke();
    c.font = "bold 10px Ubuntu,system-ui"; c.textAlign = "left"; c.fillText(`E₁ + V₀ = ${f(E1, 3)} eV`, ax + 6, (y0 + y1) / 2 + 4);
    if (!noState) { c.fillStyle = rgbFromLambda(lam); c.fillRect(g.r - 150, g.t + 8, 140, 26); c.fillStyle = "#26312d"; c.font = "bold 11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(`λ ≈ ${f(lam, 0)} nm (${modelName})`, g.r - 80, g.t + 25); }
    else { c.fillStyle = C.gray; c.font = "bold 11px Ubuntu,system-ui"; c.textAlign = "right"; c.fillText("esfera: sem estado ligado (z₀ < π/2)", g.r - 10, g.t + 25); }
    c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "left"; dot.levels.forEach((lv) => c.fillText(`E${sub(lv.n)}`, g.X(a) + 4, g.Y(lv.energyEV) + 3)); c.fillText("infinito", g.X(a) + 4, g.Y(inf - V0) + 3);
    legend([[C.green, "poço V(x)"], [C.blue, "níveis pares"], [C.purple, "níveis ímpares (tracejado)"], [C.gray, "E₁ do poço infinito"], [C.red, "E₁ + V₀ (do fundo)"]]);
    set("cdseDOut", `${f(D, 1)} nm`); set("cdseV0Out", `${f(V0, 2)} eV`);
    set("statusTitle", noState ? "esfera sem estado ligado" : `λ ≈ ${f(lam, 0)} nm (${color} ${modelWhere})`); set("statusDetail", `z₀ = ${f(dot.z0, 2)} · ${N} estado${N > 1 ? "s" : ""} (1D)`);
    set("mainTitle", "Elétron confinado num ponto quântico de CdSe"); set("mainSubtitle", `poço de largura 2a = ${f(D, 1)} nm, profundidade V₀ = ${f(V0, 2)} eV, m* = 0,13 mₑ`);
    set("caption", "Eixo x: posição (nm); eixo y: energia (eV), com o zero no topo do poço. Verde: V(x); azul/roxo tracejado: níveis pares/ímpares do elétron no modelo 1D; cinza tracejado: E₁ do poço infinito de mesma largura; seta vermelha: E₁ + V₀, a energia de confinamento medida do fundo; faixa colorida: cor do fóton no modelo escolhido.");
    set("prediction", "Para ficar mais azul, o ponto quântico precisa ser maior ou menor? E o poço infinito de mesma largura (Aula 5) erra a energia para cima ou para baixo?");
    let calc = `ħ²/2m* = 0,0381/0,13 = ${f(P.hbar2Over2mEVnm2(0.13), 3)} eV·nm² → z₀ = a√(V₀/(ħ²/2m*)) = ${f(a, 2)}√(${f(V0, 2)}/0,293) = ${f(dot.z0, 2)}<br><b>E₁ + V₀ = (ħ²/2m*) z₁²/a² = 0,293 × ${f(dot.levels[0].z, 3)}²/${f(a, 2)}² = ${f(E1, 3)} eV</b> (infinito: π²ħ²/(8m*a²) = ${f(inf, 3)} eV, ${f(100 * (inf / E1 - 1), 0)} % acima)<br>confinamento = E₁ − (−V₀) = (${f(E1 - V0, 3)}) − (${f(-V0, 3)}) = E₁ + V₀ = ${f(E1, 3)} eV`;
    if (useSphere) calc += `<br><i>extensão</i> esfera R = a (ramo ímpar): ${eConf === null ? "z₀ < π/2, sem estado ligado" : `(E₁ + V₀)_esfera = E₂(1D) = ${f(eConf, 3)} eV`}`;
    if (useHole) calc += `<br><i>extensão</i> buraco m_h* = 0,45 mₑ no mesmo poço: ${hConf === null ? "sem estado ligado" : `(E₁ + V₀)_h = ${f(hConf, 3)} eV`}`;
    calc += noState ? `<br>E_fóton: não definido (sem estado ligado para o elétron ou o buraco)` : `<br>E_fóton ≈ E_gap + ${useHole ? "(E₁ + V₀)_e + (E₁ + V₀)_h" : "(E₁ + V₀)"} = 1,74 + ${f(eConf + hConf, 3)} = ${f(Eph, 3)} eV → λ = 1239,84/${f(Eph, 3)} = ${f(lam, 0)} nm`;
    calc += `<div class="limit">Limite do modelo: 1D (o cristal é uma esfera), massa efetiva e V₀ de referência, sem o buraco nem a atração elétron–buraco. Por isso a cor sai mais vermelha que a dos pontos reais (emissão ≈ 480 a 650 nm entre 2 e 6 nm); em 3D não há garantia de estado ligado (é preciso z₀ > π/2).</div>`;
    html("calculation", calc);
    metrics([["z₀", f(dot.z0, 3)], ["estados ligados (1D)", String(N)], ["E₁ + V₀ (finito)", `${f(E1, 3)} eV`], ["E₁ + V₀ (infinito)", `${f(inf, 3)} eV`], [`E_fóton (${modelName})`, noState ? "—" : `${f(Eph, 3)} eV`], ["λ e cor (" + modelName + ")", noState ? "—" : `${f(lam, 0)} nm · ${color}`]]);
    concept("Confinamento quântico sintonizável", "A mesma equação transcendental da estação 1, com m* e V₀ reais, dá o deslocamento de energia que o cristal nanométrico acrescenta ao gap: um mesmo material emite cores diferentes conforme o tamanho, e menor é mais azul. Onde o físico médico encontra isso: em patologia e citometria ex vivo (imuno-histoquímica multiplexada, emissão estreita ≈ 30 nm e absorção larga: 5–6 cores com um só laser); in vivo só em animais, porque o cádmio é tóxico e nenhum ponto quântico de Cd tem aprovação para uso humano — a cirurgia guiada por fluorescência em humanos usa verde de indocianina (≈ 800 nm) e 5-ALA/protoporfirina IX (635 nm). A janela óptica do tecido (≈ 650–900 nm) começa onde o CdSe termina: por isso os pontos \"705\" e \"800\" são CdSeTe e as alternativas sem cádmio (InP/ZnS, Ag₂S) são as candidatas clínicas.");
    prompts(["Com 2a = 4 nm e V₀ = 1 eV, confira os três níveis da nota (0,111; 0,431; 0,888 eV) e o poço infinito 0,181 eV.", "Varie 2a de 2 a 8 nm e anote λ: o modelo cobre a faixa ≈ 480–650 nm dos pontos comerciais de CdSe? Se não, o que falta nele?", "Suba V₀ para 3 eV: quantos estados ligados cabem agora e quanto E₁ + V₀ se aproxima do poço infinito?"]);
  }

  const draws = { grafica: drawGrafica, autofuncoes: drawAutofuncoes, limite: drawLimite, cdse: drawCdse };
  function render() { (draws[view] || drawGrafica)(); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "grafica";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { }
    render();
  }
  const defaults = { grafica: { grafZ0: 2 }, autofuncoes: { autoZ0: 2, autoN: 1 }, limite: { limZ0: 8 }, cdse: { cdseD: 4, cdseV0: 1 } };
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input").forEach((e) => e.addEventListener("input", () => { touched[view] = true; render(); }));
  $("resetBtn").addEventListener("click", () => { Object.entries(defaults[view]).forEach(([id, v]) => { $(id).value = v; }); if (view === "cdse") { $("cdseHole").checked = false; $("cdseSphere").checked = false; } render(); });
  window.addEventListener("resize", render);
  switchView(view);
})();
