
const STORAGE_KEY = 'prs_next_state_v1';

const selectors = {
  tabButtons: document.querySelectorAll('.tab-button'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  toastContainer: document.querySelector('.toast-container'),
  sessionSelector: document.getElementById('session-selector'),
  sessionForm: document.getElementById('session-form'),
  productionTableBody: document.querySelector('#production-table tbody'),
  stopsTableBody: document.querySelector('#stops-table tbody'),
  journalTableBody: document.querySelector('#journal-table tbody'),
  addHourRow: document.getElementById('add-hour-row'),
  exportProduction: document.getElementById('export-production'),
  exportStops: document.getElementById('export-stops'),
  exportReport: document.getElementById('export-report'),
  analysisSession: document.getElementById('analysis-session'),
  analysisTeamFilter: document.getElementById('analysis-team-filter'),
  analysisMeta: document.getElementById('analysis-meta'),
  topLosses: document.getElementById('top-losses'),
  insights: document.getElementById('insights'),
  kpiCards: {
    oee: document.getElementById('kpi-oee'),
    performance: document.getElementById('kpi-performance'),
    quality: document.getElementById('kpi-quality'),
    availability: document.getElementById('kpi-availability'),
    reject: document.getElementById('kpi-reject'),
    mtbf: document.getElementById('kpi-mtbf'),
    mttr: document.getElementById('kpi-mttr')
  },
  openStopPanel: document.getElementById('open-stop-panel'),
  stopDialog: document.getElementById('stop-dialog'),
  stopForm: document.getElementById('stop-form'),
  stopStart: document.getElementById('stop-start'),
  stopEnd: document.getElementById('stop-end'),
  stopDuration: document.getElementById('stop-duration'),
  stopCategory: document.getElementById('stop-category'),
  stopCause: document.getElementById('stop-cause'),
  stopSubCause: document.getElementById('stop-subcause'),
  stopCriticite: document.getElementById('stop-criticite'),
  stopComment: document.getElementById('stop-comment'),
  stopTimerStart: document.getElementById('stop-timer-start'),
  stopTimerStop: document.getElementById('stop-timer-stop'),
  saveStop: document.getElementById('save-stop'),
  reportDialog: document.getElementById('report-dialog'),
  reportContent: document.getElementById('report-content'),
  printReport: document.getElementById('print-report'),
  addTarget: document.getElementById('add-target'),
  targetsTableBody: document.querySelector('#targets-table tbody'),
  addTaxonomy: document.getElementById('add-taxonomy'),
  taxonomyTableBody: document.querySelector('#taxonomy-table tbody'),
  addUser: document.getElementById('add-user'),
  usersTableBody: document.querySelector('#users-table tbody'),
  resetState: document.getElementById('reset-state'),
  importJsonBtn: document.getElementById('import-json-btn'),
  importCsvBtn: document.getElementById('import-csv-btn'),
  importJsonInput: document.getElementById('import-json-input'),
  importCsvInput: document.getElementById('import-csv-input'),
  gatewayToggle: document.getElementById('gateway-toggle'),
  datasourceUrl: document.getElementById('datasource-url'),
  teamChartCard: document.getElementById('team-chart-card')
};

let state = migrateState(loadState());
let currentSessionId = state.sessions[0]?.session_id ?? null;
let activeTabId = 'saisie';
let timerHandle = null;
let timerStartDate = null;
let charts = {
  okTarget: null,
  pareto: null,
  team: null
};
let gatewayInterval = null;

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Impossible de charger le state', error);
    return null;
  }
}

function migrateState(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema_version !== 1) {
    return createDefaultState();
  }
  const template = {
    schema_version: 1,
    sessions: [],
    production_log: [],
    stops: [],
    targets: [],
    users: [],
    taxonomy: []
  };
  return { ...template, ...raw };
}

function createDefaultState() {
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
  const date = new Date();
  date.setHours(8, 0, 0, 0);
  const end = new Date(date);
  end.setHours(16, 0, 0, 0);

  const sessions = [
    {
      session_id: sessionId,
      date: date.toISOString().slice(0, 10),
      site: 'Atelier A',
      ligne: 'Ligne 1',
      po: 'OF-45821',
      produit: 'Module X12',
      equipe: 'Equipe A',
      shift: 'Matin',
      debut: '08:00',
      fin: '16:00',
      objectif_h: 220,
      cadence_cible: 220
    }
  ];

  const production_log = [];
  for (let hour = 8; hour < 16; hour++) {
    const ts = new Date(date);
    ts.setHours(hour, 0, 0, 0);
    const ok = Math.round(1500 / 8);
    const ko = Math.round(50 / 8);
    production_log.push({
      session_id: sessionId,
      ts: ts.toISOString(),
      ok,
      ko,
      cadence_reelle: ok * 60,
      objectif_h: 220,
      comment: ''
    });
  }

  const stops = [
    {
      session_id: sessionId,
      start: new Date(date.getTime() + 3 * 3600 * 1000).toISOString(),
      end: new Date(date.getTime() + 3 * 3600 * 1000 + 20 * 60 * 1000).toISOString(),
      duree_s: 1200,
      categorie: 'Technique',
      cause: 'Capteur',
      sous_cause: 'Capteur défectueux',
      criticite: 'Majeur',
      comment: 'Remplacement capteur station 3'
    },
    {
      session_id: sessionId,
      start: new Date(date.getTime() + 6 * 3600 * 1000).toISOString(),
      end: new Date(date.getTime() + 6 * 3600 * 1000 + 10 * 60 * 1000).toISOString(),
      duree_s: 600,
      categorie: 'Organisation',
      cause: 'Manque OF',
      sous_cause: 'Ordre non disponible',
      criticite: 'Mineur',
      comment: 'OF manquant pendant 10 min'
    }
  ];

  const targets = [
    {
      ligne: 'Ligne 1',
      produit: 'Module X12',
      cadence_cible: 220,
      objectif_h: 220,
      seuil_perf: 0.85,
      seuil_rejet: 0.02
    }
  ];

  const users = [
    { user_id: 'sup-01', nom: 'Responsable Ligne', role: 'Superviseur' },
    { user_id: 'op-01', nom: 'Opérateur 1', role: 'Opérateur' }
  ];

  const taxonomy = [
    { categorie: 'Technique', cause: 'Capteur', sous_cause: 'Capteur défectueux' },
    { categorie: 'Technique', cause: 'Maintenance', sous_cause: 'Préventive manquée' },
    { categorie: 'Qualité', cause: 'Contrôle', sous_cause: 'Non-conformité' },
    { categorie: 'Organisation', cause: 'Manque OF', sous_cause: 'Ordre non disponible' },
    { categorie: 'Sécurité', cause: 'Blocage zone', sous_cause: 'Inspection' },
    { categorie: 'Logistique', cause: 'Alimentation', sous_cause: 'Rupture composant' }
  ];

  return {
    schema_version: 1,
    sessions,
    production_log,
    stops,
    targets,
    users,
    taxonomy
  };
}

function init() {
  setupTabNavigation();
  populateSessions();
  bindSessionEvents();
  selectors.stopCategory.addEventListener('change', updateCauseOptions);
  selectors.stopCause.addEventListener('change', updateSubCauseOptions);
  populateTaxonomySelectors();
  renderProductionTable();
  renderStopsTable();
  renderJournal();
  selectors.analysisSession.addEventListener('change', renderAnalysis);
  selectors.analysisTeamFilter.addEventListener('change', renderAnalysis);
  populateAnalysisSelectors();
  renderAnalysis();
  renderTargetsTable();
  renderTaxonomyTable();
  renderUsersTable();
  bindStopDialog();
  bindExports();
  bindParameters();
  bindImports();
  updateGateway();
  showToast('PRS Next prêt pour la saisie.', 'success');
}

document.addEventListener('DOMContentLoaded', init);

function setupTabNavigation() {
  selectors.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      if (!targetId || targetId === activeTabId) return;
      selectors.tabButtons.forEach((b) => {
        b.classList.toggle('active', b === button);
        const selected = b === button;
        b.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      selectors.tabPanels.forEach((panel) => {
        const isTarget = panel.id === targetId;
        panel.classList.toggle('hidden', !isTarget);
        panel.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
      });
      activeTabId = targetId;
    });
  });
}

function bindSessionEvents() {
  selectors.sessionSelector.addEventListener('change', () => {
    currentSessionId = selectors.sessionSelector.value;
    populateSessionForm();
    ensureProductionGrid();
    renderProductionTable();
    renderStopsTable();
    renderJournal();
    renderAnalysis();
  });

  document.getElementById('save-session-meta').addEventListener('click', () => {
    if (!currentSessionId) return;
    const formData = new FormData(selectors.sessionForm);
    const session = state.sessions.find((s) => s.session_id === currentSessionId);
    if (!session) return;
    for (const [key, value] of formData.entries()) {
      session[key] = value;
    }
    persistState();
    showToast('Session mise à jour.');
    populateSessions();
    renderAnalysis();
  });

  document.getElementById('new-session-btn').addEventListener('click', () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
    const formData = new FormData(selectors.sessionForm);
    const today = new Date();
    const newSession = {
      session_id: newId,
      date: formData.get('date') || today.toISOString().slice(0, 10),
      site: formData.get('site') || 'Site',
      ligne: formData.get('ligne') || 'Ligne',
      po: formData.get('po') || '',
      produit: formData.get('produit') || '',
      equipe: formData.get('equipe') || '',
      shift: formData.get('shift') || '',
      debut: formData.get('debut') || '08:00',
      fin: formData.get('fin') || '16:00',
      objectif_h: Number(formData.get('objectif_h')) || 0,
      cadence_cible: Number(formData.get('cadence_cible')) || 0
    };
    state.sessions.push(newSession);
    currentSessionId = newId;
    ensureProductionGrid();
    persistState();
    populateSessions();
    populateSessionForm();
    renderProductionTable();
    renderAnalysis();
    showToast('Nouvelle session créée.', 'success');
  });

  document.getElementById('duplicate-session-btn').addEventListener('click', () => {
    if (!currentSessionId || state.sessions.length === 0) return;
    const sorted = [...state.sessions].sort((a, b) => (a.date > b.date ? -1 : 1));
    const previous = sorted[1] || sorted[0];
    if (!previous) return;
    const newId = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
    const newDate = new Date(previous.date);
    newDate.setDate(newDate.getDate() + 1);
    const duplicated = {
      ...previous,
      session_id: newId,
      date: newDate.toISOString().slice(0, 10)
    };
    state.sessions.push(duplicated);
    currentSessionId = newId;
    ensureProductionGrid();
    persistState();
    populateSessions();
    populateSessionForm();
    renderProductionTable();
    renderAnalysis();
    showToast('Session dupliquée à partir de la veille.', 'info');
  });

  selectors.addHourRow.addEventListener('click', () => {
    if (!currentSessionId) return;
    const timeValue = prompt('Heure (HH:MM) pour la nouvelle tranche ?', '');
    if (!timeValue) return;
    const session = state.sessions.find((s) => s.session_id === currentSessionId);
    if (!session) return;
    const [hourStr, minuteStr] = timeValue.split(':');
    if (hourStr === undefined || minuteStr === undefined) {
      showToast('Format heure invalide.', 'error');
      return;
    }
    const date = new Date(`${session.date}T${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}:00`);
    if (Number.isNaN(date.getTime())) {
      showToast('Heure invalide.', 'error');
      return;
    }
    const existing = state.production_log.find((p) => p.session_id === currentSessionId && p.ts === date.toISOString());
    if (existing) {
      showToast('Une ligne existe déjà pour cette heure.', 'warn');
      return;
    }
    state.production_log.push({
      session_id: currentSessionId,
      ts: date.toISOString(),
      ok: 0,
      ko: 0,
      cadence_reelle: 0,
      objectif_h: Number(session.objectif_h) || 0,
      comment: ''
    });
    state.production_log.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    persistState();
    renderProductionTable();
    renderJournal();
    renderAnalysis();
  });
}

function populateSessions() {
  selectors.sessionSelector.innerHTML = '';
  state.sessions.forEach((session) => {
    const option = document.createElement('option');
    option.value = session.session_id;
    option.textContent = `${session.date} • ${session.ligne} • ${session.produit || 'N/A'}`;
    selectors.sessionSelector.append(option);
  });
  if (currentSessionId && state.sessions.some((s) => s.session_id === currentSessionId)) {
    selectors.sessionSelector.value = currentSessionId;
  } else {
    currentSessionId = state.sessions[0]?.session_id ?? null;
    if (currentSessionId) {
      selectors.sessionSelector.value = currentSessionId;
    }
  }
  populateSessionForm();
}

function populateSessionForm() {
  if (!currentSessionId) return;
  const session = state.sessions.find((s) => s.session_id === currentSessionId);
  if (!session) return;
  selectors.sessionForm.querySelectorAll('input').forEach((input) => {
    const name = input.name;
    if (name && session[name] !== undefined) {
      input.value = session[name];
    }
  });
}

function ensureProductionGrid() {
  if (!currentSessionId) return;
  const session = state.sessions.find((s) => s.session_id === currentSessionId);
  if (!session) return;
  const existing = state.production_log.filter((p) => p.session_id === currentSessionId);
  if (existing.length > 0) return;
  const start = `${session.date}T${session.debut || '08:00'}:00`;
  const end = `${session.date}T${session.fin || '16:00'}:00`;
  const startDate = new Date(start);
  const endDate = new Date(end);
  let pointer = new Date(startDate);
  while (pointer < endDate) {
    state.production_log.push({
      session_id: currentSessionId,
      ts: pointer.toISOString(),
      ok: 0,
      ko: 0,
      cadence_reelle: 0,
      objectif_h: Number(session.objectif_h) || 0,
      comment: ''
    });
    pointer.setHours(pointer.getHours() + 1);
  }
  state.production_log.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  persistState();
}

function renderProductionTable() {
  selectors.productionTableBody.innerHTML = '';
  if (!currentSessionId) return;
  const rows = state.production_log
    .filter((item) => item.session_id === currentSessionId)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const hour = new Date(row.ts);
    const hourCell = document.createElement('td');
    hourCell.textContent = hour.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    tr.append(hourCell);

    const okCell = document.createElement('td');
    okCell.append(createProductionInput(row, 'ok'));
    tr.append(okCell);

    const koCell = document.createElement('td');
    koCell.append(createProductionInput(row, 'ko'));
    tr.append(koCell);

    const commentCell = document.createElement('td');
    const commentInput = document.createElement('textarea');
    commentInput.value = row.comment || '';
    commentInput.rows = 1;
    commentInput.addEventListener('change', () => {
      row.comment = commentInput.value;
      persistState();
      renderJournal();
    });
    commentCell.append(commentInput);
    tr.append(commentCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'cell-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn warn';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', () => {
      const index = state.production_log.indexOf(row);
      if (index >= 0) {
        state.production_log.splice(index, 1);
        persistState();
        renderProductionTable();
        renderJournal();
        renderAnalysis();
      }
    });
    actionsCell.append(deleteBtn);
    tr.append(actionsCell);

    selectors.productionTableBody.append(tr);
  });
}

function createProductionInput(row, key) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-actions';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'increment-btn minus';
  minus.textContent = '-';
  minus.addEventListener('click', () => {
    row[key] = Math.max(0, Number(row[key]) - 1);
    persistState();
    renderProductionTable();
    renderJournal();
    renderAnalysis();
  });
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.value = row[key] ?? 0;
  input.addEventListener('change', () => {
    row[key] = Number(input.value) || 0;
    persistState();
    renderJournal();
    renderAnalysis();
  });
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'increment-btn';
  plus.textContent = '+';
  plus.addEventListener('click', () => {
    row[key] = Number(row[key]) + 1;
    persistState();
    renderProductionTable();
    renderJournal();
    renderAnalysis();
  });
  wrapper.append(minus, input, plus);
  return wrapper;
}

function populateTaxonomySelectors() {
  const categories = [...new Set(state.taxonomy.map((t) => t.categorie))];
  selectors.stopCategory.innerHTML = '<option value="">Sélectionner</option>';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    selectors.stopCategory.append(option);
  });
  updateCauseOptions();
  updateSubCauseOptions();
}

function updateCauseOptions() {
  const category = selectors.stopCategory.value;
  const causes = [...new Set(state.taxonomy.filter((t) => !category || t.categorie === category).map((t) => t.cause))];
  selectors.stopCause.innerHTML = '<option value="">Sélectionner</option>';
  causes.forEach((cause) => {
    const option = document.createElement('option');
    option.value = cause;
    option.textContent = cause;
    selectors.stopCause.append(option);
  });
  if (!causes.includes(selectors.stopCause.value)) {
    selectors.stopCause.value = '';
  }
  updateSubCauseOptions();
}

function updateSubCauseOptions() {
  const category = selectors.stopCategory.value;
  const cause = selectors.stopCause.value;
  const subCauses = state.taxonomy
    .filter((t) => (!category || t.categorie === category) && (!cause || t.cause === cause))
    .map((t) => t.sous_cause);
  selectors.stopSubCause.innerHTML = '<option value="">Sélectionner</option>';
  subCauses.forEach((sub) => {
    const option = document.createElement('option');
    option.value = sub;
    option.textContent = sub;
    selectors.stopSubCause.append(option);
  });
  if (!subCauses.includes(selectors.stopSubCause.value)) {
    selectors.stopSubCause.value = '';
  }
}

function renderStopsTable() {
  selectors.stopsTableBody.innerHTML = '';
  if (!currentSessionId) return;
  const stops = state.stops
    .filter((stop) => stop.session_id === currentSessionId)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  stops.forEach((stop) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateTime(stop.start)}</td>
      <td>${formatDateTime(stop.end)}</td>
      <td>${formatDuration(stop.duree_s)}</td>
      <td>${stop.categorie}</td>
      <td>${stop.cause}</td>
      <td>${stop.criticite}</td>
      <td>${stop.comment || ''}</td>
    `;
    selectors.stopsTableBody.append(tr);
  });
}

function renderJournal() {
  selectors.journalTableBody.innerHTML = '';
  if (!currentSessionId) return;
  const prodEvents = state.production_log
    .filter((entry) => entry.session_id === currentSessionId)
    .map((entry) => ({
      type: 'Production',
      timestamp: entry.ts,
      details: `OK ${entry.ok} / KO ${entry.ko}`,
      commentKey: 'comment',
      source: entry
    }));
  const stopEvents = state.stops
    .filter((stop) => stop.session_id === currentSessionId)
    .map((stop) => ({
      type: 'Arrêt',
      timestamp: stop.start,
      details: `${stop.categorie} • ${stop.cause} (${formatDuration(stop.duree_s)})`,
      commentKey: 'comment',
      source: stop
    }));
  const events = [...prodEvents, ...stopEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  events.forEach((event) => {
    const tr = document.createElement('tr');
    const typeCell = document.createElement('td');
    typeCell.textContent = event.type;
    tr.append(typeCell);

    const dateCell = document.createElement('td');
    dateCell.textContent = formatDateTime(event.timestamp);
    tr.append(dateCell);

    const detailsCell = document.createElement('td');
    detailsCell.textContent = event.details;
    tr.append(detailsCell);

    const commentCell = document.createElement('td');
    const input = document.createElement('textarea');
    input.value = event.source[event.commentKey] || '';
    input.rows = 1;
    input.addEventListener('change', () => {
      event.source[event.commentKey] = input.value;
      persistState();
    });
    commentCell.append(input);
    tr.append(commentCell);

    selectors.journalTableBody.append(tr);
  });
}

function bindStopDialog() {
  selectors.openStopPanel.addEventListener('click', () => {
    resetStopForm();
    selectors.stopDialog.showModal();
  });

  selectors.stopTimerStart.addEventListener('click', () => {
    timerStartDate = new Date();
    selectors.stopStart.value = toLocalDateTime(timerStartDate);
    timerHandle = setInterval(() => {
      const now = new Date();
      const seconds = Math.floor((now - timerStartDate) / 1000);
      selectors.stopDuration.textContent = formatDuration(seconds);
    }, 1000);
  });

  selectors.stopTimerStop.addEventListener('click', () => {
    if (!timerStartDate) return;
    clearInterval(timerHandle);
    timerHandle = null;
    const end = new Date();
    selectors.stopEnd.value = toLocalDateTime(end);
    const seconds = Math.floor((end - timerStartDate) / 1000);
    selectors.stopDuration.textContent = formatDuration(seconds);
  });

  selectors.stopForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentSessionId) return;
    const start = new Date(selectors.stopStart.value);
    const end = new Date(selectors.stopEnd.value);
    if (!(start instanceof Date) || Number.isNaN(start.valueOf()) || !(end instanceof Date) || Number.isNaN(end.valueOf())) {
      showToast('Horodatage invalide.', 'error');
      return;
    }
    const duree = Math.max(0, Math.round((end - start) / 1000));
    if (duree === 0) {
      showToast('Durée nulle.', 'warn');
    }
    state.stops.push({
      session_id: currentSessionId,
      start: start.toISOString(),
      end: end.toISOString(),
      duree_s: duree,
      categorie: selectors.stopCategory.value,
      cause: selectors.stopCause.value,
      sous_cause: selectors.stopSubCause.value,
      criticite: selectors.stopCriticite.value,
      comment: selectors.stopComment.value
    });
    state.stops.sort((a, b) => new Date(a.start) - new Date(b.start));
    persistState();
    selectors.stopDialog.close();
    renderStopsTable();
    renderJournal();
    renderAnalysis();
    showToast('Arrêt enregistré.', 'success');
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-dialog');
      const dialog = document.getElementById(id);
      if (dialog) dialog.close();
    });
  });
}

function resetStopForm() {
  selectors.stopForm.reset();
  selectors.stopDuration.textContent = '00:00';
  timerStartDate = null;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  populateTaxonomySelectors();
}

function bindExports() {
  selectors.exportProduction.addEventListener('click', () => {
    const header = ['session_id', 'ts', 'ok', 'ko', 'cadence_reelle', 'objectif_h', 'comment'];
    const rows = state.production_log.map((row) => header.map((key) => row[key] ?? ''));
    downloadCsv('production_log.csv', header, rows);
  });

  selectors.exportStops.addEventListener('click', () => {
    const header = ['session_id', 'start', 'end', 'duree_s', 'categorie', 'cause', 'sous_cause', 'criticite', 'comment'];
    const rows = state.stops.map((row) => header.map((key) => row[key] ?? ''));
    downloadCsv('stops.csv', header, rows);
  });

  selectors.exportReport.addEventListener('click', () => {
    const sessionId = selectors.analysisSession.value || currentSessionId;
    if (!sessionId) {
      showToast('Aucune session sélectionnée.', 'warn');
      return;
    }
    const session = state.sessions.find((s) => s.session_id === sessionId);
    const kpis = computeKpis(sessionId);
    const topLosses = buildTopLosses(sessionId);
    const insights = buildInsights(sessionId, kpis, topLosses);
    updateReport(session, kpis, topLosses, insights);
    selectors.reportDialog.showModal();
  });

  selectors.printReport.addEventListener('click', () => {
    window.print();
  });
}

function bindParameters() {
  selectors.addTarget.addEventListener('click', () => {
    state.targets.push({
      ligne: '',
      produit: '',
      cadence_cible: 0,
      objectif_h: 0,
      seuil_perf: 0.9,
      seuil_rejet: 0.02
    });
    persistState();
    renderTargetsTable();
  });

  selectors.addTaxonomy.addEventListener('click', () => {
    state.taxonomy.push({ categorie: '', cause: '', sous_cause: '' });
    persistState();
    renderTaxonomyTable();
    populateTaxonomySelectors();
  });

  selectors.addUser.addEventListener('click', () => {
    state.users.push({ user_id: `user-${Date.now()}`, nom: '', role: '' });
    persistState();
    renderUsersTable();
  });

  selectors.resetState.addEventListener('click', () => {
    if (!confirm('Confirmer la réinitialisation des données ?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    currentSessionId = state.sessions[0]?.session_id ?? null;
    persistState();
    init();
    showToast('Données réinitialisées.', 'warn');
  });

  selectors.gatewayToggle.addEventListener('change', updateGateway);
}

function renderTargetsTable() {
  selectors.targetsTableBody.innerHTML = '';
  state.targets.forEach((target, index) => {
    const tr = document.createElement('tr');
    ['ligne', 'produit', 'cadence_cible', 'objectif_h', 'seuil_perf', 'seuil_rejet'].forEach((key) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.value = target[key] ?? '';
      input.type = key.includes('seuil') ? 'number' : 'text';
      input.step = key.includes('seuil') ? '0.01' : '1';
      input.addEventListener('change', () => {
        target[key] = input.type === 'number' ? Number(input.value) : input.value;
        persistState();
        renderAnalysis();
      });
      td.append(input);
      tr.append(td);
    });
    const actions = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn warn';
    btn.textContent = 'Supprimer';
    btn.addEventListener('click', () => {
      state.targets.splice(index, 1);
      persistState();
      renderTargetsTable();
      renderAnalysis();
    });
    actions.append(btn);
    tr.append(actions);
    selectors.targetsTableBody.append(tr);
  });
}

function renderTaxonomyTable() {
  selectors.taxonomyTableBody.innerHTML = '';
  state.taxonomy.forEach((item, index) => {
    const tr = document.createElement('tr');
    ['categorie', 'cause', 'sous_cause'].forEach((key) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = item[key] ?? '';
      input.addEventListener('change', () => {
        item[key] = input.value;
        persistState();
        populateTaxonomySelectors();
      });
      td.append(input);
      tr.append(td);
    });
    const actions = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn warn';
    btn.textContent = 'Supprimer';
    btn.addEventListener('click', () => {
      state.taxonomy.splice(index, 1);
      persistState();
      renderTaxonomyTable();
      populateTaxonomySelectors();
    });
    actions.append(btn);
    tr.append(actions);
    selectors.taxonomyTableBody.append(tr);
  });
}

function renderUsersTable() {
  selectors.usersTableBody.innerHTML = '';
  state.users.forEach((user, index) => {
    const tr = document.createElement('tr');
    ['user_id', 'nom', 'role'].forEach((key) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = user[key] ?? '';
      input.addEventListener('change', () => {
        user[key] = input.value;
        persistState();
        populateAnalysisSelectors();
      });
      td.append(input);
      tr.append(td);
    });
    const actions = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn warn';
    btn.textContent = 'Supprimer';
    btn.addEventListener('click', () => {
      state.users.splice(index, 1);
      persistState();
      renderUsersTable();
    });
    actions.append(btn);
    tr.append(actions);
    selectors.usersTableBody.append(tr);
  });
}

function downloadCsv(filename, headers, rows) {
  const csvRows = [headers.join(',')];
  rows.forEach((row) => {
    csvRows.push(row.map((value) => formatCsvValue(value)).join(','));
  });
  const bom = '﻿';
  const blob = new Blob([bom + csvRows.join('
')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${filename} exporté.`, 'success');
}

function formatCsvValue(value) {
  const str = value === null || value === undefined ? '' : String(value).replace(/"/g, '""');
  if (str.includes(',') || str.includes('
')) {
    return `"${str}"`;
  }
  return str;
}

function populateAnalysisSelectors() {
  selectors.analysisSession.innerHTML = '';
  state.sessions.forEach((session) => {
    const option = document.createElement('option');
    option.value = session.session_id;
    option.textContent = `${session.date} • ${session.ligne}`;
    selectors.analysisSession.append(option);
  });
  const analysisId = currentSessionId || state.sessions[0]?.session_id;
  if (analysisId) {
    selectors.analysisSession.value = analysisId;
  }

  const teams = [...new Set(state.sessions.map((s) => s.equipe).filter(Boolean))];
  selectors.analysisTeamFilter.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Toutes équipes';
  selectors.analysisTeamFilter.append(allOption);
  teams.forEach((team) => {
    const option = document.createElement('option');
    option.value = team;
    option.textContent = team;
    selectors.analysisTeamFilter.append(option);
  });
  selectors.analysisTeamFilter.value = 'all';


}

function renderAnalysis() {
  const selectedSessionId = selectors.analysisSession.value || currentSessionId;
  const teamFilter = selectors.analysisTeamFilter.value;
  let sessionIds = [];
  let focusSession = null;
  let metaLabel = '';

  if (teamFilter && teamFilter !== 'all') {
    sessionIds = state.sessions.filter((s) => s.equipe === teamFilter).map((s) => s.session_id);
    if (sessionIds.length === 0) {
      selectors.analysisMeta.textContent = `Aucune session pour ${teamFilter}`;
      return;
    }
    focusSession = state.sessions.find((s) => s.session_id === selectedSessionId) ||
      state.sessions.find((s) => s.session_id === sessionIds[0]);
    metaLabel = `Équipe ${teamFilter} — ${sessionIds.length} session${sessionIds.length > 1 ? 's' : ''}`;
  } else {
    if (!selectedSessionId) return;
    focusSession = state.sessions.find((s) => s.session_id === selectedSessionId);
    if (!focusSession) return;
    sessionIds = [focusSession.session_id];
    metaLabel = `${focusSession.date} • ${focusSession.site} • ${focusSession.ligne} • ${focusSession.produit || ''}`;
  }

  const kpis = computeAggregateKpis(sessionIds);
  const target = focusSession ? findTarget(focusSession) : null;
  updateKpiCard('oee', kpis.oee, '%', evaluateStatus(kpis.oee / 100, target?.seuil_perf));
  updateKpiCard('performance', kpis.performance, '%', evaluateStatus(kpis.performance / 100, target?.seuil_perf));
  updateKpiCard('quality', kpis.quality, '%', evaluateQualityStatus(kpis.quality / 100, target?.seuil_rejet));
  updateKpiCard('availability', kpis.availability, '%', evaluateStatus(kpis.availability / 100, target?.seuil_perf));
  updateKpiCard('reject', kpis.rejectRate, '%', evaluateRejectStatus(kpis.rejectRate / 100, target?.seuil_rejet));
  updateKpiCard('mtbf', kpis.mtbf, ' min', classifyDuration(kpis.mtbf));
  updateKpiCard('mttr', kpis.mttr, ' min', classifyDurationReverse(kpis.mttr));

  selectors.analysisMeta.textContent = metaLabel;

  if (focusSession) {
    renderCharts(focusSession.session_id);
  }

  const losses = buildTopLosses(sessionIds);
  selectors.topLosses.innerHTML = '';
  losses.forEach((loss) => {
    const li = document.createElement('li');
    li.textContent = `${loss.cause} — ${formatDuration(loss.duration)}`;
    selectors.topLosses.append(li);
  });

  const insights = buildInsights(sessionIds, kpis, losses);
  selectors.insights.innerHTML = '';
  insights.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    selectors.insights.append(li);
  });
}

function computeKpis(sessionId) {
  const base = getSessionBase(sessionId);
  if (!base) {
    return {
      planned: 0,
      run: 0,
      downtime: 0,
      performance: 0,
      availability: 0,
      quality: 0,
      oee: 0,
      rejectRate: 0,
      mtbf: 0,
      mttr: 0
    };
  }
  const performance = base.theoretical > 0 ? (base.ok / base.theoretical) * 100 : 0;
  const availability = base.plannedMinutes > 0 ? (base.runMinutes / base.plannedMinutes) * 100 : 0;
  const total = base.ok + base.ko;
  const quality = total > 0 ? (base.ok / total) * 100 : 0;
  const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;
  const rejectRate = total > 0 ? (base.ko / total) * 100 : 0;
  const mtbf = base.majorStops > 0 ? base.runMinutes / base.majorStops : base.runMinutes;
  const mttr = base.majorStops > 0 ? base.majorDowntimeMinutes / base.majorStops : 0;
  return {
    planned: base.plannedMinutes,
    run: base.runMinutes,
    downtime: base.downtimeMinutes,
    ok: base.ok,
    ko: base.ko,
    performance: Number.isFinite(performance) ? performance : 0,
    availability: Number.isFinite(availability) ? availability : 0,
    quality: Number.isFinite(quality) ? quality : 0,
    oee: Number.isFinite(oee) ? oee : 0,
    rejectRate: Number.isFinite(rejectRate) ? rejectRate : 0,
    mtbf: Number.isFinite(mtbf) ? mtbf : 0,
    mttr: Number.isFinite(mttr) ? mttr : 0
  };
}

function computeAggregateKpis(sessionIds) {
  const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
  const totals = {
    plannedMinutes: 0,
    runMinutes: 0,
    downtimeMinutes: 0,
    ok: 0,
    ko: 0,
    theoretical: 0,
    majorStops: 0,
    majorDowntimeMinutes: 0
  };
  ids.forEach((id) => {
    const base = getSessionBase(id);
    if (!base) return;
    totals.plannedMinutes += base.plannedMinutes;
    totals.runMinutes += base.runMinutes;
    totals.downtimeMinutes += base.downtimeMinutes;
    totals.ok += base.ok;
    totals.ko += base.ko;
    totals.theoretical += base.theoretical;
    totals.majorStops += base.majorStops;
    totals.majorDowntimeMinutes += base.majorDowntimeMinutes;
  });
  const performance = totals.theoretical > 0 ? (totals.ok / totals.theoretical) * 100 : 0;
  const availability = totals.plannedMinutes > 0 ? (totals.runMinutes / totals.plannedMinutes) * 100 : 0;
  const totalPieces = totals.ok + totals.ko;
  const quality = totalPieces > 0 ? (totals.ok / totalPieces) * 100 : 0;
  const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;
  const rejectRate = totalPieces > 0 ? (totals.ko / totalPieces) * 100 : 0;
  const mtbf = totals.majorStops > 0 ? totals.runMinutes / totals.majorStops : totals.runMinutes;
  const mttr = totals.majorStops > 0 ? totals.majorDowntimeMinutes / totals.majorStops : 0;
  return {
    planned: totals.plannedMinutes,
    run: totals.runMinutes,
    downtime: totals.downtimeMinutes,
    ok: totals.ok,
    ko: totals.ko,
    performance: Number.isFinite(performance) ? performance : 0,
    availability: Number.isFinite(availability) ? availability : 0,
    quality: Number.isFinite(quality) ? quality : 0,
    oee: Number.isFinite(oee) ? oee : 0,
    rejectRate: Number.isFinite(rejectRate) ? rejectRate : 0,
    mtbf: Number.isFinite(mtbf) ? mtbf : 0,
    mttr: Number.isFinite(mttr) ? mttr : 0
  };
}

function getSessionBase(sessionId) {
  const session = state.sessions.find((s) => s.session_id === sessionId);
  if (!session) return null;
  const start = new Date(`${session.date}T${session.debut || '00:00'}:00`);
  const end = new Date(`${session.date}T${session.fin || '00:00'}:00`);
  const plannedMinutes = Math.max(0, (end - start) / 60000);
  const stops = state.stops.filter((stop) => stop.session_id === sessionId);
  const downtimeMinutes = stops.reduce((sum, stop) => sum + (stop.duree_s || 0) / 60, 0);
  const runMinutes = Math.max(0, plannedMinutes - downtimeMinutes);
  const production = state.production_log.filter((log) => log.session_id === sessionId);
  const ok = production.reduce((sum, log) => sum + (Number(log.ok) || 0), 0);
  const ko = production.reduce((sum, log) => sum + (Number(log.ko) || 0), 0);
  const cadenceCible = Number(session.cadence_cible) || 0;
  const theoretical = cadenceCible * (runMinutes / 60);
  const majorStops = stops.filter((stop) => ['Majeur', 'Critique'].includes(stop.criticite));
  const majorDowntimeMinutes = majorStops.reduce((sum, stop) => sum + (stop.duree_s || 0) / 60, 0);
  return {
    session,
    plannedMinutes,
    downtimeMinutes,
    runMinutes,
    ok,
    ko,
    theoretical,
    majorStops: majorStops.length,
    majorDowntimeMinutes
  };
}

function findTarget(session) {
  return state.targets.find((target) => target.ligne === session.ligne && target.produit === session.produit);
}

function updateKpiCard(key, value, suffix = '', status = 'ok') {
  const card = selectors.kpiCards[key];
  if (!card) return;
  card.querySelector('.kpi-value').textContent = `${value.toFixed(1)}${suffix}`;
  card.classList.remove('ok', 'warn', 'bad');
  card.classList.add(status);
}

function evaluateStatus(value, threshold = 0.85) {
  if (value >= (threshold || 0.85)) return 'ok';
  if (value >= (threshold || 0.85) * 0.9) return 'warn';
  return 'bad';
}

function evaluateQualityStatus(value, rejectThreshold = 0.02) {
  const target = 1 - (rejectThreshold || 0.02);
  if (value >= target) return 'ok';
  if (value >= target - 0.05) return 'warn';
  return 'bad';
}

function evaluateRejectStatus(value, threshold = 0.02) {
  if (value <= (threshold || 0.02)) return 'ok';
  if (value <= (threshold || 0.02) * 1.5) return 'warn';
  return 'bad';
}

function classifyDuration(value) {
  if (value >= 60) return 'ok';
  if (value >= 30) return 'warn';
  return 'bad';
}

function classifyDurationReverse(value) {
  if (value <= 15) return 'ok';
  if (value <= 30) return 'warn';
  return 'bad';
}

function renderCharts(sessionId) {
  const session = state.sessions.find((s) => s.session_id === sessionId);
  if (!session) return;
  const production = state.production_log
    .filter((log) => log.session_id === sessionId)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const labels = production.map((log) => new Date(log.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  const cumulativeOk = [];
  const cumulativeTarget = [];
  let accOk = 0;
  production.forEach((log, idx) => {
    accOk += Number(log.ok) || 0;
    cumulativeOk.push(accOk);
    const targetHourly = Number(log.objectif_h) || Number(session.objectif_h) || Number(session.cadence_cible) || 0;
    cumulativeTarget.push(targetHourly * (idx + 1));
  });
  const ctxOk = document.getElementById('chart-ok-target').getContext('2d');
  if (charts.okTarget) charts.okTarget.destroy();
  charts.okTarget = new Chart(ctxOk, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'OK cumulés',
          data: cumulativeOk,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.2)',
          fill: true
        },
        {
          label: 'Cible cumulée',
          data: cumulativeTarget,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          fill: false
        }
      ]
    }
  });

  const losses = buildTopLosses(sessionId, Infinity);
  const ctxPareto = document.getElementById('chart-pareto').getContext('2d');
  if (charts.pareto) charts.pareto.destroy();
  charts.pareto = new Chart(ctxPareto, {
    type: 'bar',
    data: {
      labels: losses.map((l) => l.cause),
      datasets: [
        {
          data: losses.map((l) => Math.round(l.duration / 60)),
          backgroundColor: losses.map(() => '#f97316')
        }
      ]
    }
  });

  const sessionsByTeam = state.sessions.reduce((map, s) => {
    if (!s.equipe) return map;
    const key = s.equipe;
    const kpis = computeKpis(s.session_id);
    map[key] = (map[key] || 0) + kpis.ok;
    return map;
  }, {});
  const teamEntries = Object.entries(sessionsByTeam);
  if (teamEntries.length <= 1) {
    selectors.teamChartCard.classList.add('hidden');
  } else {
    selectors.teamChartCard.classList.remove('hidden');
    const ctxTeam = document.getElementById('chart-team').getContext('2d');
    if (charts.team) charts.team.destroy();
    charts.team = new Chart(ctxTeam, {
      type: 'doughnut',
      data: {
        labels: teamEntries.map(([team]) => team),
        datasets: [
          {
            data: teamEntries.map(([, value]) => value),
            backgroundColor: ['#22d3ee', '#34d399', '#facc15', '#f97316', '#f87171']
          }
        ]
      }
    });
  }
}

function buildTopLosses(sessionIds, limit = 3) {
  const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
  const stops = state.stops.filter((stop) => ids.includes(stop.session_id));
  const grouped = new Map();
  stops.forEach((stop) => {
    const key = `${stop.categorie} • ${stop.cause}`;
    grouped.set(key, (grouped.get(key) || 0) + (stop.duree_s || 0));
  });
  return Array.from(grouped.entries())
    .map(([cause, duration]) => ({ cause, duration }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, limit);
}

function buildInsights(sessionIds, kpis, losses) {
  const insights = [];
  if (kpis.availability < 80) {
    insights.push(`Disponibilité à ${kpis.availability.toFixed(1)} %, investiguer les arrêts prolongés.`);
  }
  if (kpis.performance < 90 && kpis.performance > 0) {
    insights.push(`Performance à ${kpis.performance.toFixed(1)} %, vérifier cadence et goulots.`);
  }
  if (kpis.rejectRate > 2) {
    insights.push(`Taux de rejet ${kpis.rejectRate.toFixed(1)} %, renforcer les contrôles.`);
  }
  if (losses.length > 0) {
    const top = losses.slice(0, 2);
    const totalDuration = losses.reduce((sum, loss) => sum + loss.duration, 0);
    const share = totalDuration > 0 ? (top.reduce((sum, loss) => sum + loss.duration, 0) / totalDuration) * 100 : 0;
    insights.push(`${share.toFixed(0)} % des pertes concentrées sur ${top.length} causes.`);
  }
  if (insights.length === 0) {
    insights.push('Rien à signaler, maintien du plan de contrôle.');
  }
  return insights;
}

function updateReport(session, kpis, losses, insights) {
  const container = selectors.reportContent;
  container.innerHTML = '';
  const header = document.createElement('section');
  header.className = 'report-header';
  header.innerHTML = `
    <h3>${session.date} — ${session.site}</h3>
    <p>Ligne ${session.ligne} • ${session.produit || 'N/A'} • ${session.equipe || ''} • Shift ${session.shift || ''}</p>
  `;
  container.append(header);

  const kpiSection = document.createElement('section');
  kpiSection.className = 'report-kpis';
  const kpiList = [
    { label: 'TRS / OEE', value: `${kpis.oee.toFixed(1)} %` },
    { label: 'Disponibilité', value: `${kpis.availability.toFixed(1)} %` },
    { label: 'Performance', value: `${kpis.performance.toFixed(1)} %` },
    { label: 'Qualité', value: `${kpis.quality.toFixed(1)} %` },
    { label: 'Taux rejet', value: `${kpis.rejectRate.toFixed(1)} %` }
  ];
  kpiList.forEach((item) => {
    const card = document.createElement('article');
    card.innerHTML = `<h4>${item.label}</h4><p>${item.value}</p>`;
    kpiSection.append(card);
  });
  container.append(kpiSection);

  const lossSection = document.createElement('section');
  lossSection.innerHTML = '<h4>Top pertes</h4>';
  const list = document.createElement('ol');
  losses.slice(0, 3).forEach((loss) => {
    const li = document.createElement('li');
    li.textContent = `${loss.cause} — ${formatDuration(loss.duration)}`;
    list.append(li);
  });
  lossSection.append(list);
  container.append(lossSection);

  const insightSection = document.createElement('section');
  insightSection.innerHTML = '<h4>Points d’attention</h4>';
  const insightList = document.createElement('ul');
  insights.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    insightList.append(li);
  });
  insightSection.append(insightList);
  container.append(insightSection);
}

function bindImports() {
  selectors.importJsonBtn.addEventListener('click', () => selectors.importJsonInput.click());
  selectors.importCsvBtn.addEventListener('click', () => selectors.importCsvInput.click());

  selectors.importJsonInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      state = migrateState(data);
      persistState();
      init();
      showToast('Import JSON réussi.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Import JSON invalide.', 'error');
    } finally {
      event.target.value = '';
    }
  });

  selectors.importCsvInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const type = prompt('Importer pour Production ou Arrêts ? (prod/stop)', 'prod');
    try {
      if (type === 'prod') {
        mergeProductionCsv(text);
      } else if (type === 'stop') {
        mergeStopsCsv(text);
      } else {
        showToast('Type inconnu, import annulé.', 'warn');
      }
      persistState();
      renderProductionTable();
      renderStopsTable();
      renderJournal();
      renderAnalysis();
      showToast('Import CSV terminé.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erreur import CSV.', 'error');
    } finally {
      event.target.value = '';
    }
  });
}

function mergeProductionCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) throw new Error('En-tête manquant');
  const indexes = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  rows.forEach((row) => {
    const entry = {
      session_id: row[indexes.session_id],
      ts: row[indexes.ts],
      ok: Number(row[indexes.ok]) || 0,
      ko: Number(row[indexes.ko]) || 0,
      cadence_reelle: Number(row[indexes.cadence_reelle]) || 0,
      objectif_h: Number(row[indexes.objectif_h]) || 0,
      comment: row[indexes.comment] || ''
    };
    const existing = state.production_log.find((p) => p.session_id === entry.session_id && p.ts === entry.ts);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      state.production_log.push(entry);
    }
  });
}

function mergeStopsCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) throw new Error('En-tête manquant');
  const indexes = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  rows.forEach((row) => {
    const entry = {
      session_id: row[indexes.session_id],
      start: row[indexes.start],
      end: row[indexes.end],
      duree_s: Number(row[indexes.duree_s]) || 0,
      categorie: row[indexes.categorie] || '',
      cause: row[indexes.cause] || '',
      sous_cause: row[indexes.sous_cause] || '',
      criticite: row[indexes.criticite] || '',
      comment: row[indexes.comment] || ''
    };
    const existing = state.stops.find(
      (stop) => stop.session_id === entry.session_id && stop.start === entry.start && stop.end === entry.end
    );
    if (existing) {
      Object.assign(existing, entry);
    } else {
      state.stops.push(entry);
    }
  });
}

function parseCsv(text) {
  const lines = text.split(/
?
/).filter(Boolean);
  return lines.map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  });
}

function updateGateway() {
  if (gatewayInterval) {
    clearInterval(gatewayInterval);
    gatewayInterval = null;
  }
  if (!selectors.gatewayToggle.checked) return;
  const url = selectors.datasourceUrl.value;
  if (!url) return;
  const fetchData = async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Erreur réseau');
      const payload = await response.json();
      if (payload.production_log) {
        payload.production_log.forEach((row) => {
          const existing = state.production_log.find((p) => p.session_id === row.session_id && p.ts === row.ts);
          if (existing) Object.assign(existing, row);
        });
      }
      if (payload.stops) {
        payload.stops.forEach((stop) => {
          const existing = state.stops.find((s) => s.session_id === stop.session_id && s.start === stop.start);
          if (existing) Object.assign(existing, stop);
        });
      }
      persistState();
      renderProductionTable();
      renderStopsTable();
      renderJournal();
      renderAnalysis();
    } catch (error) {
      console.warn('Passerelle indisponible', error);
    }
  };
  fetchData();
  gatewayInterval = setInterval(fetchData, 5 * 60 * 1000);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  selectors.toastContainer.append(toast);
  setTimeout(() => {
    toast.classList.add('visible');
  }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatDuration(seconds) {
  const value = Math.round(seconds);
  const mins = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

function toLocalDateTime(date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

window.addEventListener('beforeunload', () => {
  if (gatewayInterval) {
    clearInterval(gatewayInterval);
  }
});
