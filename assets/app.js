"use strict";

const RESULT_COLORS = {
  "Triunfo": "#2E8B57",
  "Empate": "#DAA520",
  "Derrota": "#B22222",
  "Suspendido": "#708090",
  "Sin marcador": "#5F9EA0",
  "Local gana": "#2E8B57",
  "Visita gana": "#B22222"
};
const RESULT_ORDER = ["Triunfo", "Empate", "Derrota", "Suspendido", "Sin marcador"];
const CONDITION_ORDER = ["Local", "Visita", "Neutral"];
const numberFormat = new Intl.NumberFormat("es-CL");
const percentFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

const state = {
  data: null,
  filtered: [],
  activeTab: "summary",
  selectedYear: null,
  selectedStadium: null,
  selectedRival: null,
  selectedScorer: null,
  selectedCoach: null,
  matchView: "cards",
  matchSearch: "",
  matchPage: 1,
  matchPageSize: 12,
  otherSearch: "",
  otherPage: 1,
  otherPageSize: 25
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtInt(value) {
  return numberFormat.format(Number(value || 0));
}

function fmtPct(value) {
  return `${percentFormat.format(Number(value || 0))}%`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function fmtDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parseDate(value));
}

function fmtDateLong(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" }).format(parseDate(value));
}

function resultClass(result) {
  if (result === "Triunfo" || result === "Local gana") return "win";
  if (result === "Empate") return "draw";
  if (result === "Derrota" || result === "Visita gana") return "loss";
  return "";
}

function optionHtml(value, label = value) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function setSelectOptions(element, values, allLabel, selected = "") {
  element.innerHTML = optionHtml("", allLabel) + values.map(v => optionHtml(v)).join("");
  element.value = selected;
}

function setupCheckboxes(container, values, prefix) {
  container.innerHTML = values.map((value, index) => `
    <label class="check-label">
      <input type="checkbox" value="${escapeHtml(value)}" id="${prefix}-${index}" checked>
      <span>${escapeHtml(value)}</span>
    </label>
  `).join("");
}

function selectedCheckboxValues(containerSelector) {
  return $$(`${containerSelector} input:checked`).map(input => input.value);
}

function setupFilters() {
  const { filters, stats } = state.data;
  const years = filters.years;
  const yearFrom = $("#year-from");
  const yearTo = $("#year-to");
  yearFrom.innerHTML = years.map(y => optionHtml(y)).join("");
  yearTo.innerHTML = years.map(y => optionHtml(y)).join("");
  yearFrom.value = String(Math.min(...years));
  yearTo.value = String(Math.max(...years));

  const dateFrom = $("#date-from");
  const dateTo = $("#date-to");
  dateFrom.min = stats.date_min;
  dateFrom.max = stats.date_max;
  dateTo.min = stats.date_min;
  dateTo.max = stats.date_max;
  dateFrom.value = stats.date_min;
  dateTo.value = stats.date_max;

  setupCheckboxes($("#condition-checks"), CONDITION_ORDER.filter(v => filters.conditions.includes(v)), "condition");
  setupCheckboxes($("#result-checks"), RESULT_ORDER.filter(v => filters.results.includes(v)), "result");
  setSelectOptions($("#rival-filter"), filters.rivals, "Todos los rivales");
  const stadiumAliasByName = new Map(
    [...state.data.matches, ...state.data.other_matches]
      .filter(match => match.stadium)
      .map(match => [match.stadium, match.stadium_alias || match.stadium])
  );
  const stadiumFilter = $("#stadium-filter");
  stadiumFilter.innerHTML = optionHtml("", "Todos los estadios") + filters.stadiums
    .map(stadium => optionHtml(stadium, stadiumAliasByName.get(stadium) || stadium))
    .join("");
  setSelectOptions($("#competition-filter"), filters.competitions, "Todos los torneos");
  setSelectOptions($("#coach-filter"), filters.coaches, "Todos los entrenadores");

  $$("#sidebar input, #sidebar select").forEach(control => control.addEventListener("change", applyFilters));
  $("#reset-filters").addEventListener("click", resetFilters);
}

function resetFilters() {
  const { stats, filters } = state.data;
  $("#date-from").value = stats.date_min;
  $("#date-to").value = stats.date_max;
  $("#year-from").value = String(Math.min(...filters.years));
  $("#year-to").value = String(Math.max(...filters.years));
  $$("#condition-checks input, #result-checks input").forEach(input => { input.checked = true; });
  $("#rival-filter").value = "";
  $("#stadium-filter").value = "";
  $("#competition-filter").value = "";
  $("#coach-filter").value = "";
  applyFilters();
}

function currentFilterValues() {
  return {
    dateFrom: $("#date-from").value,
    dateTo: $("#date-to").value,
    yearFrom: Number($("#year-from").value),
    yearTo: Number($("#year-to").value),
    conditions: selectedCheckboxValues("#condition-checks"),
    results: selectedCheckboxValues("#result-checks"),
    rival: $("#rival-filter").value,
    stadium: $("#stadium-filter").value,
    competition: $("#competition-filter").value,
    coach: $("#coach-filter").value
  };
}

function applyFilters() {
  const f = currentFilterValues();
  if (f.yearFrom > f.yearTo) {
    const temp = f.yearFrom;
    f.yearFrom = f.yearTo;
    f.yearTo = temp;
    $("#year-from").value = String(f.yearFrom);
    $("#year-to").value = String(f.yearTo);
  }
  state.filtered = state.data.uch_matches.filter(match => {
    return match.date >= f.dateFrom && match.date <= f.dateTo
      && match.year >= f.yearFrom && match.year <= f.yearTo
      && f.conditions.includes(match.condition)
      && f.results.includes(match.result)
      && (!f.rival || match.rival === f.rival)
      && (!f.stadium || match.stadium === f.stadium)
      && (!f.competition || match.competition === f.competition)
      && (!f.coach || match.coach.display === f.coach);
  });

  $("#visible-count").textContent = fmtInt(state.filtered.length);
  const caption = $("#page-caption");
  if (state.filtered.length) {
    const sorted = [...state.filtered].sort((a, b) => a.date.localeCompare(b.date));
    caption.textContent = `${fmtInt(state.filtered.length)} partidos · ${fmtDate(sorted[0].date)} a ${fmtDate(sorted.at(-1).date)}`;
  } else {
    caption.textContent = "No hay partidos para los filtros seleccionados.";
  }
  $("#empty-state").hidden = state.filtered.length > 0 || state.activeTab === "other";
  renderActiveTab();
}

function setupTabs() {
  $$(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      $$(".tab-button").forEach(item => item.classList.toggle("active", item === button));
      $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${state.activeTab}`));
      $("#empty-state").hidden = state.filtered.length > 0 || state.activeTab === "other";
      renderActiveTab();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function setupMobileSidebar() {
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebar-backdrop");
  const open = () => { sidebar.classList.add("open"); backdrop.hidden = false; };
  const close = () => { sidebar.classList.remove("open"); backdrop.hidden = true; };
  $("#mobile-filter-button").addEventListener("click", open);
  $("#close-sidebar").addEventListener("click", close);
  backdrop.addEventListener("click", close);
}

function summarize(matches) {
  const played = matches.filter(m => m.points !== null);
  const wins = played.filter(m => m.result === "Triunfo").length;
  const draws = played.filter(m => m.result === "Empate").length;
  const losses = played.filter(m => m.result === "Derrota").length;
  const points = played.reduce((sum, m) => sum + Number(m.points || 0), 0);
  const gf = matches.reduce((sum, m) => sum + Number(m.goals_uch || 0), 0);
  const gc = matches.reduce((sum, m) => sum + Number(m.goals_rival || 0), 0);
  return {
    matches: matches.length,
    played: played.length,
    wins,
    draws,
    losses,
    points,
    gf,
    gc,
    performance: played.length ? points * 100 / (played.length * 3) : 0,
    stadiums: new Set(matches.map(m => m.stadium)).size,
    rivals: new Set(matches.map(m => m.rival)).size
  };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function summaryRows(matches, keyFn, labelName = "label") {
  return Array.from(groupBy(matches, keyFn), ([label, group]) => ({ [labelName]: label, ...summarize(group), items: group }));
}

function flatGoals(matches) {
  return matches.flatMap(match => (match.goals || []).map(goal => ({
    ...goal,
    date: match.date,
    rival: match.rival,
    stadium: match.stadium,
    competition: match.competition,
    score: match.score,
    condition: match.condition,
    match_id: match.id
  })));
}

function topCount(items, keyFn) {
  const rows = Array.from(groupBy(items, keyFn), ([label, group]) => ({ label, count: group.length, items: group }));
  rows.sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "es"));
  return rows;
}

function metricCard(label, value, detail = "") {
  return `<article class="metric-card">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
    ${detail ? `<div class="metric-detail">${escapeHtml(detail)}</div>` : ""}
  </article>`;
}

function highlightCard(label, value, detail = "") {
  return `<article class="highlight-card">
    <div class="highlight-label">${escapeHtml(label)}</div>
    <div class="highlight-value">${escapeHtml(value)}</div>
    <div class="highlight-detail">${escapeHtml(detail)}</div>
  </article>`;
}

function detailField(label, value) {
  return `<div class="detail-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "Sin dato")}</strong></div>`;
}

function sectionHeading(title, subtitle = "") {
  return `<div class="section-heading"><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>`;
}

function dataDisclosure(title, tableHtml, count, open = false) {
  return `<details class="data-disclosure" ${open ? "open" : ""}><summary>${escapeHtml(title)}<span>${fmtInt(count)} registros</span></summary>${tableHtml}</details>`;
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, totalPages, start, end: Math.min(start + pageSize, items.length), items: items.slice(start, start + pageSize) };
}

function paginationControls(prefix, pageData, totalItems, pageSize) {
  return `<div class="pagination">
    <div class="pagination-info">Mostrando ${totalItems ? pageData.start + 1 : 0}–${pageData.end} de ${fmtInt(totalItems)}</div>
    <div class="pagination-actions">
      <select class="page-size" id="${prefix}-page-size" aria-label="Resultados por página">
        ${[12, 24, 25, 48, 50, 100].filter((v,i,a)=>a.indexOf(v)===i).map(v => `<option value="${v}" ${v === pageSize ? "selected" : ""}>${v} / pág.</option>`).join("")}
      </select>
      <button class="page-button" type="button" id="${prefix}-prev" ${pageData.page <= 1 ? "disabled" : ""}>Anterior</button>
      <span class="pagination-info">${pageData.page} / ${pageData.totalPages}</span>
      <button class="page-button" type="button" id="${prefix}-next" ${pageData.page >= pageData.totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  </div>`;
}

function matchTitle(match, other = false) {
  const score = match.score || "S/M";
  return `${match.home} ${score} ${match.away}`;
}

function matchCard(match, other = false) {
  const honors = (match.honors || []).map(h => `<span class="chip honor">${escapeHtml(h.label || "Campeón")}</span>`).join("");
  const condition = !other ? `<span class="chip ${match.condition === "Neutral" ? "neutral" : ""}">${escapeHtml(match.condition)}</span>` : "";
  return `<button class="match-card" type="button" data-match-id="${match.id}" data-other="${other ? "1" : "0"}">
    <div class="match-date">${escapeHtml(fmtDate(match.date))} · ${escapeHtml(match.competition)}</div>
    <div class="match-score">${escapeHtml(matchTitle(match, other))}</div>
    <div class="chip-row">
      <span class="chip ${resultClass(match.result)}">${escapeHtml(match.result)}</span>
      ${condition}
      ${match.penalty_shootout ? `<span class="chip">Penales ${escapeHtml(match.penalty_shootout.score || "")}</span>` : ""}
      ${honors}
    </div>
    <div class="match-meta" title="${escapeHtml(match.stadium)}">${escapeHtml(match.stadium_alias || match.stadium)}${!other && match.coach ? ` · ${escapeHtml(match.coach.display)}` : ""}</div>
  </button>`;
}

function bindMatchLinks(root) {
  $$('[data-match-id]', root).forEach(element => {
    element.addEventListener("click", () => {
      const id = Number(element.dataset.matchId);
      const other = element.dataset.other === "1";
      const source = other ? state.data.other_matches : state.data.uch_matches;
      const match = source.find(item => item.id === id);
      if (match) showMatchDialog(match, other);
    });
  });
}

function penaltyDetails(shootout) {
  if (!shootout) return "";
  const grouped = groupBy(shootout.kicks || [], kick => kick.team);
  const kickHtml = Array.from(grouped, ([team, kicks]) => {
    const items = kicks.map(k => `${escapeHtml(k.player)} ${String(k.outcome || "").toLowerCase() === "scored" ? "✓" : "✕"}`).join(", ");
    return `<li><strong>${escapeHtml(team)}:</strong> ${items}</li>`;
  }).join("");
  return `<div class="detail-card"><strong>Definición por penales: ${escapeHtml(shootout.score || "S/M")}</strong>
    <div class="detail-subtitle">Ganador: ${escapeHtml(shootout.winner || "Sin dato")}</div>
    ${kickHtml ? `<ul class="goal-list">${kickHtml}</ul>` : ""}
  </div>`;
}

function showMatchDialog(match, other = false) {
  const goals = !other && match.goals?.length
    ? `<div class="detail-card"><strong>Goles UCH</strong><ul class="goal-list">${match.goals.map(goal => `<li>${escapeHtml(goal.player)}${goal.minute ? ` · ${escapeHtml(goal.minute)}'` : ""}${goal.penalty ? " · penal" : ""}${goal.own_goal ? " · autogol" : ""}</li>`).join("")}</ul></div>`
    : "";
  const honors = (match.honors || []).length
    ? `<div class="detail-card"><strong>Hito</strong><div class="detail-subtitle">${match.honors.map(h => `${escapeHtml(h.team)} · ${escapeHtml(h.label)}${h.trophy ? ` · ${escapeHtml(h.trophy)}` : ""}`).join("<br>")}</div></div>`
    : "";
  $("#match-dialog-content").innerHTML = `
    <div class="dialog-hero">
      <div class="hero-kicker">${escapeHtml(fmtDateLong(match.date))} · ${escapeHtml(match.competition)}</div>
      <h2 class="detail-title">${escapeHtml(matchTitle(match, other))}</h2>
      <p class="detail-subtitle">${escapeHtml(match.stadium)}${match.stadium_city ? ` · ${escapeHtml(match.stadium_city)}` : ""}</p>
    </div>
    <div class="dialog-body">
      <div class="detail-grid">
        ${detailField("Resultado", match.result)}
        ${!other ? detailField("Condición", match.condition) : detailField("Estado", match.status)}
        ${!other ? detailField("Rival", match.rival) : detailField("Torneo", match.competition)}
        ${!other ? detailField("Entrenador", match.coach?.display || "Sin DT") : detailField("Estadio", match.stadium)}
      </div>
      ${goals}
      ${penaltyDetails(match.penalty_shootout)}
      ${honors}
    </div>`;
  $("#match-dialog").showModal();
}

function setupDialog() {
  const dialog = $("#match-dialog");
  $("#close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}

const plotConfig = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] };
function baseLayout(title, extra = {}) {
  return {
    title: { text: title, x: .03, xanchor: "left", font: { size: 17, color: "#0f172a" } },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, system-ui, sans-serif", color: "#334155" },
    margin: { l: 55, r: 20, t: 55, b: 50 },
    legend: { orientation: "h", y: -0.2 },
    ...extra
  };
}

function plotDonut(id, rows, labelKey, valueKey, title) {
  Plotly.newPlot(id, [{
    type: "pie",
    labels: rows.map(r => r[labelKey]),
    values: rows.map(r => r[valueKey]),
    hole: .58,
    sort: false,
    marker: { colors: rows.map(r => RESULT_COLORS[r[labelKey]] || undefined) },
    textinfo: "percent+label",
    hovertemplate: "%{label}: %{value}<extra></extra>"
  }], baseLayout(title, { showlegend: false, margin: { l: 20, r: 20, t: 55, b: 20 } }), plotConfig);
}

function plotHorizontal(id, rows, labelKey, valueKey, title, color = "#2563eb") {
  const sorted = [...rows].sort((a, b) => a[valueKey] - b[valueKey]);
  Plotly.newPlot(id, [{
    type: "bar",
    orientation: "h",
    x: sorted.map(r => r[valueKey]),
    y: sorted.map(r => r[labelKey]),
    text: sorted.map(r => r[valueKey]),
    textposition: "outside",
    cliponaxis: false,
    marker: { color },
    hovertemplate: "%{y}: %{x}<extra></extra>"
  }], baseLayout(title, { margin: { l: 135, r: 35, t: 55, b: 45 }, xaxis: { gridcolor: "rgba(15,23,42,.09)" } }), plotConfig);
}

function plotVertical(id, rows, xKey, yKey, title, color = "#2563eb") {
  Plotly.newPlot(id, [{
    type: "bar",
    x: rows.map(r => r[xKey]),
    y: rows.map(r => r[yKey]),
    text: rows.map(r => typeof r[yKey] === "number" ? Math.round(r[yKey] * 10) / 10 : r[yKey]),
    textposition: "outside",
    cliponaxis: false,
    marker: { color },
    hovertemplate: "%{x}: %{y}<extra></extra>"
  }], baseLayout(title, { yaxis: { gridcolor: "rgba(15,23,42,.09)" } }), plotConfig);
}

function plotGrouped(id, categories, series, title) {
  const traces = series.map(item => ({
    type: "bar",
    name: item.name,
    x: categories,
    y: item.values,
    marker: { color: item.color },
    hovertemplate: `${escapeHtml(item.name)}: %{y}<extra></extra>`
  }));
  Plotly.newPlot(id, traces, baseLayout(title, { barmode: "group", yaxis: { gridcolor: "rgba(15,23,42,.09)" } }), plotConfig);
}

function plotStackedResults(id, rows, categoryKey, title) {
  const categories = rows.map(r => r[categoryKey]);
  const traces = RESULT_ORDER.slice(0, 3).map(result => ({
    type: "bar",
    name: result,
    x: categories,
    y: rows.map(row => row.items.filter(m => m.result === result).length),
    marker: { color: RESULT_COLORS[result] }
  }));
  Plotly.newPlot(id, traces, baseLayout(title, { barmode: "stack", yaxis: { gridcolor: "rgba(15,23,42,.09)" } }), plotConfig);
}

function plotStadiumMap(id, rows, title = "Mapa de estadios visitados") {
  const points = rows.filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));
  if (!points.length) {
    $("#" + id).innerHTML = `<div class="empty-state"><strong>No hay coordenadas disponibles.</strong></div>`;
    return;
  }
  Plotly.newPlot(id, [{
    type: "scattermapbox",
    mode: "markers",
    lat: points.map(r => r.latitude),
    lon: points.map(r => r.longitude),
    text: points.map(r => r.label),
    customdata: points.map(r => [r.matches, `${r.wins}-${r.draws}-${r.losses}`, r.city || "", r.country || ""]),
    marker: { size: points.map(r => Math.max(10, Math.min(26, 8 + r.matches))), color: "#2563eb", opacity: .85 },
    hovertemplate: "<b>%{text}</b><br>Partidos: %{customdata[0]}<br>G-E-P: %{customdata[1]}<br>%{customdata[2]} · %{customdata[3]}<extra></extra>"
  }], baseLayout(title, {
    height: 510,
    mapbox: {
      style: "carto-positron",
      center: {
        lat: points.reduce((s, r) => s + Number(r.latitude), 0) / points.length,
        lon: points.reduce((s, r) => s + Number(r.longitude), 0) / points.length
      },
      zoom: 3.5
    },
    margin: { l: 0, r: 0, t: 50, b: 0 }
  }), { ...plotConfig, scrollZoom: true });
}

function renderSummary() {
  const root = $("#tab-summary");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const snapshot = summarize(state.filtered);
  const goals = flatGoals(state.filtered);
  const yearRows = summaryRows(state.filtered, m => m.year, "year");
  const bestYear = [...yearRows].sort((a, b) => b.performance - a.performance || b.matches - a.matches)[0];
  const rivalTop = topCount(state.filtered, m => m.rival)[0];
  const stadiumTop = topCount(state.filtered, m => m.stadium_alias || m.stadium)[0];
  const scorerTop = topCount(goals, g => g.player)[0];
  const goalFest = [...state.filtered].filter(m => m.goals_uch !== null).sort((a, b) => (b.goals_uch + b.goals_rival) - (a.goals_uch + a.goals_rival))[0];
  const recent = [...state.filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 3);
  const resultRows = RESULT_ORDER.map(label => ({ label, count: state.filtered.filter(m => m.result === label).length })).filter(r => r.count);
  const conditionRows = CONDITION_ORDER.map(label => ({ label, count: state.filtered.filter(m => m.condition === label).length })).filter(r => r.count);
  const stadiumRows = topCount(state.filtered, m => m.stadium_alias || m.stadium).slice(0, 10).map(r => ({ label: r.label, count: r.count }));
  const rivalRows = topCount(state.filtered, m => m.rival).slice(0, 10).map(r => ({ label: r.label, count: r.count }));

  root.innerHTML = `
    <section class="hero">
      <div class="hero-kicker">Archivo filtrado</div>
      <h2>${fmtInt(snapshot.matches)} partidos de la U vistos en el estadio</h2>
      <p>${fmtInt(snapshot.stadiums)} estadios, ${fmtInt(snapshot.rivals)} rivales y ${fmtInt(snapshot.gf)} goles de Universidad de Chile dentro de la selección actual.</p>
      <div class="record-strip">
        <div class="record-pill"><span>Partidos</span><strong>${fmtInt(snapshot.matches)}</strong></div>
        <div class="record-pill"><span>G-E-P</span><strong>${snapshot.wins}-${snapshot.draws}-${snapshot.losses}</strong></div>
        <div class="record-pill"><span>Rendimiento</span><strong>${fmtPct(snapshot.performance)}</strong></div>
        <div class="record-pill"><span>Goles UCH</span><strong>${fmtInt(snapshot.gf)}</strong></div>
        <div class="record-pill"><span>GF / GC</span><strong>${snapshot.gf} / ${snapshot.gc}</strong></div>
      </div>
    </section>

    ${sectionHeading("Momentos destacados")}
    <div class="highlight-grid">
      ${highlightCard("Mejor año", bestYear ? String(bestYear.year) : "Sin datos", bestYear ? `${fmtPct(bestYear.performance)} · ${bestYear.matches} partidos` : "")}
      ${highlightCard("Rival más repetido", rivalTop?.label || "Sin datos", rivalTop ? `${rivalTop.count} partidos` : "")}
      ${highlightCard("Estadio más visitado", stadiumTop?.label || "Sin datos", stadiumTop ? `${stadiumTop.count} partidos` : "")}
      ${highlightCard("Máximo goleador visto", scorerTop?.label || "Sin datos", scorerTop ? `${scorerTop.count} goles registrados` : "")}
      ${highlightCard("Partido con más goles", goalFest ? matchTitle(goalFest) : "Sin datos", goalFest ? `${goalFest.goals_uch + goalFest.goals_rival} goles · ${fmtDate(goalFest.date)}` : "")}
      ${highlightCard("Años con partidos", fmtInt(new Set(state.filtered.map(m => m.year)).size), `${Math.min(...state.filtered.map(m => m.year))}–${Math.max(...state.filtered.map(m => m.year))}`)}
      ${highlightCard("Balance de goles", `${snapshot.gf - snapshot.gc >= 0 ? "+" : ""}${snapshot.gf - snapshot.gc}`, `${snapshot.gf} a favor · ${snapshot.gc} en contra`)}
      ${highlightCard("Promedio de goles UCH", (snapshot.gf / snapshot.matches).toFixed(2), "Por partido filtrado")}
    </div>

    ${sectionHeading("Últimos partidos")}
    <div class="match-grid">${recent.map(m => matchCard(m)).join("")}</div>

    ${sectionHeading("Resumen visual")}
    <div class="chart-grid">
      <div class="panel-card"><div id="summary-result-chart" class="plot"></div></div>
      <div class="panel-card"><div id="summary-stadium-chart" class="plot"></div></div>
      <div class="panel-card"><div id="summary-condition-chart" class="plot"></div></div>
      <div class="panel-card"><div id="summary-rival-chart" class="plot"></div></div>
    </div>`;
  bindMatchLinks(root);
  plotDonut("summary-result-chart", resultRows, "label", "count", "Resultados");
  plotHorizontal("summary-stadium-chart", stadiumRows, "label", "count", "Estadios más visitados");
  plotDonut("summary-condition-chart", conditionRows, "label", "count", "Condición");
  plotHorizontal("summary-rival-chart", rivalRows, "label", "count", "Rivales más repetidos", "#1e3a8a");
}

function renderYears() {
  const root = $("#tab-years");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const rows = summaryRows(state.filtered, m => m.year, "year").sort((a, b) => a.year - b.year);
  const best = [...rows].sort((a, b) => b.performance - a.performance || b.matches - a.matches)[0];
  const mostMatches = [...rows].sort((a, b) => b.matches - a.matches || b.year - a.year)[0];
  const mostGoals = [...rows].sort((a, b) => b.gf - a.gf || b.year - a.year)[0];
  if (!rows.some(r => r.year === state.selectedYear)) state.selectedYear = rows.at(-1).year;
  const selected = rows.find(r => r.year === state.selectedYear);
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Años con partidos", fmtInt(rows.length))}
      ${metricCard("Mejor rendimiento anual", `${best.year} · ${fmtPct(best.performance)}`)}
      ${metricCard("Más partidos", `${mostMatches.year} · ${mostMatches.matches}`)}
      ${metricCard("Más goles UCH", `${mostGoals.year} · ${mostGoals.gf}`)}
    </div>
    ${sectionHeading("Ficha de año")}
    <div class="control-row"><div class="control-group"><label for="year-detail">Año</label><select id="year-detail">${[...rows].reverse().map(r => optionHtml(r.year)).join("")}</select></div></div>
    <div class="detail-card">
      <h2 class="detail-title">${selected.year}</h2>
      <p class="detail-subtitle">Resumen de partidos del año seleccionado.</p>
      <div class="detail-grid">
        ${detailField("Partidos", selected.matches)}
        ${detailField("G-E-P", `${selected.wins}-${selected.draws}-${selected.losses}`)}
        ${detailField("Rendimiento", fmtPct(selected.performance))}
        ${detailField("GF / GC", `${selected.gf} / ${selected.gc}`)}
      </div>
    </div>
    <div class="chart-grid">
      <div class="panel-card"><div id="year-results-chart" class="plot"></div></div>
      <div class="panel-card"><div id="year-goals-chart" class="plot"></div></div>
    </div>
    <div class="panel-card"><div id="year-performance-chart" class="plot"></div></div>
    ${dataDisclosure("Tabla anual", `<div class="table-wrap"><table><thead><tr><th>Año</th><th>Partidos</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Rendimiento</th><th>Estadios</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td>${r.year}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gf}</td><td>${r.gc}</td><td>${fmtPct(r.performance)}</td><td>${r.stadiums}</td></tr>`).join("")}</tbody></table></div>`, rows.length)} `;
  const select = $("#year-detail");
  select.value = String(state.selectedYear);
  select.addEventListener("change", () => { state.selectedYear = Number(select.value); renderYears(); });
  plotStackedResults("year-results-chart", rows, "year", "Partidos por año y resultado");
  plotGrouped("year-goals-chart", rows.map(r => r.year), [
    { name: "GF", values: rows.map(r => r.gf), color: "#2563eb" },
    { name: "GC", values: rows.map(r => r.gc), color: "#b22222" }
  ], "Goles UCH y recibidos por año");
  plotVertical("year-performance-chart", rows, "year", "performance", "Rendimiento por año", "#1e3a8a");
}

function renderConditions() {
  const root = $("#tab-conditions");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const rows = summaryRows(state.filtered, m => m.condition, "condition")
    .sort((a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition));
  const total = summarize(state.filtered);
  const tableHtml = `<div class="table-wrap"><table><thead><tr><th>Condición</th><th>Partidos</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Rendimiento</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.condition)}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gf}</td><td>${r.gc}</td><td>${fmtPct(r.performance)}</td></tr>`).join("")}</tbody></table></div>`;
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Partidos analizados", fmtInt(total.matches), "Selección actual")}
      ${metricCard("Mejor condición", rows.length ? [...rows].sort((a,b)=>b.performance-a.performance || b.matches-a.matches)[0].condition : "Sin datos", rows.length ? fmtPct([...rows].sort((a,b)=>b.performance-a.performance || b.matches-a.matches)[0].performance) : "")}
      ${metricCard("Goles UCH", fmtInt(total.gf), `${fmtInt(total.gc)} recibidos`)}
      ${metricCard("Rendimiento global", fmtPct(total.performance), `${total.wins}-${total.draws}-${total.losses}`)}
    </div>
    ${sectionHeading("Comparación por condición", "Una lectura compacta del rendimiento y el récord") }
    <div class="condition-scorecards">
      ${CONDITION_ORDER.map(condition => {
        const row = rows.find(r => r.condition === condition);
        const performance = row ? row.performance : 0;
        return `<article class="condition-scorecard"><div class="condition-scorecard-head"><strong>${escapeHtml(condition)}</strong><span>${row ? `${row.matches} partidos` : "Sin partidos"}</span></div><div class="condition-bar"><span style="width:${Math.max(0, Math.min(100, performance))}%"></span></div><div class="condition-record">${row ? `${row.wins}-${row.draws}-${row.losses} · ${fmtPct(performance)} · GF ${row.gf} / GC ${row.gc}` : "Sin datos"}</div></article>`;
      }).join("")}
    </div>
    <div class="chart-grid">
      <div class="panel-card"><div id="condition-donut-chart" class="plot"></div></div>
      <div class="panel-card"><div id="condition-results-chart" class="plot"></div></div>
      <div class="panel-card"><div id="condition-performance-chart" class="plot"></div></div>
      <div class="panel-card"><div id="condition-goals-chart" class="plot"></div></div>
    </div>
    ${dataDisclosure("Tabla por condición", tableHtml, rows.length)} `;
  plotDonut("condition-donut-chart", rows.map(r => ({ label: r.condition, count: r.matches })), "label", "count", "Distribución por condición");
  plotStackedResults("condition-results-chart", rows, "condition", "Resultados por condición");
  plotHorizontal("condition-performance-chart", rows.map(r => ({ label:r.condition, performance:Math.round(r.performance*10)/10 })), "label", "performance", "Rendimiento por condición (%)", "#2563eb");
  Plotly.relayout("condition-performance-chart", { "xaxis.range": [0, 100], "xaxis.ticksuffix": "%" });
  plotGrouped("condition-goals-chart", rows.map(r=>r.condition), [
    { name:"GF", values:rows.map(r=>r.gf), color:"#2563eb" },
    { name:"GC", values:rows.map(r=>r.gc), color:"#b22222" }
  ], "Goles a favor y en contra");
}

function stadiumRows(matches) {
  return summaryRows(matches, m => m.stadium_alias || m.stadium, "label").map(row => {
    const first = row.items[0];
    return { ...row, fullName:first.stadium, latitude: first.latitude, longitude: first.longitude, city: first.stadium_city, country: first.stadium_country };
  }).sort((a, b) => b.matches - a.matches || a.label.localeCompare(b.label, "es"));
}

function renderStadiums() {
  const root = $("#tab-stadiums");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const rows = stadiumRows(state.filtered);
  if (!rows.some(r => r.label === state.selectedStadium)) state.selectedStadium = rows[0].label;
  const selected = rows.find(r => r.label === state.selectedStadium);
  const countries = new Set(rows.map(r => r.country).filter(Boolean));
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Estadios", fmtInt(rows.length))}
      ${metricCard("Ciudades", fmtInt(new Set(rows.map(r => r.city).filter(Boolean)).size))}
      ${metricCard("Países", fmtInt(countries.size))}
      ${metricCard("Más visitado", `${rows[0].label} · ${rows[0].matches}`)}
    </div>
    ${sectionHeading("Ficha de estadio")}
    <div class="control-row"><div class="control-group grow"><label for="stadium-detail">Estadio</label><select id="stadium-detail">${rows.map(r => optionHtml(r.label, `${r.label} · ${r.matches} partidos`)).join("")}</select></div></div>
    <div class="detail-card">
      <h2 class="detail-title">${escapeHtml(selected.label)}</h2>
      <p class="detail-subtitle">${escapeHtml([selected.city, selected.country].filter(Boolean).join(" · ") || "Ubicación sin datos")}</p>
      <div class="detail-grid">
        ${detailField("Nombre oficial", selected.fullName || selected.label)}
        ${detailField("Partidos", selected.matches)}
        ${detailField("G-E-P", `${selected.wins}-${selected.draws}-${selected.losses}`)}
        ${detailField("Rendimiento", fmtPct(selected.performance))}
        ${detailField("GF / GC", `${selected.gf} / ${selected.gc}`)}
      </div>
    </div>
    <div class="chart-grid">
      <div class="panel-card"><div id="stadium-ranking-chart" class="plot tall"></div></div>
      <div class="panel-card"><div id="stadium-map-chart" class="plot tall"></div></div>
    </div>
    ${dataDisclosure("Tabla de estadios", `<div class="table-wrap"><table><thead><tr><th>Estadio</th><th>Nombre oficial</th><th>Ciudad</th><th>País</th><th>Partidos</th><th>G-E-P</th><th>GF</th><th>GC</th><th>Rendimiento</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.fullName || r.label)}</td><td>${escapeHtml(r.city || "")}</td><td>${escapeHtml(r.country || "")}</td><td>${r.matches}</td><td>${r.wins}-${r.draws}-${r.losses}</td><td>${r.gf}</td><td>${r.gc}</td><td>${fmtPct(r.performance)}</td></tr>`).join("")}</tbody></table></div>`, rows.length)} `;
  const select = $("#stadium-detail");
  select.value = state.selectedStadium;
  select.addEventListener("change", () => { state.selectedStadium = select.value; renderStadiums(); });
  plotHorizontal("stadium-ranking-chart", rows.slice(0, 15), "label", "matches", "Estadios más visitados");
  plotStadiumMap("stadium-map-chart", rows);
}

function renderRivals() {
  const root = $("#tab-rivals");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const rows = summaryRows(state.filtered, m => m.rival, "rival").sort((a, b) => b.matches - a.matches || a.rival.localeCompare(b.rival, "es"));
  if (!rows.some(r => r.rival === state.selectedRival)) state.selectedRival = rows[0].rival;
  const selected = rows.find(r => r.rival === state.selectedRival);
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Rivales", fmtInt(rows.length))}
      ${metricCard("Más repetido", `${rows[0].rival} · ${rows[0].matches}`)}
      ${metricCard("Más triunfos", (() => { const r = [...rows].sort((a,b) => b.wins-a.wins)[0]; return `${r.rival} · ${r.wins}`; })())}
      ${metricCard("Más goles UCH", (() => { const r = [...rows].sort((a,b) => b.gf-a.gf)[0]; return `${r.rival} · ${r.gf}`; })())}
    </div>
    ${sectionHeading("Ficha de rival")}
    <div class="control-row"><div class="control-group grow"><label for="rival-detail">Rival</label><select id="rival-detail">${rows.map(r => optionHtml(r.rival, `${r.rival} · ${r.matches} partidos`)).join("")}</select></div></div>
    <div class="detail-card">
      <h2 class="detail-title">${escapeHtml(selected.rival)}</h2>
      <p class="detail-subtitle">Historial de partidos presenciados contra este rival.</p>
      <div class="detail-grid">
        ${detailField("Partidos", selected.matches)}
        ${detailField("G-E-P", `${selected.wins}-${selected.draws}-${selected.losses}`)}
        ${detailField("Rendimiento", fmtPct(selected.performance))}
        ${detailField("GF / GC", `${selected.gf} / ${selected.gc}`)}
      </div>
    </div>
    <div class="chart-grid">
      <div class="panel-card"><div id="rival-ranking-chart" class="plot tall"></div></div>
      <div class="panel-card"><div id="rival-results-chart" class="plot tall"></div></div>
    </div>
    <div class="panel-card"><div id="rival-goals-chart" class="plot"></div></div>
    ${dataDisclosure("Tabla de rivales", `<div class="table-wrap"><table><thead><tr><th>Rival</th><th>Partidos</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Rendimiento</th><th>Estadios</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.rival)}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gf}</td><td>${r.gc}</td><td>${fmtPct(r.performance)}</td><td>${r.stadiums}</td></tr>`).join("")}</tbody></table></div>`, rows.length)} `;
  const select = $("#rival-detail");
  select.value = state.selectedRival;
  select.addEventListener("change", () => { state.selectedRival = select.value; renderRivals(); });
  const top = rows.slice(0, 15);
  plotHorizontal("rival-ranking-chart", top.map(r => ({ label: r.rival, matches: r.matches })), "label", "matches", "Rivales más repetidos", "#1e3a8a");
  plotStackedResults("rival-results-chart", top, "rival", "Resultados por rival");
  plotGrouped("rival-goals-chart", top.map(r => r.rival), [
    { name: "GF", values: top.map(r => r.gf), color: "#2563eb" },
    { name: "GC", values: top.map(r => r.gc), color: "#b22222" }
  ], "Goles a favor y en contra por rival");
}

function renderGoals() {
  const root = $("#tab-goals");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const goals = flatGoals(state.filtered);
  const scorers = topCount(goals, g => g.player).map(r => ({ player: r.label, goals: r.count, items: r.items }));
  if (!scorers.some(r => r.player === state.selectedScorer)) state.selectedScorer = scorers[0]?.player || null;
  const selected = scorers.find(r => r.player === state.selectedScorer);
  const matchesWithGoals = state.filtered.filter(m => Number(m.goals_uch || 0) > 0).length;
  const goalCountRows = topCount(state.filtered, m => String(m.goals_uch ?? 0)).map(r => ({ goals: Number(r.label), matches: r.count })).sort((a,b) => a.goals-b.goals);
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Goles UCH", fmtInt(state.filtered.reduce((s,m) => s + Number(m.goals_uch || 0),0)))}
      ${metricCard("Goles con detalle", fmtInt(goals.length))}
      ${metricCard("Goleadores", fmtInt(scorers.length))}
      ${metricCard("Partidos anotando", fmtInt(matchesWithGoals))}
    </div>
    ${scorers.length ? `
      ${sectionHeading("Ficha de goleador")}
      <div class="control-row"><div class="control-group grow"><label for="scorer-detail">Goleador</label><select id="scorer-detail">${scorers.map(r => optionHtml(r.player, `${r.player} · ${r.goals} goles`)).join("")}</select></div></div>
      <div class="detail-card">
        <h2 class="detail-title">${escapeHtml(selected.player)}</h2>
        <p class="detail-subtitle">Goles registrados en los partidos visibles.</p>
        <div class="detail-grid">
          ${detailField("Goles", selected.goals)}
          ${detailField("Partidos anotando", new Set(selected.items.map(g => g.match_id)).size)}
          ${detailField("Rivales", new Set(selected.items.map(g => g.rival)).size)}
          ${detailField("Estadios", new Set(selected.items.map(g => g.stadium)).size)}
        </div>
      </div>` : ""}
    <div class="chart-grid">
      <div class="panel-card"><div id="scorer-ranking-chart" class="plot tall"></div></div>
      <div class="panel-card"><div id="goals-per-match-chart" class="plot tall"></div></div>
    </div>
    ${dataDisclosure("Detalle de goles", `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Goleador</th><th>Rival</th><th>Resultado</th><th>Torneo</th><th>Estadio</th><th>Detalle</th></tr></thead><tbody>${[...goals].sort((a,b) => b.date.localeCompare(a.date)).map(g => `<tr><td>${fmtDate(g.date)}</td><td>${escapeHtml(g.player)}</td><td>${escapeHtml(g.rival)}</td><td>${escapeHtml(g.score || "S/M")}</td><td>${escapeHtml(g.competition)}</td><td>${escapeHtml(g.stadium_alias || g.stadium)}</td><td>${g.penalty ? "Penal" : ""}${g.own_goal ? "Autogol" : ""}${!g.penalty && !g.own_goal ? "—" : ""}</td></tr>`).join("")}</tbody></table></div>`, goals.length)} `;
  if (scorers.length) {
    const select = $("#scorer-detail");
    select.value = state.selectedScorer;
    select.addEventListener("change", () => { state.selectedScorer = select.value; renderGoals(); });
  }
  plotHorizontal("scorer-ranking-chart", scorers.slice(0, 20).map(r => ({ label: r.player, goals: r.goals })), "label", "goals", "Goleadores vistos");
  plotVertical("goals-per-match-chart", goalCountRows, "goals", "matches", "Goles UCH por partido", "#1e3a8a");
}

function renderCoaches() {
  const root = $("#tab-coaches");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const rows = summaryRows(state.filtered, m => m.coach?.display || "Sin DT", "coach").sort((a,b) => b.matches-a.matches || a.coach.localeCompare(b.coach,"es"));
  if (!rows.some(r => r.coach === state.selectedCoach)) state.selectedCoach = rows[0].coach;
  const selected = rows.find(r => r.coach === state.selectedCoach);
  const best = [...rows].filter(r => r.played).sort((a,b) => b.performance-a.performance || b.matches-a.matches)[0];
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Entrenadores", fmtInt(rows.length))}
      ${metricCard("Partidos con DT", fmtInt(rows.reduce((s,r) => s+r.matches,0)))}
      ${metricCard("Más partidos", `${rows[0].coach} · ${rows[0].matches}`)}
      ${metricCard("Mejor rendimiento", best ? `${best.coach} · ${fmtPct(best.performance)}` : "Sin datos")}
    </div>
    ${sectionHeading("Ficha de entrenador")}
    <div class="control-row"><div class="control-group grow"><label for="coach-detail">Entrenador</label><select id="coach-detail">${rows.map(r => optionHtml(r.coach, `${r.coach} · ${r.matches} partidos`)).join("")}</select></div></div>
    <div class="detail-card">
      <h2 class="detail-title">${escapeHtml(selected.coach)}</h2>
      <p class="detail-subtitle">Partidos presenciados bajo su dirección o presencia en banca.</p>
      <div class="detail-grid">
        ${detailField("Partidos", selected.matches)}
        ${detailField("G-E-P", `${selected.wins}-${selected.draws}-${selected.losses}`)}
        ${detailField("Rendimiento", fmtPct(selected.performance))}
        ${detailField("GF / GC", `${selected.gf} / ${selected.gc}`)}
      </div>
    </div>
    <div class="chart-grid">
      <div class="panel-card"><div id="coach-ranking-chart" class="plot tall"></div></div>
      <div class="panel-card"><div id="coach-results-chart" class="plot tall"></div></div>
    </div>
    <div class="panel-card"><div id="coach-goals-chart" class="plot"></div></div>
    ${dataDisclosure("Tabla de entrenadores", `<div class="table-wrap"><table><thead><tr><th>Entrenador</th><th>Partidos</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Rendimiento</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.coach)}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gf}</td><td>${r.gc}</td><td>${fmtPct(r.performance)}</td></tr>`).join("")}</tbody></table></div>`, rows.length)} `;
  const select = $("#coach-detail");
  select.value = state.selectedCoach;
  select.addEventListener("change", () => { state.selectedCoach = select.value; renderCoaches(); });
  const top = rows.slice(0, 15);
  plotHorizontal("coach-ranking-chart", top.map(r => ({ label: r.coach, matches: r.matches })), "label", "matches", "Partidos por entrenador");
  plotStackedResults("coach-results-chart", top, "coach", "Resultados por entrenador");
  plotGrouped("coach-goals-chart", top.map(r => r.coach), [
    { name: "GF", values: top.map(r => r.gf), color: "#2563eb" },
    { name: "GC", values: top.map(r => r.gc), color: "#b22222" }
  ], "Goles a favor y en contra por entrenador");
}

function matchesTable(matches, other = false) {
  return `<div class="table-wrap compact-table"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Resultado</th>${other ? "" : "<th>Condición</th><th>DT</th>"}<th>Torneo</th><th>Estadio</th><th></th></tr></thead><tbody>
    ${matches.map(m => `<tr><td>${fmtDate(m.date)}</td><td>${escapeHtml(matchTitle(m, other))}</td><td><span class="chip ${resultClass(m.result)}">${escapeHtml(m.result)}</span></td>${other ? "" : `<td>${escapeHtml(m.condition)}</td><td>${escapeHtml(m.coach?.display || "Sin DT")}</td>`}<td>${escapeHtml(m.competition)}</td><td title="${escapeHtml(m.stadium)}">${escapeHtml(m.stadium_alias || m.stadium)}</td><td><button class="table-link" data-match-id="${m.id}" data-other="${other ? "1" : "0"}" type="button">Ver</button></td></tr>`).join("")}
  </tbody></table></div>`;
}

function renderMatches() {
  const root = $("#tab-matches");
  if (!state.filtered.length) { root.innerHTML = ""; return; }
  const query = state.matchSearch.trim().toLocaleLowerCase("es");
  const matches = [...state.filtered].sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id).filter(m => {
    if (!query) return true;
    return [m.date, m.home, m.away, m.rival, m.score, m.result, m.condition, m.competition, m.stadium, m.stadium_alias, m.coach?.display, ...(m.goals || []).map(g => g.player)]
      .join(" ").toLocaleLowerCase("es").includes(query);
  });
  const pageData = paginate(matches, state.matchPage, state.matchPageSize);
  state.matchPage = pageData.page;
  root.innerHTML = `
    <div class="control-row">
      <div class="control-group grow"><label for="match-search">Buscar partido</label><input id="match-search" type="search" placeholder="Rival, torneo, estadio, marcador o goleador" value="${escapeHtml(state.matchSearch)}"></div>
      <div class="control-group"><label>Vista</label><div class="segmented"><button type="button" data-view="cards" class="${state.matchView === "cards" ? "active" : ""}">Tarjetas</button><button type="button" data-view="table" class="${state.matchView === "table" ? "active" : ""}">Tabla</button></div></div>
    </div>
    ${sectionHeading("Partidos", `${fmtInt(matches.length)} resultados`)}
    ${paginationControls("matches", pageData, matches.length, state.matchPageSize)}
    ${state.matchView === "cards" ? `<div class="match-grid">${pageData.items.map(m => matchCard(m)).join("")}</div>` : matchesTable(pageData.items)}
    ${matches.length > state.matchPageSize ? paginationControls("matches-bottom", pageData, matches.length, state.matchPageSize) : ""}`;
  const search = $("#match-search");
  search.addEventListener("input", () => {
    state.matchSearch = search.value; state.matchPage = 1;
    window.clearTimeout(search._timer);
    search._timer = window.setTimeout(renderMatches, 160);
  });
  $$('[data-view]', root).forEach(button => button.addEventListener("click", () => { state.matchView = button.dataset.view; state.matchPage = 1; renderMatches(); }));
  const bindPager = prefix => {
    const size = $(`#${prefix}-page-size`);
    if (size) size.addEventListener("change", () => { state.matchPageSize = Number(size.value); state.matchPage = 1; renderMatches(); });
    const prev = $(`#${prefix}-prev`);
    const next = $(`#${prefix}-next`);
    if (prev) prev.addEventListener("click", () => { state.matchPage -= 1; renderMatches(); window.scrollTo({top:0,behavior:"smooth"}); });
    if (next) next.addEventListener("click", () => { state.matchPage += 1; renderMatches(); window.scrollTo({top:0,behavior:"smooth"}); });
  };
  bindPager("matches"); bindPager("matches-bottom");
  bindMatchLinks(root);
}

function currentOtherMatches() {
  const f = currentFilterValues();
  return state.data.other_matches.filter(match => match.date >= f.dateFrom && match.date <= f.dateTo && match.year >= f.yearFrom && match.year <= f.yearTo
    && (!f.stadium || match.stadium === f.stadium)
    && (!f.competition || match.competition === f.competition));
}

function renderOther() {
  const root = $("#tab-other");
  const query = state.otherSearch.trim().toLocaleLowerCase("es");
  const all = currentOtherMatches();
  const matches = [...all].sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id).filter(m => !query || [m.date,m.home,m.away,m.score,m.competition,m.stadium,m.stadium_alias,m.result].join(" ").toLocaleLowerCase("es").includes(query));
  if (!all.length) {
    root.innerHTML = `<div class="empty-state"><strong>No hay otros partidos en este rango.</strong><span>Estos partidos solo usan los filtros de fechas, años, estadio y torneo.</span></div>`;
    return;
  }
  const teams = topCount(all.flatMap(m => [{ team:m.home }, { team:m.away }]), x => x.team);
  const tournaments = topCount(all, m => m.competition);
  const stadiums = topCount(all, m => m.stadium_alias || m.stadium);
  const mapRows = Array.from(groupBy(all, m => m.stadium_alias || m.stadium), ([label, items]) => {
    const first = items.find(m => m.latitude !== null && m.longitude !== null) || items[0];
    return { label, matches: items.length, wins: 0, draws: 0, losses: 0, latitude:first.latitude, longitude:first.longitude, city:first.stadium_city, country:first.stadium_country };
  });
  const pageData = paginate(matches, state.otherPage, state.otherPageSize);
  state.otherPage = pageData.page;
  root.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Otros partidos", fmtInt(all.length))}
      ${metricCard("Equipo más visto", `${teams[0]?.label || "Sin datos"} · ${teams[0]?.count || 0}`)}
      ${metricCard("Estadios", fmtInt(new Set(all.map(m => m.stadium_alias || m.stadium)).size))}
      ${metricCard("Torneo más visto", `${tournaments[0]?.label || "Sin datos"} · ${tournaments[0]?.count || 0}`)}
    </div>
    <div class="control-row"><div class="control-group grow"><label for="other-search">Buscar otro partido</label><input id="other-search" type="search" placeholder="Equipo, torneo, estadio o marcador" value="${escapeHtml(state.otherSearch)}"></div></div>
    <div class="chart-grid">
      <div class="panel-card"><div id="other-tournament-chart" class="plot"></div></div>
      <div class="panel-card"><div id="other-team-chart" class="plot"></div></div>
      <div class="panel-card"><div id="other-stadium-chart" class="plot tall"></div></div>
      <div class="panel-card"><div id="other-map-chart" class="plot tall"></div></div>
    </div>
    ${sectionHeading("Otros partidos", `${fmtInt(matches.length)} resultados`)}
    ${paginationControls("other", pageData, matches.length, state.otherPageSize)}
    ${matchesTable(pageData.items, true)}
    ${matches.length > state.otherPageSize ? paginationControls("other-bottom", pageData, matches.length, state.otherPageSize) : ""}`;
  const search = $("#other-search");
  search.addEventListener("input", () => {
    state.otherSearch = search.value; state.otherPage = 1;
    window.clearTimeout(search._timer);
    search._timer = window.setTimeout(renderOther, 160);
  });
  const bindPager = prefix => {
    const size = $(`#${prefix}-page-size`);
    if (size) size.addEventListener("change", () => { state.otherPageSize = Number(size.value); state.otherPage = 1; renderOther(); });
    const prev = $(`#${prefix}-prev`); const next = $(`#${prefix}-next`);
    if (prev) prev.addEventListener("click", () => { state.otherPage -= 1; renderOther(); window.scrollTo({top:0,behavior:"smooth"}); });
    if (next) next.addEventListener("click", () => { state.otherPage += 1; renderOther(); window.scrollTo({top:0,behavior:"smooth"}); });
  };
  bindPager("other"); bindPager("other-bottom");
  bindMatchLinks(root);
  plotHorizontal("other-tournament-chart", tournaments.slice(0,12).map(r => ({label:r.label,count:r.count})), "label", "count", "Torneos vistos", "#1e3a8a");
  plotHorizontal("other-team-chart", teams.slice(0,12).map(r => ({label:r.label,count:r.count})), "label", "count", "Equipos más vistos");
  plotHorizontal("other-stadium-chart", stadiums.slice(0,12).map(r => ({label:r.label,count:r.count})), "label", "count", "Estadios otros", "#334155");
  plotStadiumMap("other-map-chart", mapRows, "Mapa de otros partidos");
}

const renderers = {
  summary: renderSummary,
  years: renderYears,
  conditions: renderConditions,
  stadiums: renderStadiums,
  rivals: renderRivals,
  goals: renderGoals,
  coaches: renderCoaches,
  matches: renderMatches,
  other: renderOther
};

function renderActiveTab() {
  const render = renderers[state.activeTab];
  if (render) render();
}

async function initialize() {
  setupTabs();
  setupMobileSidebar();
  setupDialog();
  try {
    const response = await fetch("data/public_data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    const updated = new Date(state.data.generated_at);
    $("#updated-at").textContent = Number.isNaN(updated.getTime()) ? state.data.generated_at : new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(updated);
    setupFilters();
    applyFilters();
  } catch (error) {
    console.error(error);
    $("#loading-screen").innerHTML = `<div><strong>No se pudo cargar el archivo público.</strong><span>Abre la página mediante un servidor local o GitHub Pages; no abras index.html directamente.</span></div>`;
    return;
  }
  $("#loading-screen").classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", initialize);
