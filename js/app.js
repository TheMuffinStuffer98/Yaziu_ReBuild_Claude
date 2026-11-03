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
  const ADD_TABS = [['search', 'Suche'], ['dishes', 'Gerichte'], ['scan', 'Scan'], ['photo', 'Foto']];
  const DEFAULT_MODEL = 'gemini-2.5-flash';

  // add: Zustand des Hinzufügen-Fensters. draft: Gericht, das gerade bearbeitet wird.
  const state = { tab: 'diary', date: todayStr(), add: null, draft: null };

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
    dishes: () => Store.get('dishes', []),
    products: () => Store.get('products', []),
    ai: () => ({ key: '', model: DEFAULT_MODEL, ...Store.get('ai', {}) }),
  };

  const sumEntries = Calc.sumEntries;
  const totals = Calc.entryTotals;

  // item = {name, grams, unit?, dishId?, base}. base gilt pro 100 g, bei unit 'port' pro Portion.
  function addEntry(date, meal, item) {
    const day = data.day(date);
    day.entries.push({ id: uid(), meal, ...item });
    data.saveDay(date, day);
  }

  const allFoods = () => Foods.list([...data.custom(), ...data.products()]);
  const foodItem = (food, grams) => ({
    name: food.name, grams, base: { kcal: food.kcal, p: food.p, f: food.f, c: food.c },
  });

  function saveProduct(p) {
    const list = data.products().filter((x) => x.id !== p.id);
    list.push(p);
    Store.set('products', list);
  }

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

  const unitLabel = (e) => (e.unit === 'port' ? 'Port.' : 'g');
  const amountText = (amount, unit) => (unit === 'port' ? `${fmt(amount, 2)} Port.` : `${fmt(amount)} g`);

  // Bei Gerichten: was pro Portion auf den Teller kommt
  function plateLine(e) {
    if (!e.dishId) return '';
    const d = data.dishes().find((x) => x.id === e.dishId);
    if (!d) return '';
    const parts = Dish.scaled(d, e.grams).map((i) => `${esc(i.name)} ${amountText(i.amount, i.unit)}`);
    return `<small class="plate">Teller: ${parts.join(' · ')}</small>`;
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
            <small class="muted">${fmt(t.kcal)} kcal · E ${fmt(t.p)} · F ${fmt(t.f)} · KH ${fmt(t.c)}</small>
            ${plateLine(e)}</div>
          <input class="grams" type="number" step="any" inputmode="decimal" value="${e.grams}" data-change="grams" data-id="${e.id}" aria-label="Menge">
          <span class="unit">${unitLabel(e)}</span>
          <button class="icon danger" data-action="del-entry" data-id="${e.id}" aria-label="Eintrag löschen">×</button>
        </li>`;
      }).join('')}</ul>` : '<p class="muted small">Noch nichts eingetragen.</p>'}
      <div class="row">
        <button class="ghost" data-action="open-add" data-meal="${key}">+ Hinzufügen</button>
        ${list.length ? `<button class="ghost" data-action="meal-to-dish" data-meal="${key}">Als Gericht speichern</button>` : ''}
      </div>
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

  // ---------- Gerichte ----------

  function macroLine(t) {
    return `${fmt(t.kcal)} kcal · E ${fmt(t.p)} · F ${fmt(t.f)} · KH ${fmt(t.c)}`;
  }

  function renderDishes() {
    const list = data.dishes();
    return `
      <div class="datebar">
        <button class="linkish" data-action="go" data-to="more">‹ Mehr</button>
        <span></span>
      </div>
      <section class="card">
        <h2>Meine Gerichte</h2>
        ${list.length ? `<ul class="list">${list.map((d) => `<li>
          <div class="grow"><b>${esc(d.name)}</b>
            <small class="muted">pro Portion: ${macroLine(Dish.perPortion(d))}</small>
            <small class="muted">Rezept für ${fmt(d.servings, 2)} Portionen · ${d.ingredients.length} Zutaten</small></div>
          <button data-action="dish-edit" data-id="${d.id}">Ändern</button>
          <button class="icon danger" data-action="dish-delete" data-id="${d.id}" aria-label="Gericht löschen">×</button>
        </li>`).join('')}</ul>` : '<p class="muted small">Noch keine Gerichte.</p>'}
        <button class="ghost" data-action="dish-new">+ Neues Gericht</button>
        <p class="hint">Gib die Zutaten für das ganze Rezept ein und sage, für wie viele Portionen es reicht. Die App rechnet auf eine Portion herunter und zeigt dir, was pro Portion auf den Teller kommt.</p>
      </section>`;
  }

  function plateList(d, portions) {
    return `<ul class="list">${Dish.scaled(d, portions).map((i) => `<li>
      <div class="grow"><b>${esc(i.name)}</b></div><span>${amountText(i.amount, i.unit)}</span></li>`).join('')}</ul>`;
  }

  function renderDishEdit() {
    const d = state.draft;
    if (!d) {
      state.tab = 'dishes';
      return renderDishes();
    }
    const tot = Calc.sumEntries(d.ingredients);
    const per = Dish.perPortion(d);
    return `
      <div class="datebar">
        <button class="linkish" data-action="dish-cancel">‹ Abbrechen</button>
        <span></span>
      </div>
      <section class="card">
        <h2>${d.id ? 'Gericht ändern' : 'Neues Gericht'}</h2>
        <div class="stack">
          ${field('Name', `<input id="draft-name" value="${esc(d.name)}" placeholder="z. B. Chili con Carne">`)}
          ${field('Rezept reicht für (Portionen)', `<input id="draft-servings" type="number" step="any" inputmode="decimal" value="${d.servings}" data-change="draft-servings">`)}
        </div>
        <h2 class="sub">Zutaten für das ganze Rezept</h2>
        ${d.ingredients.length ? `<ul class="list">${d.ingredients.map((i, idx) => `<li>
          <div class="grow"><b>${esc(i.name)}</b>
            <small class="muted">${fmt(Calc.entryTotals(i).kcal)} kcal</small></div>
          <input class="grams" type="number" step="any" inputmode="decimal" value="${i.grams}" data-change="draft-amount" data-i="${idx}" aria-label="Menge">
          <span class="unit">${unitLabel(i)}</span>
          <button class="icon danger" data-action="draft-del" data-i="${idx}" aria-label="Zutat entfernen">×</button>
        </li>`).join('')}</ul>` : '<p class="muted small">Noch keine Zutaten.</p>'}
        <button class="ghost" data-action="open-add-dish">+ Zutat hinzufügen</button>
      </section>
      <section class="card">
        <h2>Ergebnis</h2>
        <div class="line"><span class="muted">Gesamtes Rezept</span><span>${macroLine(tot)}</span></div>
        <div class="line"><b>Pro Portion</b><b>${macroLine(per)}</b></div>
        <h2 class="sub">Pro Portion auf den Teller</h2>
        ${d.ingredients.length ? plateList(d, 1) : '<p class="muted small">Füge Zutaten hinzu.</p>'}
      </section>
      <button class="primary wide" data-action="dish-save">Gericht speichern</button>`;
  }

  // ---------- Mehr ----------

  function renderMore() {
    const s = settings();
    const g = goals();
    const kg = currentWeight();
    const kf = Calc.bodyFat(s);
    const active = Store.activeId();
    const ai = data.ai();
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
        <h2>Meine Gerichte</h2>
        <p class="muted small">${data.dishes().length} gespeichert. Rezepte mit Portionen, schnell auswählbar.</p>
        <button class="ghost" data-action="go" data-to="dishes">Gerichte verwalten</button>
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

      <section class="card" id="ai-card">
        <h2>Foto-Schätzung (optional)</h2>
        <p class="muted small">Schätzt Kalorien und Zutaten aus einem Foto. Dafür brauchst du einen eigenen, kostenlosen Schlüssel von Google (Gemini). Das Foto wird zur Analyse an Google gesendet und nicht gespeichert. Im kostenlosen Tarif darf Google Eingaben zur Produktverbesserung nutzen. Der Schlüssel bleibt nur auf diesem Gerät und ist nicht im Export.</p>
        <form data-form="ai" class="stack">
          ${field('API-Schlüssel', `<input name="key" type="password" autocomplete="off" placeholder="${ai.key ? 'gespeichert, zum Ändern neu eingeben' : 'Schlüssel einfügen'}">`)}
          ${field('Modell', `<input name="model" value="${esc(ai.model)}">`)}
          <div class="row">
            <button class="primary">Speichern</button>
            ${ai.key ? '<button type="button" data-action="ai-clear">Schlüssel entfernen</button>' : ''}
          </div>
        </form>
        <p class="hint">Schlüssel erstellen: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Wenn Google das Modell ändert, hier den Namen anpassen.</p>
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
      </section>

      <section class="card">
        <h2>Quellen</h2>
        <p class="muted small">Produktdaten beim Scannen: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (Lizenz ODbL, Daten der Community). Barcode-Erkennung: ZXing (Apache-2.0). Beim Scannen wird nur die Barcode-Nummer abgefragt.</p>
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
    dishes: { title: 'Gerichte', render: renderDishes, parent: 'more' },
    dishEdit: { title: 'Gericht', render: renderDishEdit, parent: 'more' },
  };

  function render() {
    const v = views[state.tab];
    const shown = v.parent || state.tab;
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === shown));
    const prof = Store.profiles().find((p) => p.id === Store.activeId());
    $('#profile-badge').textContent = prof ? prof.name : '';
    if (!prof) {
      $('#title').textContent = 'Start';
      $('#view').innerHTML = renderWelcome();
      return;
    }
    $('#title').textContent = v.title;
    $('#view').innerHTML = v.render();
  }

  // ---------- Overlay und Meldungen ----------

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function openModal(html) {
    $('#modal').innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet">${html}</div>`;
    $('#modal').hidden = false;
  }

  function closeModal() {
    Scanner.stop();
    state.add = null;
    $('#modal').hidden = true;
    $('#modal').innerHTML = '';
  }

  const targetLabel = (t) => (t === 'dish' ? 'Zutat hinzufügen' : MEALS.find((m) => m[0] === t)[1]);

  function customForm(ean) {
    return `<form data-form="custom" class="stack">
      ${ean ? `<input type="hidden" name="ean" value="${esc(ean)}">` : ''}
      <input name="name" placeholder="Name" required aria-label="Name">
      <div class="grid4">
        ${field('kcal', '<input name="kcal" type="number" step="any" inputmode="decimal" required>')}
        ${field('Eiweiß', '<input name="p" type="number" step="any" inputmode="decimal" required>')}
        ${field('Fett', '<input name="f" type="number" step="any" inputmode="decimal" required>')}
        ${field('KH', '<input name="c" type="number" step="any" inputmode="decimal" required>')}
      </div>
      <p class="hint">Werte pro 100 g.</p>
      <button class="primary">${ean ? 'Speichern und verwenden' : 'Speichern'}</button>
    </form>`;
  }

  function addBody(a) {
    // Zweite Stufe: ein Gericht, Produkt oder nicht gefundener Barcode ist ausgewählt
    if (a.dishId) {
      const d = data.dishes().find((x) => x.id === a.dishId);
      return `<button class="linkish left" data-action="add-back">‹ Zurück</button>
        <h2>${esc(d.name)}</h2>
        ${field('Portionen', '<input id="dish-portions" type="number" step="0.25" inputmode="decimal" value="1" data-input="dish-portions">')}
        <div id="dish-detail"></div>
        <button class="primary wide" data-action="dish-add">Eintragen</button>`;
    }
    if (a.product) {
      const p = a.product;
      return `<button class="linkish left" data-action="add-back">‹ Zurück</button>
        <h2>${esc(p.name)}</h2>
        <p class="muted small">Pro 100 g: ${fmt(p.kcal)} kcal · E ${fmt(p.p, 1)} · F ${fmt(p.f, 1)} · KH ${fmt(p.c, 1)}</p>
        ${p.complete === false ? '<div class="note warn">Angaben unvollständig. Bitte mit der Packung vergleichen.</div>' : ''}
        ${field('Menge in Gramm', `<input id="prod-grams" type="number" step="any" inputmode="decimal" value="${p.piece || 100}">`)}
        <button class="primary wide" data-action="product-add">Eintragen</button>
        ${p.source === 'off' ? '<p class="hint">Daten: Open Food Facts (ODbL)</p>' : ''}`;
    }
    if (a.notFound) {
      return `<button class="linkish left" data-action="add-back">‹ Zurück</button>
        <div class="note warn">${a.error ? esc(a.error) + ' ' : ''}Barcode ${esc(a.notFound)} wurde nicht gefunden. Du kannst das Produkt selbst anlegen.</div>
        ${customForm(a.notFound)}`;
    }

    if (a.tab === 'dishes') {
      const list = data.dishes();
      return `${list.length ? `<ul class="list pick">${list.map((d) => `<li><button class="pickbtn" data-action="dish-pick" data-id="${d.id}">
        <b>${esc(d.name)}</b><small class="muted">pro Portion: ${macroLine(Dish.perPortion(d))}</small></button></li>`).join('')}</ul>`
        : '<p class="muted small">Noch keine Gerichte.</p>'}
        <button class="ghost" data-action="dish-new-from-add">+ Neues Gericht anlegen</button>`;
    }

    if (a.tab === 'scan') {
      return `<div class="scanbox"><video id="scan-video" playsinline muted autoplay></video><div class="scanline"></div></div>
        <p class="hint" id="scan-status">Kamera wird gestartet …</p>
        <form data-form="ean" class="row">
          <input name="ean" inputmode="numeric" pattern="[0-9]{8,14}" placeholder="Nummer manuell eingeben" required aria-label="Barcode-Nummer">
          <button class="primary">Suchen</button>
        </form>`;
    }

    if (a.tab === 'photo') {
      const ai = data.ai();
      if (!ai.key) {
        return `<div class="note">Für die Foto-Schätzung brauchst du einen eigenen, kostenlosen Google-Schlüssel (Gemini).</div>
          <button class="primary wide" data-action="goto-ai">Schlüssel eintragen</button>`;
      }
      if (a.busy) return '<p class="muted">Foto wird analysiert …</p>';
      if (a.photo) {
        const ph = a.photo;
        const tot = Calc.sumEntries(ph.items);
        return `<h2>${esc(ph.name)}</h2>
          ${ph.confidence ? `<p class="muted small">Sicherheit: ${esc(ph.confidence)}${ph.note ? ' · ' + esc(ph.note) : ''}</p>` : ''}
          ${ph.items.length ? `<ul class="list">${ph.items.map((it, i) => `<li>
            <div class="grow"><b>${esc(it.name)}</b><small class="muted">${macroLine(Calc.entryTotals(it))}</small></div>
            <input class="grams" type="number" step="any" inputmode="decimal" value="${it.grams}" data-change="photo-grams" data-i="${i}" aria-label="Gramm">
            <span class="unit">g</span>
            <button class="icon danger" data-action="photo-del" data-i="${i}" aria-label="Entfernen">×</button>
          </li>`).join('')}</ul>
          <div class="line"><b>Summe</b><b>${macroLine(tot)}</b></div>
          <button class="primary wide" data-action="photo-add">Alle eintragen</button>`
          : '<div class="note warn">Es wurde kein Essen erkannt.</div>'}
          <button class="ghost" data-action="photo-reset">Anderes Foto</button>
          <p class="hint">Das ist eine Schätzung. Abweichungen von 20 bis 30 % sind normal. Bitte Mengen prüfen.</p>`;
      }
      return `${a.error ? `<div class="note warn">${esc(a.error)}</div>` : ''}
        <label class="filebtn bigbtn">Foto aufnehmen oder wählen<input type="file" accept="image/*" data-change="photo" hidden></label>
        <p class="hint">Das Foto wird verkleinert und zur Analyse an Google gesendet. Es wird nicht gespeichert.</p>`;
    }

    // Standard: Suche
    return `${field('Menge in Gramm', '<input id="add-grams" type="number" step="any" inputmode="decimal" value="100">')}
      <input id="add-search" type="search" placeholder="Lebensmittel suchen" autocomplete="off" data-input="search">
      <ul id="add-list" class="list pick"></ul>
      <details>
        <summary>+ Eigenes Lebensmittel</summary>
        ${customForm('')}
      </details>`;
  }

  function renderAdd() {
    const a = state.add;
    if (!a) return;
    Scanner.stop();
    const sub = a.dishId || a.product || a.notFound;
    const tabs = ADD_TABS.filter(([k]) => !(a.target === 'dish' && k === 'dishes'));
    openModal(`
      <div class="line"><h2>${targetLabel(a.target)}</h2><button class="icon" data-action="close-modal" aria-label="Schließen">×</button></div>
      ${sub ? '' : `<div class="seg">${tabs.map(([k, l]) => `<button class="${a.tab === k ? 'on' : ''}" data-action="add-tab" data-name="${k}">${l}</button>`).join('')}</div>`}
      ${addBody(a)}`);
    if (a.dishId) renderDishDetail();
    if (!sub && a.tab === 'search') renderAddList();
    if (!sub && a.tab === 'scan') startScan();
  }

  function openAdd(target) {
    state.add = { target, tab: 'search', dishId: null, product: null, notFound: null, photo: null, busy: false, error: '' };
    renderAdd();
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

  function renderDishDetail() {
    const box = $('#dish-detail');
    if (!box || !state.add || !state.add.dishId) return;
    const d = data.dishes().find((x) => x.id === state.add.dishId);
    const portions = n($('#dish-portions').value) || 0;
    box.innerHTML = `<div class="line"><b>Nährwerte</b><b>${macroLine({
      kcal: Dish.perPortion(d).kcal * portions, p: Dish.perPortion(d).p * portions,
      f: Dish.perPortion(d).f * portions, c: Dish.perPortion(d).c * portions,
    })}</b></div>
      <h2 class="sub">Auf den Teller</h2>${plateList(d, portions)}`;
  }

  // ---------- Scanner und Foto ----------

  function setScanStatus(text) {
    const el = $('#scan-status');
    if (el) el.textContent = text;
  }

  function cameraMessage(err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      return 'Kamera-Zugriff verweigert. Erlaube die Kamera in den Safari-Einstellungen oder gib die Nummer manuell ein.';
    }
    return (err && err.message) || 'Kamera konnte nicht gestartet werden.';
  }

  async function startScan() {
    const video = $('#scan-video');
    if (!video) return;
    try {
      await Scanner.start(video, onScanned);
      if (!state.add || state.add.tab !== 'scan') return Scanner.stop();
      setScanStatus('Halte den Barcode ins Bild.');
    } catch (err) {
      setScanStatus(cameraMessage(err));
    }
  }

  async function onScanned(ean) {
    Scanner.stop();
    await findProduct(ean);
  }

  async function findProduct(ean) {
    const a = state.add;
    if (!a) return;
    const known = data.products().find((p) => p.ean === ean) || data.custom().find((p) => p.ean === ean);
    if (known) {
      a.product = known;
      return renderAdd();
    }
    setScanStatus('Produkt wird gesucht …');
    try {
      const p = await Scanner.lookup(ean);
      if (!state.add) return;
      if (p) {
        saveProduct(p);
        a.product = p;
      } else {
        a.notFound = ean;
      }
    } catch (err) {
      if (!state.add) return;
      a.notFound = ean;
      a.error = err.message;
    }
    renderAdd();
  }

  async function runPhoto(file) {
    const a = state.add;
    if (!a) return;
    const ai = data.ai();
    a.busy = true;
    a.error = '';
    a.photo = null;
    renderAdd();
    try {
      const result = await Vision.estimate(file, ai.key, ai.model || DEFAULT_MODEL);
      if (!state.add) return;
      a.photo = result;
    } catch (err) {
      if (!state.add) return;
      a.error = err.message;
    }
    a.busy = false;
    renderAdd();
  }

  // ---------- Aktionen ----------

  // Fügt fertige Einträge je nach Ziel dem Tagebuch oder dem Gericht im Editor hinzu
  function commitItems(items) {
    const target = state.add.target;
    if (target === 'dish') {
      state.draft.ingredients.push(...items);
    } else {
      items.forEach((it) => addEntry(state.date, target, it));
    }
    closeModal();
    render();
  }

  function pickFood(id) {
    const food = allFoods().find((f) => f.id === id);
    const grams = n($('#add-grams').value);
    if (!food || grams <= 0) return toast('Bitte eine Menge über 0 g angeben.');
    commitItems([foodItem(food, grams)]);
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

  function syncDraft() {
    const d = state.draft;
    if (!d) return;
    const nm = $('#draft-name');
    if (nm) d.name = nm.value;
    const sv = $('#draft-servings');
    if (sv && n(sv.value) > 0) d.servings = n(sv.value);
    document.querySelectorAll('[data-change="draft-amount"]').forEach((el) => {
      const g = n(el.value);
      if (g > 0) d.ingredients[Number(el.dataset.i)].grams = g;
    });
  }

  function newDraft(ingredients = []) {
    state.draft = { id: null, name: '', servings: ingredients.length ? 1 : 2, ingredients };
    state.tab = 'dishEdit';
    window.scrollTo(0, 0);
    render();
  }

  function saveDish() {
    syncDraft();
    const d = state.draft;
    const name = d.name.trim();
    if (!name) return toast('Bitte dem Gericht einen Namen geben.');
    if (!d.ingredients.length) return toast('Füge mindestens eine Zutat hinzu.');
    if (!(d.servings > 0)) return toast('Die Portionszahl muss größer als 0 sein.');
    const dish = { id: d.id || 'd' + uid(), name, servings: d.servings, ingredients: d.ingredients };
    const list = data.dishes();
    const idx = list.findIndex((x) => x.id === dish.id);
    if (idx >= 0) list[idx] = dish;
    else list.push(dish);
    Store.set('dishes', list);
    state.draft = null;
    state.tab = 'dishes';
    toast('Gericht gespeichert.');
    window.scrollTo(0, 0);
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
        Store.set('dishes', d.dishes || []);
        Store.set('products', d.products || []);
        state.tab = 'more';
        toast('Import abgeschlossen.');
        render();
      } catch (err) {
        toast('Import fehlgeschlagen: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // Der API-Schlüssel wird bewusst nicht exportiert.
  function exportProfile() {
    const prof = Store.profiles().find((p) => p.id === Store.activeId());
    const payload = {
      app: 'fitness-tagebuch',
      version: 2,
      name: prof ? prof.name : 'Profil',
      data: {
        settings: Store.get('settings', null),
        days: data.days(),
        weights: data.weights(),
        workouts: data.workouts(),
        custom: data.custom(),
        dishes: data.dishes(),
        products: data.products(),
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
      case 'go':
        state.tab = ds.to;
        window.scrollTo(0, 0);
        return render();
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
      case 'open-add-dish':
        syncDraft();
        return openAdd('dish');
      case 'add-tab':
        state.add.tab = ds.name;
        state.add.error = '';
        return renderAdd();
      case 'add-back':
        Object.assign(state.add, { dishId: null, product: null, notFound: null, error: '' });
        return renderAdd();
      case 'pick':
        return pickFood(ds.id);
      case 'dish-pick':
        state.add.dishId = ds.id;
        return renderAdd();
      case 'dish-add': {
        const d = data.dishes().find((x) => x.id === state.add.dishId);
        const portions = n($('#dish-portions').value);
        if (!d || portions <= 0) return toast('Bitte eine Portionszahl über 0 angeben.');
        return commitItems([Dish.toEntry(d, portions)]);
      }
      case 'product-add': {
        const grams = n($('#prod-grams').value);
        if (grams <= 0) return toast('Bitte eine Menge über 0 g angeben.');
        return commitItems([{ ...foodItem(state.add.product, grams) }]);
      }
      case 'photo-del':
        state.add.photo.items.splice(Number(ds.i), 1);
        return renderAdd();
      case 'photo-reset':
        state.add.photo = null;
        state.add.error = '';
        return renderAdd();
      case 'photo-add':
        if (!state.add.photo.items.length) return toast('Keine Einträge vorhanden.');
        return commitItems(state.add.photo.items);
      case 'goto-ai':
        closeModal();
        state.tab = 'more';
        render();
        return $('#ai-card').scrollIntoView();
      case 'ai-clear':
        Store.set('ai', { key: '', model: data.ai().model });
        toast('Schlüssel entfernt.');
        return render();
      case 'close-modal':
        return closeModal();
      case 'meal-to-dish': {
        const items = data.day(state.date).entries
          .filter((e) => e.meal === ds.meal)
          .map((e) => ({ name: e.name, grams: e.grams, ...(e.unit === 'port' ? { unit: 'port' } : {}), base: { ...e.base } }));
        return newDraft(items);
      }
      case 'dish-new':
        return newDraft();
      case 'dish-new-from-add':
        closeModal();
        return newDraft();
      case 'dish-edit': {
        const d = data.dishes().find((x) => x.id === ds.id);
        state.draft = JSON.parse(JSON.stringify(d));
        state.tab = 'dishEdit';
        window.scrollTo(0, 0);
        return render();
      }
      case 'dish-delete': {
        const d = data.dishes().find((x) => x.id === ds.id);
        if (!confirm(`Gericht „${d ? d.name : ''}“ löschen?`)) return undefined;
        Store.set('dishes', data.dishes().filter((x) => x.id !== ds.id));
        return render();
      }
      case 'dish-save':
        return saveDish();
      case 'dish-cancel':
        state.draft = null;
        state.tab = 'dishes';
        return render();
      case 'draft-del':
        syncDraft();
        state.draft.ingredients.splice(Number(ds.i), 1);
        return render();
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
        if (!confirm(`Profil „${p ? p.name : ''}“ mit allen Daten löschen? Das kann nicht rückgängig gemacht werden.`)) return undefined;
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
          else addEntry(state.date, get('meal'), foodItem(r.food, r.grams));
        });
        if (missing.length) toast(`Nicht gefunden: ${missing.join(', ')}. Lege es unter „Hinzufügen“ an.`);
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
        const ean = get('ean');
        const food = {
          id: 'c' + uid(), name: get('name').trim(),
          kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')),
          ...(ean ? { ean } : {}),
        };
        const list = data.custom();
        list.push(food);
        Store.set('custom', list);
        toast('Lebensmittel gespeichert.');
        if (ean && state.add) {
          Object.assign(state.add, { notFound: null, error: '', product: food });
          return renderAdd();
        }
        form.reset();
        return renderAddList();
      }
      case 'ean': {
        const ean = get('ean').trim();
        if (!/^\d{8,14}$/.test(ean)) return toast('Die Nummer hat 8 bis 14 Ziffern.');
        Scanner.stop();
        return findProduct(ean);
      }
      case 'ai': {
        const cur = data.ai();
        const key = get('key').trim() || cur.key;
        Store.set('ai', { key, model: get('model').trim() || DEFAULT_MODEL });
        toast('Gespeichert.');
        return render();
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
      state.draft = null;
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
    switch (el.dataset.change) {
      case 'grams':
        return changeGrams(el.dataset.id, el.value);
      case 'import':
        if (el.files[0]) importFile(el.files[0]);
        return undefined;
      case 'draft-amount':
      case 'draft-servings':
        syncDraft();
        return render();
      case 'photo-grams': {
        const g = n(el.value);
        if (g > 0) state.add.photo.items[Number(el.dataset.i)].grams = g;
        return renderAdd();
      }
      case 'photo': {
        const file = el.files[0];
        el.value = '';
        if (file) runPhoto(file);
        return undefined;
      }
      default:
        return undefined;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'search') renderAddList();
    if (e.target.dataset.input === 'dish-portions') renderDishDetail();
  });

  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
