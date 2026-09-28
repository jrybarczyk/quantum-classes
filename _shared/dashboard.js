(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const topic = document.body.dataset.topic;
  const P = window.QuantumPhysics || {};
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", gray: "#6f7171", grid: "#dce5dc", ink: "#26312d" };
  const TAU = 2 * Math.PI;
  const requestedView = new URLSearchParams(location.search).get("view");
  const requestedButton = [...document.querySelectorAll("[data-view]")].find(button => button.dataset.view === requestedView);
  let view = requestedButton?.dataset.view || document.querySelector("[data-view]").dataset.view;
  let playing = false;
  let animation = 0;
  let lastFrame = 0;
  let counts = Array(6).fill(0);
  let basisKind = "gaussian";
  let modeCount = 6;
  let uncertaintyKind = "gaussian";
  let momentumCache = { key: "", values: [] };

  const fmt = (value, digits = 3) => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const active = id => $(`${view}-${id}`) || document.querySelector(`[data-controls="${view}"] #${id}`) || $(id);
  const value = id => Number(active(id).value);
  const samples = (from, to, amount, fn) => Array.from({ length: amount }, (_, i) => {
    const x = from + i * (to - from) / (amount - 1);
    return { x, y: fn(x) };
  });
  const set = (id, text) => { $(id).textContent = text; };
  const html = (id, content) => { $(id).innerHTML = content; };

  const controls = {
    aula03: {
      normalization: [["Largura σ", .2, 1.6, .02, .66], ["meia largura do intervalo", .2, 2.5, .02, 1], ["amplitude A/A₀", .25, 1.75, .01, 1]],
      current: [["largura inicial σ₀", .5, 2, .02, 1], ["momento k₀ (v = ħk₀/m)", -2, 2, .05, 1.5], ["tempo t", 0, 6, .02, 0]],
      uncertainty: [["Δx (igual nos três estados)", .3, 1.2, .02, .6], ["momento médio p₀/ℏ", -2, 2, .05, 0], ["fase quadrática β (chirp)", -1, 1, .02, 0]]
    },
    aula04: {
      separation: [["nível n", 1, 6, 1, 2], ["amplitude", .3, 1.5, .02, 1], ["tempo reduzido τ", 0, TAU, .01, .55]],
      stationary: [["nível n", 1, 6, 1, 2], ["amplitude", .3, 1.5, .02, 1], ["tempo reduzido τ", 0, TAU, .01, .55]],
      eigen: [["nível selecionado n", 1, 6, 1, 2], ["largura L", .6, 1.8, .02, 1], ["escala da autofunção", .2, 1.2, .02, .55]]
    },
    aula05: {
      spectrum: [["nível selecionado n", 1, 6, 1, 2], ["largura do poço L", .6, 1.8, .02, 1], ["escala da autofunção", .15, .8, .01, .38]],
      wave: [["nível n", 1, 6, 1, 2], ["largura do poço L", .6, 1.8, .02, 1], ["limite do intervalo b/L", .05, 1, .01, .25]],
      superposition: [["segundo nível nᴮ", 2, 6, 1, 2], ["peso |cᴮ|²", 0, 1, .01, .5], ["tempo reduzido τ", 0, TAU, .01, 0]]
    },
    aula06: {
      expansion: [["centro u₀", .2, .8, .01, .5], ["largura do estado", .08, .35, .01, .18], ["fase inicial φ", 0, TAU, .01, 0]],
      measurement: [["centro u₀", .2, .8, .01, .5], ["largura do estado", .08, .35, .01, .18], ["escala dos autovalores", .5, 2, .05, 1]],
      evolution: [["centro u₀", .2, .8, .01, .5], ["largura do estado", .08, .35, .01, .18], ["tempo reduzido τ", 0, TAU, .01, 0]]
    }
  };

  function enhanceLayout() {
    const skip = document.createElement("a");
    skip.className = "skip-link"; skip.href = "#simulador"; skip.textContent = "Ir para o simulador";
    document.body.prepend(skip); document.querySelector("main").id = "simulador";
    document.querySelector(".status").setAttribute("aria-live", "polite");
    document.querySelector(".tabs").setAttribute("aria-label", "Estações da aula");
    document.querySelectorAll(".tabs button").forEach(button => button.setAttribute("role", "tab"));
    $("mainCanvas").setAttribute("role", "img"); $("mainCanvas").setAttribute("aria-label", "Visualização principal da estação");
    const panel = document.querySelector(".canvas-panel");
    const secondary = document.createElement("article");
    secondary.className = "canvas-panel secondary-panel";
    secondary.innerHTML = `<div class="chart-heading"><div><h2 id="secondaryTitle">Análise complementar</h2><p id="secondarySubtitle"></p></div></div><canvas id="secondaryCanvas" aria-label="Visualização quantitativa complementar"></canvas><p id="secondaryCaption" class="caption"></p>`;
    panel.after(secondary);
    const actionBar = document.createElement("div");
    actionBar.id = "actionBar";
    actionBar.className = "action-bar";
    document.querySelector(".controls").append(actionBar);
  }

  function canvas(id) {
    const element = $(id);
    const ratio = Math.max(1, Math.min(2, devicePixelRatio || 1));
    const width = element.clientWidth || 900;
    const height = width * (id === "mainCanvas" ? .5 : .34);
    element.width = width * ratio;
    element.height = height * ratio;
    const ctx = element.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfa";
    ctx.fillRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function axes(target, xMin, xMax, yMin, yMax, xLabel, yLabel, yDigits = 1) {
    const { ctx, width, height } = target;
    const left = 58, right = width - 20, top = 24, bottom = height - 43;
    const X = x => left + (x - xMin) * (right - left) / (xMax - xMin);
    const Y = y => bottom - (y - yMin) * (bottom - top) / (yMax - yMin);
    ctx.font = "10px Ubuntu, system-ui";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const x = xMin + i * (xMax - xMin) / 5;
      const y = yMin + i * (yMax - yMin) / 5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(right, Y(y)); ctx.stroke();
      ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(fmt(x, 1), X(x), bottom + 15);
      ctx.textAlign = "right"; ctx.fillText(fmt(y, yDigits), left - 7, Y(y) + 3);
    }
    ctx.strokeStyle = C.gray;
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke();
    ctx.fillStyle = C.gray; ctx.textAlign = "center"; ctx.fillText(xLabel, (left + right) / 2, height - 7);
    ctx.save(); ctx.translate(13, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ctx, X, Y, left, right, top, bottom };
  }

  function line(chart, points, color, dash = [], width = 2.6) {
    chart.ctx.strokeStyle = color; chart.ctx.lineWidth = width; chart.ctx.setLineDash(dash); chart.ctx.beginPath();
    points.forEach((point, i) => i ? chart.ctx.lineTo(chart.X(point.x), chart.Y(point.y)) : chart.ctx.moveTo(chart.X(point.x), chart.Y(point.y)));
    chart.ctx.stroke(); chart.ctx.setLineDash([]);
  }

  function bars(chart, values, color, outline = false) {
    const step = (chart.right - chart.left) / values.length;
    values.forEach((v, i) => {
      const x = chart.left + i * step + step * .18;
      const y = chart.Y(v);
      chart.ctx.fillStyle = outline ? "rgba(233,162,59,.22)" : color;
      chart.ctx.fillRect(x, y, step * .64, chart.bottom - y);
      if (outline) { chart.ctx.strokeStyle = color; chart.ctx.strokeRect(x, y, step * .64, chart.bottom - y); }
    });
  }

  function well(chart, length, yFloor = 0) {
    const ctx = chart.ctx;
    ctx.fillStyle = "rgba(131,196,78,.07)";
    ctx.fillRect(chart.X(0), chart.top, chart.X(length) - chart.X(0), chart.bottom - chart.top);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(chart.X(0), chart.top); ctx.lineTo(chart.X(0), chart.Y(yFloor)); ctx.lineTo(chart.X(length), chart.Y(yFloor)); ctx.lineTo(chart.X(length), chart.top); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.font = "bold 11px Ubuntu, system-ui"; ctx.textAlign = "center";
    ctx.fillText("V = 0", (chart.X(0) + chart.X(length)) / 2, chart.Y(yFloor) - 8);
    ctx.fillText("V = ∞", chart.X(0) - 22, chart.top + 12); ctx.fillText("V = ∞", chart.X(length) + 22, chart.top + 12);
  }

  function renderText(data) {
    set("statusTitle", data.title); set("statusDetail", data.subtitle);
    set("mainTitle", data.title); set("mainSubtitle", data.subtitle); set("caption", data.caption);
    set("secondaryTitle", data.secondaryTitle); set("secondarySubtitle", data.secondarySubtitle || ""); set("secondaryCaption", data.secondaryCaption || "");
    set("prediction", data.prediction); html("calculation", data.calculation);
    html("metrics", data.metrics.map(row => `<div><dt>${row[0]}</dt><dd>${row[1]}</dd></div>`).join(""));
    set("conceptTitle", "Ideia física"); set("conceptText", data.concept);
    html("prompts", data.prompts.map(prompt => `<li>${prompt}</li>`).join(""));
    html("legend", (data.legend || []).map(item => `<span><i style="border-color:${item[0]}"></i>${item[1]}</span>`).join(""));
  }

  function drawAula03(a, b, t, main, secondary) {
    if (view === "normalization") {
      const density = x => P.gaussianDensity(x, a) * t * t;
      const probability = P.gaussianInterval(-b, b, a);
      const chart = axes(main, -3, 3, 0, Math.max(.65, t * t / (Math.sqrt(2 * Math.PI) * a) * 1.12), "posição x", "|Ψ|²");
      chart.ctx.fillStyle = "rgba(131,196,78,.2)"; chart.ctx.fillRect(chart.X(-b), chart.top, chart.X(b) - chart.X(-b), chart.bottom - chart.top);
      line(chart, samples(-3, 3, 320, density), C.green);
      const area = t * t;
      const chart2 = axes(secondary, 0, 1.8, 0, 3.3, "amplitude A/A₀", "∫|Ψ|² dx");
      line(chart2, samples(0, 1.8, 180, x => x * x), C.gold); line(chart2, [{ x: 0, y: 1 }, { x: 1.8, y: 1 }], C.gray, [6, 4]);
      renderText({ title: "Oficina de normalização", subtitle: "a área responde como A²", caption: "A faixa verde é o intervalo escolhido; a curva muda de área quando A ≠ A₀.", secondaryTitle: "Teste de normalização", secondarySubtitle: "a norma é quadrática na amplitude", secondaryCaption: "O cruzamento em A/A₀ = 1 marca o estado normalizado.", prediction: "Dobrar a amplitude dobra ou quadruplica a norma?", calculation: `∫|AΨ₀|²dx = A²/A₀²<br><b>norma = ${fmt(area)} · P(−b≤x≤b) = ${fmt(probability * area)}</b>`, metrics: [["norma", fmt(area)], ["P no intervalo", fmt(probability * area)], ["densidade normalizada?", Math.abs(t - 1) < .015 ? "sim" : "não"]], concept: "Normalizar é ajustar uma amplitude global para que a área de |Ψ|² seja exatamente um.", prompts: ["Ajuste A até a norma valer 1.", "Mude σ sem mudar A e observe a área.", "Explique por que a probabilidade do intervalo depende de b/σ."], legend: [[C.green, "|Ψ|²"], [C.lime, "intervalo"]] });
    } else if (view === "current") {
      // Pacote livre exato (ħ = m = 1); J sai de Ψ por J = Im(Ψ*∂ₓΨ).
      const sigma0 = a, k0 = b, x0 = P.startPosition(k0), tMax = Number(active("tertiary").max), A = -1, B = 1;
      const rho = x => P.freePacket(x, t, sigma0, k0, x0).density, J = x => P.currentFromPsi(x, t, sigma0, k0, x0);
      const jLeft = J(A), jRight = J(B), rate = P.continuityRate(jLeft, jRight);
      const P_ab = time => P.packetInterval(A, B, time, sigma0, k0, x0);
      const dt = 1e-3, rateNumeric = (P_ab(t + dt) - P_ab(Math.max(0, t - dt))) / (t + dt - Math.max(0, t - dt));
      const xs = samples(-10, 10, 161, x => x), times = samples(0, tMax, 13, x => x);
      const jScale = Math.max(.05, ...times.flatMap(time => xs.map(p => Math.abs(P.currentFromPsi(p.x, time.x, sigma0, k0, x0))))) * 1.15;
      const rhoTop = 1 / (Math.sqrt(2 * Math.PI) * sigma0) * 1.15;
      const residual = Math.max(...samples(-6, 6, 121, x => Math.abs(P.continuityResidual(x, t, sigma0, k0, x0))).map(p => p.y));
      let total = 0; for (let x = -30; x <= 30; x += .02) total += J(x) * .02;
      // painel principal: ρ em cima, J embaixo, mesmo eixo x
      const half = main.height * .56, ctx = main.ctx;
      const top = axes({ ctx, width: main.width, height: half }, -10, 10, 0, rhoTop, "", "ρ(x,t)", 2);
      ctx.fillStyle = "rgba(69,123,157,.12)"; ctx.fillRect(top.X(A), top.top, top.X(B) - top.X(A), top.bottom - top.top);
      line(top, samples(-10, 10, 400, rho), C.green);
      const arrowAt = (x, current, entering) => {
        const length = Math.max(16, Math.min(60, 60 * Math.abs(current) / jScale)), y = top.top + 14, dir = Math.sign(current);
        if (Math.abs(current) < .02 * jScale) return;
        ctx.strokeStyle = ctx.fillStyle = entering ? C.green : C.red; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(top.X(x) - dir * length / 2, y); ctx.lineTo(top.X(x) + dir * length / 2, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(top.X(x) + dir * length / 2, y); ctx.lineTo(top.X(x) + dir * (length / 2 - 8), y - 5); ctx.lineTo(top.X(x) + dir * (length / 2 - 8), y + 5); ctx.fill();
      };
      arrowAt(A, jLeft, jLeft > 0); arrowAt(B, jRight, jRight < 0);
      ctx.save(); ctx.translate(0, half - 12);
      const bottom = axes({ ctx, width: main.width, height: main.height - half + 12 }, -10, 10, -jScale, jScale, "posição x", "J(x,t)", 2);
      ctx.fillStyle = "rgba(69,123,157,.12)"; ctx.fillRect(bottom.X(A), bottom.top, bottom.X(B) - bottom.X(A), bottom.bottom - bottom.top);
      line(bottom, [{ x: -10, y: 0 }, { x: 10, y: 0 }], C.gray, [3, 3], 1);
      line(bottom, samples(-10, 10, 400, J), C.blue);
      ctx.restore();
      // painel secundário: P(−1 ≤ x ≤ 1) no tempo e a reta de inclinação J(−1) − J(1)
      const pMax = Math.max(.2, ...times.map(time => P_ab(time.x))) * 1.15;
      const chart2 = axes(secondary, 0, tMax, 0, pMax, "tempo t", "P(−1 ≤ x ≤ 1)", 2);
      line(chart2, samples(0, tMax, 200, P_ab), C.green);
      const span = tMax * .12, pNow = P_ab(t);
      line(chart2, [{ x: Math.max(0, t - span), y: pNow - rate * (t - Math.max(0, t - span)) }, { x: Math.min(tMax, t + span), y: pNow + rate * (Math.min(tMax, t + span) - t) }], C.gold, [6, 4], 2.2);
      secondary.ctx.fillStyle = C.ink; secondary.ctx.beginPath(); secondary.ctx.arc(chart2.X(t), chart2.Y(pNow), 5, 0, TAU); secondary.ctx.fill();
      const phaseName = Math.abs(rate) < .01 ? "P quase parado" : rate > 0 ? "P cresce: entra mais do que sai" : "P diminui: sai mais do que entra";
      renderText({ title: "Corrente de probabilidade", subtitle: `pacote livre exato · ${phaseName}`,
        caption: `Em cima, ρ(x,t); embaixo, J(x,t) calculada da própria função de onda, J = (ħ/m) Im(Ψ*∂ₓΨ). A faixa azul é o volume de controle [−1, 1]; as setas mostram o fluxo nas fronteiras (verde entra, vermelha sai). ${Math.abs(k0) < .025 ? "Com k₀ = 0 o pacote fica centrado em x = 0 e só se alarga." : `O pacote parte de x₀ = ${fmt(x0, 0)}, do lado de onde vem, e se alarga enquanto anda.`}`,
        secondaryTitle: "Balanço no intervalo", secondarySubtitle: "a inclinação de P(t) é J(−1) − J(1)",
        secondaryCaption: "A curva é P(−1 ≤ x ≤ 1) ao longo do tempo; a reta tracejada tem inclinação J(−1) − J(1) calculada no instante atual e deve tangenciar a curva.",
        prediction: Math.abs(k0) < .025 ? "Com k₀ = 0 o centro não se move. J é nula? Para onde escoa a probabilidade?" : "Quando o centro do pacote passa por x = 0, P(−1 ≤ x ≤ 1) está no máximo? J(−1) e J(1) são iguais nesse instante?",
        calculation: `J = (ħ/m) Im(Ψ*∂ₓΨ) = ρv<br>v = k₀ + [(dσ/dt)/σ](x − x<sub>c</sub>)<br>dP/dt = J(−1) − J(1)<br><b>= ${fmt(jLeft)} − (${fmt(jRight)}) = ${fmt(rate)}</b><br><small>inclinação medida em P(t): ${fmt(rateNumeric)}</small><br><small>∫J dx = ${fmt(total)} = ⟨p⟩/m = ${fmt(k0)}</small>`,
        metrics: [["P(−1 ≤ x ≤ 1)", fmt(pNow)], ["J(−1)", fmt(jLeft)], ["J(1)", fmt(jRight)], ["dP/dt = J(−1) − J(1)", fmt(rate)], ["centro · largura", `${fmt(x0 + k0 * t, 2)} · ${fmt(P.freePacket(0, t, sigma0, k0, x0).width, 2)}`], ["resíduo máx. da continuidade", residual.toExponential(1)]],
        concept: "A continuidade ∂ₜρ + ∂ₓJ = 0 diz que a probabilidade só muda atravessando fronteiras. J mede quanta probabilidade cruza cada ponto por unidade de tempo e vem da fase de Ψ: J = ρv. Aqui ela não é imposta: é calculada de Ψ, e o resíduo confere a lei ponto a ponto.",
        prompts: ["Pare o pacote entrando, centrado e saindo: anote J(−1), J(1) e dP/dt e confira com a inclinação de P(t).", "No instante em que o centro passa por x = 0, J(−1) = J(1)? Por que o máximo de P vem antes? (Pense no alargamento.)", "Ponha k₀ = 0: o centro fica parado, mas J ≠ 0. Descreva o sinal de J nos dois lados e relacione com o alargamento."],
        legend: [[C.green, "ρ(x,t) e P(t)"], [C.blue, "J(x,t)"], [C.gold, "inclinação J(−1) − J(1)"]] });
    } else {
      // Três formas com o mesmo Δx; ψ·exp(ip₀x + iβx²). Gaussiana sem fase quadrática é o mínimo.
      const state = P.uncertaintyState(uncertaintyKind, a, b, t), reference = P.uncertaintyState("gaussian", a, b, 0);
      const pHalf = Math.max(3, 4.5 * state.dp), ps = samples(b - pHalf, b + pHalf, 161, p => p).map(p => p.x);
      const key = `${uncertaintyKind}|${a}|${b}|${t}`;
      if (momentumCache.key !== key) momentumCache = { key, values: P.momentumDensity(state, ps) };
      const rhoP = momentumCache.values.map((y, i) => ({ x: ps[i], y }));
      const refP = ps.map(p => ({ x: p, y: P.gaussianDensity(p, reference.dp, b) }));
      const marks = (chart, center, width, color) => [center - width, center + width].forEach(x => line(chart, [{ x, y: chart.yMin }, { x, y: chart.yMax }], color, [4, 4], 1.4));
      const xHalf = Math.max(2.5, 5 * a), xTop = Math.max(...samples(-xHalf, xHalf, 241, state.density).map(p => p.y), reference.density(0)) * 1.15;
      const cx = axes(main, -xHalf, xHalf, 0, xTop, "posição x", "ρₓ(x) = |ψ(x)|²", 2);
      cx.yMin = 0; cx.yMax = xTop;
      line(cx, samples(-xHalf, xHalf, 400, reference.density), C.gray, [6, 4], 1.6);
      line(cx, samples(-xHalf, xHalf, 600, state.density), C.green);
      marks(cx, 0, a, C.green);
      const pTop = Math.max(...rhoP.map(p => p.y), ...refP.map(p => p.y)) * 1.15;
      const cp = axes(secondary, b - pHalf, b + pHalf, 0, pTop, "momento p/ℏ", "ρₚ(p) = |φ(p)|²", 2);
      cp.yMin = 0; cp.yMax = pTop;
      line(cp, refP, C.gray, [6, 4], 1.6);
      line(cp, rhoP, C.gold);
      marks(cp, b, state.dp, C.gold);
      const products = ["gaussian", "triangular", "exponential"].map(kind => fmt(P.uncertaintyState(kind, a, 0, t).product, 3));
      const excess = 100 * (state.product / .5 - 1);
      const dpFormula = { gaussian: "ħ/(2Δx)", exponential: "ħ/(√2 Δx)", triangular: "√0,3 ħ/Δx" }[uncertaintyKind];
      renderText({ title: `Estado ${state.name}: distribuição em posição`, subtitle: `Δx = ${fmt(a, 2)} · linhas tracejadas em ±Δx`,
        caption: "Curva verde: o estado escolhido. Cinza tracejado: a gaussiana com o mesmo Δx, que é o estado de incerteza mínima. p₀ e β mudam a fase de ψ, não ρₓ(x): esta curva não se move quando você mexe neles.",
        secondaryTitle: "Distribuição em momento", secondarySubtitle: `Δp = ${fmt(state.dp, 3)} ħ · tracejado em ⟨p⟩ ± Δp`,
        secondaryCaption: `φ(p) é calculada numericamente pela transformada de Fourier de ψ(x). Cinza tracejado: a gaussiana de mesmo Δx. Os eixos têm unidades próprias; as larguras não se comparam visualmente entre os painéis.${uncertaintyKind === "exponential" ? " Repare: o pico de φ(p) da exponencial é mais estreito que o da gaussiana e, ainda assim, Δp é maior — as caudas, que decaem como p⁻⁴, pesam em ⟨p²⟩." : ""}`,
        prediction: "Com o mesmo Δx, qual dos três estados tem o menor Δp? Algum deles consegue ΔxΔp < ħ/2? E a fase quadrática β: muda Δx, Δp ou os dois?",
        calculation: `Δp₀ = ${dpFormula} = ${fmt(state.dpBase, 3)} ħ<br>Δp = √(Δp₀² + 4β²Δx²) = ${fmt(state.dp, 3)} ħ<br><b>ΔxΔp = ${fmt(state.product, 3)} ħ ≥ 0,500 ħ</b><br><small>⟨p²⟩ = ∫|ψ′|²dx + 4β²⟨x²⟩ (ħ = 1)</small>`,
        metrics: [["Δx", fmt(a, 3)], ["Δp/ħ", fmt(state.dp, 3)], ["ΔxΔp/ħ", fmt(state.product, 3)], ["acima do mínimo ħ/2", `${fmt(excess, 1)}%`], ["⟨p⟩/ħ = p₀", fmt(b, 2)], ["ΔxΔp/ħ: gauss · triang · exp", products.join(" · ")]],
        concept: "ΔxΔp ≥ ħ/2 vale para qualquer estado. Só a gaussiana sem fase quadrática atinge a igualdade; as outras formas, e qualquer estado com fase quadrática, ficam acima. A incerteza em momento não depende só da largura de ρₓ: depende também da fase de ψ.",
        prompts: ["Com Δx = 0,6 e β = 0, compare os três estados: ordene os produtos ΔxΔp. Qual satura a desigualdade?", "Mude Δx mantendo o estado: o produto muda? Por que ele não pode depender de Δx? (Pense em unidades.)", "Ligue β: ρₓ(x) fica igual, mas Δp cresce. O pacote livre que se alarga (estação 2) ganha exatamente essa fase quadrática."],
        legend: [[C.green, "ρₓ do estado"], [C.gold, "ρₚ do estado"], [C.gray, "gaussiana de mesmo Δx"]] });
    }
  }

  function drawAula04(n, amplitude, time, main, secondary) {
    const energy = P.energyLevel(n, view === "eigen" ? amplitude : 1);
    if (view === "separation") {
      const phase = P.phase(energy, time);
      const chart = axes(main, 0, 1, -1.6, 1.6, "u = x/L", "Ψ(u,t)"); well(chart, 1, -1.5);
      line(chart, samples(0, 1, 320, u => amplitude * P.boxWave(u, n) * phase.re), C.green);
      line(chart, samples(0, 1, 320, u => amplitude * P.boxWave(u, n) * phase.im), C.gold, [7, 4]);
      drawPhaseCircle(secondary, phase, energy, time);
      renderText({ title: "Separação espacial e temporal", subtitle: "Ψₙ(u,t)=ψₙ(u)e⁻ⁱᴱⁿᵗ/ℏ", caption: "A forma espacial permanece fixa; a fase temporal gira o estado entre as partes real e imaginária.", secondaryTitle: "Fator temporal no plano complexo", secondarySubtitle: "módulo unitário", secondaryCaption: "A ponta do vetor percorre o círculo sem alterar |T(t)|².", prediction: "A rotação da fase altera a densidade |Ψ|²?", calculation: `Hψₙ=Eₙψₙ<br><b>Eₙ/E₁=${fmt(energy, 0)} · fase = −${fmt(energy * time, 2)} rad</b>`, metrics: [["n", fmt(n, 0)], ["Eₙ/E₁", fmt(energy, 0)], ["|T(t)|²", "1,000"]], concept: "Separar variáveis isola a forma espacial do fator de fase que carrega a evolução temporal.", prompts: ["Compare n=1 e n=3.", "Encontre um tempo em que Re Ψ desaparece.", "Explique por que V deve ser independente do tempo."], legend: [[C.green, "Re Ψ"], [C.gold, "Im Ψ"]] });
    } else if (view === "stationary") {
      const phase = P.phase(energy, time);
      const chart = axes(main, 0, 1, -1.65, 2.25, "u = x/L", "amplitude / densidade"); well(chart, 1, -1.55);
      line(chart, samples(0, 1, 320, u => amplitude * P.boxWave(u, n) * phase.re), C.green);
      line(chart, samples(0, 1, 320, u => P.densityStationary(u, n)), C.blue);
      const compare = axes(secondary, 0, 1, 0, 2.3, "u = x/L", "|Ψ|²");
      line(compare, samples(0, 1, 320, u => P.densityStationary(u, n)), C.blue);
      line(compare, samples(0, 1, 320, u => P.densityStationary(u, n)), C.gold, [7, 4]);
      renderText({ title: "Estado estacionário dentro do poço", subtitle: "a fase muda; a densidade não", caption: "As paredes e a densidade deixam claro o significado físico de “estacionário”.", secondaryTitle: "Densidade em dois instantes", secondarySubtitle: "t=0 e t atual coincidem", secondaryCaption: "As curvas sobrepostas demonstram que |e⁻ⁱᴱᵗ/ℏ|²=1.", prediction: "A função de onda fica parada ou apenas sua densidade?", calculation: `|Ψₙ(u,t)|²=|ψₙ(u)|²<br><b>∂ρ/∂t = 0</b>`, metrics: [["nós internos", fmt(n - 1, 0)], ["fase", fmt(energy * time, 2)], ["densidade", "invariante"]], concept: "Um estado estacionário evolui por uma fase global, invisível em toda probabilidade de posição.", prompts: ["Mova o tempo e compare as curvas.", "Conte os nós internos.", "Antecipe o que muda numa superposição de energias."], legend: [[C.green, "Re Ψ"], [C.blue, "|Ψ|²"]] });
    } else {
      drawSpectrum(main, n, amplitude, time, true);
      const chart = axes(secondary, 0, amplitude, -1.6, 1.6, "x", "ψₙ(x)"); well(chart, amplitude, -1.5);
      line(chart, samples(0, amplitude, 320, x => time * P.boxWave(x / amplitude, n)), C.green);
      renderText({ title: "Autovalores permitidos", subtitle: "as condições de contorno selecionam Eₙ", caption: "Linhas horizontais são energias permitidas; a selecionada carrega sua autofunção.", secondaryTitle: `Autofunção do nível n=${n}`, secondarySubtitle: "ψ(0)=ψ(L)=0", secondaryCaption: "A solução admissível zera nas duas paredes.", prediction: "Ao dobrar L, por qual fator muda Eₙ?", calculation: `Eₙ/E₁(L=1)=n²/L²<br><b>E${n}/E₁ = ${fmt(energy, 2)}</b>`, metrics: [["n", fmt(n, 0)], ["L", fmt(amplitude, 2)], ["Eₙ/E₁", fmt(energy, 2)]], concept: "Autovalores são os valores de energia compatíveis simultaneamente com a equação e com as condições de contorno.", prompts: ["Dobre L.", "Compare os espaçamentos E₂−E₁ e E₃−E₂.", "Relacione n ao número de nós."], legend: [[C.green, "nível selecionado"], [C.gray, "demais níveis"]] });
    }
  }

  function drawPhaseCircle(target, phase, energy, time) {
    const { ctx, width, height } = target;
    const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .32;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - radius - 16, cy); ctx.lineTo(cx + radius + 16, cy); ctx.moveTo(cx, cy - radius - 16); ctx.lineTo(cx, cy + radius + 16); ctx.stroke();
    ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + radius * phase.re, cy - radius * phase.im); ctx.stroke();
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx + radius * phase.re, cy - radius * phase.im, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.gray; ctx.font = "11px Ubuntu, system-ui"; ctx.fillText(`Eτ = ${fmt(energy * time, 2)}`, 16, 20); ctx.fillText("Re", cx + radius + 20, cy + 4); ctx.fillText("Im", cx + 6, cy - radius - 15);
  }

  function drawAula04General(n, scale, time, main, secondary) {
    if (view === "eigen") { drawAula04(n, scale, time, main, secondary); return; }
    const energy = n * n, temporal = P.phase(energy, time);
    if (view === "separation") {
      const chart = axes(main, -Math.PI, Math.PI, -.7, .7, "coordenada periódica θ", "Ψ(θ,t)");
      line(chart, samples(-Math.PI, Math.PI, 360, theta => scale * P.ringWave(theta, n) * temporal.re), C.green);
      line(chart, samples(-Math.PI, Math.PI, 360, theta => scale * P.ringWave(theta, n) * temporal.im), C.gold, [7, 4]);
      drawPhaseCircle(secondary, temporal, energy, time);
      renderText({ title: "Separação em um sistema periódico", subtitle: "exemplo geral sem paredes infinitas", caption: "A forma espacial periódica permanece fixa; somente o fator temporal complexo gira.", secondaryTitle: "Fator temporal no plano complexo", secondarySubtitle: "|T(t)|=1", secondaryCaption: "A rotação preserva a norma e separa claramente forma espacial de evolução temporal.", prediction: "A fase temporal altera a densidade de probabilidade?", calculation: `Ψₙ(θ,t)=ψₙ(θ)e⁻ⁱᴱⁿᵗ/ℏ<br><b>Eₙ∝n² · |T|²=1</b>`, metrics: [["condição", "ψ(−π)=ψ(π)"], ["n", fmt(n, 0)], ["fase", fmt(energy * time, 2)]], concept: "A separação de variáveis vale para Hamiltonianos independentes do tempo; o poço é apenas um exemplo possível.", prompts: ["Verifique a periodicidade nas bordas.", "Mude o tempo sem mudar a forma espacial.", "Compare este contorno periódico com as paredes da aula 5."], legend: [[C.green, "Re Ψ"], [C.gold, "Im Ψ"]] });
    } else {
      const chart = axes(main, -Math.PI, Math.PI, -.7, .7, "coordenada periódica θ", "Re Ψ");
      line(chart, samples(-Math.PI, Math.PI, 360, theta => scale * P.ringWave(theta, n) * temporal.re), C.green);
      const compare = axes(secondary, -Math.PI, Math.PI, 0, .36, "coordenada periódica θ", "|Ψ|²");
      line(compare, samples(-Math.PI, Math.PI, 360, theta => P.ringDensity(theta, n)), C.blue);
      line(compare, samples(-Math.PI, Math.PI, 360, theta => P.ringDensity(theta, n)), C.gold, [7, 4]);
      renderText({ title: "Função evolui; densidade é estacionária", subtitle: "autoestado em domínio periódico", caption: "A parte real oscila com o tempo, portanto a função de onda não está parada.", secondaryTitle: "Densidade em t=0 e no tempo atual", secondarySubtitle: "as duas curvas coincidem", secondaryCaption: "O módulo quadrado remove a fase global em qualquer autoestado de energia.", prediction: "“Estado estacionário” significa Ψ constante ou apenas |Ψ|² constante?", calculation: `|ψₙe⁻ⁱᴱⁿᵗ/ℏ|²=|ψₙ|²<br><b>∂ρ/∂t=0</b>`, metrics: [["domínio", "periódico"], ["Eₙ∝", `${n * n}`], ["densidade", "invariante"]], concept: "Estacionariedade é consequência de uma energia definida, não uma propriedade exclusiva do poço infinito.", prompts: ["Mova o tempo.", "Observe a coincidência das densidades.", "Antecipe por que duas energias diferentes produzem batimentos."], legend: [[C.green, "Re Ψ"], [C.blue, "|Ψ|²"]] });
    }
  }

  function drawSpectrum(target, selected, length, scale, includeWave) {
    const maxEnergy = 36 / (length * length);
    const chart = axes(target, -.16 * length, 1.16 * length, 0, maxEnergy * 1.08, "posição x", "energia / E₁");
    well(chart, length, 0);
    for (let n = 1; n <= 6; n += 1) {
      const e = n * n / (length * length);
      chart.ctx.strokeStyle = n === selected ? C.green : C.gray; chart.ctx.lineWidth = n === selected ? 3 : 1.4;
      chart.ctx.beginPath(); chart.ctx.moveTo(chart.X(.06 * length), chart.Y(e)); chart.ctx.lineTo(chart.X(.94 * length), chart.Y(e)); chart.ctx.stroke();
      chart.ctx.fillStyle = n === selected ? C.green : C.gray; chart.ctx.font = "bold 10px Ubuntu, system-ui"; chart.ctx.textAlign = "left"; chart.ctx.fillText(`n=${n}`, chart.X(.96 * length), chart.Y(e) + 3);
      if (includeWave && n === selected) line(chart, samples(0, length, 240, x => e + scale * maxEnergy * .055 * Math.sin(n * Math.PI * x / length)), C.green);
    }
  }

  function drawAula05(n, lengthOrWeight, time, main, secondary) {
    if (view === "spectrum") {
      drawSpectrum(main, n, lengthOrWeight, time, true);
      const energies = Array.from({ length: 6 }, (_, i) => (i + 1) ** 2 / lengthOrWeight ** 2);
      const chart = axes(secondary, .5, 6.5, 0, Math.max(...energies) * 1.08, "n", "Eₙ/E₁"); bars(chart, energies, C.green);
      renderText({ title: "O poço e seu espectro", subtitle: "paredes infinitas em x=0 e x=L", caption: "O potencial, os níveis e a autofunção selecionada aparecem no mesmo diagrama de energia.", secondaryTitle: "Lei quadrática do espectro", secondarySubtitle: "Eₙ ∝ n²/L²", secondaryCaption: "A separação entre níveis cresce com n e diminui quando o poço alarga.", prediction: "Se L dobrar, a energia cai à metade ou a um quarto?", calculation: `Eₙ=ℏ²π²n²/(2mL²)<br><b>E${n}/E₁(L=1) = ${fmt(P.boxEnergy(n, lengthOrWeight), 2)}</b>`, metrics: [["n", fmt(n, 0)], ["L", fmt(lengthOrWeight, 2)], ["nós internos", fmt(n - 1, 0)]], concept: "As paredes infinitas tornam visíveis as condições ψ(0)=ψ(L)=0 que quantizam o espectro.", prompts: ["Alargue o poço.", "Selecione n=1 e n=6.", "Relacione comprimento de onda, nós e energia."], legend: [[C.green, "nível e ψₙ"], [C.ink, "potencial V(x)"]] });
    } else if (view === "wave") {
      const chart = axes(main, -.14 * lengthOrWeight, 1.14 * lengthOrWeight, -1.65 / Math.sqrt(lengthOrWeight), 1.65 / Math.sqrt(lengthOrWeight), "posição x", "ψₙ(x)"); well(chart, lengthOrWeight, -1.55 / Math.sqrt(lengthOrWeight));
      line(chart, samples(0, lengthOrWeight, 320, x => P.boxWave(x, n, lengthOrWeight)), C.green);
      chart.ctx.fillStyle = "rgba(233,162,59,.16)"; chart.ctx.fillRect(chart.X(0), chart.top, chart.X(time * lengthOrWeight) - chart.X(0), chart.bottom - chart.top);
      const probability = P.intervalProbability(n, 0, time * lengthOrWeight, lengthOrWeight);
      const chart2 = axes(secondary, -.14 * lengthOrWeight, 1.14 * lengthOrWeight, 0, 2.2 / lengthOrWeight, "posição x", "|ψₙ(x)|²");
      chart2.ctx.fillStyle = "rgba(233,162,59,.18)"; chart2.ctx.fillRect(chart2.X(0), chart2.top, chart2.X(time * lengthOrWeight) - chart2.X(0), chart2.bottom - chart2.top);
      line(chart2, samples(0, lengthOrWeight, 320, x => P.boxWave(x, n, lengthOrWeight) ** 2), C.blue);
      renderText({ title: "Autofunção dentro do poço", subtitle: "amplitude em seu próprio eixo", caption: "A função de onda tem sinal e nós; a faixa amarela marca o intervalo [0,b].", secondaryTitle: "Densidade de probabilidade", secondarySubtitle: "|ψₙ|² em escala separada", secondaryCaption: "A área sombreada é P(0≤x≤b); ψ e |ψ|² não são tratados como a mesma grandeza.", prediction: "Quantos nós internos aparecem para o nível escolhido?", calculation: `ψₙ=√(2/L) sen(nπx/L)<br><b>P(0≤x≤b) = ${fmt(probability)}</b>`, metrics: [["nós internos", fmt(n - 1, 0)], ["norma", "1,000"], ["P no intervalo", fmt(probability)]], concept: "A geometria do poço determina zeros, comprimentos de onda permitidos e probabilidades espaciais.", prompts: ["Conte os nós em ψ.", "Compare nós e mínimos de |ψ|².", "Aumente b e interprete a área sombreada."], legend: [[C.green, "ψₙ no painel superior"], [C.blue, "|ψₙ|² no painel inferior"], [C.ink, "V(x)"]] });
    } else {
      const nB = n, weight = lengthOrWeight;
      const relativePhase = (nB * nB - 1) * time;
      const chart = axes(main, -.14, 1.14, 0, 4.3, "u=x/L", "|Ψ|²"); well(chart, 1, 0);
      line(chart, samples(0, 1, 320, u => P.superpositionDensity(u, 1, nB, weight, relativePhase)), C.green);
      const phase = { re: Math.cos(relativePhase), im: -Math.sin(relativePhase) };
      drawPhaseCircle(secondary, phase, nB * nB - 1, time);
      const meanE = 1 - weight + weight * nB * nB;
      renderText({ title: `Superposição |1⟩ + |${nB}⟩`, subtitle: "a interferência move a densidade dentro do poço", caption: "O potencial permanece fixo enquanto a fase relativa redistribui a probabilidade.", secondaryTitle: "Relógio da fase relativa", secondarySubtitle: `frequência (E${nB}−E₁)/ℏ`, secondaryCaption: "Quando o vetor gira, o termo de interferência muda de sinal.", prediction: "Os pesos de energia mudam durante a evolução?", calculation: `Ψ=√(1−w)ψ₁e⁻ⁱᴱ¹ᵗ/ℏ+√w ψ${nB}e⁻ⁱᴱ${nB}ᵗ/ℏ<br><b>⟨E⟩/E₁ = ${fmt(meanE, 2)}</b>`, metrics: [["P(E₁)", fmt(1 - weight)], [`P(E${nB})`, fmt(weight)], ["fase relativa", fmt(relativePhase % TAU, 2)]], concept: "Em uma superposição, pesos de energia constantes coexistem com uma densidade espacial dependente do tempo.", prompts: ["Use peso 0 ou 1.", "Evolua a fase.", "Compare nᴮ=2 e nᴮ=5."], legend: [[C.green, "|Ψ(u,t)|²"], [C.ink, "V(x)"]] });
    }
  }

  function drawAula06(dominant, mixing, third, main, secondary) {
    const projection = P.projectState(basisKind, dominant, mixing, modeCount);
    const probabilities = projection.normalizedProbabilities;
    const stateName = { gaussian: "gaussiano localizado", triangular: "triangular", flat: "constante" }[basisKind];
    const values = Array.from({ length: modeCount }, (_, i) => (i + 1) * (view === "measurement" ? third : 1));
    const mean = P.expectation(values, probabilities), variance = P.variance(values, probabilities);
    if (view === "expansion") {
      const amplitudes = projection.coefficients.map((coefficient, i) => coefficient * Math.cos(third * (i + 1)));
      const chart = axes(main, .5, modeCount + .5, -1, 1, "estado de base |n⟩", "Re(cₙ)"); barsSigned(chart, amplitudes, C.green, C.red);
      const reconstruction = samples(0, 1, 320, u => ({ x: u, y: projection.coefficients.reduce((sum, coefficient, i) => sum + coefficient * Math.sqrt(2) * Math.sin((i + 1) * Math.PI * u), 0) }));
      const chart2 = axes(secondary, 0, 1, -1.6, 1.6, "u=x/L", "ψ(u)");
      line(chart2, samples(0, 1, 320, u => ({ x: u, y: projection.wave(u) })), C.gold, [5, 4]);
      line(chart2, reconstruction, C.blue);
      renderText({ title: "Projeção de um estado concreto", subtitle: `estado ${stateName} expandido na base do poço`, caption: "Cada barra é calculada numericamente pela integral cₙ=∫ψₙ(u)ψ(u)du.", secondaryTitle: "Coeficientes e reconstrução", secondarySubtitle: `N=${modeCount} termos · norma capturada ${fmt(projection.capturedNorm)}`, secondaryCaption: "Barras: |cₙ|². Linha azul: reconstrução Σcₙψₙ(u) no mesmo painel; aumente N para reduzir o erro.", prediction: "Que simetria do estado faz desaparecer parte dos coeficientes?", calculation: `cₙ=∫₀¹ψₙ(u)ψ(u)du<br><b>Σₙ₌₁ⁿ|cₙ|² = ${fmt(projection.capturedNorm)}</b>`, metrics: [["estado preparado", stateName], ["termos N", fmt(modeCount, 0)], ["norma capturada", fmt(projection.capturedNorm)], ["maior peso", fmt(Math.max(...probabilities))]], concept: "Expandir deixou de ser uma distribuição arbitrária: os coeficientes agora são projeções de uma função normalizada sobre autofunções conhecidas.", prompts: ["Compare estado constante e triangular.", "Desloque o centro e observe a paridade.", "Aumente N e avalie a reconstrução."], legend: [[C.green, "Re(cₙ)>0"], [C.red, "Re(cₙ)<0"], [C.blue, "reconstrução"]] });
    } else if (view === "measurement") {
      const total = counts.reduce((x, y) => x + y, 0);
      const observed = counts.map(count => total ? count / total : 0);
      const chart = axes(main, .5, modeCount + .5, 0, Math.max(.65, ...probabilities, ...observed) * 1.12, "resultado aₙ", "frequência"); bars(chart, probabilities, C.gold, true); if (total) bars(chart, observed, C.green);
      const chart2 = axes(secondary, .5, modeCount + .5, 0, Math.max(...values) * 1.08, "resultado n", "autovalor aₙ"); bars(chart2, values, C.blue);
      renderText({ title: "Medidas em um ensemble", subtitle: `${stateName} · Born × frequências observadas · N=${total}`, caption: "Cada sorteio usa uma nova cópia; a distribuição prevista vem das projeções calculadas.", secondaryTitle: "Espectro do observável A", secondarySubtitle: "resultados possíveis, não uma curva contínua", secondaryCaption: "A simulação condiciona a medida aos seis níveis exibidos; a norma capturada informa a truncagem.", prediction: "Uma única medida retorna ⟨A⟩ ou um dos autovalores?", calculation: `P(aₙ|n≤6)=|cₙ|²/Σ₁⁶|c|²<br><b>⟨A⟩=${fmt(mean)} · ΔA=${fmt(Math.sqrt(variance))}</b>`, metrics: [["ensemble N", fmt(total, 0)], ["último resultado", window.lastMeasurement || "—"], ["norma capturada", fmt(projection.capturedNorm)]], concept: "A média descreve o ensemble; cada realização individual produz um autovalor permitido.", prompts: ["Meça uma cópia.", "Compare N=100 e N=1000.", "Troque o estado e observe as frequências."], legend: [[C.gold, "previsão projetada"], [C.green, "frequência observada"]] });
    } else {
      const phases = probabilities.map((_, i) => -((i + 1) ** 2) * third);
      drawPhasors(main, probabilities, phases);
      const chart2 = axes(secondary, .5, modeCount + .5, 0, Math.max(.65, ...probabilities) * 1.15, "energia Eₙ", "P(Eₙ)"); bars(chart2, probabilities, C.gold);
      renderText({ title: "Fases da expansão projetada", subtitle: `${stateName} · cada cₙ gira com Eₙ/ℏ`, caption: "Comprimentos dos vetores vêm das projeções; seus ângulos evoluem em ritmos n².", secondaryTitle: "Probabilidades de energia", secondarySubtitle: "invariantes durante a evolução unitária", secondaryCaption: "As barras não mudam com o tempo, embora as fases relativas mudem.", prediction: "A evolução livre altera os pesos de energia ou apenas suas fases?", calculation: `cₙ(t)=cₙ(0)e⁻ⁱᴱⁿᵗ/ℏ<br><b>⟨H⟩₆=${fmt(mean)} · norma capturada=${fmt(projection.capturedNorm)}</b>`, metrics: [["tempo τ", fmt(third, 2)], ["⟨H⟩ na truncagem", fmt(mean)], ["norma capturada", fmt(projection.capturedNorm)]], concept: "A evolução unitária preserva os módulos das projeções e altera apenas suas fases relativas.", prompts: ["Evolua o tempo.", "Compare estados com paridades diferentes.", "Relacione frequência de cada fasor a n²."], legend: [[C.green, "fasores cₙ"], [C.gold, "|cₙ|²"]] });
    }
  }

  function barsSigned(chart, values, positive, negative) {
    const step = (chart.right - chart.left) / values.length;
    values.forEach((v, i) => { const x = chart.left + i * step + step * .18; chart.ctx.fillStyle = v >= 0 ? positive : negative; chart.ctx.fillRect(x, Math.min(chart.Y(v), chart.Y(0)), step * .64, Math.abs(chart.Y(v) - chart.Y(0))); });
  }

  function drawPhasors(target, probabilities, phases) {
    const { ctx, width, height } = target;
    const cols = 3, rows = 2, cellW = width / cols, cellH = height / rows;
    probabilities.forEach((p, i) => {
      const cx = cellW * (i % cols + .5), cy = cellH * (Math.floor(i / cols) + .53), radius = Math.min(cellW, cellH) * .3;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
      const length = radius * Math.sqrt(p / Math.max(...probabilities));
      ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + length * Math.cos(phases[i]), cy - length * Math.sin(phases[i])); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = "bold 11px Ubuntu, system-ui"; ctx.textAlign = "center"; ctx.fillText(`c${i + 1} · P=${fmt(p, 2)}`, cx, cy - radius - 8);
    });
  }

  function configureControls() {
    controls[topic][view].forEach((config, index) => {
      const id = ["parameter", "secondary", "tertiary"][index];
      const input = active(id), label = input.closest("label"), output = label.querySelector("output");
      label.querySelector("span").innerHTML = config[0];
      input.min = config[1]; input.max = config[2]; input.step = config[3]; input.value = config[4]; input.defaultValue = config[4];
      output.textContent = fmt(config[4], config[3] >= 1 ? 0 : 2);
    });
    updateActions();
  }

  function updateOutputs() {
    ["parameter", "secondary", "tertiary"].forEach(id => {
      const input = active(id), output = input.closest("label").querySelector("output");
      output.textContent = fmt(Number(input.value), Number(input.step) >= 1 ? 0 : 2);
    });
  }

  function updateActions() {
    const canPlay = (topic === "aula03" && view === "current") || (topic === "aula04" && ["separation", "stationary"].includes(view)) || (topic === "aula05" && view === "superposition") || (topic === "aula06" && view === "evolution");
    const canMeasure = topic === "aula06" && view === "measurement";
    const uncertaintySelector = topic === "aula03" && view === "uncertainty" ? `<label class="state-select"><span>Estado</span><select id="uncertaintyKind"><option value="gaussian">Gaussiana</option><option value="triangular">Triangular</option><option value="exponential">Exponencial √λ e^(−λ|x|)</option></select></label>` : "";
    const stateSelector = topic === "aula06" ? `<label class="state-select"><span>Estado preparado</span><select id="basisKind"><option value="gaussian">Gaussiano localizado</option><option value="triangular">Triangular</option><option value="flat">Constante no poço</option></select></label><label class="state-select"><span>Termos N</span><input id="modeCount" type="range" min="3" max="12" step="1" value="${modeCount}"><output>${modeCount}</output></label>` : "";
    html("actionBar", `${uncertaintySelector}${stateSelector}${canPlay ? `<button id="playBtn" type="button">${playing ? "❚❚ Pausar" : "▶ Evoluir"}</button><button id="zeroBtn" class="quiet" type="button">t = 0</button>` : ""}${canMeasure ? `<button data-shots="1">Medir 1</button><button data-shots="100">Medir 100</button><button data-shots="1000">Medir 1000</button><button id="clearBtn" class="quiet">Limpar</button>` : ""}`);
    if (uncertaintySelector) { $("uncertaintyKind").value = uncertaintyKind; $("uncertaintyKind").onchange = event => { uncertaintyKind = event.target.value; draw(); }; }
    if (topic === "aula06") { $("basisKind").value = basisKind; $("basisKind").onchange = event => { basisKind = event.target.value; counts = Array(modeCount).fill(0); window.lastMeasurement = null; draw(); }; $("modeCount").oninput = event => { modeCount = Number(event.target.value); event.target.nextElementSibling.textContent = modeCount; counts = Array(modeCount).fill(0); window.lastMeasurement = null; draw(); }; }
    if (canPlay) { $("playBtn").onclick = togglePlay; $("zeroBtn").onclick = () => { active("tertiary").value = 0; draw(); }; }
    if (canMeasure) {
      document.querySelectorAll("[data-shots]").forEach(button => button.onclick = () => measure(Number(button.dataset.shots)));
      $("clearBtn").onclick = () => { counts = Array(modeCount).fill(0); window.lastMeasurement = null; draw(); };
    }
  }

  function measure(shots) {
    const probabilities = P.projectState(basisKind, value("parameter"), value("secondary"), modeCount).normalizedProbabilities;
    for (let i = 0; i < shots; i += 1) { const result = P.sample(probabilities); counts[result] += 1; window.lastMeasurement = `a${result + 1}`; }
    draw();
  }

  function togglePlay() {
    playing = !playing; lastFrame = performance.now();
    if (playing && topic === "aula03" && Number(active("tertiary").value) >= Number(active("tertiary").max)) active("tertiary").value = 0;
    updateActions();
    if (playing) animation = requestAnimationFrame(tick); else cancelAnimationFrame(animation);
  }

  function tick(now) {
    if (!playing) return;
    const input = active("tertiary");
    const next = Number(input.value) + (now - lastFrame) * .001, max = Number(input.max);
    lastFrame = now;
    if (topic === "aula03" && next >= max) { input.value = max; playing = false; updateActions(); draw(); return; }
    input.value = topic === "aula03" ? next : next % TAU;
    draw(); animation = requestAnimationFrame(tick);
  }

  function draw() {
    updateOutputs();
    const main = canvas("mainCanvas"), secondary = canvas("secondaryCanvas");
    const a = value("parameter"), b = value("secondary"), t = value("tertiary");
    if (topic === "aula03") drawAula03(a, b, t, main, secondary);
    else if (topic === "aula04") drawAula04General(a, b, t, main, secondary);
    else if (topic === "aula05") drawAula05(a, b, t, main, secondary);
    else drawAula06(a, b, t, main, secondary);
  }

  function switchView(next) {
    playing = false; cancelAnimationFrame(animation); view = next;
    document.querySelectorAll("[data-view]").forEach(button => { const selected = button.dataset.view === view; button.classList.toggle("active", selected); button.setAttribute("aria-selected", String(selected)); });
    document.querySelectorAll("[data-controls]").forEach(section => section.classList.toggle("active", section.dataset.controls === view));
    try { const url = new URL(location.href); url.searchParams.set("view", view); history.replaceState(null, "", url); } catch (_) {}
    configureControls(); draw();
  }

  enhanceLayout();
  document.querySelector(".tabs").addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-view]")], current = tabs.findIndex(tab => tab.dataset.view === view);
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[index].focus(); switchView(tabs[index].dataset.view);
  });
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("input").forEach(input => input.addEventListener("input", draw));
  $("resetBtn").addEventListener("click", () => { playing = false; counts = Array(6).fill(0); window.lastMeasurement = null; configureControls(); draw(); });
  window.addEventListener("resize", draw);
  switchView(view);
})();
