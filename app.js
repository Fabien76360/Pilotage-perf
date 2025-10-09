const STORAGE_KEY = 'prs_next_state_v1';
export const SCHEMA_VERSION = 1;

const defaultTaxonomy = [
  { categorie: 'Technique', cause: 'Capteur', sous_cause: 'PhotoCell' },
  { categorie: 'Organisation', cause: 'Changement format', sous_cause: 'Réglage outillage' },
  { categorie: 'Qualité', cause: 'Contrôle', sous_cause: 'Tolérance' }
];

function createDemoState() {
  const sessionId = crypto.randomUUID();
  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  return {
    schema_version: SCHEMA_VERSION,
    site: 'NDB',
    sessions: [
      {
        session_id: sessionId,
        date,
        ligne: 'L16',
        po: 'PO123',
        produit: 'REF',
        equipe: 'Jour',
        shift: 'A',
        debut: '06:00',
        fin: '14:00',
        objectif_h: 220,
        cadence_cible: 220
      }
    ],
    production_log: Array.from({ length: 8 }).map((_, idx) => {
      const hour = String(6 + idx).padStart(2, '0');
      return {
        session_id: sessionId,
        ts: `${date}T${hour}:00`,
        ok: idx < 7 ? 200 : 100,
        ko: idx === 4 ? 15 : 5,
        cadence_reelle: 200,
        objectif_h: 220,
        comment: ''
      };
    }),
    stops: [
      {
        session_id: sessionId,
        start: `${date}T08:40`,
        end: `${date}T09:00`,
        duree_s: 1200,
        categorie: 'Technique',
        cause: 'Capteur',
        sous_cause: 'PhotoCell',
        criticite: 'Majeur',
        comment: 'Blocage étuis'
      },
      {
        session_id: sessionId,
        start: `${date}T11:10`,
        end: `${date}T11:20`,
        duree_s: 600,
        categorie: 'Organisation',
        cause: 'Changement format',
        sous_cause: 'Réglage outillage',
        criticite: 'Mineur',
        comment: 'Réglage équipe'
      }
    ],
    quality: [
      { session_id: sessionId, ts: `${date}T11:15`, nb_rebuts: 50, code_defaut: 'Écrasé', poste: 'Encartonneuse' }
    ],
    targets: [
      { ligne: 'L16', produit: 'REF', cadence_cible: 220, objectif_h: 220, seuil_perf: 0.85, seuil_rejet: 0.02 }
    ],
    taxonomy: defaultTaxonomy,
    users: [
      { user_id: 'op1', nom: 'Op A', role: 'Opérateur' }
    ],
    active_stop: null
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = createDemoState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    return JSON.parse(JSON.stringify(demo));
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schema_version !== SCHEMA_VERSION) {
      return migrateState(parsed);
    }
    return parsed;
  } catch (error) {
    console.error('Erreur chargement state', error);
    const demo = createDemoState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    return JSON.parse(JSON.stringify(demo));
  }
}

export function saveState(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function migrateState(raw) {
  const migrated = { ...createDemoState(), ...raw };
  migrated.schema_version = SCHEMA_VERSION;
  saveState(migrated);
  return migrated;
}

export function newSession(meta) {
  const session = {
    session_id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    ligne: meta.ligne || '',
    po: meta.po || '',
    produit: meta.produit || '',
    equipe: meta.equipe || '',
    shift: meta.shift || '',
    debut: meta.debut || '06:00',
    fin: meta.fin || '14:00',
    objectif_h: Number(meta.objectif_h) || 0,
    cadence_cible: Number(meta.cadence_cible) || 0
  };
  state.sessions.push(session);
  const hours = buildHourSlots(session.debut, session.fin, session.date);
  hours.forEach((ts) => {
    state.production_log.push({
      session_id: session.session_id,
      ts,
      ok: 0,
      ko: 0,
      cadence_reelle: 0,
      objectif_h: session.objectif_h,
      comment: ''
    });
  });
  saveState(state);
  return session;
}

function buildHourSlots(start, end, date) {
  const result = [];
  const sessionDate = date || new Date().toISOString().slice(0, 10);
  const [startH] = start.split(':').map(Number);
  const [endH] = end.split(':').map(Number);
  for (let h = startH; h < endH; h += 1) {
    result.push(`${sessionDate}T${String(h).padStart(2, '0')}:00`);
  }
  return result;
}

export function incrementOK(ts, delta) {
  updateProduction(ts, { field: 'ok', delta });
}

export function incrementKO(ts, delta) {
  updateProduction(ts, { field: 'ko', delta });
}

export function setObjectifHoraire(value, sessionId) {
  const session = state.sessions.find((s) => s.session_id === sessionId);
  if (session) {
    session.objectif_h = Number(value) || 0;
    state.production_log
      .filter((row) => row.session_id === sessionId)
      .forEach((row) => {
        row.objectif_h = session.objectif_h;
      });
    saveState(state);
    renderProductionTable();
  }
}

function updateProduction(ts, { field, delta }) {
  const row = state.production_log.find((r) => r.ts === ts && r.session_id === currentSessionId);
  if (!row) return;
  row[field] = Math.max(0, (row[field] || 0) + delta);
  const session = state.sessions.find((s) => s.session_id === currentSessionId);
  if (session) {
    const hours = Math.max(1, state.production_log.filter((r) => r.session_id === currentSessionId).length);
    const totalOk = totalForSession(currentSessionId, 'ok');
    row.cadence_reelle = session && session.fin && session.debut
      ? totalOk / hours
      : row.ok;
  }
  saveState(state);
  renderProductionTable();
  renderJournal();
  renderAnalysis();
}

export function startStopEvent(meta) {
  if (state.active_stop) return;
  state.active_stop = {
    ...meta,
    start: new Date().toISOString(),
    session_id: currentSessionId
  };
  saveState(state);
  runStopTimer();
}

export function stopCurrentEvent(extra = {}) {
  if (!state.active_stop) return;
  const end = new Date();
  const start = new Date(state.active_stop.start);
  const duree_s = Math.max(1, Math.round((end - start) / 1000));
  const record = {
    session_id: state.active_stop.session_id,
    start: state.active_stop.start,
    end: end.toISOString(),
    duree_s,
    categorie: extra.categorie || state.active_stop.categorie,
    cause: extra.cause || state.active_stop.cause,
    sous_cause: extra.sous_cause || state.active_stop.sous_cause,
    criticite: extra.criticite || state.active_stop.criticite || 'Mineur',
    comment: extra.comment || state.active_stop.comment || ''
  };
  addStop(record);
  state.active_stop = null;
  saveState(state);
  stopStopTimer();
}

export function addStop(record) {
  state.stops.push({ ...record });
  saveState(state);
  renderStopsTable();
  renderJournal();
  renderAnalysis();
}

export function computeKPI(sessionId) {
  const session = state.sessions.find((s) => s.session_id === sessionId);
  if (!session) return null;
  const prodRows = state.production_log.filter((row) => row.session_id === sessionId);
  const stops = state.stops.filter((stop) => stop.session_id === sessionId);
  const totalOk = prodRows.reduce((sum, row) => sum + Number(row.ok || 0), 0);
  const totalKo = prodRows.reduce((sum, row) => sum + Number(row.ko || 0), 0);
  const start = toISO(session.date, session.debut);
  const end = toISO(session.date, session.fin);
  const planMs = new Date(end) - new Date(start);
  const stopsMs = stops.reduce((sum, stop) => sum + (Number(stop.duree_s) || 0) * 1000, 0);
  const runningMs = Math.max(0, planMs - stopsMs);
  const runningHours = runningMs / (1000 * 60 * 60);
  const plannedHours = planMs / (1000 * 60 * 60);
  const prodTheorique = (session.cadence_cible || 0) * runningHours;
  const disponibilite = plannedHours ? runningMs / planMs : 0;
  const performance = prodTheorique ? totalOk / prodTheorique : 0;
  const qualite = totalOk + totalKo ? totalOk / (totalOk + totalKo) : 1;
  const trs = disponibilite * performance * qualite;
  const tauxRejet = totalOk + totalKo ? totalKo / (totalOk + totalKo) : 0;
  const cadenceVs = session.cadence_cible && runningHours > 0 ? (totalOk / runningHours) / session.cadence_cible : 0;
  const nbPannes = stops.length;
  const mtbf = nbPannes ? runningMs / nbPannes / 60000 : runningMs / 60000;
  const mttr = nbPannes ? (stopsMs / nbPannes) / 60000 : 0;
  return {
    disponibilite,
    performance,
    qualite,
    trs,
    tauxRejet,
    cadenceVs,
    mtbf,
    mttr,
    totalOk,
    totalKo,
    runningHours,
    plannedHours,
    stopsMs,
    session
  };
}

export function buildParetoStops(sessionId) {
  const stops = state.stops.filter((stop) => stop.session_id === sessionId);
  const map = new Map();
  stops.forEach((stop) => {
    const key = `${stop.categorie} › ${stop.cause}`;
    map.set(key, (map.get(key) || 0) + Number(stop.duree_s || 0));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

export function buildCumulOkVsTarget(sessionId) {
  const rows = state.production_log
    .filter((row) => row.session_id === sessionId)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let cumulOk = 0;
  let cumulTarget = 0;
  return rows.map((row) => {
    const durationHours = 1;
    cumulOk += Number(row.ok || 0);
    cumulTarget += Number(row.objectif_h || 0) * durationHours;
    return {
      label: new Date(row.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      ok: cumulOk,
      target: cumulTarget
    };
  });
}

export function topLosses(sessionId, n = 3) {
  const pareto = buildParetoStops(sessionId);
  return pareto.slice(0, n);
}

export function generateInsights(sessionId) {
  const pareto = buildParetoStops(sessionId);
  const total = pareto.reduce((sum, item) => sum + item.value, 0);
  const firstTwo = pareto.slice(0, 2).reduce((sum, item) => sum + item.value, 0);
  const insights = [];
  if (total > 0 && firstTwo / total >= 0.8) {
    insights.push(`80 % des pertes proviennent de ${pareto.slice(0, 2).map((p) => p.label).join(' & ')}`);
  }
  const kpi = computeKPI(sessionId);
  if (kpi && kpi.performance < 0.9) {
    insights.push('Performance en dessous de 90 %, vérifier les réglages machine.');
  }
  if (kpi && kpi.tauxRejet > (getTargetForSession(sessionId)?.seuil_rejet || 0.02)) {
    insights.push('Taux de rejet supérieur au seuil. Renforcer les contrôles qualité.');
  }
  if (insights.length === 0) {
    insights.push('Aucune alerte majeure, poursuivre la surveillance.');
  }
  return insights;
}

export function exportCSVProduction(sessionId) {
  const rows = state.production_log.filter((row) => row.session_id === sessionId);
  const header = 'session_id,ts,ok,ko,cadence_reelle,objectif_h,comment';
  const body = rows
    .map((row) => [row.session_id, row.ts, row.ok, row.ko, row.cadence_reelle, row.objectif_h, wrap(row.comment)].join(','))
    .join('\n');
  downloadFile(`${header}\n${body}`, 'production_log.csv', 'text/csv;charset=utf-8;');
}

export function exportCSVStops(sessionId) {
  const rows = state.stops.filter((row) => row.session_id === sessionId);
  const header = 'session_id,start,end,duree_s,categorie,cause,sous_cause,criticite,comment';
  const body = rows
    .map((row) => [
      row.session_id,
      row.start,
      row.end,
      row.duree_s,
      row.categorie,
      row.cause,
      row.sous_cause,
      row.criticite,
      wrap(row.comment)
    ].join(','))
    .join('\n');
  downloadFile(`${header}\n${body}`, 'stops.csv', 'text/csv;charset=utf-8;');
}

export function exportOnePageReport(sessionId) {
  const dialog = document.getElementById('report-dialog');
  const container = document.getElementById('report-content');
  const kpi = computeKPI(sessionId);
  if (!kpi) return;
  const session = kpi.session;
  container.innerHTML = `
    <h3>${session.date} - Ligne ${session.ligne} - PO ${session.po}</h3>
    <p>Équipe ${session.equipe} (${session.debut} → ${session.fin})</p>
    <div class="kpi-grid">
      <article class="kpi-card"><h4>TRS</h4><p class="kpi-value">${formatPercent(kpi.trs)}</p></article>
      <article class="kpi-card"><h4>Taux de rejet</h4><p class="kpi-value">${formatPercent(kpi.tauxRejet)}</p></article>
      <article class="kpi-card"><h4>Cadence vs cible</h4><p class="kpi-value">${formatPercent(kpi.cadenceVs)}</p></article>
    </div>
    <section>
      <h4>Pareto Arrêts</h4>
      <ol>${buildParetoStops(sessionId).map((item) => `<li>${item.label} - ${formatDuration(item.value * 1000)}</li>`).join('')}</ol>
    </section>
    <section>
      <h4>Top 3 pertes</h4>
      <ol>${topLosses(sessionId).map((item) => `<li>${item.label} - ${formatDuration(item.value * 1000)}</li>`).join('')}</ol>
    </section>
    <section>
      <h4>Insights</h4>
      <ul>${generateInsights(sessionId).map((txt) => `<li>${txt}</li>`).join('')}</ul>
    </section>
  `;
  dialog.showModal();
}

export function importJSONState(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    data.schema_version = SCHEMA_VERSION;
    state = data;
    saveState(state);
    hydrateUI();
    toast('Import JSON effectué');
  } catch (error) {
    toast('Erreur import JSON', 'danger');
  }
}

export function importCSV(type, file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const rows = text.trim().split(/\r?\n/);
    const [header, ...lines] = rows;
    const cols = header.split(',');
    lines.forEach((line) => {
      if (!line.trim()) return;
      const values = parseCSVLine(line);
      const record = Object.fromEntries(cols.map((col, idx) => [col, values[idx]]));
      if (type === 'production') {
        record.ok = Number(record.ok || 0);
        record.ko = Number(record.ko || 0);
        record.cadence_reelle = Number(record.cadence_reelle || 0);
        record.objectif_h = Number(record.objectif_h || 0);
        mergeRecord(state.production_log, record, ['session_id', 'ts']);
      } else if (type === 'stops') {
        record.duree_s = Number(record.duree_s || 0);
        mergeRecord(state.stops, record, ['session_id', 'start']);
      }
    });
    saveState(state);
    hydrateUI();
    toast('Import CSV réussi');
  };
  reader.readAsText(file);
}

export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  }
  return `${minutes}m${String(seconds).padStart(2, '0')}`;
}

export function toISO(date, time) {
  return `${date}T${time}`;
}

export function parseTime(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function wrap(value = '') {
  if (!value) return '';
  if (value.includes(',')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function mergeRecord(list, record, keys) {
  const found = list.find((item) => keys.every((key) => item[key] === record[key]));
  if (found) {
    Object.assign(found, record);
  } else {
    list.push(record);
  }
}

function totalForSession(sessionId, field) {
  return state.production_log
    .filter((row) => row.session_id === sessionId)
    .reduce((sum, row) => sum + Number(row[field] || 0), 0);
}

function getTargetForSession(sessionId) {
  const session = state.sessions.find((s) => s.session_id === sessionId);
  if (!session) return null;
  return state.targets.find((t) => t.ligne === session.ligne && t.produit === session.produit) || null;
}

function toast(message, variant = 'info') {
  const container = document.querySelector('.toast-container');
  const div = document.createElement('div');
  div.className = `toast toast-${variant}`;
  div.textContent = message;
  container.appendChild(div);
  setTimeout(() => {
    div.remove();
  }, 3500);
}

function renderSessionSelector() {
  const selector = document.getElementById('session-selector');
  const analysisSelector = document.getElementById('analysis-session');
  const sessions = [...state.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  selector.innerHTML = '';
  analysisSelector.innerHTML = '';
  sessions.forEach((session) => {
    const label = `${session.date} • ${session.ligne} • ${session.po}`;
    const option = new Option(label, session.session_id);
    selector.add(option.cloneNode(true));
    analysisSelector.add(option);
  });
  if (!currentSessionId && sessions[0]) {
    currentSessionId = sessions[0].session_id;
  }
  selector.value = currentSessionId;
  analysisSelector.value = currentSessionId;
}

function renderSessionForm() {
  const form = document.getElementById('session-form');
  const session = state.sessions.find((s) => s.session_id === currentSessionId);
  if (!session) return;
  form.site.value = state.site || '';
  form.ligne.value = session.ligne || '';
  form.po.value = session.po || '';
  form.produit.value = session.produit || '';
  form.equipe.value = session.equipe || '';
  form.shift.value = session.shift || '';
  form.debut.value = session.debut || '';
  form.fin.value = session.fin || '';
  form.objectif_h.value = session.objectif_h || 0;
  form.cadence_cible.value = session.cadence_cible || 0;
}

function renderProductionTable() {
  const tbody = document.querySelector('#production-table tbody');
  const rows = state.production_log
    .filter((row) => row.session_id === currentSessionId)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  tbody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const time = new Date(row.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    tr.innerHTML = `
      <td>${time}</td>
      <td>
        <div class="table-actions">
          <button class="btn" data-action="dec-ok" data-ts="${row.ts}">−</button>
          <span>${row.ok}</span>
          <button class="btn" data-action="inc-ok" data-ts="${row.ts}">+</button>
        </div>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn" data-action="dec-ko" data-ts="${row.ts}">−</button>
          <span>${row.ko}</span>
          <button class="btn" data-action="inc-ko" data-ts="${row.ts}">+</button>
        </div>
      </td>
      <td><input data-field="comment" data-ts="${row.ts}" value="${row.comment || ''}" placeholder="Commentaire"></td>
      <td><button class="btn" data-action="remove-row" data-ts="${row.ts}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStopsTable() {
  const tbody = document.querySelector('#stops-table tbody');
  const rows = state.stops.filter((row) => row.session_id === currentSessionId);
  tbody.innerHTML = '';
  rows.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateTime(row.start)}</td>
      <td>${formatDateTime(row.end)}</td>
      <td>${formatDuration(row.duree_s * 1000)}</td>
      <td>${row.categorie}</td>
      <td>${row.cause}</td>
      <td>${row.sous_cause}</td>
      <td contenteditable data-start="${row.start}">${row.comment || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderJournal() {
  const tbody = document.querySelector('#journal-table tbody');
  const prodRows = state.production_log.filter((row) => row.session_id === currentSessionId).map((row) => ({
    type: 'Production',
    ts: row.ts,
    details: `OK ${row.ok} / KO ${row.ko}`,
    comment: row.comment || ''
  }));
  const stopRows = state.stops.filter((row) => row.session_id === currentSessionId).map((row) => ({
    type: 'Arrêt',
    ts: row.start,
    details: `${row.categorie} - ${row.cause} (${formatDuration(row.duree_s * 1000)})`,
    comment: row.comment || ''
  }));
  const rows = [...prodRows, ...stopRows].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  tbody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.type}</td>
      <td>${formatDateTime(row.ts)}</td>
      <td>${row.details}</td>
      <td contenteditable data-type="${row.type}" data-ts="${row.ts}">${row.comment}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTargets() {
  const tbody = document.querySelector('#targets-table tbody');
  tbody.innerHTML = '';
  state.targets.forEach((target, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-target-index="${index}" data-field="ligne" value="${target.ligne}"></td>
      <td><input data-target-index="${index}" data-field="produit" value="${target.produit}"></td>
      <td><input type="number" data-target-index="${index}" data-field="cadence_cible" value="${target.cadence_cible}"></td>
      <td><input type="number" data-target-index="${index}" data-field="objectif_h" value="${target.objectif_h}"></td>
      <td><input type="number" step="0.01" data-target-index="${index}" data-field="seuil_perf" value="${target.seuil_perf}"></td>
      <td><input type="number" step="0.01" data-target-index="${index}" data-field="seuil_rejet" value="${target.seuil_rejet}"></td>
      <td><button class="btn" data-action="delete-target" data-index="${index}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTaxonomy() {
  const tbody = document.querySelector('#taxonomy-table tbody');
  tbody.innerHTML = '';
  state.taxonomy.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-tax-index="${index}" data-field="categorie" value="${item.categorie}"></td>
      <td><input data-tax-index="${index}" data-field="cause" value="${item.cause}"></td>
      <td><input data-tax-index="${index}" data-field="sous_cause" value="${item.sous_cause}"></td>
      <td><button class="btn" data-action="delete-tax" data-index="${index}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  });
  populateStopDialogOptions();
}

function renderUsers() {
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = '';
  state.users.forEach((user, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-user-index="${index}" data-field="user_id" value="${user.user_id}"></td>
      <td><input data-user-index="${index}" data-field="nom" value="${user.nom}"></td>
      <td><input data-user-index="${index}" data-field="role" value="${user.role}"></td>
      <td><button class="btn" data-action="delete-user" data-index="${index}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAnalysis() {
  if (!currentSessionId) return;
  const kpi = computeKPI(currentSessionId);
  if (!kpi) return;
  const target = getTargetForSession(currentSessionId) || { seuil_perf: 0.85, seuil_rejet: 0.02 };
  setKpiCard('kpi-oee', formatPercent(kpi.trs), `Disponibilité ${formatPercent(kpi.disponibilite)} • Performance ${formatPercent(kpi.performance)} • Qualité ${formatPercent(kpi.qualite)}`, thresholdColor(kpi.trs, target.seuil_perf));
  setKpiCard('kpi-reject', formatPercent(kpi.tauxRejet), `${kpi.totalKo} KO / ${kpi.totalOk + kpi.totalKo}`, thresholdColor(1 - kpi.tauxRejet, 1 - target.seuil_rejet, true));
  setKpiCard('kpi-cadence', formatPercent(kpi.cadenceVs), `${Math.round(kpi.totalOk / Math.max(1, kpi.runningHours))} u/h`, thresholdColor(kpi.cadenceVs, 1));
  setKpiCard('kpi-mtbf', `${kpi.mtbf.toFixed(1)} min`, `${kpi.session.cadence_cible} cible`, kpi.mtbf > 60 ? 'success' : 'warning');
  setKpiCard('kpi-mttr', `${kpi.mttr.toFixed(1)} min`, `${formatDuration(kpi.stopsMs)}`, kpi.mttr < 30 ? 'success' : 'warning');
  updateCharts(currentSessionId);
  renderTopLosses();
  renderInsights();
  renderTeamFilter();
}

function renderTopLosses() {
  const list = document.getElementById('top-losses');
  list.innerHTML = '';
  topLosses(currentSessionId).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.label} • ${formatDuration(item.value * 1000)}`;
    list.appendChild(li);
  });
}

function renderInsights() {
  const list = document.getElementById('insights');
  list.innerHTML = '';
  generateInsights(currentSessionId).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderTeamFilter() {
  const select = document.getElementById('analysis-team-filter');
  const teams = new Set(state.sessions.map((s) => s.equipe).filter(Boolean));
  const value = select.value;
  select.innerHTML = '<option value="all">Toutes</option>';
  teams.forEach((team) => {
    const option = new Option(team, team);
    select.add(option);
  });
  select.value = value || 'all';
  updateTeamChart(currentSessionId, select.value);
}

function setKpiCard(id, value, detail, variant) {
  const card = document.getElementById(id);
  card.querySelector('.kpi-value').textContent = value;
  card.querySelector('.kpi-detail').textContent = detail;
  card.classList.remove('success', 'warning', 'danger');
  if (variant) card.classList.add(variant);
}

function thresholdColor(value, threshold, reverse = false) {
  if (reverse) {
    if (value >= threshold) return 'success';
    if (value >= threshold - 0.05) return 'warning';
    return 'danger';
  }
  if (value >= threshold) return 'success';
  if (value >= threshold * 0.9) return 'warning';
  return 'danger';
}

let okTargetChart;
let paretoChart;
let teamChart;

function updateCharts(sessionId) {
  const ctx1 = document.getElementById('chart-ok-target');
  const ctx2 = document.getElementById('chart-pareto');
  const ctx3 = document.getElementById('chart-team');
  const data1 = buildCumulOkVsTarget(sessionId);
  const pareto = buildParetoStops(sessionId);
  const teams = aggregateByTeam(sessionId);
  if (okTargetChart) okTargetChart.destroy();
  if (paretoChart) paretoChart.destroy();
  if (teamChart) teamChart.destroy();
  okTargetChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: data1.map((item) => item.label),
      datasets: [
        {
          label: 'OK cumulés',
          data: data1.map((item) => item.ok),
          tension: 0.3,
          borderColor: '#3f8cff',
          backgroundColor: 'rgba(63, 140, 255, 0.2)',
          fill: true
        },
        {
          label: 'Cible cumulée',
          data: data1.map((item) => item.target),
          tension: 0.3,
          borderColor: '#40c463',
          borderDash: [6, 4],
          fill: false
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
  paretoChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: pareto.map((item) => item.label),
      datasets: [
        {
          label: 'Durée (min)',
          data: pareto.map((item) => item.value / 60),
          backgroundColor: '#ff5b6b'
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
  teamChart = new Chart(ctx3, {
    type: 'doughnut',
    data: {
      labels: teams.map((item) => item.team),
      datasets: [
        {
          label: 'OK',
          data: teams.map((item) => item.ok),
          backgroundColor: ['#3f8cff', '#40c463', '#f7b733', '#ff5b6b']
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#fff' } } }
    }
  });
}

function aggregateByTeam(sessionId) {
  const result = new Map();
  state.sessions.forEach((session) => {
    const ok = totalForSession(session.session_id, 'ok');
    const team = session.equipe || 'N/A';
    const entry = result.get(team) || { team, ok: 0 };
    entry.ok += ok;
    result.set(team, entry);
  });
  return Array.from(result.values());
}

function updateTeamChart(sessionId, filter) {
  if (!teamChart) return;
  const data = aggregateByTeam(sessionId).filter((item) => filter === 'all' || item.team === filter);
  teamChart.data.labels = data.map((item) => item.team);
  teamChart.data.datasets[0].data = data.map((item) => item.ok);
  teamChart.update();
}

function populateStopDialogOptions() {
  const form = document.getElementById('stop-form');
  const categories = Array.from(new Set(state.taxonomy.map((item) => item.categorie)));
  const catSelect = form.categorie;
  const causeSelect = form.cause;
  const sousSelect = form.sous_cause;
  catSelect.innerHTML = '';
  categories.forEach((cat) => catSelect.add(new Option(cat, cat)));
  function updateCauseOptions() {
    const selectedCat = catSelect.value;
    const causes = state.taxonomy.filter((item) => item.categorie === selectedCat);
    const uniqueCauses = Array.from(new Set(causes.map((item) => item.cause)));
    causeSelect.innerHTML = '';
    uniqueCauses.forEach((cause) => causeSelect.add(new Option(cause, cause)));
    updateSousCauseOptions();
  }
  function updateSousCauseOptions() {
    const selectedCat = catSelect.value;
    const selectedCause = causeSelect.value;
    const sous = state.taxonomy.filter((item) => item.categorie === selectedCat && item.cause === selectedCause);
    sousSelect.innerHTML = '';
    sous.forEach((item) => sousSelect.add(new Option(item.sous_cause, item.sous_cause)));
  }
  catSelect.onchange = updateCauseOptions;
  causeSelect.onchange = updateSousCauseOptions;
  updateCauseOptions();
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });
}

function hydrateUI() {
  if (!currentSessionId || !state.sessions.some((s) => s.session_id === currentSessionId)) {
    currentSessionId = state.sessions[0]?.session_id || null;
  }
  renderSessionSelector();
  renderSessionForm();
  renderProductionTable();
  renderStopsTable();
  renderJournal();
  renderTargets();
  renderTaxonomy();
  renderUsers();
  renderAnalysis();
}

function handleTabNavigation() {
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });
}

function handleSessionActions() {
  document.getElementById('save-session-meta').addEventListener('click', () => {
    const form = document.getElementById('session-form');
    const session = state.sessions.find((s) => s.session_id === currentSessionId);
    if (!session) return;
    state.site = form.site.value;
    Object.assign(session, {
      ligne: form.ligne.value,
      po: form.po.value,
      produit: form.produit.value,
      equipe: form.equipe.value,
      shift: form.shift.value,
      debut: form.debut.value,
      fin: form.fin.value,
      objectif_h: Number(form.objectif_h.value) || 0,
      cadence_cible: Number(form.cadence_cible.value) || 0
    });
    state.production_log.filter((row) => row.session_id === session.session_id).forEach((row) => {
      row.objectif_h = session.objectif_h;
    });
    saveState(state);
    hydrateUI();
    toast('Session mise à jour');
  });

  document.getElementById('new-session-btn').addEventListener('click', () => {
    const form = document.getElementById('session-form');
    const session = newSession(Object.fromEntries(new FormData(form)));
    currentSessionId = session.session_id;
    hydrateUI();
    toast('Nouvelle session créée');
  });

  document.getElementById('duplicate-session-btn').addEventListener('click', () => {
    const sessions = [...state.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const previous = sessions[1] || sessions[0];
    if (!previous) return;
    const session = newSession(previous);
    currentSessionId = session.session_id;
    hydrateUI();
    toast('Session dupliquée');
  });

  document.getElementById('session-selector').addEventListener('change', (event) => {
    currentSessionId = event.target.value;
    renderSessionForm();
    renderProductionTable();
    renderStopsTable();
    renderJournal();
    renderAnalysis();
  });

  document.getElementById('analysis-session').addEventListener('change', (event) => {
    currentSessionId = event.target.value;
    document.getElementById('session-selector').value = currentSessionId;
    renderSessionForm();
    renderProductionTable();
    renderStopsTable();
    renderJournal();
    renderAnalysis();
  });
}

function handleProductionActions() {
  document.querySelector('#production-table tbody').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const ts = btn.dataset.ts;
    if (!ts) return;
    if (btn.dataset.action === 'inc-ok') incrementOK(ts, 1);
    if (btn.dataset.action === 'dec-ok') incrementOK(ts, -1);
    if (btn.dataset.action === 'inc-ko') incrementKO(ts, 1);
    if (btn.dataset.action === 'dec-ko') incrementKO(ts, -1);
    if (btn.dataset.action === 'remove-row') {
      state.production_log = state.production_log.filter((row) => !(row.session_id === currentSessionId && row.ts === ts));
      saveState(state);
      renderProductionTable();
      renderJournal();
      renderAnalysis();
    }
  });

  document.querySelector('#production-table tbody').addEventListener('input', (event) => {
    const input = event.target;
    if (input.dataset.field === 'comment') {
      const row = state.production_log.find((r) => r.session_id === currentSessionId && r.ts === input.dataset.ts);
      if (row) {
        row.comment = input.value;
        saveState(state);
        renderJournal();
      }
    }
  });

  document.getElementById('add-hour-row').addEventListener('click', () => {
    const session = state.sessions.find((s) => s.session_id === currentSessionId);
    if (!session) return;
    const lastRow = state.production_log
      .filter((row) => row.session_id === currentSessionId)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
    const nextDate = new Date(lastRow ? lastRow.ts : `${session.date}T${session.debut}`);
    nextDate.setHours(nextDate.getHours() + 1);
    state.production_log.push({
      session_id: currentSessionId,
      ts: nextDate.toISOString().slice(0, 16),
      ok: 0,
      ko: 0,
      cadence_reelle: 0,
      objectif_h: session.objectif_h,
      comment: ''
    });
    saveState(state);
    renderProductionTable();
    renderJournal();
  });
}

function handleStopActions() {
  const dialog = document.getElementById('stop-dialog');
  document.getElementById('open-stop-panel').addEventListener('click', () => {
    populateStopDialogOptions();
    dialog.showModal();
  });
  document.getElementById('start-stop-btn').addEventListener('click', () => {
    const form = document.getElementById('stop-form');
    startStopEvent({
      categorie: form.categorie.value,
      cause: form.cause.value,
      sous_cause: form.sous_cause.value,
      criticite: form.criticite.value,
      comment: form.comment.value
    });
    toast('Arrêt démarré');
  });
  document.getElementById('stop-stop-btn').addEventListener('click', () => {
    const form = document.getElementById('stop-form');
    stopCurrentEvent({
      categorie: form.categorie.value,
      cause: form.cause.value,
      sous_cause: form.sous_cause.value,
      criticite: form.criticite.value,
      comment: form.comment.value
    });
    toast('Arrêt enregistré');
    dialog.close();
  });
  document.getElementById('save-stop').addEventListener('click', (event) => {
    event.preventDefault();
    const form = document.getElementById('stop-form');
    if (state.active_stop) {
      stopCurrentEvent({
        categorie: form.categorie.value,
        cause: form.cause.value,
        sous_cause: form.sous_cause.value,
        criticite: form.criticite.value,
        comment: form.comment.value
      });
    } else {
      addStop({
        session_id: currentSessionId,
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        duree_s: 60,
        categorie: form.categorie.value,
        cause: form.cause.value,
        sous_cause: form.sous_cause.value,
        criticite: form.criticite.value,
        comment: form.comment.value
      });
    }
    toast('Arrêt enregistré');
    dialog.close();
  });

  document.querySelector('#stops-table tbody').addEventListener('blur', (event) => {
    const cell = event.target;
    if (!cell.matches('[contenteditable]')) return;
    const stop = state.stops.find((row) => row.session_id === currentSessionId && row.start === cell.dataset.start);
    if (stop) {
      stop.comment = cell.textContent.trim();
      saveState(state);
      renderJournal();
    }
  }, true);
}

function handleJournalEdit() {
  document.querySelector('#journal-table tbody').addEventListener('blur', (event) => {
    const cell = event.target;
    if (!cell.matches('[contenteditable]')) return;
    const { type, ts } = cell.dataset;
    if (type === 'Production') {
      const row = state.production_log.find((r) => r.session_id === currentSessionId && r.ts === ts);
      if (row) {
        row.comment = cell.textContent;
      }
    } else {
      const stop = state.stops.find((r) => r.session_id === currentSessionId && r.start === ts);
      if (stop) {
        stop.comment = cell.textContent;
      }
    }
    saveState(state);
  }, true);
}

function handleParamActions() {
  document.getElementById('add-target').addEventListener('click', () => {
    state.targets.push({ ligne: '', produit: '', cadence_cible: 0, objectif_h: 0, seuil_perf: 0.85, seuil_rejet: 0.02 });
    saveState(state);
    renderTargets();
  });
  document.getElementById('targets-table').addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset.targetIndex) return;
    const target = state.targets[input.dataset.targetIndex];
    target[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value;
    saveState(state);
  });
  document.getElementById('targets-table').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (btn && btn.dataset.action === 'delete-target') {
      state.targets.splice(btn.dataset.index, 1);
      saveState(state);
      renderTargets();
    }
  });

  document.getElementById('add-taxonomy').addEventListener('click', () => {
    state.taxonomy.push({ categorie: 'Nouvelle', cause: 'Cause', sous_cause: 'Sous-cause' });
    saveState(state);
    renderTaxonomy();
  });
  document.getElementById('taxonomy-table').addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset.taxIndex) return;
    const item = state.taxonomy[input.dataset.taxIndex];
    item[input.dataset.field] = input.value;
    saveState(state);
    populateStopDialogOptions();
  });
  document.getElementById('taxonomy-table').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (btn && btn.dataset.action === 'delete-tax') {
      state.taxonomy.splice(btn.dataset.index, 1);
      saveState(state);
      renderTaxonomy();
    }
  });

  document.getElementById('add-user').addEventListener('click', () => {
    state.users.push({ user_id: '', nom: '', role: '' });
    saveState(state);
    renderUsers();
  });
  document.getElementById('users-table').addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset.userIndex) return;
    const user = state.users[input.dataset.userIndex];
    user[input.dataset.field] = input.value;
    saveState(state);
  });
  document.getElementById('users-table').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (btn && btn.dataset.action === 'delete-user') {
      state.users.splice(btn.dataset.index, 1);
      saveState(state);
      renderUsers();
    }
  });

  document.getElementById('export-json').addEventListener('click', () => {
    downloadFile(JSON.stringify(state, null, 2), 'prs_next_state.json', 'application/json');
  });
  document.getElementById('import-json-btn').addEventListener('click', () => {
    document.getElementById('import-json').click();
  });
  document.getElementById('import-json').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importJSONState(reader.result);
    reader.readAsText(file);
  });
  document.getElementById('import-csv-btn').addEventListener('click', () => {
    document.getElementById('import-csv').click();
  });
  document.getElementById('import-csv').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const type = file.name.includes('stop') ? 'stops' : 'production';
    importCSV(type, file);
  });
  document.getElementById('reset-state').addEventListener('click', () => {
    if (confirm('Réinitialiser toutes les données ?')) {
      state = createDemoState();
      saveState(state);
      hydrateUI();
    }
  });
}

function handleExports() {
  document.getElementById('export-production').addEventListener('click', () => exportCSVProduction(currentSessionId));
  document.getElementById('export-stops').addEventListener('click', () => exportCSVStops(currentSessionId));
  document.getElementById('export-report').addEventListener('click', () => exportOnePageReport(currentSessionId));
  document.getElementById('print-report').addEventListener('click', () => window.print());
  document.getElementById('close-report').addEventListener('click', () => document.getElementById('report-dialog').close());
  document.getElementById('reset-session').addEventListener('click', () => {
    if (!currentSessionId) return;
    if (confirm('Effacer la session courante ?')) {
      state.production_log = state.production_log.filter((row) => row.session_id !== currentSessionId);
      state.stops = state.stops.filter((row) => row.session_id !== currentSessionId);
      saveState(state);
      hydrateUI();
    }
  });
}

let timerInterval;

function runStopTimer() {
  const display = document.getElementById('stop-duration');
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.active_stop) return;
    const elapsed = Date.now() - new Date(state.active_stop.start).getTime();
    display.textContent = formatDuration(elapsed);
  }, 1000);
}

function stopStopTimer() {
  clearInterval(timerInterval);
  document.getElementById('stop-duration').textContent = '00:00';
}

function handleTeamFilter() {
  document.getElementById('analysis-team-filter').addEventListener('change', (event) => {
    updateTeamChart(currentSessionId, event.target.value);
  });
}

function bindReportDialog() {
  document.getElementById('report-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    event.target.close();
  });
}

let state = loadState();
let currentSessionId = state.sessions[0]?.session_id || null;

document.addEventListener('DOMContentLoaded', () => {
  handleTabNavigation();
  handleSessionActions();
  handleProductionActions();
  handleStopActions();
  handleJournalEdit();
  handleParamActions();
  handleExports();
  handleTeamFilter();
  bindReportDialog();
  hydrateUI();
  if (state.active_stop) {
    runStopTimer();
  }
});
