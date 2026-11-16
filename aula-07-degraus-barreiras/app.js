(function () {
  "use strict";
  const P = window.BarrierPhysics, $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", purple: "#7b5ea7", gray: "#6f7171", ink: "#26312d", grid: "#dce5dc" };
  let view = new URLSearchParams(location.search).get("view") || "degrau";
  const f = (x, n = 3) => P.formatPt(x, n), sig = (x, n = 3) => P.sigPt(x, n), sci = (x, n = 1) => P.sciPt(x, n);
  function set(id, text) { $(id).innerHTML = text; } function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  const FONT = "Ubuntu,system-ui,sans-serif";

  // Canvas com altura proporcional à largura; abaixo de 600 px usa a razão "estreita" (painéis empilhados).
  function canvas(wide, narrowRatio) {
    const e = $("mainCanvas"), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, narrow = w < 600;
    const h = Math.round(w * (narrow ? narrowRatio : wide));
    e.width = w * ratio; e.height = h * ratio;
    const c = e.getContext("2d"); c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, w, h);
    return { c, w, h, narrow };
  }
  function legend(rows) { html("legend", rows.map(([color, label, dash]) => `<span><i style="border-color:${color};border-top-style:${dash ? "dashed" : "solid"}"></i>${label}</span>`).join("")); }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }
  function tag(c, text, x, y, color, align = "left", font = `bold 11px ${FONT}`) {
    c.font = font; c.textAlign = align; c.lineJoin = "round"; c.strokeStyle = "rgba(255,255,255,.92)"; c.lineWidth = 3.5; c.strokeText(text, x, y); c.fillStyle = color; c.fillText(text, x, y);
  }
  // Marcas: lista explícita ([v] ou [{v,label}]) ou niceTicks (T1 de 2026-11-15).
  function resolveTicks(spec, min, max, target) {
    if (Array.isArray(spec)) return spec.map((t) => (typeof t === "object" ? t : { v: t, label: null })).map((t) => ({ v: t.v, label: t.label }));
    const nt = P.niceTicks(min, max, target);
    return nt.ticks.map((v) => ({ v, label: f(v, nt.decimals) }));
  }
  // Painel de gráfico dentro de rect = {x, y, w, h}. spec: xr, yr, xlabel, ylabel, xticks, yticks, marks.
  function plot(c, rect, series, spec) {
    const [xmin, xmax] = spec.xr, [ymin, ymax] = spec.yr;
    const l = rect.x + (rect.w < 380 ? 48 : 58), r = rect.x + rect.w - 16, t = rect.y + (spec.top === undefined ? 24 : spec.top), b = rect.y + rect.h - 44;
    const X = (x) => l + (x - xmin) * (r - l) / (xmax - xmin), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    const xt = resolveTicks(spec.xticks, xmin, xmax, rect.w < 420 ? 4 : 6), yt = resolveTicks(spec.yticks, ymin, ymax, 5);
    c.strokeStyle = C.grid; c.lineWidth = 1; c.fillStyle = C.gray; c.font = `10px ${FONT}`;
    xt.forEach(({ v, label }) => { c.beginPath(); c.moveTo(X(v), t); c.lineTo(X(v), b); c.stroke(); c.textAlign = "center"; c.fillText(label, X(v), b + 15); });
    yt.forEach(({ v, label }) => { c.beginPath(); c.moveTo(l, Y(v)); c.lineTo(r, Y(v)); c.stroke(); c.textAlign = "right"; c.fillText(label, l - 6, Y(v) + 3.5); });
    (spec.marks || []).forEach((m) => {
      if (m.x < xmin || m.x > xmax) return;
      c.strokeStyle = m.color || C.gray; c.lineWidth = m.width || 1; c.setLineDash(m.dash === undefined ? [4, 4] : m.dash);
      c.beginPath(); c.moveTo(X(m.x), t); c.lineTo(X(m.x), b); c.stroke(); c.setLineDash([]);
    });
    c.strokeStyle = C.gray; c.lineWidth = 1; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = `11px ${FONT}`; c.textAlign = "center"; c.fillText(spec.xlabel, (l + r) / 2, rect.y + rect.h - 6);
    c.save(); c.translate(rect.x + 12, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(spec.ylabel, 0, 0); c.restore();
    c.save(); c.beginPath(); c.rect(l, t - 4, r - l, b - t + 8); c.clip();
    series.forEach((s) => {
      c.strokeStyle = s.color; c.lineWidth = s.width || 2.4; c.setLineDash(s.dash || []); c.beginPath();
      let pen = false;
      s.points.forEach((p) => { if (!p || !Number.isFinite(p.y)) { pen = false; return; } if (pen) c.lineTo(X(p.x), Y(p.y)); else c.moveTo(X(p.x), Y(p.y)); pen = true; });
      c.stroke(); c.setLineDash([]);
    });
    c.restore();
    return { X, Y, l, r, t, b };
  }

  // Divide o canvas em painéis: ψ no alto (largura inteira) e os demais embaixo, lado a lado (largo) ou empilhados (estreito).
  function layout(d, nBottom, tops) {
    const g = 8;
    if (d.narrow) {
      const hs = [0.9, ...Array(nBottom).fill(0.74)].map((k) => k * d.w), rects = []; let y = 0;
      hs.forEach((h) => { rects.push({ x: 0, y, w: d.w, h }); y += h + g; });
      return rects;
    }
    const hTop = d.h * tops, hb = d.h - hTop - g, wb = (d.w - g * (nBottom - 1)) / nBottom;
    return [{ x: 0, y: 0, w: d.w, h: hTop }, ...Array.from({ length: nBottom }, (_, i) => ({ x: i * (wb + g), y: hTop + g, w: wb, h: hb }))];
  }
  const narrowRatio = (nBottom) => 0.9 + 0.8 * nBottom;

  // ψ nas três regiões (nota 07, figura da barreira): Re ψ e |ψ| desenhadas a partir do nível E.
  // wv = stepWave ou barrierWave; a = 0 para o degrau. Escala vertical da onda arbitrária.
  function wavePanel(c, rect, wv, E, V0, a, comps) {
    const isBarrier = a > 0, k1 = isBarrier ? wv.k : wv.k1, lam = 2 * Math.PI / k1;
    const left = 2.5 * lam;
    let right;
    if (isBarrier) right = 2.5 * lam;
    else if (wv.above) right = Math.min(2.5 * 2 * Math.PI / wv.k2, 6 * lam);
    else right = Math.min(Math.max(4 / wv.kappa, 0.5 * lam), 2.5 * lam);
    const x0 = -left, x1 = (isBarrier ? a : 0) + right, pts = samples(x0, x1, 700, (x) => x);
    const psi = pts.map((p) => wv.psi(p.x)), maxAbs = Math.max(...psi.map((z) => Math.hypot(z[0], z[1])), 1e-9);
    const s = 0.3 * V0 / maxAbs, ymin = Math.min(0, E - s * maxAbs) - 0.05 * V0, ymax = Math.max(V0, E + s * maxAbs) + 0.06 * V0;
    const xticks = isBarrier ? [{ v: 0, label: "0" }, { v: a, label: "a" }] : [{ v: 0, label: "0" }];
    const reS = { color: C.red, width: 2.4, points: pts.map((p, i) => ({ x: p.x, y: E + s * psi[i][0] })) };
    const absS = { color: C.blue, width: 2, dash: [6, 4], points: pts.map((p, i) => ({ x: p.x, y: E + s * Math.hypot(psi[i][0], psi[i][1]) })) };
    const series = [reS, absS];
    if (comps) {
      const mk = (key, color) => ({ color, width: 1.5, points: pts.map((p) => { const q = wv.parts(p.x)[key]; return q ? { x: p.x, y: E + s * q[0] } : null; }) });
      // quebra de linha entre x<0 e x≥0 (a componente transmitida é outra função)
      series.push(mk("inc", C.purple), mk("ref", C.gold), mk("trans", C.purple));
    }
    // o potencial, o nível E e as séries são desenhados na ordem: preenchimento antes dos eixos precisa dos mapas X, Y
    const ax = plot(c, rect, [], { xr: [x0, x1], yr: [ymin, ymax], xlabel: "posição x (unidades reduzidas, ħ = m = 1)", ylabel: "energia (V₀ = " + f(V0, 2) + ")", xticks, yticks: [{ v: 0, label: "0" }, { v: V0, label: "V₀" }], top: 26 });
    c.save(); c.beginPath(); c.rect(ax.l, ax.t - 4, ax.r - ax.l, ax.b - ax.t + 8); c.clip();
    const xa = isBarrier ? a : x1 + 1;
    c.fillStyle = "rgba(111,113,113,.16)"; c.fillRect(ax.X(0), ax.Y(V0), ax.X(xa) - ax.X(0), ax.Y(0) - ax.Y(V0));
    c.strokeStyle = C.gray; c.lineWidth = 2.2; c.beginPath(); c.moveTo(ax.l, ax.Y(0)); c.lineTo(ax.X(0), ax.Y(0)); c.lineTo(ax.X(0), ax.Y(V0));
    if (isBarrier) { c.lineTo(ax.X(a), ax.Y(V0)); c.lineTo(ax.X(a), ax.Y(0)); c.lineTo(ax.r, ax.Y(0)); } else c.lineTo(ax.r, ax.Y(V0));
    c.stroke();
    c.strokeStyle = C.ink; c.lineWidth = 1.2; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(ax.l, ax.Y(E)); c.lineTo(ax.r, ax.Y(E)); c.stroke(); c.setLineDash([]);
    series.forEach((sr) => {
      c.strokeStyle = sr.color; c.lineWidth = sr.width; c.setLineDash(sr.dash || []); c.beginPath(); let pen = false;
      sr.points.forEach((p) => { if (!p) { pen = false; return; } if (pen) c.lineTo(ax.X(p.x), ax.Y(p.y)); else c.moveTo(ax.X(p.x), ax.Y(p.y)); pen = true; });
      c.stroke(); c.setLineDash([]);
    });
    c.restore();
    tag(c, "E", ax.l + 5, Math.max(ax.t + 10, ax.Y(E) - 5), C.ink);
    // rótulos das regiões acima do quadro
    c.font = `bold 11px ${FONT}`; c.fillStyle = C.gray; c.textAlign = "center";
    const mid = (u, v) => ax.X((Math.max(u, x0) + Math.min(v, x1)) / 2);
    c.fillText(isBarrier ? "I" : "I (x < 0)", mid(x0, 0), rect.y + 14);
    if (isBarrier) { if (ax.X(a) - ax.X(0) > 16) c.fillText("II", mid(0, a), rect.y + 14); c.fillText("III", mid(a, x1), rect.y + 14); }
    else c.fillText(wv.above ? "II (x > 0)" : "II (x > 0, evanescente)", mid(0, x1), rect.y + 14);
    return ax;
  }
  const waveLegend = (comps) => [[C.red, "Re ψ"], [C.blue, "|ψ|", true], ...(comps ? [[C.purple, "incidente / transmitida"], [C.gold, "refletida"]] : []), [C.ink, "E", true]];
  const reMark = (E) => ({ x: E, color: C.gold, dash: [], width: 2 });

  // ---------------------------------------------------------------- estação 1: degrau
  function drawDegrau() {
    const ratio = +$("degrauE").value, V0 = +$("degrauV0").value, E = ratio * V0, comps = $("degrauComp").checked;
    const s = P.step(E, V0), wv = P.stepWave(E, V0), d = canvas(0.9, narrowRatio(1));
    const [rw, rb] = layout(d, 1, 0.56);
    wavePanel(d.c, rw, wv, E, V0, 0, comps);
    const R = samples(0, 2.5, 300, (x) => P.step(x * V0, V0).R), T = samples(0, 2.5, 300, (x) => P.step(x * V0, V0).T);
    plot(d.c, rb, [{ points: R, color: C.red }, { points: T, color: C.green, dash: [7, 4] }], { xr: [0, 2.5], yr: [0, 1], xlabel: "E/V₀", ylabel: "R, T", marks: [{ x: 1, color: C.gray }, { ...reMark(ratio) }] });
    legend([...waveLegend(comps), [C.red, "R(E)"], [C.green, "T(E)", true]]);
    set("degrauEOut", f(ratio, 2)); set("degrauV0Out", f(V0, 2));
    const exact = Math.abs(ratio - 1) < 1e-9;
    set("statusTitle", s.regime === "evanescente" ? "Reflexão total" : "Degrau com E>V₀"); set("statusDetail", `E/V₀ = ${f(ratio, 2)}`);
    set("mainTitle", "ψ nas duas regiões e coeficientes R, T"); set("mainSubtitle", "alto: Re ψ e |ψ| desenhadas a partir de E · baixo: R + T = 1 sempre que E > V₀; abaixo, R = 1");
    set("caption", "Mesmo com E>V₀ há reflexão parcial: a onda muda de número de onda na descontinuidade (no painel de cima, |ψ| oscila à esquerda, onde incidente e refletida interferem). Uma partícula clássica sempre subiria o degrau; uma onda clássica não: é o eco do ultrassom (estação 4). V₀ só reescala k₁, k₂ e κ: R e T dependem apenas de E/V₀. ψ e ψ′ são contínuas em x = 0 (confira na conta).");
    set("prediction", "Quando E se aproxima de V₀ por cima, T tende a zero ou a um valor finito? E à esquerda do degrau, |ψ| é constante ou oscila?");
    if (s.regime === "evanescente") {
      const phi = Math.atan2(wv.r[1], wv.r[0]), C2 = wv.t[0] ** 2 + wv.t[1] ** 2;
      html("calculation", exact
        ? `E = V₀: κ = 0, d<sub>p</sub> → ∞ (limite entre os dois regimes)<br><b>R = 1, T = 0</b>; r = 1, ψ(0) = 2 e a onda não decai na região II<small>com E apenas um pouco abaixo de V₀, d<sub>p</sub> fica enorme; com E apenas acima, k₂ → 0 e T → 0</small>`
        : `κ = √[2(V₀−E)] = ${f(s.kappa, 3)}<br><b>d<sub>p</sub> = 1/κ = ${f(s.delta, 3)}</b><br>r = (k₁−iκ)/(k₁+iκ) = e<sup>iφ</sup>, φ = ${f(phi, 3)} rad, |r| = 1; C = 1 + r, |C|² = ${f(C2, 3)}<small>R = 1, T = 0: só há penetração evanescente, sem corrente (J = 0)</small>`);
      metrics([["R", "1,000"], ["T", "0,000"], ["κ", f(s.kappa)], ["d<sub>p</sub> = 1/κ", exact ? "∞" : f(s.delta)], ["fase de r", `${f(phi, 3)} rad`], ["|ψ(0)|²", f(C2)]]);
    } else {
      const r = (s.k1 - s.k2) / (s.k1 + s.k2), t = 2 * s.k1 / (s.k1 + s.k2);
      html("calculation", `r = (k₁−k₂)/(k₁+k₂) = ${f(r, 3)}, t = 2k₁/(k₁+k₂) = ${f(t, 3)}<br>ψ contínua: 1 + r = ${f(1 + r, 3)} = t ✓ · ψ′ contínua: k₁(1−r) = ${f(s.k1 * (1 - r), 3)} = k₂t = ${f(s.k2 * t, 3)} ✓<br><b>R = ${f(s.R, 3)}, T = ${f(s.T, 3)}</b><small>R+T = ${f(s.R + s.T, 6)} (fluxos: T = (k₂/k₁)|t|², não |t|²)</small>`);
      metrics([["k₁", f(s.k1)], ["k₂", f(s.k2)], ["R", f(s.R)], ["T", f(s.T)], ["r = B/A", f(r)], ["t = C/A", f(t)]]);
    }
    set("conceptTitle", "Reflexão quântica num degrau"); set("conceptText", "A conexão de ψ e ψ′ numa descontinuidade sempre produz onda refletida quando os números de onda mudam, mesmo sem barreira de energia. É a mesma álgebra da reflexão de ultrassom numa interface de tecidos, com k → Z (estação 4).");
    prompts(["Leve E/V₀ de baixo para cima de 1 e acompanhe R e T; no painel de ψ, veja o comprimento de onda à direita crescer quando E → V₀.", "Verifique R+T=1 para E>V₀ e, com E/V₀ = 4/3, R = 1/9.", "Para E &lt; V₀, explique por que T=0 apesar de ψ≠0 em x>0 (olhe a curva azul tracejada à direita)."]);
  }

  // ---------------------------------------------------------------- estação 2: barreira
  const aMaxBarrier = () => +$("barreiraA").max;
  function drawBarreira() {
    const ratio = +$("barreiraE").value, V0 = +$("barreiraV0").value, a = +$("barreiraA").value, E = ratio * V0, comps = $("barreiraComp").checked;
    const below = E < V0 - 1e-9, T = P.barrierT(E, V0, a), lnT = P.lnBarrierT(E, V0, a), wv = P.barrierWave(E, V0, a);
    const Twide = below ? P.barrierTWide(E, V0, a) : NaN, kappa = below ? Math.sqrt(2 * (V0 - E)) : NaN, ka = kappa * a;
    const d = canvas(0.98, narrowRatio(2)), [rw, rT, rL] = layout(d, 2, 0.5);
    wavePanel(d.c, rw, wv, E, V0, a, comps);
    plot(d.c, rT, [{ points: samples(0, 2, 400, (x) => P.barrierT(x * V0, V0, a)), color: C.green }], { xr: [0, 2], yr: [0, 1], xlabel: "E/V₀", ylabel: "T(E)", marks: [{ x: 1, color: C.gray }, reMark(ratio)] });
    // ln T contra a (nota 07, "Barreira larga ou alta"): reta de inclinação −2κ para E < V₀
    const aMax = aMaxBarrier(), curve = samples(0, aMax, 300, (x) => P.lnBarrierT(E, V0, x)), ys = curve.map((p) => p.y);
    const intercept = below ? Math.log(16 * E * (V0 - E) / (V0 * V0)) : 0;
    const yLo = Math.min(...ys, below ? P.lnBarrierTWide(E, V0, aMax) : 0) - 0.5, yHi = Math.max(0, intercept) + 0.4;
    const lnSeries = [{ points: curve, color: C.green }];
    if (below) lnSeries.push({ points: samples(0, aMax, 2, (x) => P.lnBarrierTWide(E, V0, x)), color: C.red, dash: [7, 4], width: 2 });
    const ax = plot(d.c, rL, lnSeries, { xr: [0, aMax], yr: [yLo, yHi], xlabel: "largura a", ylabel: "ln T", marks: [{ x: a, color: C.gold, dash: [], width: 2 }] });
    d.c.fillStyle = C.green; d.c.beginPath(); d.c.arc(ax.X(a), ax.Y(lnT), 5, 0, 2 * Math.PI); d.c.fill();
    if (below && Number.isFinite(Twide) && Twide > 0) { d.c.strokeStyle = C.red; d.c.lineWidth = 2; d.c.beginPath(); d.c.arc(ax.X(a), ax.Y(Math.log(Twide)), 5.5, 0, 2 * Math.PI); d.c.stroke(); }
    if (below) tag(d.c, `inclinação −2κ = ${f(-2 * kappa, 2)}`, ax.r - 4, ax.t + 14, C.red, "right", `bold 10.5px ${FONT}`);
    else tag(d.c, "E ≥ V₀: sem reta (κ imaginário)", ax.r - 4, ax.t + 14, C.gray, "right", `bold 10.5px ${FONT}`);
    legend([...waveLegend(comps), [C.green, "T exato · ln T exato"], [C.red, "aproximação de barreira larga", true], [C.gold, "E (ou a) atual"]]);
    set("barreiraEOut", f(ratio, 2)); set("barreiraV0Out", f(V0, 2)); set("barreiraAOut", f(a, 2));
    set("statusTitle", "Barreira retangular"); set("statusDetail", `E/V₀ = ${f(ratio, 2)} · a = ${f(a, 2)}`);
    set("mainTitle", "ψ nas três regiões, T(E) e ln T contra a"); set("mainSubtitle", "alto: Re ψ e |ψ| · embaixo à esquerda: T contra E/V₀ · à direita: ln T contra a, reta de inclinação −2κ");
    set("caption", "T nunca é zero abaixo de V₀: dentro da barreira |ψ| decai (não é zero) e sobra uma onda progressiva em III, de amplitude √T. Em ln T contra a a exponencial vira reta; o ponto verde é o estado atual e o círculo vermelho, a aproximação (só vale quando as duas curvas se confundem).");
    set("prediction", "Se a largura a dobra, T cai pela metade ou (quase) ao quadrado? Que forma tem o gráfico de ln T contra a?");
    const warnWide = below && Twide >= 1;
    html("calculation", below
      ? `κa = ${f(ka, 3)}<br><b>T = [1+V₀²senh²(κa)/4E(V₀−E)]⁻¹ = ${sig(T, 4)}</b><small>aproximação de barreira larga: T ≈ ${warnWide ? `${sig(Twide, 4)} <span class="warn">aproximação inválida (κa ≲ 1): T > 1</span>` : sig(Twide, 4)}${!warnWide && ka < 1.5 ? ` <span class="warn">(imprecisa para κa &lt; 1,5)</span>` : ""}<br>ln T = ${f(lnT, 3)} · ψ e ψ′ contínuas em x = 0 e x = a (|F/A|² = T)</small>`
      : Math.abs(ratio - 1) < 1e-9
        ? `E = V₀ (κ = q = 0): ψ é linear dentro da barreira<br><b>T = [1+V₀a²/2]⁻¹ = ${sig(T, 4)}</b><small>limite da fórmula nos dois regimes; sem aproximação de barreira larga</small>`
        : `T = [1+V₀²sen²(qa)/4E(E−V₀)]⁻¹ = <b>${sig(T, 4)}</b><small>acima da barreira: ressonâncias em qa=nπ; ln T = ${f(lnT, 3)}</small>`);
    metrics(below
      ? [["κa", f(ka)], ["T exato", sig(T, 4)], ["T aprox.", warnWide ? "inválida (> 1)" : sig(Twide, 4)], ["R = 1 − T", f(1 - T, 4)], ["ln T exato", f(lnT, 2)], ["inclinação −2κ", f(-2 * kappa, 2)]]
      : [["q", f(wv.q)], ["qa", f(wv.q * a)], ["T", sig(T, 4)], ["R = 1 − T", f(1 - T, 4)], ["ln T", f(lnT, 2)]]);
    set("conceptTitle", "Tunelamento"); set("conceptText", "T decai aproximadamente como e<sup>−2κa</sup>: a sensibilidade exponencial à largura e à massa está por trás do decaimento alfa e da microscopia de tunelamento. No gráfico de ln T contra a, isso é uma reta de inclinação −2κ.");
    prompts(["Aumente a e leia, no painel ln T × a, quanto ln T cai por unidade de a; compare com −2κ.", "Compare T exato e a aproximação de barreira larga para κa grande e pequeno (o círculo vermelho se afasta do ponto verde quando a aproximação falha).", "Verifique que T→1 quando a→0, e reproduza o exemplo da nota com o botão: T = 5,4×10⁻⁴."]);
  }

  // ---------------------------------------------------------------- estação 3: ressonância
  function drawRessonancia() {
    const ratio = +$("ressonanciaE").value, V0 = +$("ressonanciaV0").value, a = +$("ressonanciaA").value, E = ratio * V0;
    const T = P.barrierT(E, V0, a), q = Math.sqrt(2 * (E - V0));
    const curve = samples(1, 4, 400, (x) => P.barrierT(x * V0, V0, a)), marks = [reMark(ratio)];
    for (let n = 1; n <= 12; n += 1) { const En = P.resonanceEnergy(V0, a, n) / V0; if (En > 1 && En < 4) marks.push({ x: En, color: C.red }); }
    const d = canvas(0.6, 0.95);
    plot(d.c, { x: 0, y: 0, w: d.w, h: d.h }, [{ points: curve, color: C.green }], { xr: [1, 4], yr: [0, 1], xlabel: "E/V₀", ylabel: "T(E)", marks });
    legend([[C.green, "T(E)"], [C.red, "ressonâncias qa=nπ", true], [C.gold, "E atual"]]);
    set("ressonanciaEOut", f(ratio, 2)); set("ressonanciaV0Out", f(V0, 2)); set("ressonanciaAOut", f(a, 2));
    set("statusTitle", "Transmissão ressonante"); set("statusDetail", `qa = ${f(q * a, 3)}`);
    set("mainTitle", "Ressonâncias acima da barreira"); set("mainSubtitle", "T=1 sempre que qa=nπ");
    set("caption", "Reflexões múltiplas nas duas interfaces interferem construtivamente quando a largura contém um número inteiro de meios-comprimentos de onda internos.");
    set("prediction", "Entre duas ressonâncias consecutivas, T chega a cair até quanto?");
    html("calculation", `q = √[2(E−V₀)] = ${f(q, 3)}<br><b>qa = ${f(q * a, 3)} · T = ${sig(T, 4)}</b><small>T=1 em qa = π, 2π, 3π, ...</small>`);
    metrics([["q", f(q)], ["qa", f(q * a)], ["T", sig(T, 4)], ["próxima ressonância", `qa=${f(Math.ceil(q * a / Math.PI) * Math.PI, 2)}`]]);
    set("conceptTitle", "Interferência de múltiplas reflexões"); set("conceptText", "Interferência das reflexões nas duas bordas: em qa = nπ cabe um número inteiro de meios comprimentos de onda e a barreira fica \"invisível\", como uma lâmina de meia onda entre meios iguais. A camada antirreflexo de uma lente usa outra condição: espessura λ/4 com impedância intermediária, √(Z₁Z₂).");
    prompts(["Mova E até T=1 e leia qa no painel.", "Aumente a e veja as ressonâncias ficarem mais próximas.", "Compare com o limite clássico (T=1 sempre) para V₀→0."]);
  }

  // ---------------------------------------------------------------- estação 4: física médica
  const TISSUE_NAME = { tecido: "tecido mole", gordura: "gordura", musculo: "músculo", osso: "osso", ar: "ar" };
  const sup = (n) => String(n).replace("-", "⁻").replace(/\d/g, (q) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[q]);
  function halfLifeText(days) {
    if (days < 1 / 24) return `${f(days * 1440, 1)} min`;
    if (days < 2) return `${f(days * 24, 1)} h`;
    if (days < 730) return `${f(days, 1)} d`;
    return days / 365.25 < 1e4 ? `${f(days / 365.25, 0)} anos` : `${sci(days / 365.25, 1)} anos`;
  }
  const dbText = (R) => { if (!(R > 0)) return "−∞ dB"; const v = 10 * Math.log10(R); return Math.abs(v) < 0.05 ? "≈ 0 dB" : `${f(v, 1)} dB`; };
  function drawMedica() {
    const modo = $("medModo").value;
    $("medAlfa").hidden = modo !== "alfa"; $("medEco").hidden = modo !== "eco";
    if (modo === "alfa") drawAlfa(); else drawEco();
  }
  function drawAlfa() {
    const R = +$("medR").value, E = +$("medE").value, Z = 86;
    const V = P.coulombMeV(R, Z), b = P.turningPointFm(E, Z), G = P.gamowExponent(E, R, Z), rect = P.rectangleExponent(E, R, Z);
    const nu = P.assaultRatePerS(E, R), T12 = P.alphaHalfLifeDays(E, R, Z);
    set("medROut", f(R, 2)); set("medEOut", f(E, 2));
    const d = canvas(0.5, 1.7), c = d.c, narrow = d.narrow;
    const rl = narrow ? { x: 0, y: 0, w: d.w, h: d.h / 2 - 4 } : { x: 0, y: 0, w: d.w * .52, h: d.h };
    const rr = narrow ? { x: 0, y: d.h / 2 + 4, w: d.w, h: d.h / 2 - 4 } : { x: d.w * .52, y: 0, w: d.w * .48, h: d.h };
    const rMax = Math.max(60, b * 1.2), vTop = 45;
    const pot = samples(R, rMax, 300, (r) => P.coulombMeV(r, Z));
    const ax = plot(c, rl, [{ points: pot, color: C.red }, { points: [{ x: 0, y: E }, { x: rMax, y: E }], color: C.gold, dash: [6, 4], width: 2 }], { xr: [0, rMax], yr: [-5, vTop], xlabel: "distância r ao centro do núcleo (fm)", ylabel: "energia (MeV)", marks: [{ x: R, color: C.gray }, { x: b, color: C.gray }] });
    c.save(); c.beginPath(); c.rect(ax.l, ax.t, ax.r - ax.l, ax.b - ax.t); c.clip();
    c.fillStyle = "rgba(198,92,75,.16)"; c.beginPath(); c.moveTo(ax.X(R), ax.Y(E)); pot.filter((p) => p.x <= b).forEach((p) => c.lineTo(ax.X(p.x), ax.Y(p.y))); c.lineTo(ax.X(b), ax.Y(E)); c.closePath(); c.fill();
    c.strokeStyle = C.gray; c.lineWidth = 1.8; c.setLineDash([4, 3]); c.strokeRect(ax.X(R), ax.Y(V), ax.X(b) - ax.X(R), ax.Y(E) - ax.Y(V)); c.setLineDash([]);
    c.fillStyle = "rgba(38,49,45,.12)"; c.fillRect(ax.X(0), ax.Y(0), ax.X(R) - ax.X(0), ax.Y(-5) - ax.Y(0));
    c.restore();
    // rótulos sem sobreposição: R à direita da sua linha, b à esquerda da sua; E_α depois de b
    tag(c, `R = ${f(R, 1)} fm`, ax.X(R) + 4, ax.t + 14, C.ink);
    tag(c, `b = ${f(b, 1)} fm`, ax.X(b) - 4, ax.t + 28, C.ink, "right");
    tag(c, narrow || ax.r - ax.X(b) < 90 ? "E_α" : `E_α = ${f(E, 2)} MeV`, ax.r - 4, ax.Y(E) - 6, "#9a6a12", "right");
    tag(c, "núcleo", ax.X(0) + 3, ax.Y(-2.5) + 3, C.gray, "left", `10px ${FONT}`);
    // direita: T½ contra R, escala log
    const curve = samples(6, 11, 120, (r) => Math.log10(P.alphaHalfLifeDays(E, r, Z))), lm = Math.log10(11.4);
    const ys = curve.map((p) => p.y), yMin = Math.floor(Math.min(...ys, lm) - .3), yMax = Math.ceil(Math.max(...ys, lm) + .3);
    const yt = P.niceTicks(yMin, yMax, 5).ticks.map((v) => ({ v, label: `10${sup(v)}` }));
    const ax2 = plot(c, rr, [{ points: curve, color: C.green }, { points: [{ x: 6, y: lm }, { x: 11, y: lm }], color: C.gray, dash: [6, 4], width: 1.6 }], { xr: [6, 11], yr: [yMin, yMax], xlabel: "raio R (fm)", ylabel: "T½ (dias, escala log)", yticks: yt, marks: [{ x: R, color: C.gold, dash: [], width: 2 }] });
    tag(c, "medido: 11,4 d", ax2.r - 4, ax2.Y(lm) - 6, C.gray, "right", `10px ${FONT}`);
    c.beginPath(); c.fillStyle = "#c98a1c"; c.arc(ax2.X(R), ax2.Y(Math.log10(T12)), 5, 0, 2 * Math.PI); c.fill();
    legend([[C.red, "V(r) = 2Ze²/4πε₀r"], [C.gold, "E_α", true], [C.gray, "retângulo de altura V(R)", true], [C.green, "T½(R) pelo fator de Gamow"]]);
    set("statusTitle", "Física médica: alfa do ²²³Ra"); set("statusDetail", `R = ${f(R, 2)} fm · T½ ≈ ${halfLifeText(T12)}`);
    set("mainTitle", "Tunelamento da alfa: retângulo × barreira coulombiana"); set("mainSubtitle", "esquerda: a região sombreada é a barreira que a alfa atravessa · direita: meia-vida prevista contra R");
    set("caption", `O retângulo tracejado tem a altura máxima V(R) em toda a largura b − R; a barreira real cai como 1/r. Trocar 2κa por G = 2∫κ(r)dr reduz o expoente de ${f(rect, 0)} para ${f(G, 0)}. À direita, T½ ∝ e<sup>G</sup> muda várias ordens de grandeza com poucos fm de R.`);
    set("prediction", "A barreira retangular de altura V(R) dá e<sup>−2κa</sup> ~ 10⁻⁶⁰. O fator de Gamow vai dar algo maior ou menor? E se R mudar de 9,1 para 7,2 fm, a meia-vida muda por um fator 2, 10 ou 1000?");
    html("calculation", `V(R) = 2·86·1,44/${f(R, 2)} = ${f(V, 1)} MeV · b = 2·86·1,44/${f(E, 2)} = ${f(b, 1)} fm<br>retângulo: 2κa = ${f(rect, 1)} → e<sup>−2κa</sup> = ${sci(Math.exp(-rect))}<br>G = (2b√(2m<sub>α</sub>E<sub>α</sub>)/ħ)[arccos√(R/b) − √((R/b)(1 − R/b))] = <b>${f(G, 1)}</b><br>λ = (v/2R)e<sup>−G</sup> = ${sci(nu)} s⁻¹ × ${sci(Math.exp(-G))} = ${sci(nu * Math.exp(-G))} s⁻¹<br><b>T½ = ln 2/λ ≈ ${halfLifeText(T12)}</b> (medido: 11,4 d)<div class="limit">Limite do modelo: o pré-fator v/2R é clássico; sem massa reduzida nem momento angular; a meia-vida é exponencialmente sensível a R (com R = 7,2 fm, só o raio do filho, dá ≈ 80 anos). O modelo acerta a ordem de grandeza, não o valor. Justificativa rigorosa de e<sup>−2∫κ dr</sup>: aproximação WKB, fora deste curso.</div>`);
    metrics([["V(R)", `${f(V, 1)} MeV`], ["ponto de saída b", `${f(b, 1)} fm`], ["retângulo e<sup>−2κa</sup>", sci(Math.exp(-rect))], ["Gamow G · e<sup>−G</sup>", `${f(G, 1)} · ${sci(Math.exp(-G))}`], ["T½ prevista", halfLifeText(T12)], ["T½ medida (²²³Ra)", "11,4 d"]]);
    set("conceptTitle", "A mesma exponencial, com κ variável");
    set("conceptText", "O tunelamento da alfa é o da barreira desta aula, T ∝ e<sup>−2κa</sup>, com a barreira fatiada em retângulos finos: G = 2∫κ(r)dr. Como T½ ∝ e<sup>G</sup>, poucos fm em R ou poucos MeV em E_α mudam a meia-vida por ordens de grandeza; é por isso que emissores α de energias parecidas têm meias-vidas de minutos a bilhões de anos.");
    prompts(["Com R = 9,1 fm e E_α = 5,72 MeV, confira a nota: G = 62 e T½ ≈ 10 d, contra 11,4 d medidos. Quanto vale e<sup>−2κa</sup> do retângulo?", "Leve R para 7,2 fm (só o raio do filho): por que fator muda T½? E com +0,1 fm?", "Mantenha R = 9,1 fm e mude E_α de 5,72 para 5,0 MeV: o que acontece com T½? (Geiger–Nuttall)"]);
  }
  function drawEco() {
    const k1 = $("medZ1").value, k2 = $("medZ2").value, Z1 = P.TISSUES[k1], Z2 = P.TISSUES[k2];
    const R = P.acousticR(Z1, Z2), T = P.acousticT(Z1, Z2), ratio = Z2 / Z1, u0 = Math.log10(ratio);
    const d = canvas(0.55, 0.95), c = d.c, lo = -5, hi = 5, step = d.w < 520 ? 2 : 1;
    const xt = []; for (let u = -4; u <= 4; u += step) xt.push({ v: u, label: u === 0 ? "1" : u === 1 ? "10" : `10${sup(u)}` });
    const ax = plot(c, { x: 0, y: 0, w: d.w, h: d.h }, [{ points: samples(lo, hi, 400, (u) => P.acousticR(1, 10 ** u)), color: C.red }, { points: samples(lo, hi, 400, (u) => P.acousticT(1, 10 ** u)), color: C.green, dash: [7, 4] }], { xr: [lo, hi], yr: [0, 1], xlabel: "razão de impedâncias Z₂/Z₁ (escala log)", ylabel: "R, T", xticks: xt, marks: [{ x: u0, color: C.gold, dash: [], width: 2 }, { x: 0, color: C.gray }] });
    const pairs = [["tecido", "osso"], ["tecido", "ar"], ["gordura", "musculo"]];
    c.fillStyle = C.gold; c.beginPath(); c.arc(ax.X(u0), ax.Y(R), 8, 0, 2 * Math.PI); c.fill();
    pairs.forEach(([a, bb], i) => {
      const u = Math.log10(P.TISSUES[bb] / P.TISSUES[a]), r = P.acousticR(P.TISSUES[a], P.TISSUES[bb]), x = ax.X(u), y = ax.Y(r);
      c.fillStyle = C.ink; c.beginPath(); c.arc(x, y, 7, 0, 2 * Math.PI); c.fill();
      c.fillStyle = "#fff"; c.font = `bold 10px ${FONT}`; c.textAlign = "center"; c.fillText(String(i + 1), x, y + 3.5);
    });
    legend([[C.red, "R = ((Z₁−Z₂)/(Z₁+Z₂))²"], [C.green, "T = 4Z₁Z₂/(Z₁+Z₂)²", true], [C.gold, "interface escolhida"]]);
    const keys = pairs.map(([a, bb], i) => `${i + 1}: ${TISSUE_NAME[a]} → ${TISSUE_NAME[bb]}, R = ${f(P.acousticR(P.TISSUES[a], P.TISSUES[bb]), 3)}`).join(" · ");
    set("statusTitle", "Física médica: ultrassom"); set("statusDetail", `${TISSUE_NAME[k1]} → ${TISSUE_NAME[k2]} · R = ${f(R, 4)}`);
    set("mainTitle", "Eco numa interface: o degrau com k → Z"); set("mainSubtitle", "R e T em intensidade, contra a razão de impedâncias acústicas Z = ρc");
    set("caption", `A curva é a mesma do degrau (estação 1), com k₁/k₂ trocado por Z₁/Z₂. Interfaces de tecido mole quase não refletem; osso reflete 43 %; ar reflete quase tudo, por isso o gel acoplante entre o transdutor e a pele. Pontos numerados: ${keys}.`);
    set("prediction", "Uma onda de ultrassom sai do tecido mole e encontra osso. Que fração volta: 1 %, 40 % ou 99 %? E se entre o transdutor e a pele houver uma camada de ar?");
    html("calculation", `R = ((Z₁ − Z₂)/(Z₁ + Z₂))² = ((${sig(Z1, 3)} − ${sig(Z2, 3)})/(${sig(Z1, 3)} + ${sig(Z2, 3)}))² = <b>${sig(R, 4)}</b><br>T = 4Z₁Z₂/(Z₁ + Z₂)² = <b>${sig(T, 4)}</b> · R + T = ${f(R + T, 6)}<small>eco: 10 log₁₀ R ${dbText(R).startsWith("≈") ? "" : "= "}${dbText(R)}</small><div class="limit">Limite da analogia: a onda acústica é clássica; R e T são frações de intensidade, não probabilidades. Incidência normal, sem absorção (a atenuação do tecido, ~0,5 dB/cm/MHz, é absorção: não é a onda evanescente desta aula).</div>`);
    metrics([["Z₁", `${sig(Z1, 3)} MRayl`], ["Z₂", `${sig(Z2, 3)} MRayl`], ["Z₂/Z₁", sig(ratio, 3)], ["R (eco)", sig(R, 4)], ["T (segue adiante)", sig(T, 4)], ["eco em dB", dbText(R)]]);
    set("conceptTitle", "Reflexão sem faltar energia");
    set("conceptText", "No degrau com E > V₀ a reflexão vem de casar duas ondas numa descontinuidade, não de faltar energia. A onda acústica obedece à mesma condição de continuidade (pressão e velocidade), e R = ((Z₁ − Z₂)/(Z₁ + Z₂))² é a Eq. de R do degrau com k → Z. A imagem de ultrassom é o mapa desses ecos.");
    prompts(["Confira a nota: tecido/osso R = 0,43; tecido/ar R = 0,999; gordura/músculo R = 0,011.", "Troque os meios 1 e 2 de lugar: R muda? Por quê (olhe a fórmula)?", "Escolha Z₁ = Z₂: o que acontece com R? Que meio teria de ter o gel acoplante?"]);
  }

  const VIEWS = ["degrau", "barreira", "ressonancia", "medica"];
  function render() { if (view === "degrau") drawDegrau(); else if (view === "barreira") drawBarreira(); else if (view === "ressonancia") drawRessonancia(); else drawMedica(); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "degrau";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { }
    render();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((e) => e.addEventListener("input", render));
  const DEFAULTS = {
    degrau: ["degrauE", 1.4, "degrauV0", 1, "degrauComp", true],
    barreira: ["barreiraE", .4, "barreiraV0", 1, "barreiraA", 1.5, "barreiraComp", true],
    ressonancia: ["ressonanciaE", 1.4, "ressonanciaV0", 1, "ressonanciaA", 2],
    medica: ["medR", 9.1, "medE", 5.72, "medZ1", "tecido", "medZ2", "osso", "medModo", "alfa"]
  };
  function setValues(d) { for (let i = 0; i < d.length; i += 2) { const el = $(d[i]); if (el.type === "checkbox") el.checked = d[i + 1]; else el.value = d[i + 1]; } }
  $("resetBtn").addEventListener("click", () => { setValues(DEFAULTS[view]); render(); });
  // Presets da nota (estação 2). Exemplo numérico: E = 2 eV, V₀ = 5 eV, a = 0,5 nm (κa = 4,44);
  // em unidades reduzidas E/V₀ = 0,4, V₀ = 1 e a = 4,05 (a/√(ħ²/mV₀) = 0,5 nm/0,1235 nm): T = 5,38×10⁻⁴.
  // Figura da nota: E = 0,3V₀ e κa = 2,0 (V₀ = 1: a = 1,69), T = 0,060.
  $("presetNota").addEventListener("click", () => { setValues(["barreiraE", .4, "barreiraV0", 1, "barreiraA", 4.05]); render(); });
  $("presetFigura").addEventListener("click", () => { setValues(["barreiraE", .3, "barreiraV0", 1, "barreiraA", 1.69]); render(); });
  new URLSearchParams(location.search).forEach((value, key) => { const el = $(key); if (el && key !== "view" && (el.tagName === "INPUT" || el.tagName === "SELECT")) { if (el.type === "checkbox") el.checked = value !== "0" && value !== "false"; else el.value = value; } });
  window.addEventListener("resize", render);
  switchView(view);
})();
