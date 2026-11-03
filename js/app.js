// Oberfläche: Ansichten, Eingaben und Ereignisse. Daten liegen über Store lokal.
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (x, d = 0) => Number(x || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const n = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function toDateStr(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  const todayStr = () => toDateStr(new Date());
  const addDays = (str, k) => {
    const d = new Date(str + 'T12:00:00');
    d.setDate(d.getDate() + k);
    return toDateStr(d);
  };
  const dateLabel = (str) => (str === todayStr()
    ? 'Heute'
    : new Date(str + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }));

  const MEALS = [['fruehstueck', 'Frühstück'], ['mittag', 'Mittagessen'], ['abend', 'Abendessen'], ['snack', 'Snacks']];
  const ACTIVITY = [
    [1.2, 'Kaum Bewegung (Bürojob)'],
    [1.375, 'Leicht aktiv (1–3 Einheiten/Woche)'],
    [1.55, 'Aktiv (3–5 Einheiten/Woche)'],
    [1.725, 'Sehr aktiv (6–7 Einheiten/Woche)'],
    [1.9, 'Extrem (Training plus körperliche Arbeit)'],
  ];
  const GOALS = [['cut', 'Abnehmen (Cut)'], ['maintain', 'Halten'], ['bulk', 'Muskelaufbau (Bulk)']];

  const state = { tab: 'diary', date: todayStr(), addMeal: null };

  // ---------- Daten ----------

  const defaults = () => ({
    name: '', sex: 'm', age: 30, height: 180, weight: 80, activity: 1.55,
    goal: 'bulk', pace: 300, waist: '', neck: '', hip: '',
  });
  const settings = () => ({ ...defaults(), ...Store.get('settings', {}) });

  const data = {
    days: () => Store.get('days', {}),
    day: (date) => data.days()[date] || { entries: [], water: 0 },
    saveDay: (date, day) => {
      const all = data.days();
      all[date] = day;
      Store.set('days', all);
    },
    weights: () => Store.get('weights', []),
    workouts: () => Store.get('workouts', []),
    custom: () => Store.get('custom', []),
  };

  // Einträge speichern pro 100 g. So lässt sich die Menge später ändern.
  const totals = (e) => {
    const k = e.grams / 100;
    return { kcal: e.base.kcal * k, p: e.base.p * k, f: e.base.f * k, c: e.base.c * k };
  };
  function sumEntries(list) {
    return list.reduce((t, e) => {
      const x = totals(e);
      return { kcal: t.kcal + x.kcal, p: t.p + x.p, f: t.f + x.f, c: t.c + x.c };
    }, { kcal: 0, p: 0, f: 0, c: 0 });
  }

  function addEntry(date, meal, food, grams) {
    const day = data.day(date);
    day.entries.push({
      id: uid(), meal, name: food.name, grams,
      base: { kcal: food.kcal, p: food.p, f: food.f, c: food.c },
    });
    data.saveDay(date, day);
  }

  const allFoods = () => Foods.list(data.custom());

  function weightAvg(from, to) {
    const w = data.weights().filter((e) => e.date >= from && e.date <= to);
    return w.length ? w.reduce((t, e) => t + e.kg, 0) / w.length : null;
  }

  function currentWeight() {
    const w = [...data.weights()].sort((a, b) => a.date.localeCompare(b.date));
    return w.length ? w[w.length - 1].kg : settings().weight;
  }

  function goals() {
    const s = settings();
    const kg = currentWeight();
    const kcal = Calc.goalKcal(s, kg);
    return { ...Calc.macros(s, kg, kcal), water: Math.round((kg * 35) / 50) * 50 };
  }

  function weekStats(end = todayStr()) {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
    const logged = dates.map((d) => data.day(d)).filter((d) => d.entries.length);
    const count = Math.max(logged.length, 1);
    const sum = logged.reduce((t, d) => {
      const s = sumEntries(d.entries);
      return { kcal: t.kcal + s.kcal, p: t.p + s.p, f: t.f + s.f, c: t.c + s.c };
    }, { kcal: 0, p: 0, f: 0, c: 0 });
    const recent = weightAvg(dates[0], end);
    const prev = weightAvg(addDays(dates[0], -7), addDays(dates[0], -1));

    return {
      loggedDays: logged.length,
      avg: {
        kcal: sum.kcal / count, p: sum.p / count, f: sum.f / count, c: sum.c / count,
        water: dates.reduce((t, d) => t + data.day(d).water, 0) / 7,
      },
      weightRate: recent !== null && prev !== null ? recent - prev : null,
      weightKg: currentWeight(),
      sessions: data.workouts().filter((w) => w.date >= dates[0] && w.date <= end).length,
      goals: goals(),
      goal: settings().goal,
    };
  }

  // ---------- Grafiken (SVG, ohne Bibliothek) ----------

  function lineChart(rows) {
    if (rows.length < 2) return '<p class="hint">Mindestens zwei Einträge für den Verlauf.</p>';
    const W = 320, H = 160, P = 24;
    const ys = rows.map((r) => r.kg);
    const min = Math.min(...ys) - 0.5, max = Math.max(...ys) + 0.5;
    const x = (i) => P + (i * (W - 2 * P)) / (rows.length - 1);
    const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
    const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.kg).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Gewichtsverlauf">
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${rows.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.kg).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('')}
      <text x="2" y="${y(max - 0.5).toFixed(1)}" class="axis">${fmt(max - 0.5, 1)}</text>
      <text x="2" y="${y(min + 0.5).toFixed(1)}" class="axis">${fmt(min + 0.5, 1)}</text>
    </svg>`;
  }

  function barChart(rows, goal) {
    const W = 320, H = 160, P = 20;
    const max = Math.max(goal * 1.2, ...rows.map((r) => r.value), 1);
    const bw = (W - 2 * P) / rows.length;
    const gy = H - P - (goal / max) * (H - 2 * P);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Kalorien pro Tag">
      ${rows.map((r, i) => {
        const h = (r.value / max) * (H - 2 * P);
        return `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${(H - P - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="bar"/>
        <text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 4}" class="axis" text-anchor="middle">${r.label}</text>`;
      }).join('')}
      <line x1="${P}" x2="${W - P}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" class="goal"/>
    </svg>`;
  }

  // ---------- Ansichten ----------

  function macroBar(label, val, goal, tone) {
    const pct = goal > 0 ? Math.min(100, (val / goal) * 100) : 0;
    return `<div class="macro">
      <div class="line"><span>${label}</span><span class="muted">${fmt(val)} / ${fmt(goal)} g</span></div>
      <div class="track"><div class="fill tone-${tone} ${val > goal ? 'over' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
  }

  // Ring für den Kalorienstand des Tages
  function ring(eaten, goal) {
    const R = 52, C = 2 * Math.PI * R;
    const pct = goal > 0 ? Math.min(1, eaten / goal) : 0;
    return `<svg viewBox="0 0 120 120" class="ring" aria-hidden="true">
      <circle cx="60" cy="60" r="${R}" class="ring-bg"/>
      <circle cx="60" cy="60" r="${R}" class="ring-fg ${eaten > goal ? 'over' : ''}"
        stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
    </svg>`;
  }

  function mealCard(key, label, entries) {
    const list = entries.filter((e) => e.meal === key);
    const kcal = sumEntries(list).kcal;
    return `<section class="card">
      <div class="line"><h2>${label}</h2><span class="muted">${fmt(kcal)} kcal</span></div>
      ${list.length ? `<ul class="list">${list.map((e) => {
        const t = totals(e);
        return `<li>
          <div class="grow"><b>${esc(e.name)}</b>
            <small class="muted">${fmt(t.kcal)} kcal · E ${fmt(t.p)} · F ${fmt(t.f)} · KH ${fmt(t.c)}</small></div>
          <input class="grams" type="number" inputmode="decimal" value="${e.grams}" data-change="grams" data-id="${e.id}" aria-label="Gramm">
          <button class="icon danger" data-action="del-entry" data-id="${e.id}" aria-label="Eintrag löschen">×</button>
        </li>`;
      }).join('')}</ul>` : '<p class="muted small">Noch nichts eingetragen.</p>'}
      <button class="ghost" data-action="open-add" data-meal="${key}">+ Lebensmittel hinzufügen</button>
    </section>`;
  }

  function renderDiary() {
    const day = data.day(state.date);
    const g = goals();
    const t = sumEntries(day.entries);
    const left = g.kcal - t.kcal;
    return `
      <div class="datebar">
        <button class="icon" data-action="day" data-d="-1" aria-label="Vorheriger Tag">‹</button>
        <button class="linkish" data-action="today">${dateLabel(state.date)}</button>
        <button class="icon" data-action="day" data-d="1" aria-label="Nächster Tag">›</button>
      </div>
      <section class="card hero">
        <div class="hero-ring">
          ${ring(t.kcal, g.kcal)}
          <div class="hero-center">
            <span class="big">${fmt(Math.abs(left))}</span>
            <span class="small">${left >= 0 ? 'kcal übrig' : 'kcal zu viel'}</span>
          </div>
        </div>
        <div class="hero-side">
          <div class="muted small">Gegessen</div>
          <div class="hero-num">${fmt(t.kcal)} <span class="muted small">/ ${fmt(g.kcal)} kcal</span></div>
          ${macroBar('Eiweiß', t.p, g.p, 'p')}
          ${macroBar('Fett', t.f, g.f, 'f')}
          ${macroBar('Kohlenh.', t.c, g.c, 'c')}
        </div>
      </section>
      <section class="card">
        <h2>Schnelleingabe</h2>
        <form data-form="quick" class="stack">
          <input name="text" placeholder="z. B. 80 g Haferflocken, 2 Eier, 200 ml Milch" autocomplete="off" required>
          <div class="row">
            <select name="meal" aria-label="Mahlzeit">${MEALS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <button class="primary">Eintragen</button>
          </div>
        </form>
      </section>
      ${MEALS.map(([k, l]) => mealCard(k, l, day.entries)).join('')}
      <section class="card">
        <div class="line"><h2>Wasser</h2><span class="muted">${fmt(day.water)} / ${fmt(g.water)} ml</span></div>
        <div class="row">
          <button data-action="water" data-ml="-250">−250</button>
          <button data-action="water" data-ml="250">+250</button>
          <button data-action="water" data-ml="500">+500</button>
        </div>
      </section>`;
  }

  function renderWeight() {
    const rows = [...data.weights()].sort((a, b) => a.date.localeCompare(b.date));
    const avg = weightAvg(addDays(todayStr(), -6), todayStr());
    const recent = [...rows].reverse().slice(0, 30);
    return `
      <section class="card">
        <h2>Gewicht eintragen</h2>
        <form data-form="weight" class="row">
          <input name="date" type="date" value="${todayStr()}" required aria-label="Datum">
          <input name="kg" type="number" step="0.1" inputmode="decimal" placeholder="kg" required aria-label="Gewicht in kg">
          <button class="primary">Speichern</button>
        </form>
        <p class="muted small">Ø der letzten 7 Tage: ${avg === null ? 'noch keine Einträge' : fmt(avg, 1) + ' kg'}</p>
      </section>
      <section class="card">${lineChart(rows.slice(-60))}</section>
      <section class="card">
        <h2>Einträge</h2>
        ${recent.length ? `<ul class="list">${recent.map((r) => `
          <li><div class="grow"><b>${fmt(r.kg, 1)} kg</b> <small class="muted">${r.date}</small></div>
          <button class="icon danger" data-action="del-weight" data-date="${r.date}" aria-label="Löschen">×</button></li>`).join('')}</ul>`
          : '<p class="muted small">Noch keine Einträge.</p>'}
      </section>`;
  }

  function bestLifts() {
    const best = {};
    data.workouts().forEach((w) => w.exercises.forEach((ex) => ex.sets.forEach((s) => {
      const key = ex.name.toLowerCase();
      const e = Calc.e1rm(s.w, s.r);
      if (!best[key] || e > best[key].e1rm) best[key] = { name: ex.name, e1rm: e, w: s.w, r: s.r, date: w.date };
    })));
    return Object.values(best).sort((a, b) => b.e1rm - a.e1rm).slice(0, 10);
  }

  function workoutCard(w) {
    const volume = w.exercises.reduce((t, ex) => t + ex.sets.reduce((s, x) => s + x.w * x.r, 0), 0);
    return `<section class="card">
      <div class="line"><h2>${esc(w.title || 'Training')}</h2>
        <button class="icon danger" data-action="del-workout" data-id="${w.id}" aria-label="Training löschen">×</button></div>
      <p class="muted small">${w.date} · Volumen ${fmt(volume)} kg</p>
      <ul class="list">${w.exercises.map((ex) => `<li><div class="grow"><b>${esc(ex.name)}</b>
        <small class="muted">${ex.sets.map((s) => `${fmt(s.w, 1)} × ${s.r}`).join(' · ')}</small></div></li>`).join('')}</ul>
    </section>`;
  }

  function renderTrain() {
    const list = [...data.workouts()].sort((a, b) => b.date.localeCompare(a.date));
    const lifts = bestLifts();
    return `
      <section class="card">
        <h2>Training eintragen</h2>
        <form data-form="workout" class="stack">
          <div class="row">
            <input name="date" type="date" value="${todayStr()}" required aria-label="Datum">
            <input name="title" placeholder="Name, z. B. Push A" aria-label="Name des Trainings">
          </div>
          <textarea name="lines" rows="6" required placeholder="Bankdrücken 80 x 8, 80 x 8, 82.5 x 6"></textarea>
          <button class="primary">Speichern</button>
        </form>
        <p class="hint">Eine Zeile pro Übung. Format: Name Gewicht x Wdh, Gewicht x Wdh.</p>
      </section>
      <section class="card">
        <h2>Bestwerte (geschätzte 1RM)</h2>
        ${lifts.length ? `<ul class="list">${lifts.map((l) => `<li><div class="grow"><b>${esc(l.name)}</b>
          <small class="muted">${fmt(l.w, 1)} kg × ${l.r} · ${l.date}</small></div><span>${fmt(l.e1rm, 1)} kg</span></li>`).join('')}</ul>`
          : '<p class="muted small">Noch keine Sätze erfasst.</p>'}
      </section>
      ${list.slice(0, 20).map(workoutCard).join('')}`;
  }

  function barRows() {
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(todayStr(), i - 13);
      return { label: d.slice(8), value: sumEntries(data.day(d).entries).kcal };
    });
  }

  function renderStats() {
    const s = weekStats();
    const g = s.goals;
    const row = (label, val, goal, unit) => `<div class="line"><span>${label}</span>
      <span>${fmt(val)} <span class="muted">/ ${fmt(goal)} ${unit}</span></span></div>`;
    const trend = s.weightRate === null
      ? 'zu wenig Daten'
      : `${s.weightRate > 0 ? '+' : ''}${fmt(s.weightRate, 2)} kg pro Woche`;
    return `
      <section class="card">
        <h2>Letzte 7 Tage (Ø pro Tag mit Einträgen)</h2>
        ${row('Kalorien', s.avg.kcal, g.kcal, 'kcal')}
        ${row('Eiweiß', s.avg.p, g.p, 'g')}
        ${row('Fett', s.avg.f, g.f, 'g')}
        ${row('Kohlenhydrate', s.avg.c, g.c, 'g')}
        ${row('Wasser', s.avg.water, g.water, 'ml')}
        <div class="line"><span>Gewichtstrend</span><span>${trend}</span></div>
        <div class="line"><span>Trainings</span><span>${s.sessions}</span></div>
      </section>
      <section class="card"><h2>Kalorien letzte 14 Tage</h2>${barChart(barRows(), g.kcal)}
        <p class="muted small">Gestrichelte Linie = Kalorienziel</p></section>`;
  }

  function renderCoach() {
    const msgs = Coach.analyze(weekStats());
    return `
      <section class="card">
        <h2>Hinweise aus den letzten 7 Tagen</h2>
        ${msgs.map((m) => `<div class="note ${m.level}">${esc(m.text)}</div>`).join('') || '<p class="muted">Keine Hinweise. Alles im Rahmen.</p>'}
      </section>
      <p class="hint">Feste Regeln auf deinen Einträgen. Kein Ersatz für ärztliche oder sportmedizinische Beratung.</p>`;
  }

  function field(label, input) {
    return `<label class="field"><span>${label}</span>${input}</label>`;
  }

  function renderMore() {
    const s = settings();
    const g = goals();
    const kg = currentWeight();
    const kf = Calc.bodyFat(s);
    const active = Store.activeId();
    const sel = (opts, cur) => opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');

    return `
      <section class="card">
        <h2>Rechner</h2>
        <dl class="kv">
          <dt>Grundumsatz</dt><dd>${fmt(Calc.bmr(s, kg))} kcal</dd>
          <dt>Gesamtumsatz</dt><dd>${fmt(Calc.tdee(s, kg))} kcal</dd>
          <dt>Kalorienziel</dt><dd>${fmt(g.kcal)} kcal</dd>
          <dt>Eiweiß</dt><dd>${fmt(g.p)} g</dd>
          <dt>Fett</dt><dd>${fmt(g.f)} g</dd>
          <dt>Kohlenhydrate</dt><dd>${fmt(g.c)} g</dd>
          <dt>Körperfett (Navy)</dt><dd>${kf === null ? 'Taille und Hals eintragen' : fmt(kf, 1) + ' %'}</dd>
        </dl>
        <p class="muted small">Schätzwerte. Körperfett nach Navy-Methode, ±3–4 %.</p>
      </section>

      <section class="card">
        <h2>Profil</h2>
        <form data-form="settings" class="stack">
          ${field('Name', `<input name="name" value="${esc(s.name)}">`)}
          <div class="grid2">
            ${field('Geschlecht', `<select name="sex">${sel([['m', 'männlich'], ['w', 'weiblich']], s.sex)}</select>`)}
            ${field('Alter', `<input name="age" type="number" inputmode="numeric" value="${s.age}">`)}
            ${field('Größe (cm)', `<input name="height" type="number" inputmode="numeric" value="${s.height}">`)}
            ${field('Gewicht (kg)', `<input name="weight" type="number" step="0.1" inputmode="decimal" value="${s.weight}">`)}
          </div>
          ${field('Aktivität', `<select name="activity">${sel(ACTIVITY, s.activity)}</select>`)}
          ${field('Ziel', `<select name="goal">${sel(GOALS, s.goal)}</select>`)}
          ${field('Abstand zum Gesamtumsatz (kcal/Tag)', `<input name="pace" type="number" inputmode="numeric" value="${s.pace}">`)}
          <p class="hint">Abnehmen: 400 bis 600. Muskelaufbau: 200 bis 400.</p>
          <div class="grid3">
            ${field('Taille (cm)', `<input name="waist" type="number" step="0.5" inputmode="decimal" value="${s.waist}">`)}
            ${field('Hals (cm)', `<input name="neck" type="number" step="0.5" inputmode="decimal" value="${s.neck}">`)}
            ${field('Hüfte (cm)', `<input name="hip" type="number" step="0.5" inputmode="decimal" value="${s.hip}">`)}
          </div>
          <p class="hint">Hüfte nur für Frauen nötig, für das Körperfett.</p>
          <button class="primary">Speichern</button>
        </form>
      </section>

      <section class="card">
        <h2>Profile auf diesem Gerät</h2>
        <ul class="list">${Store.profiles().map((p) => `
          <li><div class="grow"><b>${esc(p.name)}</b>${p.id === active ? ' <small class="muted">(aktiv)</small>' : ''}</div>
            ${p.id !== active ? `<button data-action="profile-switch" data-id="${p.id}">Wählen</button>` : ''}
            <button class="icon danger" data-action="profile-delete" data-id="${p.id}" aria-label="Profil löschen">×</button></li>`).join('')}
        </ul>
        <button class="ghost" data-action="new-profile">+ Neues Profil</button>
        <p class="hint">Jedes Profil hat eigene Daten. Alles bleibt auf diesem Gerät.</p>
      </section>

      <section class="card">
        <h2>Daten sichern</h2>
        <p class="muted small">Ohne Backup gehen die Daten verloren, wenn der Browser-Speicher gelöscht wird. Die Datei kannst du auf ein anderes Gerät übertragen.</p>
        <div class="row">
          <button data-action="export">Exportieren</button>
          <label class="filebtn">Importieren<input type="file" accept="application/json,.json" data-change="import" hidden></label>
        </div>
      </section>`;
  }

  function renderWelcome() {
    return `<section class="card">
      <h2>Willkommen</h2>
      <p>Lege ein Profil an. Alle Daten bleiben auf diesem Gerät.</p>
      <form data-form="new-profile" class="stack">
        <input name="name" placeholder="Dein Name" required aria-label="Name">
        <button class="primary">Starten</button>
      </form>
    </section>`;
  }

  const views = {
    diary: { title: 'Tagebuch', render: renderDiary },
    weight: { title: 'Gewicht', render: renderWeight },
    train: { title: 'Training', render: renderTrain },
    stats: { title: 'Auswertung', render: renderStats },
    coach: { title: 'Coach', render: renderCoach },
    more: { title: 'Mehr', render: renderMore },
  };

  function render() {
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const prof = Store.profiles().find((p) => p.id === Store.activeId());
    $('#profile-badge').textContent = prof ? prof.name : '';
    if (!prof) {
      $('#title').textContent = 'Start';
      $('#view').innerHTML = renderWelcome();
      return;
    }
    const v = views[state.tab];
    $('#title').textContent = v.title;
    $('#view').innerHTML = v.render();
  }

  // ---------- Hilfsfunktionen für Overlay und Meldungen ----------

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function openModal(html) {
    $('#modal').innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet">${html}</div>`;
    $('#modal').hidden = false;
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modal').innerHTML = '';
  }

  function openAdd(meal) {
    state.addMeal = meal;
    const label = MEALS.find((m) => m[0] === meal)[1];
    openModal(`
      <div class="line"><h2>${label}</h2><button class="icon" data-action="close-modal" aria-label="Schließen">×</button></div>
      <label class="field"><span>Menge in Gramm</span><input id="add-grams" type="number" inputmode="decimal" value="100"></label>
      <input id="add-search" type="search" placeholder="Lebensmittel suchen" autocomplete="off" data-input="search">
      <ul id="add-list" class="list pick"></ul>
      <details>
        <summary>+ Eigenes Lebensmittel (Werte pro 100 g)</summary>
        <form data-form="custom" class="stack">
          <input name="name" placeholder="Name" required aria-label="Name">
          <div class="grid4">
            ${field('kcal', '<input name="kcal" type="number" step="any" inputmode="decimal" required>')}
            ${field('Eiweiß', '<input name="p" type="number" step="any" inputmode="decimal" required>')}
            ${field('Fett', '<input name="f" type="number" step="any" inputmode="decimal" required>')}
            ${field('KH', '<input name="c" type="number" step="any" inputmode="decimal" required>')}
          </div>
          <button class="primary">Speichern</button>
        </form>
      </details>`);
    renderAddList();
  }

  function renderAddList() {
    const list = $('#add-list');
    if (!list) return;
    const q = ($('#add-search').value || '').trim().toLowerCase();
    const foods = allFoods().filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 40);
    list.innerHTML = foods.map((f) => `<li><button class="pickbtn" data-action="pick" data-id="${esc(f.id)}">
      <b>${esc(f.name)}</b>
      <small class="muted">${fmt(f.kcal)} kcal · E ${fmt(f.p, 1)} · F ${fmt(f.f, 1)} · KH ${fmt(f.c, 1)} pro 100 g</small></button></li>`).join('')
      || '<li class="muted small">Nichts gefunden. Unten kannst du es anlegen.</li>';
  }

  // ---------- Aktionen ----------

  function pickFood(id) {
    const food = allFoods().find((f) => f.id === id);
    const grams = n($('#add-grams').value);
    if (!food || grams <= 0) return toast('Bitte eine Menge über 0 g angeben.');
    addEntry(state.date, state.addMeal, food, grams);
    closeModal();
    render();
  }

  function changeGrams(id, value) {
    const day = data.day(state.date);
    const e = day.entries.find((x) => x.id === id);
    const g = n(value);
    if (!e || g <= 0) return render();
    e.grams = g;
    data.saveDay(state.date, day);
    render();
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (payload.app !== 'fitness-tagebuch' || !payload.data) throw new Error('Falsches Dateiformat');
        const d = payload.data;
        Store.createProfile(`${payload.name || 'Import'} (importiert)`);
        if (d.settings) Store.set('settings', d.settings);
        Store.set('days', d.days || {});
        Store.set('weights', d.weights || []);
        Store.set('workouts', d.workouts || []);
        Store.set('custom', d.custom || []);
        state.tab = 'more';
        toast('Import abgeschlossen.');
        render();
      } catch (err) {
        toast('Import fehlgeschlagen: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function exportProfile() {
    const prof = Store.profiles().find((p) => p.id === Store.activeId());
    const payload = {
      app: 'fitness-tagebuch',
      version: 1,
      name: prof ? prof.name : 'Profil',
      data: {
        settings: Store.get('settings', null),
        days: data.days(),
        weights: data.weights(),
        workouts: data.workouts(),
        custom: data.custom(),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-${payload.name.replace(/[^\w-]+/g, '_')}-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleAction(action, ds) {
    switch (action) {
      case 'day':
        state.date = addDays(state.date, Number(ds.d));
        return render();
      case 'today':
        state.date = todayStr();
        return render();
      case 'del-entry': {
        const day = data.day(state.date);
        day.entries = day.entries.filter((e) => e.id !== ds.id);
        data.saveDay(state.date, day);
        return render();
      }
      case 'open-add':
        return openAdd(ds.meal);
      case 'pick':
        return pickFood(ds.id);
      case 'close-modal':
        return closeModal();
      case 'water': {
        const day = data.day(state.date);
        day.water = Math.max(0, day.water + Number(ds.ml));
        data.saveDay(state.date, day);
        return render();
      }
      case 'del-weight':
        Store.set('weights', data.weights().filter((w) => w.date !== ds.date));
        return render();
      case 'del-workout':
        Store.set('workouts', data.workouts().filter((w) => w.id !== ds.id));
        return render();
      case 'new-profile':
        return openModal(`
          <div class="line"><h2>Neues Profil</h2><button class="icon" data-action="close-modal" aria-label="Schließen">×</button></div>
          <form data-form="new-profile" class="stack">
            <input name="name" placeholder="Name" required aria-label="Name">
            <button class="primary">Anlegen</button>
          </form>`);
      case 'profile-switch':
        Store.setActive(ds.id);
        return render();
      case 'profile-delete': {
        const p = Store.profiles().find((x) => x.id === ds.id);
        if (!confirm(`Profil „${p ? p.name : ''}“ mit allen Daten löschen? Das kann nicht rückgängig gemacht werden.`)) return;
        Store.deleteProfile(ds.id);
        return render();
      }
      case 'export':
        return exportProfile();
      default:
        return undefined;
    }
  }

  function handleSubmit(formName, form, f) {
    const get = (k) => String(f.get(k) ?? '');
    switch (formName) {
      case 'quick': {
        const foods = allFoods();
        const missing = [];
        Parse.items(get('text')).forEach((item) => {
          const r = Parse.food(item, foods);
          if (r.missing) missing.push(r.missing);
          else addEntry(state.date, get('meal'), r.food, r.grams);
        });
        if (missing.length) toast(`Nicht gefunden: ${missing.join(', ')}. Lege es unter „Lebensmittel hinzufügen“ an.`);
        form.reset();
        return render();
      }
      case 'weight': {
        const kg = n(get('kg'));
        if (kg <= 0) return toast('Bitte ein Gewicht eintragen.');
        const date = get('date');
        const list = data.weights().filter((w) => w.date !== date);
        list.push({ date, kg });
        Store.set('weights', list);
        toast('Gewicht gespeichert.');
        return render();
      }
      case 'workout': {
        const exercises = get('lines').split('\n').map(Parse.exercise).filter(Boolean);
        if (!exercises.length) return toast('Keine gültige Übung erkannt. Format: Name 80 x 8, 80 x 8');
        const list = data.workouts();
        list.push({ id: uid(), date: get('date'), title: get('title').trim(), exercises });
        Store.set('workouts', list);
        toast('Training gespeichert.');
        return render();
      }
      case 'custom': {
        const list = data.custom();
        list.push({
          id: 'c' + uid(), name: get('name').trim(),
          kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')),
        });
        Store.set('custom', list);
        form.reset();
        toast('Lebensmittel gespeichert.');
        return renderAddList();
      }
      case 'settings': {
        const name = get('name').trim() || 'Ich';
        const next = {
          name,
          sex: get('sex'),
          age: n(get('age')),
          height: n(get('height')),
          weight: n(get('weight')),
          activity: n(get('activity')),
          goal: get('goal'),
          pace: n(get('pace')),
          waist: n(get('waist')) || '',
          neck: n(get('neck')) || '',
          hip: n(get('hip')) || '',
        };
        Store.set('settings', next);
        Store.renameProfile(Store.activeId(), name);
        toast('Profil gespeichert.');
        return render();
      }
      case 'new-profile': {
        const name = get('name').trim() || 'Ich';
        Store.createProfile(name);
        Store.set('settings', { ...defaults(), name });
        state.tab = 'diary';
        closeModal();
        toast(`Profil „${name}“ angelegt.`);
        return render();
      }
      default:
        return undefined;
    }
  }

  // ---------- Ereignisse ----------

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      window.scrollTo(0, 0);
      return render();
    }
    const el = e.target.closest('[data-action]');
    if (el) handleAction(el.dataset.action, el.dataset);
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(e.target.dataset.form, e.target, new FormData(e.target));
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.change === 'grams') changeGrams(el.dataset.id, el.value);
    if (el.dataset.change === 'import' && el.files[0]) importFile(el.files[0]);
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'search') renderAddList();
  });

  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
