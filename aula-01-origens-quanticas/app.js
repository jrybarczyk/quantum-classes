(function () {
  "use strict";
  const P = window.OriginsPhysics;
  const $ = (id) => document.getElementById(id);
  const colors = { green: "#619b60", lime: "#83c44e", gray: "#6f7171", grid: "#dce5dc", warm: "#e9a23b", red: "#c65c4b", ink: "#26312d", pale: "#edf5e8" };
  let activeView = new URLSearchParams(location.search).get("view") || "blackbody";
  const defaults = { blackbody: { temperature: 5800, spectrumAxis: "dimensionless" }, photoelectric: { frequency: 7, workFunction: 2.3, intensity: 1 }, compton: { comptonWavelength: 71, comptonAngle: 90 }, matter: { voltage: 150, spacing: .2, braggOrder: 1 } };
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
    for (let index = 0; index <= 5; index += 1) {
      const x = options.xMin + index * (options.xMax - options.xMin) / 5;
      const y = options.yMin + index * (options.yMax - options.yMin) / 5;
      line(context, mapX(x), top, mapX(x), bottom, colors.grid, 1);
      line(context, left, mapY(y), right, mapY(y), colors.grid, 1);
      text(context, fmt(x, options.xDigits ?? 1), mapX(x), bottom + 17, colors.gray, "center", "10px Ubuntu, system-ui");
      text(context, fmt(y, options.yDigits ?? 1), left - 7, mapY(y) + 3, colors.gray, "right", "10px Ubuntu, system-ui");
    }
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

  function drawBlackbody() {
    const temperature = value("temperature"), axis = $("spectrumAxis").value, body = P.blackbody(temperature), drawing = canvas();
    setText("temperatureOut", `${temperature.toLocaleString("pt-BR")} K`);
    if (axis === "dimensionless") {
      chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [
        { points: samples(.02, 8, 250, (x) => x ** 3 / Math.expm1(x)), color: colors.green },
        { points: samples(0, 2.8, 100, (x) => x ** 2), color: colors.red, dash: [8, 5] },
      ], { xMin: 0, xMax: 8, yMin: 0, yMax: 8, xLabel: "x = hν/kT", yLabel: "função espectral reduzida" });
      legend([[colors.green, "Planck"], [colors.red, "Rayleigh–Jeans", true]]);
    } else {
      const peakMicron = body.lambdaPeak * 1e6, maximum = Math.max(2, peakMicron * 4.5);
      const raw = samples(.03, maximum, 260, (lambdaMicron) => P.planckWavelength(lambdaMicron * 1e-6, temperature));
      const scale = Math.max(...raw.map((point) => point.y)); raw.forEach((point) => { point.y /= scale; });
      const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [{ points: raw, color: colors.green }], { xMin: 0, xMax: maximum, yMin: 0, yMax: 1.08, xLabel: "comprimento de onda λ (μm)", yLabel: "uλ / uλ,máx", xDigits: 2 });
      line(drawing.context, plot.mapX(peakMicron), plot.top, plot.mapX(peakMicron), plot.bottom, colors.warm, 2, [6, 5]);
      legend([[colors.green, "espectro"], [colors.warm, "λmáx", true]]);
    }
    setText("statusTitle", "Corpo negro"); setText("statusDetail", `T = ${temperature.toLocaleString("pt-BR")} K`);
    setText("mainTitle", axis === "dimensionless" ? "Planck versus Rayleigh–Jeans" : "Espectro em comprimento de onda");
    setText("mainSubtitle", axis === "dimensionless" ? "a quantização corta a divergência ultravioleta" : "o pico obedece λmáxT = constante");
    setText("caption", "A lei clássica acerta hν≪kT, mas atribui kT a um número ilimitado de modos de alta frequência. Planck torna essas excitações energeticamente improváveis.");
    setText("prediction", "Ao dobrar T, a posição do pico cai pela metade. A energia total dobra, quadruplica ou cresce 16 vezes?");
    setHtml("calculation", `λ<sub>máx</sub> = b/T<br>= 2,8978×10<sup>−3</sup> / ${temperature}<br><b>= ${fmt(body.lambdaPeak * 1e9, 1)} nm</b><small>U/V = aT⁴ = ${sci(body.energyDensity, 3)} J·m⁻³</small>`);
    metricRows([["Temperatura", `${temperature.toLocaleString("pt-BR")} K`], ["λmáx", `${fmt(body.lambdaPeak * 1e9, 1)} nm`], ["Energia/volume", `${sci(body.energyDensity, 3)} J/m³`], ["Fluxo emitido", `${sci(body.radiatedFlux, 3)} W/m²`]]);
    setText("conceptTitle", "O problema era a energia por modo"); setText("conceptText", "A contagem clássica dos modos permanece. O passo novo é ⟨E⟩=hν/(e^{hν/kT}−1), em lugar de kT para toda frequência.");
    promptRows(["Localize o Sol e a temperatura ambiente no espectro.", "Confirme numericamente a escala T⁴.", "Explique por que os máximos em ν e λ não são conversões diretas."]);
  }

  function drawPhotoelectric() {
    const frequency = value("frequency") * 1e14, phi = value("workFunction"), intensity = value("intensity"), result = P.photoelectric(frequency, phi, intensity), drawing = canvas();
    setText("frequencyOut", `${fmt(frequency / 1e14, 2)}×10¹⁴ Hz`); setText("workFunctionOut", `${fmt(phi, 3)} eV`); setText("intensityOut", `${fmt(intensity, 2)}×`);
    const maxX = 12, maxY = Math.max(4, P.photoelectric(maxX * 1e14, phi).kineticEV * 1.15), thresholdX = result.thresholdFrequency / 1e14;
    const curve = samples(thresholdX, maxX, 160, (x) => P.photoelectric(x * 1e14, phi).kineticEV);
    const plot = chart(drawing.context, { x: 0, y: 0, width: drawing.width, height: drawing.height }, [{ points: curve, color: colors.green }], { xMin: 0, xMax: maxX, yMin: 0, yMax: maxY, xLabel: "frequência ν (10¹⁴ Hz)", yLabel: "Kmáx = eVs (eV)" });
    line(drawing.context, plot.mapX(thresholdX), plot.top, plot.mapX(thresholdX), plot.bottom, colors.red, 2, [6, 5]);
    dot(drawing.context, plot.mapX(frequency / 1e14), plot.mapY(result.kineticEV), result.emitted ? colors.warm : colors.red, 6);
    const photons = Math.round(4 + intensity * 9); for (let index = 0; index < photons; index += 1) dot(drawing.context, plot.left + 18 + index * Math.min(17, (plot.right - plot.left - 30) / photons), plot.top + 14, colors.lime, 3);
    legend([[colors.green, "Kmáx(ν)"], [colors.red, "frequência de corte", true], [colors.warm, "estado escolhido"]]);
    setText("statusTitle", "Efeito fotoelétrico"); setText("statusDetail", result.emitted ? `emissão · Vs=${fmt(result.stoppingVoltage, 2)} V` : "sem emissão");
    setText("mainTitle", "Energia máxima versus frequência"); setText("mainSubtitle", "a intensidade controla quantos elétrons; ν controla a energia de cada um");
    setText("caption", "Os pontos verdes no topo representam o fluxo de fótons. Aumentar sua quantidade não desloca a reta nem cruza o limiar energético de um único fóton.");
    setText("prediction", "Fixe ν abaixo de ν₀ e dobre a intensidade. A emissão aparece? Depois faça o mesmo acima de ν₀.");
    setHtml("calculation", `E<sub>γ</sub> = hν<br>= (4,1357×10<sup>−15</sup>)(${fmt(frequency, 2)})<br><b>= ${fmt(result.photonEnergyEV, 3)} eV</b><small>K<sub>máx</sub> = ${fmt(result.photonEnergyEV, 3)} − ${fmt(phi, 3)} = ${fmt(result.kineticEV, 3)} eV</small>`);
    metricRows([["Energia do fóton", `${fmt(result.photonEnergyEV, 3)} eV`], ["Frequência de corte", `${sci(result.thresholdFrequency, 3)} Hz`], ["Kmáx", `${fmt(result.kineticEV, 3)} eV`], ["Potencial Vs", `${fmt(result.stoppingVoltage, 3)} V`], ["Fotocorrente relativa", `${fmt(result.relativeCurrent, 2)}×`]]);
    setText("conceptTitle", "Energia por fóton, contagem por intensidade"); setText("conceptText", "No regime de um fóton por evento, a intensidade muda a taxa de eventos. A condição hν≥Φ continua sendo individual.");
    promptRows(["Meça ν₀ para dois metais simulados.", "Extraia h/e pela inclinação da reta.", "Separe experimentalmente os efeitos de ν e intensidade."]);
  }

  function drawCompton() {
    const wavelength = value("comptonWavelength") * 1e-12, angle = value("comptonAngle"), result = P.compton(wavelength, angle), drawing = canvas(), context = drawing.context;
    setText("comptonWavelengthOut", `${fmt(wavelength * 1e12, 0)} pm`); setText("comptonAngleOut", `${fmt(angle, 0)}°`);
    const split = drawing.width * .48, centerX = split * .48, centerY = drawing.height * .48, length = Math.min(split * .37, drawing.height * .32), theta = angle * Math.PI / 180;
    text(context, "evento de colisão", split * .5, 28, colors.gray, "center", "700 11px Ubuntu, system-ui");
    arrow(context, 35, centerY, centerX - 10, centerY, colors.green, 4); text(context, `γ · ${fmt(wavelength * 1e12, 0)} pm`, 40, centerY - 14, colors.green);
    dot(context, centerX, centerY, colors.red, 9); text(context, "e⁻ em repouso", centerX, centerY + 28, colors.gray, "center");
    arrow(context, centerX + 8, centerY, centerX + length * Math.cos(theta), centerY - length * Math.sin(theta), colors.warm, 4);
    text(context, "γ′", centerX + length * Math.cos(theta) + 8, centerY - length * Math.sin(theta), colors.warm);
    arrow(context, centerX + 4, centerY + 4, centerX + length * .88, centerY + length * .55, colors.gray, 3); text(context, "e⁻", centerX + length * .9, centerY + length * .55 + 13, colors.gray);
    const curve = samples(0, 180, 181, (degrees) => P.compton(wavelength, degrees).shift * 1e12);
    const plot = chart(context, { x: split, y: 0, width: drawing.width - split, height: drawing.height }, [{ points: curve, color: colors.green }], { xMin: 0, xMax: 180, yMin: 0, yMax: 5.1, xLabel: "ângulo θ (graus)", yLabel: "Δλ (pm)", xDigits: 0 });
    dot(context, plot.mapX(angle), plot.mapY(result.shift * 1e12), colors.warm, 6); legend([[colors.green, "Δλ(θ)"], [colors.warm, "estado escolhido"]]);
    setText("statusTitle", "Efeito Compton"); setText("statusDetail", `θ=${fmt(angle, 0)}° · Δλ=${fmt(result.shift * 1e12, 3)} pm`);
    setText("mainTitle", "Colisão relativística fóton–elétron"); setText("mainSubtitle", "conservação de energia e momento em um evento localizado");
    setText("caption", "O gráfico usa o comprimento de Compton do elétron. O deslocamento depende apenas do alvo e do ângulo; a fração de energia transferida também depende de λ.");
    setText("prediction", "O deslocamento máximo ocorre a 90° ou 180°? Mudar λ altera Δλ no mesmo ângulo?");
    setHtml("calculation", `Δλ = λ<sub>C</sub>(1−cos θ)<br>= 2,426 pm [1−cos(${fmt(angle, 0)}°)]<br><b>= ${fmt(result.shift * 1e12, 4)} pm</b><small>λ′ = ${fmt(wavelength * 1e12, 3)} + ${fmt(result.shift * 1e12, 3)} = ${fmt(result.scatteredWavelength * 1e12, 3)} pm</small>`);
    metricRows([["λ incidente", `${fmt(wavelength * 1e12, 3)} pm`], ["λ espalhado", `${fmt(result.scatteredWavelength * 1e12, 3)} pm`], ["Eγ", `${fmt(result.incidentEnergyEV / 1000, 3)} keV`], ["Eγ′", `${fmt(result.scatteredEnergyEV / 1000, 3)} keV`], ["K do elétron", `${fmt(result.electronKineticEV / 1000, 3)} keV`], ["p do elétron", `${sci(result.electronMomentum, 3)} kg·m/s`]]);
    setText("conceptTitle", "O fóton carrega momento"); setText("conceptText", "A relação pγ=h/λ é necessária para que energia e momento sejam conservados simultaneamente no espalhamento.");
    promptRows(["Verifique os limites θ=0° e 180°.", "Compare raios X de 40 pm e 160 pm.", "Confirme numericamente Kₑ=Eγ−Eγ′."]);
  }

  function drawMatter() {
    const voltage = value("voltage"), spacing = value("spacing") * 1e-9, order = value("braggOrder"), wave = P.deBroglieElectron(voltage), angle = P.braggAngle(wave.relativisticWavelength, spacing, order), drawing = canvas(), context = drawing.context;
    setText("voltageOut", voltage >= 1000 ? `${fmt(voltage / 1000, 2)} kV` : `${fmt(voltage, 0)} V`); setText("spacingOut", `${fmt(spacing * 1e9, 3)} nm`);
    const split = drawing.width * .46, baseY = drawing.height * .67;
    text(context, "difração no cristal", split * .5, 28, colors.gray, "center", "700 11px Ubuntu, system-ui");
    for (let index = 0; index < 4; index += 1) line(context, 45, baseY - index * 55, split - 25, baseY - index * 55, index === 0 ? colors.green : colors.grid, 2);
    arrow(context, 85, 70, 205, baseY - 55, colors.green, 4); arrow(context, 205, baseY - 55, 355, 75, colors.warm, 4);
    line(context, 205, baseY - 55, 205, 70, colors.gray, 1, [5, 4]); text(context, angle === null ? "sem ordem permitida" : `θ = ${fmt(angle, 2)}°`, 215, 105, colors.warm);
    text(context, `d = ${fmt(spacing * 1e9, 3)} nm`, 58, baseY - 31, colors.gray);
    const voltages = samples(10, 10000, 260, (candidate) => P.deBroglieElectron(candidate).relativisticWavelength * 1e9);
    const plot = chart(context, { x: split, y: 0, width: drawing.width - split, height: drawing.height }, [{ points: voltages, color: colors.green }], { xMin: 0, xMax: 10000, yMin: 0, yMax: .4, xLabel: "tensão aceleradora V (V)", yLabel: "λ de de Broglie (nm)", xDigits: 0, yDigits: 2 });
    dot(context, plot.mapX(voltage), plot.mapY(wave.relativisticWavelength * 1e9), colors.warm, 6); legend([[colors.green, "λ(V) relativístico"], [colors.warm, "estado escolhido"]]);
    setText("statusTitle", "de Broglie e Bragg"); setText("statusDetail", angle === null ? "nenhum máximo nesta ordem" : `λ=${fmt(wave.relativisticWavelength * 1e9, 4)} nm · θ=${fmt(angle, 2)}°`);
    setText("mainTitle", "Comprimento de onda do elétron"); setText("mainSubtitle", "a escala atômica torna o cristal uma rede de difração");
    setText("caption", "A curva inclui a correção relativística. Na faixa baixa de tensão ela coincide visualmente com λ=h/√(2mₑeV); a diferença cresce com a energia.");
    setText("prediction", "Quadruplicar V reduz λ por 2 ou por 4 no regime não relativístico? Quando uma ordem de Bragg deixa de existir?");
    setHtml("calculation", `λ ≈ 12,27/√V Å<br>= 12,27/√${voltage} Å<br><b>= ${fmt(wave.classicalWavelength * 1e10, 4)} Å</b><small>2d sen θ = nλ → ${angle === null ? "nλ&gt;2d: sem solução" : `θ=${fmt(angle, 3)}°`}</small>`);
    metricRows([["Energia cinética", `${voltage.toLocaleString("pt-BR")} eV`], ["λ não relativístico", `${fmt(wave.classicalWavelength * 1e9, 5)} nm`], ["λ relativístico", `${fmt(wave.relativisticWavelength * 1e9, 5)} nm`], ["Correção relativa", `${fmt(100 * wave.relativeError, 4)}%`], ["Ângulo de Bragg", angle === null ? "não permitido" : `${fmt(angle, 3)}°`]]);
    setText("conceptTitle", "Momento também define uma escala ondulatória"); setText("conceptText", "A difração não significa uma órbita ondulada. Ela revela interferência entre amplitudes associadas a caminhos indistinguíveis.");
    promptRows(["Recupere aproximadamente 1,67 Å em 54 V.", "Teste a validade não relativística em 150 V e 5 kV.", "Varie d e n e identifique ordens proibidas."]);
  }

  function render() { if (activeView === "blackbody") drawBlackbody(); else if (activeView === "photoelectric") drawPhotoelectric(); else if (activeView === "compton") drawCompton(); else drawMatter(); }
  function switchView(view) {
    activeView = ["blackbody", "photoelectric", "compton", "matter"].includes(view) ? view : "blackbody";
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
