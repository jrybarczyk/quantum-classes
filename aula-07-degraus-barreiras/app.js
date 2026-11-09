(function () {
  "use strict";
  const P = window.BarrierPhysics, $ = (id) => document.getElementById(id), C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", gray: "#6f7171", grid: "#dce5dc" };
  let view = new URLSearchParams(location.search).get("view") || "degrau";
  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n });
  function set(id, text) { $(id).textContent = text; } function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function canvas() { const e = $("mainCanvas"), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = w * 590 / 1100; e.width = w * ratio; e.height = h * ratio; const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h); return { c, w, h }; }
  function legend(rows) { html("legend", rows.map(([color, label]) => `<span><i style="border-color:${color}"></i>${label}</span>`).join("")); }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }
  function plot(c, w, h, series, min, max, ymin, ymax, xlabel, ylabel, marks, box) {
    const ox = box ? box.x : 0, l = ox + 58, r = ox + (box ? box.w : w) - 20, t = 25, b = h - 52, X = (x) => l + (x - min) * (r - l) / (max - min), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    c.strokeStyle = C.grid; c.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const x = min + i * (max - min) / 5, y = ymin + i * (ymax - ymin) / 5;
      c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke();
      c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke();
      c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(box && box.xf ? box.xf(x) : f(x, 2), X(x), b + 16);
      c.textAlign = "right"; c.fillText(box && box.yf ? box.yf(y) : f(y, 2), l - 7, Y(y) + 3);
    }
    (marks || []).forEach((m) => { c.strokeStyle = m.color || C.gray; c.setLineDash(m.dash || [4, 4]); c.beginPath(); c.moveTo(X(m.x), t); c.lineTo(X(m.x), b); c.stroke(); c.setLineDash([]); });
    c.strokeStyle = C.gray; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(xlabel, (l + r) / 2, h - 10);
    c.save(); c.translate(ox + 13, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore();
    c.save(); c.beginPath(); c.rect(l, t - 2, r - l, b - t + 2); c.clip();
    series.forEach((s) => { c.strokeStyle = s.color; c.lineWidth = s.width || 2.6; c.setLineDash(s.dash || []); c.beginPath(); s.points.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke(); c.setLineDash([]); });
    c.restore();
    return { X, Y, l, r, t, b };
  }

  function drawDegrau() {
    const ratio = +$("degrauE").value, V0 = +$("degrauV0").value, E = ratio * V0;
    const s = P.step(E, V0), d = canvas();
    const R = samples(.05, 2.5, 260, (x) => P.step(x * V0, V0).R);
    const T = samples(.05, 2.5, 260, (x) => P.step(x * V0, V0).T);
    plot(d.c, d.w, d.h, [{ points: R, color: C.red }, { points: T, color: C.green, dash: [7, 4] }], .05, 2.5, 0, 1.05, "E/V₀", "R, T", [{ x: 1, color: C.gray }, { x: ratio, color: C.gold, dash: [] }]);
    legend([[C.red, "R(E)"], [C.green, "T(E)", true], [C.gold, "E atual"]]);
    set("degrauEOut", f(ratio, 2)); set("degrauV0Out", f(V0, 2));
    set("statusTitle", s.regime === "evanescente" ? "Reflexão total" : "Degrau com E>V₀");
    set("statusDetail", `E/V₀=${f(ratio, 2)}`);
    set("mainTitle", "Coeficientes de reflexão e transmissão"); set("mainSubtitle", "R+T=1 sempre que E>V₀; abaixo, R=1");
    set("caption", "Mesmo com E>V₀ há reflexão parcial: a onda muda de número de onda na descontinuidade. Uma partícula clássica sempre subiria o degrau; uma onda clássica não: é o eco do ultrassom (estação 4).");
    set("prediction", "Quando E se aproxima de V₀ por cima, T tende a zero ou a um valor finito?");
    if (s.regime === "evanescente") {
      html("calculation", `κ = √[2(V₀−E)] = ${f(s.kappa, 3)}<br><b>d_p = 1/κ = ${f(s.delta, 3)}</b><small>R=1, T=0: só há penetração evanescente, sem corrente</small>`);
      metrics([["R", "1,000"], ["T", "0,000"], ["κ", f(s.kappa)], ["d_p=1/κ", f(s.delta)]]);
    } else {
      html("calculation", `r = (k₁−k₂)/(k₁+k₂) = ${f((s.k1 - s.k2) / (s.k1 + s.k2), 3)}<br><b>R = ${f(s.R, 3)}, T = ${f(s.T, 3)}</b><small>R+T = ${f(s.R + s.T, 6)}</small>`);
      metrics([["k₁", f(s.k1)], ["k₂", f(s.k2)], ["R", f(s.R)], ["T", f(s.T)]]);
    }
    set("conceptTitle", "Reflexão quântica num degrau"); set("conceptText", "A conexão de ψ e ψ' numa descontinuidade sempre produz onda refletida quando os números de onda mudam, mesmo sem barreira de energia. É a mesma álgebra da reflexão de ultrassom numa interface de tecidos, com k → Z (estação 4).");
    prompts(["Leve E/V₀ de baixo para cima de 1 e acompanhe R e T.", "Verifique R+T=1 para E>V₀.", "Explique por que T=0 abaixo do degrau apesar de ψ≠0 em x>0."]);
  }

  function drawBarreira() {
    const ratio = +$("barreiraE").value, V0 = +$("barreiraV0").value, a = +$("barreiraA").value, E = ratio * V0;
    const T = P.barrierT(E, V0, a), Twide = E < V0 ? P.barrierTWide(E, V0, a) : NaN;
    const curve = samples(.02, 1.98, 300, (x) => P.barrierT(x * V0, V0, a));
    const d = canvas();
    plot(d.c, d.w, d.h, [{ points: curve, color: C.green }], .02, 1.98, 0, 1.05, "E/V₀", "T(E)", [{ x: 1, color: C.gray }, { x: ratio, color: C.gold, dash: [] }]);
    legend([[C.green, "T exato"], [C.gold, "E atual"]]);
    set("barreiraEOut", f(ratio, 2)); set("barreiraV0Out", f(V0, 2)); set("barreiraAOut", f(a, 2));
    set("statusTitle", "Barreira retangular"); set("statusDetail", `E/V₀=${f(ratio, 2)} · a=${f(a, 2)}`);
    set("mainTitle", "Transmissão através da barreira"); set("mainSubtitle", "sub-barreira (senh) à esquerda de E=V₀, ressonâncias (sen) à direita");
    set("caption", "T nunca é zero abaixo de V₀: a partícula atravessa uma região classicamente proibida (tunelamento).");
    set("prediction", "Dobrar a largura a divide T pela metade ou o afeta exponencialmente?");
    const kappa = E < V0 ? Math.sqrt(2 * (V0 - E)) : NaN;
    html("calculation", E < V0
      ? `κa = ${f(kappa * a, 3)}<br><b>T = [1+V₀²senh²(κa)/4E(V₀−E)]⁻¹ = ${f(T, 5)}</b><small>aproximação de barreira larga: T≈${f(Twide, 5)}</small>`
      : `T = [1+V₀²sen²(qa)/4E(E−V₀)]⁻¹ = ${f(T, 5)}<small>acima da barreira: ressonâncias em qa=nπ</small>`);
    metrics([["E/V₀", f(ratio)], ["a", f(a)], ["T exato", f(T, 5)], ["T aprox.", isNaN(Twide) ? "—" : f(Twide, 5)]]);
    set("conceptTitle", "Tunelamento"); set("conceptText", "T decai aproximadamente como e^{−2κa}: a sensibilidade exponencial à largura e à massa está por trás do decaimento alfa e da microscopia de tunelamento.");
    prompts(["Aumente a e observe a escala do eixo T.", "Compare T exato e a aproximação de barreira larga para κa grande e pequeno.", "Verifique que T→1 quando a→0."]);
  }

  function drawRessonancia() {
    const ratio = +$("ressonanciaE").value, V0 = +$("ressonanciaV0").value, a = +$("ressonanciaA").value, E = ratio * V0;
    const T = P.barrierT(E, V0, a);
    const q = Math.sqrt(2 * (E - V0));
    const curve = samples(1.005, 4, 320, (x) => P.barrierT(x * V0, V0, a));
    const marks = [{ x: ratio, color: C.gold, dash: [] }];
    for (let n = 1; n <= 6; n += 1) { const En = P.resonanceEnergy(V0, a, n) / V0; if (En > 1 && En < 4) marks.push({ x: En, color: C.red }); }
    const d = canvas();
    plot(d.c, d.w, d.h, [{ points: curve, color: C.green }], 1.005, 4, 0, 1.05, "E/V₀", "T(E)", marks);
    legend([[C.green, "T(E)"], [C.red, "ressonâncias qa=nπ"], [C.gold, "E atual"]]);
    set("ressonanciaEOut", f(ratio, 2)); set("ressonanciaV0Out", f(V0, 2)); set("ressonanciaAOut", f(a, 2));
    set("statusTitle", "Transmissão ressonante"); set("statusDetail", `qa=${f(q * a, 3)}`);
    set("mainTitle", "Ressonâncias acima da barreira"); set("mainSubtitle", "T=1 sempre que qa=nπ");
    set("caption", "Reflexões múltiplas nas duas interfaces interferem construtivamente quando a largura contém um número inteiro de meios-comprimentos de onda internos.");
    set("prediction", "Entre duas ressonâncias consecutivas, T chega a cair até quanto?");
    html("calculation", `q = √[2(E−V₀)] = ${f(q, 3)}<br><b>qa = ${f(q * a, 3)} · T = ${f(T, 5)}</b><small>T=1 em qa = π, 2π, 3π, ...</small>`);
    metrics([["q", f(q)], ["qa", f(q * a)], ["T", f(T, 5)], ["próxima ressonância", `qa=${f(Math.ceil(q * a / Math.PI) * Math.PI, 2)}`]]);
    set("conceptTitle", "Interferência de múltiplas reflexões"); set("conceptText", "Interferência das reflexões nas duas bordas: em qa = nπ cabe um número inteiro de meios comprimentos de onda e a barreira fica \"invisível\", como uma lâmina de meia onda entre meios iguais. A camada antirreflexo de uma lente usa outra condição: espessura λ/4 com impedância intermediária, √(Z₁Z₂).");
    prompts(["Mova E até T=1 e leia qa no painel.", "Aumente a e veja as ressonâncias ficarem mais próximas.", "Compare com o limite clássico (T=1 sempre) para V₀→0."]);
  }

  const TISSUE_NAME = { tecido: "tecido mole", gordura: "gordura", musculo: "músculo", osso: "osso", ar: "ar" };
  const sci = (x, n = 1) => { if (!Number.isFinite(x) || x <= 0) return "—"; const e = Math.floor(Math.log10(x)); const m = x / 10 ** e; return `${f(m, n)}×10${String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])}`; };
  function halfLifeText(days) {
    if (days < 1 / 24) return `${f(days * 1440, 1)} min`;
    if (days < 2) return `${f(days * 24, 1)} h`;
    if (days < 730) return `${f(days, 1)} d`;
    return days / 365.25 < 1e4 ? `${f(days / 365.25, 0)} anos` : `${sci(days / 365.25, 1)} anos`;
  }
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
    const d = canvas(), wl = d.w * .52;
    // esquerda: V(r), E_α e o retângulo
    const rMax = Math.max(60, b * 1.2), vTop = 45;
    const pot = samples(R, rMax, 300, (r) => P.coulombMeV(r, Z));
    const ax = plot(d.c, d.w, d.h, [{ points: pot, color: C.red }, { points: [{ x: 0, y: E }, { x: rMax, y: E }], color: C.gold, dash: [6, 4], width: 2 }], 0, rMax, -5, vTop, "distância r ao centro do núcleo (fm)", "energia (MeV)", [{ x: R, color: C.gray }, { x: b, color: C.gray }], { x: 0, w: wl, xf: (x) => f(x, 0), yf: (y) => f(y, 0) });
    const c = d.c;
    c.save(); c.beginPath(); c.rect(ax.l, ax.t, ax.r - ax.l, ax.b - ax.t); c.clip();
    c.fillStyle = "rgba(198,92,75,.16)"; c.beginPath(); c.moveTo(ax.X(R), ax.Y(E)); pot.filter((p) => p.x <= b).forEach((p) => c.lineTo(ax.X(p.x), ax.Y(p.y))); c.lineTo(ax.X(b), ax.Y(E)); c.closePath(); c.fill();
    c.strokeStyle = C.gray; c.lineWidth = 1.8; c.setLineDash([4, 3]); c.strokeRect(ax.X(R), ax.Y(V), ax.X(b) - ax.X(R), ax.Y(E) - ax.Y(V)); c.setLineDash([]);
    c.fillStyle = "rgba(38,49,45,.12)"; c.fillRect(ax.X(0), ax.Y(0), ax.X(R) - ax.X(0), ax.Y(-5) - ax.Y(0));
    c.restore();
    c.fillStyle = C.ink; c.font = "bold 11px Ubuntu,system-ui"; c.textAlign = "left";
    c.fillText(`R = ${f(R, 1)} fm`, ax.X(R) + 4, ax.t + 14); c.fillText(`b = ${f(b, 1)} fm`, ax.X(b) + 4, ax.t + 14);
    c.fillStyle = C.gold; c.fillText(`E_α = ${f(E, 2)} MeV`, ax.X(b) + 4, ax.Y(E) - 6);
    c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.fillText("núcleo", ax.X(0) + 3, ax.Y(-2.5));
    // direita: T½ contra R, escala log
    const curve = samples(6, 11, 120, (r) => Math.log10(P.alphaHalfLifeDays(E, r, Z)));
    const ys = curve.map((p) => p.y), yMin = Math.floor(Math.min(...ys, Math.log10(11.4)) - .5), yMax = yMin + 5 * Math.ceil((Math.max(...ys, Math.log10(11.4)) + .5 - yMin) / 5);
    const ax2 = plot(d.c, d.w, d.h, [{ points: curve, color: C.green }, { points: [{ x: 6, y: Math.log10(11.4) }, { x: 11, y: Math.log10(11.4) }], color: C.gray, dash: [6, 4], width: 1.6 }], 6, 11, yMin, yMax, "raio R (fm)", "T½ (dias, escala log)", [{ x: R, color: C.gold, dash: [] }], { x: wl, w: d.w - wl, xf: (x) => f(x, 0), yf: (y) => `10${String(Math.round(y)).replace("-", "⁻").replace(/\d/g, (q) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[q])}` });
    c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "right"; c.fillText("medido: 11,4 d", ax2.r - 4, ax2.Y(Math.log10(11.4)) - 5);
    c.beginPath(); c.fillStyle = C.gold; c.arc(ax2.X(R), ax2.Y(Math.log10(T12)), 5, 0, 2 * Math.PI); c.fill();
    legend([[C.red, "V(r) = 2Ze²/4πε₀r"], [C.gold, "E_α"], [C.gray, "retângulo de altura V(R)"], [C.green, "T½(R) pelo fator de Gamow"]]);
    set("statusTitle", "Física médica: alfa do ²²³Ra"); set("statusDetail", `R = ${f(R, 2)} fm · T½ ≈ ${halfLifeText(T12)}`);
    set("mainTitle", "Tunelamento da alfa: retângulo × barreira coulombiana"); set("mainSubtitle", "esquerda: a região sombreada é a barreira que a alfa atravessa · direita: meia-vida prevista contra R");
    set("caption", `O retângulo tracejado tem a altura máxima V(R) em toda a largura b − R; a barreira real cai como 1/r. Trocar 2κa por G = 2∫κ(r)dr reduz o expoente de ${f(rect, 0)} para ${f(G, 0)}. À direita, T½ ∝ e^G muda várias ordens de grandeza com poucos fm de R.`);
    set("prediction", "A barreira retangular de altura V(R) dá e^(−2κa) ~ 10⁻⁶⁰. O fator de Gamow vai dar algo maior ou menor? E se R mudar de 9,1 para 7,2 fm, a meia-vida muda por um fator 2, 10 ou 1000?");
    html("calculation", `V(R) = 2·86·1,44/${f(R, 2)} = ${f(V, 1)} MeV · b = 2·86·1,44/${f(E, 2)} = ${f(b, 1)} fm<br>retângulo: 2κa = ${f(rect, 1)} → e^(−2κa) = ${sci(Math.exp(-rect))}<br>G = (2b√(2m_αE_α)/ħ)[arccos√(R/b) − √((R/b)(1 − R/b))] = <b>${f(G, 1)}</b><br>λ = (v/2R)e^(−G) = ${sci(nu)} s⁻¹ × ${sci(Math.exp(-G))} = ${sci(nu * Math.exp(-G))} s⁻¹<br><b>T½ = ln 2/λ ≈ ${halfLifeText(T12)}</b> (medido: 11,4 d)<div class="limit">Limite do modelo: o pré-fator v/2R é clássico; sem massa reduzida nem momento angular; a meia-vida é exponencialmente sensível a R (com R = 7,2 fm, só o raio do filho, dá ≈ 80 anos). O modelo acerta a ordem de grandeza, não o valor. Justificativa rigorosa de e^(−2∫κ dr): aproximação WKB, fora deste curso.</div>`);
    metrics([["V(R)", `${f(V, 1)} MeV`], ["ponto de saída b", `${f(b, 1)} fm`], ["retângulo e^(−2κa)", sci(Math.exp(-rect))], ["Gamow G · e^(−G)", `${f(G, 1)} · ${sci(Math.exp(-G))}`], ["T½ prevista", halfLifeText(T12)], ["T½ medida (²²³Ra)", "11,4 d"]]);
    set("conceptTitle", "A mesma exponencial, com κ variável");
    set("conceptText", "O tunelamento da alfa é o da barreira desta aula, T ∝ e^(−2κa), com a barreira fatiada em retângulos finos: G = 2∫κ(r)dr. Como T½ ∝ e^G, poucos fm em R ou poucos MeV em E_α mudam a meia-vida por ordens de grandeza; é por isso que emissores α de energias parecidas têm meias-vidas de minutos a bilhões de anos.");
    prompts(["Com R = 9,1 fm e E_α = 5,72 MeV, confira a nota: G = 62 e T½ ≈ 10 d, contra 11,4 d medidos. Quanto vale e^(−2κa) do retângulo?", "Leve R para 7,2 fm (só o raio do filho): por que fator muda T½? E com +0,1 fm?", "Mantenha R = 9,1 fm e mude E_α de 5,72 para 5,0 MeV: o que acontece com T½? (Geiger–Nuttall)"]);
  }
  function drawEco() {
    const k1 = $("medZ1").value, k2 = $("medZ2").value, Z1 = P.TISSUES[k1], Z2 = P.TISSUES[k2];
    const R = P.acousticR(Z1, Z2), T = P.acousticT(Z1, Z2), ratio = Z2 / Z1;
    const d = canvas(), lo = -5, hi = 5;
    const curve = samples(lo, hi, 400, (u) => P.acousticR(1, 10 ** u));
    const ax = plot(d.c, d.w, d.h, [{ points: curve, color: C.red }, { points: samples(lo, hi, 400, (u) => P.acousticT(1, 10 ** u)), color: C.green, dash: [7, 4] }], lo, hi, 0, 1.05, "razão de impedâncias Z₂/Z₁ (escala log)", "R, T", [{ x: Math.log10(ratio), color: C.gold, dash: [] }, { x: 0, color: C.gray }], { x: 0, w: d.w, xf: (u) => `10${String(Math.round(u)).replace("-", "⁻").replace(/\d/g, (q) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[q])}`, yf: (y) => f(y, 1) });
    const pairs = [["tecido", "osso"], ["tecido", "ar"], ["gordura", "musculo"]];
    const c = d.c; c.font = "10px Ubuntu,system-ui"; c.textAlign = "left";
    pairs.forEach(([a, bb]) => { const u = Math.log10(P.TISSUES[bb] / P.TISSUES[a]), r = P.acousticR(P.TISSUES[a], P.TISSUES[bb]); c.fillStyle = C.ink; c.beginPath(); c.arc(ax.X(u), ax.Y(r), 4, 0, 2 * Math.PI); c.fill(); c.fillText(`${TISSUE_NAME[a]}/${TISSUE_NAME[bb]}: ${f(r, 3)}`, ax.X(u) + 6, ax.Y(r) - 6); });
    c.fillStyle = C.gold; c.beginPath(); c.arc(ax.X(Math.log10(ratio)), ax.Y(R), 6, 0, 2 * Math.PI); c.fill();
    legend([[C.red, "R = ((Z₁−Z₂)/(Z₁+Z₂))²"], [C.green, "T = 4Z₁Z₂/(Z₁+Z₂)²"], [C.gold, "interface escolhida"]]);
    set("statusTitle", "Física médica: ultrassom"); set("statusDetail", `${TISSUE_NAME[k1]} → ${TISSUE_NAME[k2]} · R = ${f(R, 3)}`);
    set("mainTitle", "Eco numa interface: o degrau com k → Z"); set("mainSubtitle", "R e T em intensidade, contra a razão de impedâncias acústicas Z = ρc");
    set("caption", "A curva é a mesma do degrau (estação 1), com k₁/k₂ trocado por Z₁/Z₂. Interfaces de tecido mole quase não refletem; osso reflete 43 %; ar reflete quase tudo, por isso o gel acoplante entre o transdutor e a pele.");
    set("prediction", "Uma onda de ultrassom sai do tecido mole e encontra osso. Que fração volta: 1 %, 40 % ou 99 %? E se entre o transdutor e a pele houver uma camada de ar?");
    html("calculation", `R = ((Z₁ − Z₂)/(Z₁ + Z₂))² = ((${f(Z1, 4)} − ${f(Z2, 4)})/(${f(Z1, 4)} + ${f(Z2, 4)}))² = <b>${f(R, 4)}</b><br>T = 4Z₁Z₂/(Z₁ + Z₂)² = <b>${f(T, 4)}</b> · R + T = ${f(R + T, 6)}<small>eco: 10 log₁₀ R = ${R > 0 ? f(10 * Math.log10(R), 1) : "−∞"} dB</small><div class="limit">Limite da analogia: a onda acústica é clássica; R e T são frações de intensidade, não probabilidades. Incidência normal, sem absorção (a atenuação do tecido, ~0,5 dB/cm/MHz, é absorção: não é a onda evanescente desta aula).</div>`);
    metrics([["Z₁", `${f(Z1, 4)} MRayl`], ["Z₂", `${f(Z2, 4)} MRayl`], ["Z₂/Z₁", f(ratio, 4)], ["R (eco)", f(R, 4)], ["T (segue adiante)", f(T, 4)], ["eco em dB", R > 0 ? `${f(10 * Math.log10(R), 1)} dB` : "—"]]);
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
  $("resetBtn").addEventListener("click", () => {
    const d = { degrau: ["degrauE", 1.4, "degrauV0", 1], barreira: ["barreiraE", .4, "barreiraV0", 1, "barreiraA", 1.5], ressonancia: ["ressonanciaE", 1.4, "ressonanciaV0", 1, "ressonanciaA", 2], medica: ["medR", 9.1, "medE", 5.72, "medZ1", "tecido", "medZ2", "osso"] }[view];
    for (let i = 0; i < d.length; i += 2) $(d[i]).value = d[i + 1];
    render();
  });
  window.addEventListener("resize", render);
  switchView(view);
})();
