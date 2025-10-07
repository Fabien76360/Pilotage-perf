const STORAGE_KEY = "prs_performance_state_v1";

const Utils = (() => {
  const pad = (value) => value.toString().padStart(2, "0");
  const minutesToLabel = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const hourLabel = (hour) => `${pad(hour)}:00`;
  const parseTime = (time) => {
    if (!time) return 0;
    const [h = "0", m = "0"] = time.split(":");
    return Number(h) * 60 + Number(m);
  };
  const uid = () => `id-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const sum = (values) => values.reduce((acc, value) => acc + Number(value || 0), 0);
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowTimestamp = () => new Date().toISOString();
  return { pad, minutesToLabel, hourLabel, parseTime, uid, sum, clamp, formatPercent, todayISO, nowTimestamp };
})();

const TeamPlanner = (() => {
  const teamForMinute = (minute, teams) => {
    if (!teams || !teams.length) return null;
    const sorted = [...teams].sort((a, b) => Utils.parseTime(a.shiftStart) - Utils.parseTime(b.shiftStart));
    const dayMinute = minute % 1440;
    let chosen = sorted[sorted.length - 1];
    for (const team of sorted) {
      if (dayMinute >= Utils.parseTime(team.shiftStart)) {
        chosen = team;
      }
    }
    return chosen;
  };

  const teamForHour = (hour, teams) => teamForMinute(hour * 60, teams);

  const createTimeline = (teams) => {
    const slots = [];
    for (let minute = 0; minute < 1440; minute += 10) {
      const team = teamForMinute(minute, teams);
      slots.push({
        id: Utils.uid(),
        minute,
        status: "run",
        teamId: team ? team.id : null,
        eventId: null,
        note: "",
      });
    }
    return slots;
  };

  const createHourlyRecords = (teams) => {
    const records = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const team = teamForHour(hour, teams);
      const base = 180 + hour * 3;
      records.push({
        hour,
        teamId: team ? team.id : null,
        good: base,
        scrap: Math.floor((hour % 4) * 1.5),
      });
    }
    return records;
  };

  return { teamForMinute, teamForHour, createTimeline, createHourlyRecords };
})();

const Storage = (() => {
  const defaultState = () => {
    const lines = [
      { id: Utils.uid(), name: "Ligne A", cadence: 360, cycleTime: 0.17, trsThreshold: 0.85 },
      { id: Utils.uid(), name: "Ligne B", cadence: 420, cycleTime: 0.14, trsThreshold: 0.88 },
    ];
    const teams = [
      { id: Utils.uid(), name: "Équipe A", shiftStart: "06:00", color: "#3ddc97" },
      { id: Utils.uid(), name: "Équipe B", shiftStart: "14:00", color: "#ffb703" },
      { id: Utils.uid(), name: "Équipe C", shiftStart: "22:00", color: "#8ecae6" },
    ];
    const events = [
      { id: Utils.uid(), name: "Panne technique", category: "Technique", subCategory: "Capteur", color: "#f94144" },
      { id: Utils.uid(), name: "Réglage qualité", category: "Qualité", subCategory: "Démarrage", color: "#f3722c" },
      { id: Utils.uid(), name: "Manque matière", category: "Logistique", subCategory: "Appro", color: "#f9c74f" },
    ];
    const sessionId = Utils.uid();
    const timeline = TeamPlanner.createTimeline(teams);
    const hourlyRecords = TeamPlanner.createHourlyRecords(teams);
    const journal = [
      { id: Utils.uid(), ts: Utils.nowTimestamp(), type: "info", detail: "Session initialisée", comment: "" },
    ];
    return {
      schema_version: 1,
      lines,
      teams,
      events,
      sessions: [
        {
          id: sessionId,
          date: Utils.todayISO(),
          lineId: lines[0].id,
          orderId: "OF-001",
          cycleTime: lines[0].cycleTime,
          targetPerHour: lines[0].cadence,
          timeline,
          hourlyRecords,
          journal,
        },
      ],
      currentSessionId: sessionId,
    };
  };

  const migrate = (state) => {
    if (!state || typeof state !== "object") return defaultState();
    if (state.schema_version !== 1) {
      const migrated = defaultState();
      migrated.sessions = state.sessions || migrated.sessions;
      migrated.lines = state.lines || migrated.lines;
      migrated.teams = state.teams || migrated.teams;
      migrated.events = state.events || migrated.events;
      migrated.currentSessionId = migrated.sessions[0]?.id || migrated.currentSessionId;
      return migrated;
    }
    return state;
  };

  const load = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultState();
      const parsed = JSON.parse(stored);
      return migrate(parsed);
    } catch (error) {
      console.warn("Erreur lecture localStorage", error);
      return defaultState();
    }
  };

  const save = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Erreur écriture localStorage", error);
    }
  };

  return { load, save, defaultState };
})();

const Toasts = (() => {
  const container = document.querySelector(".toast-container");
  const show = (label, message, type = "info", timeout = 3500) => {
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="label">${label}</span><span class="message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 250);
    }, timeout);
  };
  return { show };
})();

const Analytics = (() => {
  const compute = (session, line, teams, events) => {
    if (!session) return null;
    const openMinutes = session.timeline.length * 10;
    const runMinutes = session.timeline.filter((slot) => slot.status === "run").length * 10;
    const goods = Utils.sum(session.hourlyRecords.map((record) => record.good));
    const scraps = Utils.sum(session.hourlyRecords.map((record) => record.scrap));
    const total = goods + scraps;
    const cycle = session.cycleTime || line?.cycleTime || 1;
    const target = session.targetPerHour || line?.cadence || 0;
    const trs = openMinutes ? (goods * cycle) / openMinutes : 0;
    const availability = openMinutes ? runMinutes / openMinutes : 0;
    const performance = runMinutes ? (goods * cycle) / runMinutes : 0;
    const quality = total ? goods / total : 0;

    const eventDurations = session.timeline
      .filter((slot) => slot.status === "event" && slot.eventId)
      .reduce((acc, slot) => {
        const key = slot.eventId;
        acc[key] = (acc[key] || 0) + 10;
        return acc;
      }, {});

    const losses = Object.entries(eventDurations)
      .map(([eventId, minutes]) => {
        const event = events.find((item) => item.id === eventId);
        return {
          id: eventId,
          name: event ? event.name : "Évènement",
          minutes,
          category: event?.category || "",
        };
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);

    const recurring = Object.values(
      session.timeline
        .filter((slot) => slot.status === "event" && slot.eventId)
        .reduce((acc, slot) => {
          const event = events.find((item) => item.id === slot.eventId);
          const key = event ? `${event.category}|${event.subCategory}` : "Autre";
          if (!acc[key]) {
            acc[key] = { key, count: 0, label: event ? `${event.category} - ${event.subCategory}` : "Autre" };
          }
          acc[key].count += 1;
          return acc;
        }, {})
    ).sort((a, b) => b.count - a.count);

    const teamTotals = session.hourlyRecords.reduce((acc, record) => {
      if (!record.teamId) return acc;
      acc[record.teamId] = acc[record.teamId] || { good: 0, scrap: 0 };
      acc[record.teamId].good += Number(record.good || 0);
      acc[record.teamId].scrap += Number(record.scrap || 0);
      return acc;
    }, {});

    return {
      openMinutes,
      runMinutes,
      goods,
      scraps,
      total,
      cycle,
      target,
      trs,
      availability,
      performance,
      quality,
      losses,
      recurring,
      teamTotals,
    };
  };

  const drawHourlyChart = (canvas, session, line) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const records = session?.hourlyRecords || [];
    if (!records.length) return;
    const target = session?.targetPerHour || line?.cadence || 0;
    const maxGood = Math.max(target, ...records.map((record) => Number(record.good || 0)));
    const maxValue = maxGood <= 0 ? 1 : maxGood * 1.2;

    ctx.strokeStyle = "rgba(154, 167, 199, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = height - (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (target > 0) {
      const y = height - (target / maxValue) * height;
      ctx.strokeStyle = "rgba(61, 220, 151, 0.7)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(61, 220, 151, 0.9)";
      ctx.font = "12px Inter";
      ctx.fillText(`Cible ${target}`, 8, Math.max(12, y - 6));
    }

    const barWidth = width / (records.length * 1.6);
    records.forEach((record, index) => {
      const good = Number(record.good || 0);
      const x = 20 + index * (barWidth * 1.6);
      const barHeight = (good / maxValue) * (height - 24);
      ctx.fillStyle = "rgba(61, 220, 151, 0.75)";
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      if (index % 3 === 0) {
        ctx.fillStyle = "rgba(245, 247, 255, 0.7)";
        ctx.font = "11px Inter";
        ctx.fillText(Utils.pad(record.hour), x, height - 4);
      }
    });
  };

  const drawTeamChart = (canvas, teamTotals, teams) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const items = teams.map((team) => ({ team, totals: teamTotals[team.id] || { good: 0, scrap: 0 } }));
    const maxValue = Math.max(...items.map((item) => item.totals.good), 1) * 1.2;
    const barHeight = 36;
    const spacing = 24;
    items.forEach((item, index) => {
      const y = spacing + index * (barHeight + spacing);
      ctx.fillStyle = "rgba(154, 167, 199, 0.2)";
      ctx.fillRect(40, y, width - 160, barHeight);
      const valueWidth = ((item.totals.good || 0) / maxValue) * (width - 160);
      ctx.fillStyle = item.team.color || "rgba(61, 220, 151, 0.8)";
      ctx.fillRect(40, y, valueWidth, barHeight);
      ctx.fillStyle = "rgba(245, 247, 255, 0.85)";
      ctx.font = "14px Inter";
      ctx.fillText(item.team.name, 40, y - 8);
      ctx.fillText(`${Math.round(item.totals.good)} u`, 50, y + barHeight / 1.5);
      ctx.fillStyle = "rgba(255, 107, 107, 0.7)";
      const scrapWidth = ((item.totals.scrap || 0) / maxValue) * (width - 160);
      ctx.fillRect(40, y + barHeight - 6, scrapWidth, 6);
    });
  };

  return { compute, drawHourlyChart, drawTeamChart };
})();

const Exporters = (() => {
  const download = (filename, content, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 0);
  };

  const journalToCSV = (journal) => {
    const header = "ts,type,detail,comment";
    const rows = journal.map((item) => [item.ts, item.type, item.detail, item.comment?.replace(/\n/g, " ") || ""].map((value) => `"${(value || "").replace(/"/g, '""')}"`).join(","));
    return [header, ...rows].join("\n");
  };

  const sessionToHTML = (session, line, metrics) => {
    const header = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Rapport ${session.orderId || ""}</title><style>body{font-family:Inter,Arial,sans-serif;background:#fff;color:#0f1a34;padding:32px;}h1{margin-top:0;}section{margin-bottom:28px;}table{border-collapse:collapse;width:100%;margin-top:12px;}th,td{border:1px solid #d9e2f5;padding:8px;text-align:left;}th{background:#f2f5fb;} .kpis{display:flex;gap:18px;flex-wrap:wrap;} .kpi{flex:1 1 160px;border:1px solid #d9e2f5;border-radius:12px;padding:12px;} .kpi h2{margin:0;font-size:0.9rem;color:#53608c;} .kpi p{margin:6px 0 0;font-size:1.6rem;font-weight:600;} ul{margin:0;padding-left:18px;} .badge{display:inline-block;padding:2px 10px;border-radius:999px;background:#3ddc97;color:#0f1a34;font-size:0.75rem;margin-left:8px;}</style></head><body>`;
    const meta = `<h1>Rapport Performance</h1><p><strong>Ligne :</strong> ${line?.name || ""} <span class="badge">${session.date}</span></p><p><strong>Ordre :</strong> ${session.orderId || "-"}</p>`;
    const kpis = `<section><div class="kpis"><div class="kpi"><h2>TRS</h2><p>${Utils.formatPercent(metrics.trs)}</p></div><div class="kpi"><h2>Disponibilité</h2><p>${Utils.formatPercent(metrics.availability)}</p></div><div class="kpi"><h2>Performance</h2><p>${Utils.formatPercent(metrics.performance)}</p></div><div class="kpi"><h2>Qualité</h2><p>${Utils.formatPercent(metrics.quality)}</p></div></div></section>`;
    const journalRows = session.journal
      .map((item) => `<tr><td>${item.ts}</td><td>${item.type}</td><td>${item.detail}</td><td>${item.comment || ""}</td></tr>`)
      .join("");
    const journal = `<section><h2>Journal</h2><table><thead><tr><th>Horodatage</th><th>Type</th><th>Détails</th><th>Commentaire</th></tr></thead><tbody>${journalRows}</tbody></table></section>`;
    const losses = metrics.losses
      .map((loss) => `<li>${loss.name} : ${loss.minutes} min</li>`)
      .join("") || "<li>RAS</li>";
    const recurring = metrics.recurring
      .map((item) => `<li>${item.label} (${item.count})</li>`)
      .join("") || "<li>RAS</li>";
    const lossesBlock = `<section><h2>Pertes</h2><ul>${losses}</ul><h3>Causes récurrentes</h3><ul>${recurring}</ul></section>`;
    const footer = "</body></html>";
    return `${header}${meta}${kpis}${lossesBlock}${journal}${footer}`;
  };

  return { download, journalToCSV, sessionToHTML };
})();

const App = (() => {
  const state = Storage.load();
  let currentSession = state.sessions.find((session) => session.id === state.currentSessionId) || state.sessions[0];
  if (!currentSession && state.sessions.length) {
    currentSession = state.sessions[0];
    state.currentSessionId = currentSession.id;
  }

  const dom = {
    tabs: Array.from(document.querySelectorAll(".tab-button")),
    panels: Array.from(document.querySelectorAll(".tab-panel")),
    sessionMeta: document.querySelector("#session-meta"),
    sessionLine: document.querySelector("#session-line"),
    sessionOrder: document.querySelector("#session-order"),
    sessionDate: document.querySelector("#session-date"),
    sessionCycle: document.querySelector("#session-cycle"),
    sessionTarget: document.querySelector("#session-target"),
    saveSession: document.querySelector("#save-session"),
    newSession: document.querySelector("#new-session"),
    hourlyTableBody: document.querySelector("#hourly-table tbody"),
    timelineGrid: document.querySelector("#timeline-grid"),
    journalBody: document.querySelector("#journal-table tbody"),
    exportJournalCsv: document.querySelector("#export-journal-csv"),
    exportReportHtml: document.querySelector("#export-report-html"),
    eventShortcut: document.querySelector("#event-shortcut"),
    slotDialog: document.querySelector("#slot-dialog"),
    slotForm: document.querySelector("#slot-form"),
    slotTeam: document.querySelector("#slot-team"),
    slotEvent: document.querySelector("#slot-event"),
    slotNote: document.querySelector("#slot-note"),
    slotTime: document.querySelector("#slot-time"),
    slotSave: document.querySelector("#slot-save"),
    kpiGrid: document.querySelector("#kpi-grid"),
    hourlyCanvas: document.querySelector("#chart-hourly"),
    teamCanvas: document.querySelector("#chart-team"),
    topLosses: document.querySelector("#top-losses"),
    recurringCauses: document.querySelector("#recurring-causes"),
    historyBody: document.querySelector("#history-table tbody"),
    linesTableBody: document.querySelector("#lines-table tbody"),
    teamsTableBody: document.querySelector("#teams-table tbody"),
    eventsTableBody: document.querySelector("#events-table tbody"),
    addLine: document.querySelector("#add-line"),
    addTeam: document.querySelector("#add-team"),
    addEvent: document.querySelector("#add-event"),
    resetState: document.querySelector("#reset-state"),
    confirmReset: document.querySelector("#confirm-reset"),
  };

  let selectedSlotIndex = null;

  const persist = () => Storage.save(state);

  const updateCurrentSession = (session) => {
    currentSession = session;
    state.currentSessionId = session.id;
    persist();
    renderAll();
  };

  const renderSessionMeta = () => {
    if (!currentSession) {
      dom.sessionMeta.textContent = "Aucune session";
      return;
    }
    const line = state.lines.find((item) => item.id === currentSession.lineId);
    dom.sessionMeta.textContent = `${currentSession.date} · ${line?.name || "Ligne"} · OF ${currentSession.orderId || "-"}`;
  };

  const populateSessionForm = () => {
    dom.sessionLine.innerHTML = state.lines.map((line) => `<option value="${line.id}">${line.name}</option>`).join("");
    dom.sessionLine.value = currentSession.lineId || state.lines[0]?.id || "";
    dom.sessionOrder.value = currentSession.orderId || "";
    dom.sessionDate.value = currentSession.date || Utils.todayISO();
    dom.sessionCycle.value = currentSession.cycleTime || "";
    dom.sessionTarget.value = currentSession.targetPerHour || "";
  };

  const renderHourlyTable = () => {
    dom.hourlyTableBody.innerHTML = "";
    currentSession.hourlyRecords.forEach((record) => {
      const team = TeamPlanner.teamForHour(record.hour, state.teams);
      record.teamId = team ? team.id : record.teamId;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${Utils.hourLabel(record.hour)}</td>
        <td><span class="team-pill" style="background:${team?.color || "#3ddc97"}"></span>${team?.name || ""}</td>
        <td><input type="number" min="0" step="1" value="${record.good}" data-hour="${record.hour}" data-field="good" /></td>
        <td><input type="number" min="0" step="1" value="${record.scrap}" data-hour="${record.hour}" data-field="scrap" /></td>`;
      dom.hourlyTableBody.appendChild(row);
    });
  };

  const attachHourlyEvents = () => {
    dom.hourlyTableBody.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const hour = Number(input.dataset.hour);
      const field = input.dataset.field;
      const record = currentSession.hourlyRecords.find((item) => item.hour === hour);
      if (!record) return;
      record[field] = Number(input.value || 0);
      currentSession.journal.push({
        id: Utils.uid(),
        ts: Utils.nowTimestamp(),
        type: "production",
        detail: `Heure ${Utils.hourLabel(hour)} - ${field === "good" ? "Bon" : "Rebut"} : ${record[field]}`,
        comment: "",
      });
      persist();
      renderJournal();
      refreshAnalysis();
    });
  };

  const renderTimeline = () => {
    dom.timelineGrid.innerHTML = "";
    currentSession.timeline.forEach((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `timeline-slot ${slot.status}`;
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `${Utils.minutesToLabel(slot.minute)} ${slot.status}`);
      button.textContent = Utils.minutesToLabel(slot.minute);
      const team = state.teams.find((item) => item.id === slot.teamId);
      const dot = document.createElement("span");
      dot.className = "team-dot";
      dot.style.background = team?.color || "#3ddc97";
      button.appendChild(dot);
      button.addEventListener("click", () => openSlotDialog(index));
      dom.timelineGrid.appendChild(button);
    });
  };

  const openSlotDialog = (index) => {
    const slot = currentSession.timeline[index];
    if (!slot) return;
    selectedSlotIndex = index;
    dom.slotTime.textContent = `Tranche ${Utils.minutesToLabel(slot.minute)}`;
    dom.slotTeam.innerHTML = state.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join("");
    dom.slotTeam.value = slot.teamId || state.teams[0]?.id || "";
    dom.slotEvent.innerHTML = `<option value="">-</option>` + state.events.map((event) => `<option value="${event.id}">${event.name}</option>`).join("");
    dom.slotEvent.value = slot.eventId || "";
    dom.slotNote.value = slot.note || "";
    dom.slotForm.querySelectorAll('input[name="slot-status"]').forEach((input) => {
      input.checked = input.value === slot.status;
    });
    if (typeof dom.slotDialog.showModal === "function") {
      dom.slotDialog.showModal();
    }
  };

  const applySlotChanges = () => {
    if (selectedSlotIndex == null) return;
    const slot = currentSession.timeline[selectedSlotIndex];
    if (!slot) return;
    const formData = new FormData(dom.slotForm);
    const status = formData.get("slot-status") || "run";
    slot.teamId = formData.get("slot-team") || slot.teamId;
    slot.status = status;
    slot.eventId = status === "event" ? formData.get("slot-event") || null : null;
    slot.note = dom.slotNote.value.trim();
    currentSession.journal.push({
      id: Utils.uid(),
      ts: Utils.nowTimestamp(),
      type: status === "event" ? "évènement" : "run",
      detail: `${Utils.minutesToLabel(slot.minute)} - ${status === "event" ? getEventName(slot.eventId) : "Run"}`,
      comment: slot.note,
    });
    persist();
    renderTimeline();
    renderJournal();
    refreshAnalysis();
    Toasts.show("Timeline", "Tranche mise à jour", "success");
  };

  const getEventName = (eventId) => state.events.find((event) => event.id === eventId)?.name || "Évènement";

  const renderJournal = () => {
    const sorted = [...currentSession.journal].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    dom.journalBody.innerHTML = "";
    sorted.forEach((entry) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.ts}</td>
        <td>${entry.type}</td>
        <td>${entry.detail}</td>
        <td><input type="text" value="${entry.comment || ""}" data-journal="${entry.id}" /></td>`;
      dom.journalBody.appendChild(row);
    });
  };

  const attachJournalEvents = () => {
    dom.journalBody.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const id = input.dataset.journal;
      const entry = currentSession.journal.find((item) => item.id === id);
      if (!entry) return;
      entry.comment = input.value;
      persist();
    });
  };

  const renderKpis = () => {
    const line = state.lines.find((item) => item.id === currentSession.lineId);
    const metrics = Analytics.compute(currentSession, line, state.teams, state.events);
    if (!metrics) return;
    const threshold = line?.trsThreshold || 0.85;
    const kpiMap = { trs: metrics.trs, availability: metrics.availability, performance: metrics.performance, quality: metrics.quality };
    dom.kpiGrid.querySelectorAll(".kpi-card").forEach((card) => {
      const key = card.dataset.kpi;
      const value = kpiMap[key];
      if (typeof value === "number") {
        card.querySelector(".value").textContent = Utils.formatPercent(Utils.clamp(value, 0, 1.5));
      }
      card.classList.remove("ok", "warn", "bad");
      if (key === "trs") {
        if (value >= threshold) card.classList.add("ok");
        else if (value >= threshold * 0.9) card.classList.add("warn");
        else card.classList.add("bad");
      }
    });
    dom.topLosses.innerHTML = metrics.losses.map((loss) => `<li>${loss.name} · ${loss.minutes} min</li>`).join("") || "<li>Aucune perte</li>";
    dom.recurringCauses.innerHTML = metrics.recurring.map((item) => `<li>${item.label} (${item.count})</li>`).join("") || "<li>Aucune</li>";
    Analytics.drawHourlyChart(dom.hourlyCanvas, currentSession, line);
    Analytics.drawTeamChart(dom.teamCanvas, metrics.teamTotals, state.teams);
  };

  const renderHistory = () => {
    const rows = state.sessions
      .map((session) => {
        const line = state.lines.find((item) => item.id === session.lineId);
        const metrics = Analytics.compute(session, line, state.teams, state.events) || {};
        return { session, line, trs: metrics.trs || 0 };
      })
      .sort((a, b) => new Date(b.session.date) - new Date(a.session.date));
    dom.historyBody.innerHTML = rows
      .map(
        (row) => `
        <tr>
          <td>${row.session.date}</td>
          <td>${row.line?.name || ""}</td>
          <td>${row.session.orderId || ""}</td>
          <td>${Utils.formatPercent(Utils.clamp(row.trs, 0, 1.5))}</td>
        </tr>`
      )
      .join("");
  };

  const renderLines = () => {
    dom.linesTableBody.innerHTML = state.lines
      .map(
        (line) => `
        <tr data-id="${line.id}">
          <td><input type="text" value="${line.name}" data-field="name" /></td>
          <td><input type="number" step="1" value="${line.cadence}" data-field="cadence" /></td>
          <td><input type="number" step="0.01" value="${line.cycleTime}" data-field="cycleTime" /></td>
          <td><input type="number" step="0.01" value="${line.trsThreshold}" data-field="trsThreshold" /></td>
          <td><button type="button" class="round-btn outline" data-action="remove-line">Supprimer</button></td>
        </tr>`
      )
      .join("");
  };

  const renderTeams = () => {
    dom.teamsTableBody.innerHTML = state.teams
      .map(
        (team) => `
        <tr data-id="${team.id}">
          <td><input type="text" value="${team.name}" data-field="name" /></td>
          <td><input type="time" value="${team.shiftStart}" data-field="shiftStart" /></td>
          <td><input type="color" value="${team.color}" data-field="color" /></td>
          <td><button type="button" class="round-btn outline" data-action="remove-team">Supprimer</button></td>
        </tr>`
      )
      .join("");
  };

  const renderEvents = () => {
    dom.eventsTableBody.innerHTML = state.events
      .map(
        (event) => `
        <tr data-id="${event.id}">
          <td><input type="text" value="${event.name}" data-field="name" /></td>
          <td><input type="text" value="${event.category}" data-field="category" /></td>
          <td><input type="text" value="${event.subCategory}" data-field="subCategory" /></td>
          <td><input type="color" value="${event.color}" data-field="color" /></td>
          <td><button type="button" class="round-btn outline" data-action="remove-event">Supprimer</button></td>
        </tr>`
      )
      .join("");
  };

  const attachSettingsEvents = () => {
    dom.linesTableBody.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const id = input.closest("tr")?.dataset.id;
      const line = state.lines.find((item) => item.id === id);
      if (!line) return;
      const field = input.dataset.field;
      line[field] = input.type === "number" ? Number(input.value || 0) : input.value;
      persist();
      renderSessionMeta();
      refreshAnalysis();
    });
    dom.linesTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='remove-line']");
      if (!button) return;
      const id = button.closest("tr")?.dataset.id;
      state.lines = state.lines.filter((line) => line.id !== id);
      if (currentSession.lineId === id && state.lines.length) {
        currentSession.lineId = state.lines[0].id;
      }
      persist();
      renderLines();
      populateSessionForm();
      refreshAnalysis();
    });

    dom.teamsTableBody.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const id = input.closest("tr")?.dataset.id;
      const team = state.teams.find((item) => item.id === id);
      if (!team) return;
      const field = input.dataset.field;
      team[field] = input.value;
      reassignTeams();
      persist();
      renderTimeline();
      renderHourlyTable();
      refreshAnalysis();
    });
    dom.teamsTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='remove-team']");
      if (!button) return;
      const id = button.closest("tr")?.dataset.id;
      state.teams = state.teams.filter((team) => team.id !== id);
      reassignTeams();
      persist();
      renderTeams();
      renderTimeline();
      renderHourlyTable();
      refreshAnalysis();
    });

    dom.eventsTableBody.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const id = input.closest("tr")?.dataset.id;
      const item = state.events.find((event) => event.id === id);
      if (!item) return;
      const field = input.dataset.field;
      item[field] = input.value;
      persist();
    });
    dom.eventsTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='remove-event']");
      if (!button) return;
      const id = button.closest("tr")?.dataset.id;
      state.events = state.events.filter((event) => event.id !== id);
      persist();
      renderEvents();
    });

    dom.addLine.addEventListener("click", () => {
      const line = { id: Utils.uid(), name: "Nouvelle ligne", cadence: 360, cycleTime: 0.2, trsThreshold: 0.85 };
      state.lines.push(line);
      persist();
      renderLines();
      populateSessionForm();
      Toasts.show("Paramètres", "Ligne ajoutée", "success");
    });
    dom.addTeam.addEventListener("click", () => {
      const team = { id: Utils.uid(), name: "Nouvelle équipe", shiftStart: "00:00", color: "#3ddc97" };
      state.teams.push(team);
      reassignTeams();
      persist();
      renderTeams();
      renderTimeline();
      renderHourlyTable();
      Toasts.show("Paramètres", "Équipe ajoutée", "success");
    });
    dom.addEvent.addEventListener("click", () => {
      const event = { id: Utils.uid(), name: "Nouvel évènement", category: "", subCategory: "", color: "#ff6b6b" };
      state.events.push(event);
      persist();
      renderEvents();
      Toasts.show("Paramètres", "Évènement ajouté", "success");
    });

    dom.resetState.addEventListener("click", () => {
      if (typeof dom.confirmReset.showModal === "function") {
        dom.confirmReset.returnValue = "";
        dom.confirmReset.showModal();
      }
    });

    dom.confirmReset.addEventListener("close", () => {
      if (dom.confirmReset.returnValue === "confirm") {
        const fresh = Storage.defaultState();
        Object.assign(state, fresh);
        currentSession = state.sessions[0];
        renderAll();
        persist();
        Toasts.show("Reset", "Données réinitialisées", "warn");
      }
    });
  };

  const reassignTeams = () => {
    currentSession.timeline.forEach((slot) => {
      const team = TeamPlanner.teamForMinute(slot.minute, state.teams);
      slot.teamId = team ? team.id : slot.teamId;
    });
    currentSession.hourlyRecords.forEach((record) => {
      const team = TeamPlanner.teamForHour(record.hour, state.teams);
      record.teamId = team ? team.id : record.teamId;
    });
  };

  const attachSessionEvents = () => {
    dom.sessionLine.addEventListener("change", () => {
      currentSession.lineId = dom.sessionLine.value;
      const line = state.lines.find((item) => item.id === currentSession.lineId);
      if (line) {
        currentSession.cycleTime = line.cycleTime;
        currentSession.targetPerHour = line.cadence;
        dom.sessionCycle.value = line.cycleTime;
        dom.sessionTarget.value = line.cadence;
      }
      persist();
      refreshAnalysis();
      renderSessionMeta();
    });
    dom.sessionOrder.addEventListener("input", () => {
      currentSession.orderId = dom.sessionOrder.value;
      persist();
      renderSessionMeta();
    });
    dom.sessionDate.addEventListener("change", () => {
      currentSession.date = dom.sessionDate.value;
      persist();
      renderSessionMeta();
      renderHistory();
    });
    dom.sessionCycle.addEventListener("change", () => {
      currentSession.cycleTime = Number(dom.sessionCycle.value || 0);
      persist();
      refreshAnalysis();
    });
    dom.sessionTarget.addEventListener("change", () => {
      currentSession.targetPerHour = Number(dom.sessionTarget.value || 0);
      persist();
      refreshAnalysis();
    });
    dom.saveSession.addEventListener("click", () => {
      persist();
      Toasts.show("Session", "Métadonnées sauvegardées", "success");
    });
    dom.newSession.addEventListener("click", () => {
      const line = state.lines[0];
      const session = {
        id: Utils.uid(),
        date: Utils.todayISO(),
        lineId: line?.id || null,
        orderId: "",
        cycleTime: line?.cycleTime || 0.2,
        targetPerHour: line?.cadence || 0,
        timeline: TeamPlanner.createTimeline(state.teams),
        hourlyRecords: TeamPlanner.createHourlyRecords(state.teams),
        journal: [],
      };
      state.sessions.push(session);
      updateCurrentSession(session);
      Toasts.show("Session", "Nouvelle session créée", "success");
    });
  };

  const attachTimelineEvents = () => {
    dom.slotSave.addEventListener("click", (event) => {
      event.preventDefault();
      applySlotChanges();
      dom.slotDialog.close();
    });
    if (dom.eventShortcut) {
      dom.eventShortcut.addEventListener("click", () => {
        const now = new Date();
        const minutes = now.getHours() * 60 + Math.floor(now.getMinutes() / 10) * 10;
        const index = currentSession.timeline.findIndex((slot) => slot.minute === minutes);
        openSlotDialog(index >= 0 ? index : 0);
      });
    }
  };

  const attachExportEvents = () => {
    dom.exportJournalCsv.addEventListener("click", () => {
      const csv = Exporters.journalToCSV(currentSession.journal);
      Exporters.download(`journal-${currentSession.date}.csv`, csv, "text/csv");
      Toasts.show("Export", "Journal exporté", "success");
    });
    dom.exportReportHtml.addEventListener("click", () => {
      const line = state.lines.find((item) => item.id === currentSession.lineId);
      const metrics = Analytics.compute(currentSession, line, state.teams, state.events);
      const html = Exporters.sessionToHTML(currentSession, line, metrics);
      Exporters.download(`rapport-${currentSession.date}.html`, html, "text/html");
      Toasts.show("Export", "Rapport généré", "success");
    });
  };

  const attachTabNavigation = () => {
    dom.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.target;
        dom.tabs.forEach((button) => {
          const isActive = button === tab;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        dom.panels.forEach((panel) => {
          const visible = panel.id === target;
          panel.classList.toggle("active", visible);
          panel.toggleAttribute("hidden", !visible);
        });
      });
    });
  };

  const refreshAnalysis = () => {
    renderKpis();
    renderHistory();
  };

  const renderAll = () => {
    populateSessionForm();
    renderSessionMeta();
    renderHourlyTable();
    renderTimeline();
    renderJournal();
    renderLines();
    renderTeams();
    renderEvents();
    refreshAnalysis();
  };

  const init = () => {
    attachTabNavigation();
    attachSessionEvents();
    attachHourlyEvents();
    attachJournalEvents();
    attachTimelineEvents();
    attachSettingsEvents();
    attachExportEvents();
    renderAll();
    Toasts.show("Dashboard", "Chargé avec succès", "success", 2500);
  };

  return { init };
})();

App.init();
