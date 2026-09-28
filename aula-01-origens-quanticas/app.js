(function () {
  "use strict";
  const P = window.OriginsPhysics;
  const $ = (id) => document.getElementById(id);
  // A moldura preserva a marca do laboratório; os gráficos usam a paleta conceitual dos slides.
  const colors = { green: "#1f3a6e", lime: "#83c44e", gray: "#5e6877", grid: "#d8e1ef", warm: "#3f7f54", red: "#9e2a2b", ink: "#1d2a3d", pale: "#eef3fa" };
  let activeView = new URLSearchParams(location.search).get("view") || "blackbody";
  const defaults = { blackbody: { temperature: 5800, spectrumAxis: "dimensionless" }, photoelectric: { frequency: 7, workFunction: 2.3, intensity: 1, photoView: "energy" }, compton: { comptonWavelength: 71, comptonAngle: 90 }, matter: { voltage: 150, spacing: .2, braggOrder: 1 }, radiation: { radiationMaterial: "water", radiationEnergy: 2, radiationThickness: 1 } };
  document.querySelector(".tabs").addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = [...document.querySelectorAll("[data-view]")], current = tabs.findIndex(tab => tab.dataset.view === activeView), index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; event.preventDefault(); tabs[index].focus(); switchView(tabs[index].dataset.view); });

  function value(id) { return Number($(id).value); }
  function fmt(number, digits = 3) { return Number(number).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
  function sci(number, digits = 3) {
    if (!Number.isFinite(number)) return "—";
    if (number === 0) return "0";
    const exponent = Math.floor(Math.log10(Math.abs(number)));
    return `${fmt(number / 10 ** exponent, digits)}×10<sup>${exponent}</sup>`;
  }
  function setText(id, text) { $(id).textContent = text; }
  function setHtml(id, html) { $(id).innerHTML = html; }
  function metricRows(rows) { setHtml("metrics", rows.map(([term, result]) => `<div><dt>${term}</dt><dd>${result}</dd></div>`).join("")); }
  function promptRows(rows) { setHtml("prompts", rows.map((row) => `<li>${row}</li>`).join("")); }
  function legend(rows) { setHtml("legend", rows.map(([color, text, dashed]) => `<span><i style="border-color:${color};${dashed ? "border-style:dashed" : ""}"></i>${text}</span>`).join("")); }

  function canvas() {
    const element = $("mainCanvas");
    const ratio = Math.max(1, Math.min(2, devicePixelRatio || 1));
    const width = element.clientWidth || 900;
    const height = width * 590 / 1100;
    element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
    const context = element.getContext("2d"); context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }
  function text(context, label, x, y, color = colors.ink, align = "left", font = "12px Ubuntu, system-ui") {
    context.fillStyle = color; context.textAlign = align; context.font = font; context.fillText(label, x, y);
  }
  function line(context, x1, y1, x2, y2, color, width = 2, dash = []) {
    context.strokeStyle = color; context.lineWidth = width; context.setLineDash(dash); context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); context.setLineDash([]);
  }
  function arrow(context, x1, y1, x2, y2, color, width = 3) {
    line(context, x1, y1, x2, y2, color, width);
    const angle = Math.atan2(y2 - y1, x2 - x1), size = 9;
    context.fillStyle = color; context.beginPath(); context.moveTo(x2, y2); context.lineTo(x2 - size * Math.cos(angle - .45), y2 - size * Math.sin(angle - .45)); context.lineTo(x2 - size * Math.cos(angle + .45), y2 - size * Math.sin(angle + .45)); context.closePath(); context.fill();
  }
  function chart(context, box, series, options) {
    const left = box.x + 58, right = box.x + box.width - 18, top = box.y + 22, bottom = box.y + box.height - 45;
    const mapX = (x) => left + (x - options.xMin) * (right - left) / (options.xMax - options.xMin);
    const mapY = (y) => bottom - (y - options.yMin) * (bottom - top) / (options.yMax - options.yMin);
    context.save();
    const ticks = (min, max, digits) => Array.from({ length: 6 }, (_, index) => { const v = min + index * (max - min) / 5; return { v, label: fmt(v, digits) }; });
    (options.xTicks || ticks(options.xMin, options.xMax, options.xDigits ?? 1)).forEach(({ v, label }) => {
      line(context, mapX(v), top, mapX(v), bottom, colors.grid, 1);
      text(context, label, mapX(v), bottom + 17, colors.gray, "center", "10px Ubuntu, system-ui");
    });
    (options.yTicks || ticks(options.yMin, options.yMax, options.yDigits ?? 1)).forEach(({ v, label }) => {
      line(context, left, mapY(v), right, mapY(v), colors.grid, 1);
      text(context, label, left - 7, mapY(v) + 3, colors.gray, "right", "10px Ubuntu, system-ui");
    });
    line(context, left, bottom, right, bottom, colors.gray, 1.2); line(context, left, top, left, bottom, colors.gray, 1.2);
    text(context, options.xLabel, (left + right) / 2, box.y + box.height - 8, colors.gray, "center", "11px Ubuntu, system-ui");
    context.save(); context.translate(box.x + 12, (top + bottom) / 2); context.rotate(-Math.PI / 2); text(context, options.yLabel, 0, 0, colors.gray, "center", "11px Ubuntu, system-ui"); context.restore();
    context.beginPath(); context.rect(left, top, right - left, bottom - top); context.clip();
    series.forEach((entry) => {
      context.strokeStyle = entry.color; context.lineWidth = entry.width || 2.5; context.setLineDash(entry.dash || []); context.beginPath();
      entry.points.forEach((point, index) => { const x = mapX(point.x), y = mapY(point.y); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
    });
    context.restore();
    return { left, right, top, bottom, mapX, mapY };
  }
  function samples(minimum, maximum, count, fn) { return Array.from({ length: count }, (_, index) => { const x = minimum + index * (maximum - minimum) / (count - 1); return { x, y: fn(x) }; }); }
  function dot(context, x, y, color, radius = 5) { context.fillStyle = color; context.beginPath(); context.arc(x, y, radius, 0, 2 * Math.PI); context.fill(); }
  function spectralColor(wavelengthNm) {
    let red = 0, green = 0, blue = 0;
    if (wavelengthNm < 440) { red = -(wavelengthNm - 440) / 60; blue = 1; }
    else if (wavelengthNm < 490) { green = (wavelengthNm - 440) / 50; blue = 1; }
    else if (wavelengthNm < 510) { green = 1; blue = -(wavelengthNm - 510) / 20; }
    else if (wavelengthNm < 580) { red = (wavelengthNm - 510) / 70; green = 1; }
    else if (wavelengthNm < 645) { red = 1; green = -(wavelengthNm - 645) / 65; }
    else { red = 1; }
    const edge = wavelengthNm < 420 ? .45 + .55 * (wavelengthNm - 380) / 40 : wavelengthNm > 700 ? .45 + .55 * (750 - wavelengthNm) / 50 : 1;
    const channel = (value) => Math.round(255 * (Math.max(0, value) * edge) ** .8);
    return `rgb(${channel(red)}, ${channel(green)}, ${channel(blue)})`;
  }
  function visibleBand(context, plot) {
    const from = Math.max(plot.mapX(.38), plot.left), to = Math.min(plot.mapX(.75), plot.right);
    context.save(); context.globalAlpha = .18;
    for (let x = from; x < to; x += 2) { context.fillStyle = spectralColor(380 + (x - from) / (to - from) * 370); context.fillRect(x, plot.top, 3, plot.bottom - plot.top); }
    context.restore();
    text(context, "espectro visível", (from + to) / 2, plot.top + 14, colors.gray, "center", "10px Ubuntu, system-ui");
  }

  function drawBlackbody() {
    const temperature = value("temperature"), axis = $("spectrumAxis").value, body = P.blackbody(temperature), drawing = canvas();
    setText("temperatureOut", `${temperature.toLocaleString("pt-BR")} K`);
    if (axis === "dimensionless") {
      chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [
        { points: samples(.02, 8, 250, (x) => x ** 3 / Math.expm1(x)), color: colors.green },
        { points: samples(0, 2.8, 100, (x) => x ** 2), color: colors.red, dash: [8, 5] },
      ], { xMin: 0, xMax: 8, yMin: 0, yMax: 3, xLabel: "x = hν/kT", yLabel: "função espectral reduzida" });
      legend([[colors.green, "Planck"], [colors.red, "Rayleigh–Jeans", true]]);
    } else if (axis === "absolute") {
      // u_ν(ν) para T e 2T no mesmo eixo, normalizado pelo máximo de 2T
      const peak = P.blackbodyPeakFrequency(temperature), maximum = 7 * peak, exponent = Math.floor(Math.log10(maximum));
      const unit = 10 ** exponent, top = P.planckFrequency(2 * peak, 2 * temperature);
      const curveAt = (temp) => samples(0, maximum / unit, 300, (nu) => P.planckFrequency(nu * unit, temp) / top);
      const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [
        { points: curveAt(temperature), color: colors.green },
        { points: curveAt(2 * temperature), color: colors.warm, dash: [8, 5] },
      ], { xMin: 0, xMax: maximum / unit, yMin: 0, yMax: 1.1, xLabel: `frequência ν (10${String(exponent).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])} Hz)`, yLabel: "u_ν / u_ν,máx(2T)", xDigits: 1, yDigits: 2 });
      [[peak, temperature, colors.green], [2 * peak, 2 * temperature, colors.warm]].forEach(([nu, temp, color]) => {
        line(drawing.context, plot.mapX(nu / unit), plot.mapY(P.planckFrequency(nu, temp) / top), plot.mapX(nu / unit), plot.bottom, color, 1.5, [4, 4]);
        dot(drawing.context, plot.mapX(nu / unit), plot.mapY(P.planckFrequency(nu, temp) / top), color, 5);
      });
      legend([[colors.green, `T = ${temperature.toLocaleString("pt-BR")} K`], [colors.warm, `2T = ${(2 * temperature).toLocaleString("pt-BR")} K`, true]]);
    } else {
      const peakMicron = body.lambdaPeak * 1e6, maximum = Math.max(2, peakMicron * 4.5);
      const raw = samples(.03, maximum, 260, (lambdaMicron) => P.planckWavelength(lambdaMicron * 1e-6, temperature));
      const scale = Math.max(...raw.map((point) => point.y)); raw.forEach((point) => { point.y /= scale; });
      const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [{ points: raw, color: colors.green }], { xMin: 0, xMax: maximum, yMin: 0, yMax: 1.08, xLabel: "comprimento de onda λ (μm)", yLabel: "uλ / uλ,máx", xDigits: 2 });
      visibleBand(drawing.context, plot);
      line(drawing.context, plot.mapX(peakMicron), plot.top, plot.mapX(peakMicron), plot.bottom, colors.warm, 2, [6, 5]);
      legend([[colors.green, "espectro"], [colors.warm, "λmáx", true]]);
    }
    setText("statusTitle", "Corpo negro"); setText("statusDetail", `T = ${temperature.toLocaleString("pt-BR")} K`);
    setText("mainTitle", { dimensionless: "Planck versus Rayleigh–Jeans", absolute: "Espectro absoluto: T e 2T", wavelength: "Espectro em comprimento de onda" }[axis]);
    setText("mainSubtitle", { dimensionless: "a quantização corta a divergência ultravioleta", absolute: "ao dobrar T, o pico dobra de frequência, fica 8× mais alto e a área cresce 16×", wavelength: "o pico obedece λmáxT = constante" }[axis]);
    setText("caption", axis === "absolute"
      ? "As duas curvas estão no mesmo eixo, normalizadas pelo máximo de 2T. A escala x = hν/kT esconde essa diferença: nela todas as temperaturas caem sobre uma só curva. Em escala absoluta, a frequência do pico é proporcional a T, a altura a T³ e a área (energia total por volume) a T⁴."
      : "A lei clássica acerta hν≪kT, mas atribui kT a um número ilimitado de modos de alta frequência. Planck torna essas excitações energeticamente improváveis.");
    setText("prediction", "Ao dobrar T, a posição do pico cai pela metade. A energia total dobra, quadruplica ou cresce 16 vezes?");
    setHtml("calculation", axis === "absolute"
      ? `ν<sub>máx</sub> = 2,821 kT/h<br>= 2,821 × (1,3806×10<sup>−23</sup>)(${temperature}) / (6,6261×10<sup>−34</sup>)<br><b>= ${sci(P.blackbodyPeakFrequency(temperature), 3)} Hz</b><small>ao dobrar T: ν<sub>máx</sub> × 2 · u<sub>ν,máx</sub> × 2³ = 8 · U/V × 2⁴ = 16</small>`
      : `λ<sub>máx</sub> = b/T<br>= 2,8978×10<sup>−3</sup> m·K / ${temperature} K<br><b>= ${fmt(body.lambdaPeak * 1e9, 1)} nm</b><small>U/V = aT⁴ = ${sci(body.energyDensity, 3)} J·m⁻³</small>`);
    metricRows([["Temperatura", `${temperature.toLocaleString("pt-BR")} K`], ["λmáx", `${fmt(body.lambdaPeak * 1e9, 1)} nm`], ["νmáx", `${sci(P.blackbodyPeakFrequency(temperature), 3)} Hz`], ["Energia/volume", `${sci(body.energyDensity, 3)} J/m³`], ["Fluxo emitido", `${sci(body.radiatedFlux, 3)} W/m²`]]);
    setText("conceptTitle", "O problema era a energia por modo"); setText("conceptText", "A contagem clássica dos modos permanece. O passo novo é ⟨E⟩=hν/(e^{hν/kT}−1), em lugar de kT para toda frequência.");
    promptRows(["Na escala absoluta, meça a razão entre as alturas dos picos de 2T e T e compare com 2³.", "Confirme numericamente a escala T⁴ com a energia por volume.", "Explique por que os máximos em ν e λ não são conversões diretas: compare c/νmáx com λmáx."]);
  }

  function drawPhotoelectric() {
    const frequency = value("frequency") * 1e14, phi = value("workFunction"), intensity = value("intensity"), result = P.photoelectric(frequency, phi, intensity), drawing = canvas();
    setText("frequencyOut", `${fmt(frequency / 1e14, 2)}×10¹⁴ Hz`); setText("workFunctionOut", `${fmt(phi, 3)} eV`); setText("intensityOut", `${fmt(intensity, 2)}×`);
    const currentView = $("photoView").value === "current";
    if (currentView) {
      // fotocorrente × tensão do anodo: intensidade escolhida, o dobro dela e ν maior
      const higher = frequency + 2e14, vsHigher = P.photoelectric(higher, phi).stoppingVoltage;
      const vMin = -Math.max(1, 1.25 * vsHigher + .3), vMax = 2, iMax = Math.max(1, 2 * intensity) * 1.15;
      const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [
        { points: samples(vMin, vMax, 300, (v) => P.photocurrent(v, frequency, phi, intensity)), color: colors.green },
        { points: samples(vMin, vMax, 300, (v) => P.photocurrent(v, frequency, phi, 2 * intensity)), color: colors.green, dash: [8, 5], width: 2 },
        { points: samples(vMin, vMax, 300, (v) => P.photocurrent(v, higher, phi, intensity)), color: colors.warm, dash: [2, 4], width: 2.2 },
      ], { xMin: vMin, xMax: vMax, yMin: 0, yMax: iMax, xLabel: "tensão do anodo V (V) · negativa = frenagem", yLabel: "fotocorrente relativa", xDigits: 1, yDigits: 1 });
      line(drawing.context, plot.mapX(0), plot.top, plot.mapX(0), plot.bottom, colors.gray, 1, [3, 3]);
      if (result.emitted) {
        line(drawing.context, plot.mapX(-result.stoppingVoltage), plot.top, plot.mapX(-result.stoppingVoltage), plot.bottom, colors.red, 2, [6, 5]);
        text(drawing.context, `−Vs = −${fmt(result.stoppingVoltage, 2)} V`, plot.mapX(-result.stoppingVoltage) + 5, plot.top + 14, colors.red, "left", "10px Ubuntu, system-ui");
      } else text(drawing.context, "abaixo do corte: nenhuma corrente, com qualquer intensidade", (plot.left + plot.right) / 2, plot.top + 40, colors.red, "center");
      legend([[colors.green, `intensidade ${fmt(intensity, 2)}×`], [colors.green, `intensidade ${fmt(2 * intensity, 2)}×`, true], [colors.warm, `ν + 2×10¹⁴ Hz`, true], [colors.red, "potencial de frenagem", true]]);
    } else {
      const maxX = 12, maxY = Math.max(4, P.photoelectric(maxX * 1e14, phi).kineticEV * 1.15), thresholdX = result.thresholdFrequency / 1e14;
      const curve = samples(thresholdX, maxX, 160, (x) => P.photoelectric(x * 1e14, phi).kineticEV);
      const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [{ points: curve, color: colors.green }], { xMin: 0, xMax: maxX, yMin: 0, yMax: maxY, xLabel: "frequência ν (10¹⁴ Hz)", yLabel: "Kmáx = eVs (eV)" });
      line(drawing.context, plot.mapX(thresholdX), plot.top, plot.mapX(thresholdX), plot.bottom, colors.red, 2, [6, 5]);
      dot(drawing.context, plot.mapX(frequency / 1e14), plot.mapY(result.kineticEV), result.emitted ? colors.warm : colors.red, 6);
      const photons = Math.round(4 + intensity * 9); for (let index = 0; index < photons; index += 1) dot(drawing.context, plot.left + 18 + index * Math.min(17, (plot.right - plot.left - 30) / photons), plot.top + 14, colors.lime, 3);
      legend([[colors.green, "Kmáx(ν)"], [colors.red, "frequência de corte", true], [colors.warm, "estado escolhido"]]);
    }
    setText("statusTitle", "Efeito fotoelétrico"); setText("statusDetail", result.emitted ? `emissão · Vs=${fmt(result.stoppingVoltage, 2)} V` : "sem emissão");
    setText("mainTitle", currentView ? "Fotocorrente versus tensão" : "Energia máxima versus frequência"); setText("mainSubtitle", "a intensidade controla quantos elétrons; ν controla a energia de cada um");
    setText("caption", currentView
      ? "É a curva que se mede no laboratório. Com V > 0 todos os elétrons emitidos chegam ao anodo (saturação); com V < 0 só chegam os que têm K ≥ e|V|. Dobrar a intensidade dobra a saturação, mas o corte em −Vs não se move; aumentar ν desloca o corte. Modelo didático: energias cinéticas distribuídas uniformemente até Kmáx."
      : "Os pontos verdes no topo representam o fluxo de fótons. Aumentar sua quantidade não desloca a reta nem cruza o limiar energético de um único fóton.");
    setText("prediction", "Fixe ν abaixo de ν₀ e dobre a intensidade. A emissão aparece? Depois faça o mesmo acima de ν₀.");
    setHtml("calculation", `E<sub>γ</sub> = hν<br>= (4,1357×10<sup>−15</sup> eV·s)(${sci(frequency, 3)} Hz)<br><b>= ${fmt(result.photonEnergyEV, 3)} eV</b><small>K<sub>máx</sub> = ${fmt(result.photonEnergyEV, 3)} − ${fmt(phi, 3)} = ${fmt(result.kineticEV, 3)} eV</small>`);
    metricRows([["Energia do fóton", `${fmt(result.photonEnergyEV, 3)} eV`], ["Frequência de corte", `${sci(result.thresholdFrequency, 3)} Hz`], ["Kmáx", `${fmt(result.kineticEV, 3)} eV`], ["Potencial Vs", `${fmt(result.stoppingVoltage, 3)} V`], ["Fotocorrente relativa", `${fmt(result.relativeCurrent, 2)}×`]]);
    setText("conceptTitle", "Energia por fóton, contagem por intensidade"); setText("conceptText", "No regime de um fóton por evento, a intensidade muda a taxa de eventos. A condição hν≥Φ continua sendo individual.");
    promptRows(["Meça ν₀ para dois metais simulados.", "Extraia h/e pela inclinação da reta Kmáx(ν).", "No gráfico de fotocorrente, separe os efeitos de ν e intensidade: qual muda a saturação e qual muda o corte?"]);
  }

  function drawCompton() {
    const wavelength = value("comptonWavelength") * 1e-12, angle = value("comptonAngle"), result = P.compton(wavelength, angle), drawing = canvas(), context = drawing.context;
    setText("comptonWavelengthOut", `${fmt(wavelength * 1e12, 0)} pm`); setText("comptonAngleOut", `${fmt(angle, 0)}°`);
    const split = drawing.width * .48, centerX = split * .48, centerY = drawing.height * .48, length = Math.min(split * .23, drawing.height * .3), theta = angle * Math.PI / 180;
    text(context, "evento de colisão", split * .5, 28, colors.gray, "center", "700 11px Ubuntu, system-ui");
    // comprimentos das setas proporcionais aos momentos: p_γ = p_γ′ + p_e
    const scale = length / result.incidentMomentum, scattered = result.scatteredMomentum * scale;
    line(context, centerX, centerY, centerX + length, centerY, colors.grid, 1.5, [5, 4]);
    arrow(context, centerX - length, centerY, centerX - 6, centerY, colors.green, 4); text(context, `γ · ${fmt(wavelength * 1e12, 0)} pm`, centerX - length, centerY - 14, colors.green);
    dot(context, centerX, centerY, colors.red, 9);
    // perto de 180° o fóton volta sobre a seta incidente: desloca-o um pouco para baixo
    const offset = angle > 165 ? 10 : 0;
    arrow(context, centerX + 6 * Math.cos(theta), centerY - 6 * Math.sin(theta) + offset, centerX + scattered * Math.cos(theta), centerY - scattered * Math.sin(theta) + offset, colors.warm, 4);
    text(context, "γ′", centerX + scattered * Math.cos(theta) + (offset ? -4 : 8), centerY - scattered * Math.sin(theta) + offset + (offset ? 16 : 0), colors.warm);
    if (result.electronAngle === null) text(context, "θ = 0: sem colisão, o elétron fica em repouso", centerX, centerY + 34, colors.gray, "center");
    else {
      const phi = result.electronAngle * Math.PI / 180, electron = result.electronMomentum * scale;
      arrow(context, centerX + 6 * Math.cos(phi), centerY + 6 * Math.sin(phi), centerX + electron * Math.cos(phi), centerY + electron * Math.sin(phi), colors.gray, 3);
      text(context, `e⁻ · φ = ${fmt(result.electronAngle, 1)}°`, Math.min(split - 50, centerX + electron * Math.cos(phi)), centerY + electron * Math.sin(phi) + 20, colors.gray, "center");
    }
    text(context, "setas em escala de momento", split * .5, drawing.height - 18, colors.gray, "center", "10px Ubuntu, system-ui");
    const curve = samples(0, 180, 181, (degrees) => P.compton(wavelength, degrees).shift * 1e12);
    const plot = chart(context, { x: split, y: 0, width: drawing.width - split, height: drawing.height }, [{ points: curve, color: colors.green }], { xMin: 0, xMax: 180, yMin: 0, yMax: 5.1, xLabel: "ângulo θ (graus)", yLabel: "Δλ (pm)", xDigits: 0 });
    dot(context, plot.mapX(angle), plot.mapY(result.shift * 1e12), colors.warm, 6); legend([[colors.green, "Δλ(θ)"], [colors.warm, "estado escolhido"]]);
    setText("statusTitle", "Efeito Compton"); setText("statusDetail", `θ=${fmt(angle, 0)}° · Δλ=${fmt(result.shift * 1e12, 3)} pm`);
    setText("mainTitle", "Colisão relativística fóton–elétron"); setText("mainSubtitle", "conservação de energia e momento em um evento localizado");
    setText("caption", "No diagrama, o comprimento de cada seta é proporcional ao momento: p_γ = p_γ′ + p_e. O elétron recua do lado oposto ao fóton, com cot φ = (1 + Eγ/mₑc²)·tan(θ/2). O deslocamento Δλ depende apenas do alvo e do ângulo; a fração de energia transferida também depende de λ.");
    setText("prediction", "O deslocamento máximo ocorre a 90° ou 180°? Mudar λ altera Δλ no mesmo ângulo?");
    setHtml("calculation", `Δλ = λ<sub>C</sub>(1−cos θ)<br>= 2,426 pm [1−cos(${fmt(angle, 0)}°)]<br><b>= ${fmt(result.shift * 1e12, 4)} pm</b><small>λ′ = ${fmt(wavelength * 1e12, 3)} + ${fmt(result.shift * 1e12, 3)} = ${fmt(result.scatteredWavelength * 1e12, 3)} pm</small>`);
    metricRows([["λ espalhado", `${fmt(result.scatteredWavelength * 1e12, 3)} pm`], ["Eγ", `${fmt(result.incidentEnergyEV / 1000, 3)} keV`], ["Eγ′", `${fmt(result.scatteredEnergyEV / 1000, 3)} keV`], ["K do elétron", `${fmt(result.electronKineticEV / 1000, 3)} keV`], ["p do elétron", `${sci(result.electronMomentum, 3)} kg·m/s`], ["recuo φ", result.electronAngle === null ? "sem colisão" : `${fmt(result.electronAngle, 2)}°`]]);
    setText("conceptTitle", "O fóton carrega momento"); setText("conceptText", "A relação pγ=h/λ é necessária para que energia e momento sejam conservados simultaneamente no espalhamento.");
    promptRows(["Verifique os limites θ=0° e 180°: para onde vai o elétron em cada caso?", "Compare raios X de 40 pm e 160 pm.", "Confirme numericamente Kₑ=Eγ−Eγ′ e, no diagrama, que as setas fecham o balanço de momento."]);
  }

  function drawMatter() {
    const voltage = value("voltage"), spacing = value("spacing") * 1e-9, order = value("braggOrder"), wave = P.deBroglieElectron(voltage), angle = P.braggAngle(wave.relativisticWavelength, spacing, order), drawing = canvas(), context = drawing.context;
    setText("voltageOut", voltage >= 1000 ? `${fmt(voltage / 1000, 2)} kV` : `${fmt(voltage, 0)} V`); setText("spacingOut", `${fmt(spacing * 1e9, 3)} nm`);
    const split = drawing.width * .46, baseY = drawing.height * .67;
    text(context, "difração no cristal", split * .5, 28, colors.gray, "center", "700 11px Ubuntu, system-ui");
    // planos cristalinos (espaçamento fora de escala) e dois raios refletidos com o θ calculado
    const gap = 48, topPlane = baseY - 2 * gap, hitX = split * .5;
    for (let index = 0; index < 4; index += 1) line(context, 30, topPlane + index * gap, split - 20, topPlane + index * gap, colors.grid, 2);
    const drawn = angle === null ? 35 : angle, theta = drawn * Math.PI / 180, reach = Math.min(split * .42, (topPlane - 75) / Math.max(Math.sin(theta), .05));
    [[0, colors.green, colors.warm, 4], [gap, "#7f95b8", "#8fb89a", 2.5]].forEach(([depth, inColor, outColor, width]) => {
      const y = topPlane + depth, x = hitX;
      arrow(context, x - reach * Math.cos(theta), y - reach * Math.sin(theta), x - 4, y - 2, inColor, width);
      if (angle !== null) arrow(context, x + 2, y - 2, x + reach * Math.cos(theta), y - reach * Math.sin(theta), outColor, width);
    });
    context.strokeStyle = colors.warm; context.lineWidth = 1.5; context.beginPath(); context.arc(hitX, topPlane, 34, Math.PI, Math.PI + theta, false); context.stroke();
    text(context, angle === null ? "nλ > 2d: sem máximo nesta ordem" : `θ = ${fmt(angle, 2)}° (arco no ponto de reflexão)`, split * .5, 50, angle === null ? colors.red : colors.warm, "center", "700 12px Ubuntu, system-ui");
    line(context, hitX + 14, topPlane, hitX + 14, topPlane + gap, colors.gray, 1, [3, 3]);
    text(context, `d = ${fmt(spacing * 1e9, 3)} nm`, hitX + 20, topPlane + gap / 2 + 4, colors.gray);
    if (angle !== null) text(context, `diferença de caminho 2d sen θ = ${order}λ`, split * .5, topPlane + 3 * gap + 26, colors.gray, "center", "11px Ubuntu, system-ui");
    // tensão em escala log: x = log10(V)
    const voltages = samples(1, 4, 260, (logV) => P.deBroglieElectron(10 ** logV).relativisticWavelength * 1e9);
    const xTicks = [1, 2, 3, 4].map((v) => ({ v, label: v < 3 ? `${10 ** v} V` : `${10 ** (v - 3)} kV` }));
    const plot = chart(context, { x: split, y: 0, width: drawing.width - split, height: drawing.height }, [{ points: voltages, color: colors.green }], { xMin: 1, xMax: 4, yMin: 0, yMax: .4, xLabel: "tensão aceleradora V (escala log)", yLabel: "λ de de Broglie (nm)", xTicks, yDigits: 2 });
    line(context, plot.left, plot.mapY(spacing * 1e9), plot.right, plot.mapY(spacing * 1e9), colors.gray, 1.2, [5, 4]);
    text(context, "λ = d", plot.right - 4, plot.mapY(spacing * 1e9) - 5, colors.gray, "right", "10px Ubuntu, system-ui");
    dot(context, plot.mapX(Math.log10(voltage)), plot.mapY(wave.relativisticWavelength * 1e9), colors.warm, 6); legend([[colors.green, "λ(V) relativístico"], [colors.warm, "estado escolhido"]]);
    setText("statusTitle", "de Broglie e Bragg"); setText("statusDetail", angle === null ? "nenhum máximo nesta ordem" : `λ=${fmt(wave.relativisticWavelength * 1e9, 4)} nm · θ=${fmt(angle, 2)}°`);
    setText("mainTitle", "Comprimento de onda do elétron"); setText("mainSubtitle", "a escala atômica torna o cristal uma rede de difração");
    setText("caption", "A curva inclui a correção relativística. Na faixa baixa de tensão ela coincide visualmente com λ=h/√(2mₑeV); a diferença cresce com a energia.");
    setText("prediction", "Quadruplicar V reduz λ por 2 ou por 4 no regime não relativístico? Quando uma ordem de Bragg deixa de existir?");
    setHtml("calculation", `λ ≈ 12,26/√V Å<br>= 12,26/√${voltage} Å<br><b>= ${fmt(wave.classicalWavelength * 1e10, 4)} Å</b><small>2d sen θ = nλ → ${angle === null ? "nλ&gt;2d: sem solução" : `θ=${fmt(angle, 3)}°`}</small>`);
    metricRows([["Energia cinética", `${voltage.toLocaleString("pt-BR")} eV`], ["λ não relativístico", `${fmt(wave.classicalWavelength * 1e9, 5)} nm`], ["λ relativístico", `${fmt(wave.relativisticWavelength * 1e9, 5)} nm`], ["Correção relativa", `${fmt(100 * wave.relativeError, 4)}%`], ["Ângulo de Bragg", angle === null ? "não permitido" : `${fmt(angle, 3)}°`]]);
    setText("conceptTitle", "Momento também define uma escala ondulatória"); setText("conceptText", "A difração não significa uma órbita ondulada. Ela revela interferência entre amplitudes associadas a caminhos indistinguíveis.");
    promptRows(["Recupere aproximadamente 1,67 Å em 54 V.", "Teste a validade não relativística em 150 V e 5 kV.", "Varie d e n e identifique ordens proibidas."]);
  }

  function drawRadiation() {
    const materialKey = $("radiationMaterial").value, logKeV = value("radiationEnergy"), energyMeV = 10 ** logKeV / 1000, thickness = value("radiationThickness");
    const result = P.radiationInteraction(materialKey, energyMeV, thickness), drawing = canvas();
    const labels = { coherent: "Rayleigh", photoelectric: "fotoelétrico", compton: "Compton", pair: "pares" };
    // escala log-log: x = log10(E/keV), y = log10(μ/ρ em cm²/g); as bordas entram nas amostras dos dois lados
    const edges = P.absorptionEdges(materialKey), grid = samples(1, 4.3, 500, x => x).map(point => point.x);
    edges.forEach(edge => { const x = Math.log10(edge * 1000); grid.push(x - 1e-7, x); });
    grid.sort((a, b) => a - b);
    const rows = grid.map(x => ({ x, row: P.radiationInteraction(materialKey, 10 ** x / 1000, thickness) }));
    const curve = key => rows.filter(point => point.row[key] > 0).map(point => ({ x: point.x, y: Math.log10(point.row[key]) }));
    const series = [
      { points: curve("coherent"), color: colors.gray, dash: [5, 4], width: 1.6 },
      { points: curve("photoelectric"), color: colors.warm },
      { points: curve("compton"), color: colors.green },
      { points: curve("pair"), color: "#8065b8" },
      { points: curve("totalMass"), color: colors.ink, width: 3.2 },
    ];
    const energyLabel = keV => keV >= 1000 ? `${fmt(keV / 1000, keV >= 10000 ? 0 : 1)} MeV` : `${fmt(keV, 0)} keV`;
    const xTicks = [1, 2, 3, 4].map(v => ({ v, label: energyLabel(10 ** v) }));
    const superscript = n => String(n).replace(/-/g, "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    const yTicks = [-4, -3, -2, -1, 0, 1, 2, 3].map(v => ({ v, label: `10${superscript(v)}` }));
    const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, series, { xMin: 1, xMax: 4.3, yMin: -4, yMax: 3.3, xLabel: "energia do fóton (escala log)", yLabel: "μ/ρ (cm²/g, escala log)", xTicks, yTicks });
    line(drawing.context, plot.mapX(Math.log10(1022)), plot.top, plot.mapX(Math.log10(1022)), plot.bottom, "#8065b8", 1.5, [5, 4]);
    text(drawing.context, "limiar de pares 1,022 MeV", plot.mapX(Math.log10(1022)) + 5, plot.top + 14, "#8065b8", "left", "10px Ubuntu, system-ui");
    edges.filter(edge => edge > .02).forEach(edge => text(drawing.context, `borda K · ${fmt(edge * 1000, 1)} keV`, plot.mapX(Math.log10(edge * 1000)) + 5, plot.mapY(Math.log10(P.radiationInteraction(materialKey, edge, 1).totalMass)) - 8, colors.warm, "left", "10px Ubuntu, system-ui"));
    line(drawing.context, plot.mapX(logKeV), plot.top, plot.mapX(logKeV), plot.bottom, colors.red, 1.2, [3, 3]);
    dot(drawing.context, plot.mapX(logKeV), plot.mapY(Math.log10(result.totalMass)), colors.red, 6);
    legend([[colors.ink, "total"], [colors.warm, "fotoelétrico"], [colors.green, "Compton"], ["#8065b8", "pares"], [colors.gray, "Rayleigh", true], [colors.red, "seleção"]]);
    setText("radiationEnergyOut", energyLabel(10 ** logKeV));
    setText("radiationThicknessOut", `${fmt(thickness, 1)} cm`);
    setText("statusTitle", "Fótons e matéria"); setText("statusDetail", `${result.material.name} · ${labels[result.dominant]}`);
    setText("mainTitle", "Aplicação: atenuação de raios X e γ"); setText("mainSubtitle", "os coeficientes macroscópicos revelam canais microscópicos quantizados");
    setText("caption", "Seções de choque do NIST XCOM, interpoladas em log-log; os dois eixos são logarítmicos. Os saltos verticais são bordas de absorção: acima delas o fóton tem energia para arrancar elétrons de uma camada mais interna (K do chumbo: 88,0 keV). Pares exigem Eγ ≥ 2mₑc² = 1,022 MeV.");
    setText("prediction", "Ao aumentar a energia, qual canal passa a dominar? O chumbo atenua mais logo abaixo ou logo acima de 88 keV?");
    setHtml("calculation", `μ = ρ(μ/ρ)<br>= ${fmt(result.material.density, 2)} × ${fmt(result.totalMass, 4)}<br><b>= ${fmt(result.linear, 4)} cm<sup>−1</sup></b><small>I/I<sub>0</sub> = e<sup>−μx</sup> = ${result.transmission < 1e-3 ? sci(result.transmission, 2) : fmt(result.transmission, 4)}</small>`);
    const share = key => `${fmt(100 * result[key] / result.totalMass, 0)}%`;
    metricRows([["Energia", energyLabel(10 ** logKeV)], ["Canal dominante", labels[result.dominant]], ["μ/ρ total", `${fmt(result.totalMass, 4)} cm²/g`], ["foto · Compton · pares", `${share("photoelectric")} · ${share("compton")} · ${share("pair")}`], ["μ linear", `${fmt(result.linear, 4)} cm⁻¹`], ["Transmissão", result.transmission < 1e-3 ? `${sci(100 * result.transmission, 2)}%` : `${fmt(100 * result.transmission, 2)}%`]]);
    setText("conceptTitle", "Atenuação não é uma nova lei quântica"); setText("conceptText", "Beer–Lambert descreve o feixe em escala macroscópica. Os coeficientes que entram nela somam probabilidades de processos quânticos distintos, cada um com sua dependência em E e Z.");
    promptRows(["Compare água e osso em 50 keV: qual canal explica o contraste de uma radiografia?", "Use os presets Pb · 85 keV e Pb · 90 keV: o que acontece com μ/ρ ao cruzar a borda K? Por que isso importa para a blindagem?", "Suba acima de 1,022 MeV: em qual material os pares passam a dominar dentro da faixa, e por quê?"]);
  }

  function render() { if (activeView === "blackbody") drawBlackbody(); else if (activeView === "photoelectric") drawPhotoelectric(); else if (activeView === "compton") drawCompton(); else if (activeView === "matter") drawMatter(); else drawRadiation(); }
  function switchView(view) {
    activeView = ["blackbody", "photoelectric", "compton", "matter", "radiation"].includes(view) ? view : "blackbody";
    document.querySelectorAll("[data-view]").forEach((button) => { const active = button.dataset.view === activeView; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((section) => section.classList.toggle("active", section.dataset.controls === activeView));
    try { const url = new URL(location.href); url.searchParams.set("view", activeView); history.replaceState(null, "", url); } catch (_) {}
    requestAnimationFrame(render);
  }
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("input,select").forEach((control) => control.addEventListener("input", render));
  document.querySelectorAll("[data-set]").forEach((button) => button.addEventListener("click", () => { const ids = button.dataset.set.split(","), values = button.dataset.value.split(","); ids.forEach((id, index) => { $(id).value = values[index]; }); render(); }));
  $("resetBtn").addEventListener("click", () => { Object.entries(defaults[activeView]).forEach(([id, value]) => { $(id).value = value; }); render(); });
  window.addEventListener("resize", render);
  switchView(activeView);
})();
