// Oberfläche: vier Reiter (Tagebuch, Kochbuch, Fortschritt, Profil), Auswahl-Fenster, Gericht-Editor.
// Daten liegen über Store lokal im Browser.
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
  const mealLabel = (k) => (MEALS.find((m) => m[0] === k) || [k, k])[1];
  const ACTIVITY = [
    [1.2, 'Kaum Bewegung (Bürojob)'],
    [1.375, 'Leicht aktiv (1–3 Einheiten/Woche)'],
    [1.55, 'Aktiv (3–5 Einheiten/Woche)'],
    [1.725, 'Sehr aktiv (6–7 Einheiten/Woche)'],
    [1.9, 'Extrem (Training plus körperliche Arbeit)'],
  ];
  const GOALS = [['cut', 'Abnehmen (Cut)'], ['maintain', 'Halten'], ['bulk', 'Muskelaufbau (Bulk)']];
  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const ACCENTS = [
    ['#1f7a5a', 'Grün'], ['#2b6fd6', 'Blau'], ['#7a4fd1', 'Violett'],
    ['#d9741a', 'Orange'], ['#cf3b4a', 'Rot'], ['#12898f', 'Türkis'],
  ];

  const state = {
    tab: 'diary',
    sub: { cook: 'foods', progress: 'weight', profile: 'goals' },
    date: todayStr(),
    picker: null, // Auswahl-Fenster (Lebensmittel, Gerichte, Scan)
    photo: null, // Foto-Schätzung
    draft: null, // Gericht im Editor
    editorReturn: null, // Mahlzeit, zu der nach dem Speichern zurückgekehrt wird
    cook: null, // Such- und Filterzustand im Kochbuch
  };

  // ---------- Darstellung (pro Gerät) ----------

  const THEME_KEY = 'ft.theme';
  function themeLoad() {
    try {
      return { mode: 'system', accent: '#1f7a5a', ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') };
    } catch (err) {
      return { mode: 'system', accent: '#1f7a5a' };
    }
  }
  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function themeApply(t) {
    const root = document.documentElement;
    if (t.mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t.mode);
    root.style.setProperty('--accent-base', t.accent);
    root.style.setProperty('--on-accent', luminance(t.accent) > 0.45 ? '#10201a' : '#ffffff');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.accent);
  }
  function themeSave(patch) {
    const t = { ...themeLoad(), ...patch };
    try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (err) { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ }
    themeApply(t);
  }

  // ---------- Daten ----------

  const defaults = () => ({
    name: '', sex: 'm', age: 30, height: 180, weight: 80, activity: 1.55,
    goal: 'bulk', pace: 300, waist: '', neck: '', hip: '', bodyFat: '',
    targetMode: 'auto', proteinPerKg: '', fatPct: '', leanBasis: false,
    manual: { kcal: '', p: '', f: '', c: '' },
  });
  const settings = () => {
    const s = Store.get('settings', {});
    return { ...defaults(), ...s, manual: { ...defaults().manual, ...(s.manual || {}) } };
  };
  // Neue Profile haben noch keine Eckdaten. Ältere Profile gelten als eingerichtet.
  const isSetup = () => {
    const s = Store.get('settings', {});
    return !!(s.setupDone || s.age !== undefined);
  };

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
    favs: () => Store.get('favs', []),
    ai: () => ({ key: '', model: DEFAULT_MODEL, ...Store.get('ai', {}) }),
  };

  const sumEntries = Calc.sumEntries;
  const totals = Calc.entryTotals;

  // item = {name, grams, unit?, dishId?, foodId?, base}. base gilt pro 100 g, bei unit 'port' pro Portion.
  function addEntry(date, meal, item) {
    const day = data.day(date);
    day.entries.push({ id: uid(), meal, ...item });
    data.saveDay(date, day);
  }

  const allFoods = () => Foods.list([...data.custom(), ...data.products()]);
  const foodItem = (food, grams) => ({
    name: food.name, grams, foodId: food.id, base: { kcal: food.kcal, p: food.p, f: food.f, c: food.c },
  });

  function saveProduct(p) {
    const list = data.products().filter((x) => x.id !== p.id);
    list.push(p);
    Store.set('products', list);
  }

  const isFav = (id) => data.favs().includes(id);
  function toggleFav(id) {
    const list = data.favs();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    Store.set('favs', list);
  }

  // Zuletzt benutzte Lebensmittel oder Gerichte aus dem Tagebuch (neueste zuerst)
  function recentIds(kind) {
    const key = kind === 'dish' ? 'dishId' : 'foodId';
    const days = data.days();
    const seen = new Set();
    const out = [];
    for (const d of Object.keys(days).sort().reverse()) {
      for (const e of [...days[d].entries].reverse()) {
        const id = e[key];
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
          if (out.length >= 20) return out;
        }
      }
    }
    return out;
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
    const kg = currentWeight();
    return { ...Calc.targets(settings(), kg), water: Math.round((kg * 35) / 50) * 50 };
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

  // ---------- Bausteine ----------

  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
  const macroLine = (t) => `${fmt(t.kcal)} kcal · E ${fmt(t.p)} · F ${fmt(t.f)} · KH ${fmt(t.c)}`;
  const unitLabel = (e) => (e.unit === 'port' ? 'Port.' : 'g');
  const amountText = (amount, unit) => (unit === 'port' ? `${fmt(amount, 2)} Port.` : `${fmt(amount)} g`);

  // Umschalter innerhalb eines Reiters
  function seg(group, options, current) {
    return `<div class="seg">${options.map(([v, l]) => `<button class="${v === current ? 'on' : ''}"
      data-action="sub" data-group="${group}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

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

  // ---------- Tagebuch ----------

  // Bei Gerichten: was pro Portion auf den Teller kommt
  function plateLine(e) {
    if (!e.dishId) return '';
    const d = data.dishes().find((x) => x.id === e.dishId);
    if (!d) return '';
    const parts = Dish.scaled(d, e.grams).map((i) => `${esc(i.name)} ${amountText(i.amount, i.unit)}`);
    return `<small class="plate">Teller: ${parts.join(' · ')}</small>`;
  }

  function entryRow(e) {
    const t = totals(e);
    return `<li class="entry">
      <button class="entry-name" data-action="swap" data-id="${e.id}" aria-label="Lebensmittel ersetzen"><b>${esc(e.name)}</b></button>
      <input class="grams" type="number" step="any" inputmode="decimal" value="${e.grams}" data-change="grams" data-id="${e.id}" aria-label="Menge">
      <span class="unit">${unitLabel(e)}</span>
      <button class="icon danger" data-action="del-entry" data-id="${e.id}" aria-label="Eintrag löschen">×</button>
      <div class="entry-info"><small class="muted">${macroLine(t)}</small>${plateLine(e)}</div>
    </li>`;
  }

  function mealCard(key, label, entries) {
    const list = entries.filter((e) => e.meal === key);
    const kcal = sumEntries(list).kcal;
    const yesterday = data.day(addDays(state.date, -1)).entries.filter((e) => e.meal === key);
    return `<section class="card">
      <div class="line"><h2>${label}</h2><span class="muted">${fmt(kcal)} kcal</span></div>
      ${list.length ? `<ul class="list">${list.map(entryRow).join('')}</ul>` : '<p class="muted small">Noch nichts eingetragen.</p>'}
      <div class="addrow">
        <button class="add" data-action="open-picker" data-meal="${key}" data-pk="foods">+ Essen</button>
        <button class="add" data-action="open-picker" data-meal="${key}" data-pk="dishes">Gericht</button>
        <button class="add" data-action="photo-open" data-meal="${key}">Foto</button>
      </div>
      <div class="minor">
        ${list.length ? `<button class="linkish" data-action="meal-save" data-meal="${key}">Als Gericht speichern</button>` : ''}
        ${!list.length && yesterday.length ? `<button class="linkish" data-action="meal-copy" data-meal="${key}">Von gestern übernehmen</button>` : ''}
      </div>
    </section>`;
  }

  function renderDiary() {
    const day = data.day(state.date);
    const g = goals();
    const t = sumEntries(day.entries);
    const left = g.kcal - t.kcal;
    return `
      ${isSetup() ? '' : `<section class="card note-card">
        <h2>Eckdaten fehlen</h2>
        <p class="muted small">Trage Ziel und Körperdaten ein, oder gib deine Tagesziele selbst vor. Bis dahin gelten Beispielwerte.</p>
        <button class="primary wide" data-action="go-profile">Jetzt einrichten</button>
      </section>`}
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

  function updateSubbar() {
    const bar = $('#subbar');
    if (!bar) return;
    if (state.tab === 'diary' && Store.activeId()) {
      const g = goals();
      const t = sumEntries(data.day(state.date).entries);
      const left = g.kcal - t.kcal;
      bar.textContent = `${fmt(t.kcal)} / ${fmt(g.kcal)} kcal · ${left >= 0 ? fmt(left) + ' übrig' : fmt(-left) + ' zu viel'} · E ${fmt(t.p)}/${fmt(g.p)}`;
    }
    bar.classList.toggle('show', state.tab === 'diary' && window.scrollY > 200);
  }

  // ---------- Listen für Lebensmittel und Gerichte (Auswahl und Kochbuch) ----------

  const newLs = (kind) => ({ q: '', filter: recentIds(kind).length ? 'recent' : 'all', limit: 30 });

  // Das Kochbuch zeigt standardmäßig alles. Nur die Auswahl im Tagebuch startet mit „Zuletzt“.
  function cookLs(sub) {
    if (!state.cook) {
      state.cook = {
        foods: { q: '', filter: 'all', limit: 30 },
        dishes: { q: '', filter: 'all', limit: 30 },
      };
    }
    return state.cook[sub];
  }

  // Liefert {ls, kind} für 'picker' oder 'cook'
  function lsFor(scope) {
    if (scope === 'picker') {
      const p = state.picker;
      return { ls: p.ls[p.tab], kind: p.tab === 'foods' ? 'food' : 'dish' };
    }
    return { ls: cookLs(state.sub.cook), kind: state.sub.cook === 'foods' ? 'food' : 'dish' };
  }

  function ownIds() {
    return new Set([...data.custom(), ...data.products()].map((f) => f.id));
  }

  function listItems(kind, ls) {
    const q = ls.q.trim().toLowerCase();
    const all = kind === 'food' ? allFoods() : data.dishes();
    const byName = (a, b) => a.name.localeCompare(b.name, 'de');
    if (q) return all.filter((x) => x.name.toLowerCase().includes(q)).sort(byName);
    if (ls.filter === 'recent') {
      return recentIds(kind).map((id) => all.find((x) => x.id === id)).filter(Boolean);
    }
    if (ls.filter === 'fav') return all.filter((x) => isFav(x.id)).sort(byName);
    if (ls.filter === 'own') {
      const own = ownIds();
      return all.filter((x) => own.has(x.id)).sort(byName);
    }
    return [...all].sort(byName);
  }

  function itemRow(kind, x, scope) {
    const sub = kind === 'food'
      ? `${fmt(x.kcal)} kcal · E ${fmt(x.p, 1)} · F ${fmt(x.f, 1)} · KH ${fmt(x.c, 1)} pro 100 g`
      : `pro Portion: ${macroLine(Dish.perPortion(x))}`;
    let act;
    if (scope === 'picker') act = kind === 'food' ? 'pk-food' : 'pk-dish';
    else act = kind === 'food' ? 'food-open' : 'dish-edit';
    const fav = isFav(x.id);
    return `<li>
      <button class="pickbtn" data-action="${act}" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small class="muted">${sub}</small></button>
      <button class="star ${fav ? 'on' : ''}" data-action="fav" data-id="${esc(x.id)}" aria-label="Favorit">${fav ? '★' : '☆'}</button>
    </li>`;
  }

  function listHtml(kind, ls, scope) {
    const items = listItems(kind, ls);
    if (!items.length) {
      let msg = 'Noch nichts vorhanden.';
      if (ls.q) msg = 'Nichts gefunden.';
      else if (ls.filter === 'fav') msg = 'Noch keine Favoriten. Tippe auf ☆.';
      else if (ls.filter === 'recent') msg = 'Noch nichts benutzt.';
      return `<p class="muted small empty">${msg}</p>`;
    }
    const shown = items.slice(0, ls.limit);
    const rest = items.length - shown.length;
    return `<ul class="list pick">${shown.map((x) => itemRow(kind, x, scope)).join('')}</ul>
      ${rest > 0 ? `<button class="ghost" data-action="more" data-scope="${scope}">Mehr anzeigen (${rest})</button>` : ''}`;
  }

  function chipsHtml(kind, ls, scope) {
    const opts = [['recent', 'Zuletzt'], ['fav', 'Favoriten'], ['all', 'Alle']];
    if (kind === 'food') opts.push(['own', 'Eigene']);
    return `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${!ls.q && ls.filter === v ? 'on' : ''}"
      data-action="filter" data-scope="${scope}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  function refreshList(scope) {
    const box = $('#list-' + scope);
    if (!box) return;
    const { ls, kind } = lsFor(scope);
    box.innerHTML = listHtml(kind, ls, scope);
  }

  // ---------- Kochbuch ----------

  function renderCook() {
    const sub = state.sub.cook;
    const kind = sub === 'foods' ? 'food' : 'dish';
    const ls = cookLs(sub);
    return `
      ${seg('cook', [['foods', 'Lebensmittel'], ['dishes', 'Gerichte']], sub)}
      <div class="row search-row">
        <input id="cook-q" type="search" placeholder="${kind === 'food' ? 'Lebensmittel' : 'Gericht'} suchen" autocomplete="off"
          value="${esc(ls.q)}" data-input="q" data-scope="cook" aria-label="Suche">
        ${kind === 'food' ? '<button data-action="cook-scan">Scan</button>' : ''}
      </div>
      ${chipsHtml(kind, ls, 'cook')}
      <div id="list-cook">${listHtml(kind, ls, 'cook')}</div>
      <button class="primary wide add-new" data-action="${kind === 'food' ? 'cook-new-food' : 'dish-new'}">
        + ${kind === 'food' ? 'Neues Lebensmittel' : 'Neues Gericht'}</button>`;
  }

  // ---------- Fortschritt ----------

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

  function renderProgress() {
    const sub = state.sub.progress;
    const body = { weight: renderWeight, train: renderTrain, stats: renderStats, coach: renderCoach }[sub];
    return seg('progress', [['weight', 'Gewicht'], ['train', 'Training'], ['stats', 'Auswertung'], ['coach', 'Coach']], sub) + body();
  }

  // ---------- Profil ----------

  function targetPreview() {
    const s = settings();
    const kg = currentWeight();
    const g = goals();
    const kcalOf = (grams, k) => grams * k;
    const pct = (v) => (g.kcal > 0 ? Math.round((v / g.kcal) * 100) : 0);
    const range = Calc.PROTEIN[s.goal] || Calc.PROTEIN.maintain;
    const notes = [];
    if (g.mode === 'auto') {
      const [lo, hi] = g.lean ? [Calc.LEAN.min, Calc.LEAN.max] : [range.min, range.max];
      if (g.perKg < lo || g.perKg > hi) {
        notes.push(`Eiweiß ${fmt(g.perKg, 1)} g/kg liegt außerhalb des üblichen Bereichs von ${fmt(lo, 1)} bis ${fmt(hi, 1)} g/kg. Das ist erlaubt, aber ungewöhnlich.`);
      }
      if (g.fatPct < Calc.FAT.min || g.fatPct > Calc.FAT.max) {
        notes.push(`Fett ${fmt(g.fatPct)} % der Kalorien liegt außerhalb des üblichen Bereichs von ${Calc.FAT.min} bis ${Calc.FAT.max} %.`);
      }
      if (g.overBudget) notes.push('Eiweiß und Fett brauchen mehr Kalorien als das Ziel. Kohlenhydrate sind auf 0 gesetzt. Senke Eiweiß oder Fett oder erhöhe die Kalorien.');
    }
    return `<section class="card">
      <h2>Deine Tagesziele</h2>
      <dl class="kv">
        <dt>Kalorien</dt><dd>${fmt(g.kcal)} kcal</dd>
        <dt>Eiweiß</dt><dd>${fmt(g.p)} g · ${fmt(g.perKg, 1)} g/kg · ${pct(kcalOf(g.p, 4))} %</dd>
        <dt>Fett</dt><dd>${fmt(g.f)} g · ${pct(kcalOf(g.f, 9))} %</dd>
        <dt>Kohlenhydrate</dt><dd>${fmt(g.c)} g · ${pct(kcalOf(g.c, 4))} %</dd>
        ${g.mode === 'auto' ? `<dt>Grundumsatz</dt><dd>${fmt(Calc.bmr(s, kg))} kcal</dd><dt>Gesamtumsatz</dt><dd>${fmt(Calc.tdee(s, kg))} kcal</dd>` : ''}
      </dl>
      <p class="muted small">${g.mode === 'manual' ? 'Eigene Werte.' : `Berechnet aus Ziel „${(GOALS.find((x) => x[0] === s.goal) || [])[1]}“${g.lean ? ' (Eiweiß auf Magermasse bezogen)' : ''}.`}</p>
      ${notes.map((t) => `<div class="note warn">${esc(t)}</div>`).join('')}
    </section>`;
  }

  function renderGoals() {
    const s = settings();
    const kf = Calc.bodyFat(s);
    const sel = (opts, cur) => opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const range = Calc.PROTEIN[s.goal] || Calc.PROTEIN.maintain;
    const auto = s.targetMode !== 'manual';
    return `
      ${targetPreview()}
      <form data-form="goals" class="stack">
        <section class="card">
          <h2>Körperdaten</h2>
          <div class="stack">
            ${field('Name', `<input name="name" value="${esc(s.name)}">`)}
            <div class="grid2">
              ${field('Geschlecht', `<select name="sex">${sel([['m', 'männlich'], ['w', 'weiblich']], s.sex)}</select>`)}
              ${field('Alter', `<input name="age" type="number" inputmode="numeric" value="${s.age}">`)}
              ${field('Größe (cm)', `<input name="height" type="number" inputmode="numeric" value="${s.height}">`)}
              ${field('Gewicht (kg)', `<input name="weight" type="number" step="0.1" inputmode="decimal" value="${s.weight}">`)}
            </div>
            ${field('Aktivität', `<select name="activity">${sel(ACTIVITY, s.activity)}</select>`)}
            ${field('Körperfett in % (optional)', `<input name="bodyFat" type="number" step="0.1" inputmode="decimal" value="${s.bodyFat}" placeholder="${kf === null ? '' : fmt(kf, 1) + ' (geschätzt)'}">`)}
            <details>
              <summary>Maße für die Körperfett-Schätzung (Navy)</summary>
              <div class="grid3">
                ${field('Taille (cm)', `<input name="waist" type="number" step="0.5" inputmode="decimal" value="${s.waist}">`)}
                ${field('Hals (cm)', `<input name="neck" type="number" step="0.5" inputmode="decimal" value="${s.neck}">`)}
                ${field('Hüfte (cm)', `<input name="hip" type="number" step="0.5" inputmode="decimal" value="${s.hip}">`)}
              </div>
              <p class="hint">Hüfte nur für Frauen. Genauigkeit etwa ±3–4 %.</p>
            </details>
          </div>
        </section>
        <section class="card">
          <h2>Ziele festlegen</h2>
          ${field('Wie sollen die Ziele entstehen?', `<select name="targetMode" data-change="target-mode">${sel([['auto', 'Automatisch berechnen'], ['manual', 'Selbst vorgeben']], s.targetMode)}</select>`)}
          <div data-mode-group="auto" ${auto ? '' : 'hidden'} class="stack grp">
            ${field('Ziel', `<select name="goal">${sel(GOALS, s.goal)}</select>`)}
            ${field('Kalorien-Abstand zum Gesamtumsatz (kcal/Tag)', `<input name="pace" type="number" inputmode="numeric" value="${s.pace}">`)}
            <p class="hint">Abnehmen: 400 bis 600. Muskelaufbau: 200 bis 400. Halten: wird ignoriert.</p>
            ${field(`Eiweiß in g pro kg Körpergewicht (leer = Standard ${fmt(range.def, 1)})`, `<input name="proteinPerKg" type="number" step="0.1" inputmode="decimal" value="${s.proteinPerKg}" placeholder="${fmt(range.def, 1)}">`)}
            <p class="hint">Üblicher Bereich: Abnehmen ${fmt(Calc.PROTEIN.cut.min, 1)}–${fmt(Calc.PROTEIN.cut.max, 1)}, Halten ${fmt(Calc.PROTEIN.maintain.min, 1)}–${fmt(Calc.PROTEIN.maintain.max, 1)}, Muskelaufbau ${fmt(Calc.PROTEIN.bulk.min, 1)}–${fmt(Calc.PROTEIN.bulk.max, 1)} g/kg. Du darfst auch andere Werte nehmen.</p>
            ${field(`Fett in % der Kalorien (leer = Standard ${Calc.FAT.def})`, `<input name="fatPct" type="number" step="1" inputmode="numeric" value="${s.fatPct}" placeholder="${Calc.FAT.def}">`)}
            <p class="hint">Üblicher Bereich: ${Calc.FAT.min} bis ${Calc.FAT.max} %. Kohlenhydrate sind der Rest.</p>
            <label class="check"><input type="checkbox" name="leanBasis" ${s.leanBasis ? 'checked' : ''}> Beim Abnehmen: Eiweiß auf die Magermasse beziehen (braucht Körperfett, üblich ${fmt(Calc.LEAN.min, 1)}–${fmt(Calc.LEAN.max, 1)} g/kg, Standard ${fmt(Calc.LEAN.def, 1)})</label>
          </div>
          <div data-mode-group="manual" ${auto ? 'hidden' : ''} class="stack grp">
            <div class="grid2">
              ${field('Kalorien', `<input name="mkcal" type="number" inputmode="numeric" value="${s.manual.kcal}">`)}
              ${field('Eiweiß (g)', `<input name="mp" type="number" inputmode="numeric" value="${s.manual.p}">`)}
              ${field('Fett (g)', `<input name="mf" type="number" inputmode="numeric" value="${s.manual.f}">`)}
              ${field('Kohlenhydrate (g)', `<input name="mc" type="number" inputmode="numeric" value="${s.manual.c}">`)}
            </div>
            <p class="hint">Körperdaten sind hier nur für die Wasser-Empfehlung nötig.</p>
          </div>
        </section>
        <button class="primary wide">Speichern</button>
      </form>`;
  }

  function renderLook() {
    const t = themeLoad();
    const modes = [['system', 'Wie iPhone'], ['light', 'Hell'], ['dark', 'Dunkel']];
    return `
      <section class="card">
        <h2>Modus</h2>
        <div class="seg">${modes.map(([v, l]) => `<button class="${t.mode === v ? 'on' : ''}" data-action="theme-mode" data-v="${v}">${l}</button>`).join('')}</div>
      </section>
      <section class="card">
        <h2>Akzentfarbe</h2>
        <div class="swatches">${ACCENTS.map(([c, l]) => `<button class="sw ${t.accent.toLowerCase() === c ? 'on' : ''}"
          style="background:${c}" data-action="accent" data-c="${c}" aria-label="${l}"></button>`).join('')}</div>
        ${field('Eigene Farbe', `<input type="color" value="${t.accent}" data-change="accent-custom" class="colorpick">`)}
        <p class="hint">Gilt für Buttons, Ringe, Hervorhebungen und Diagramme. Die Wahl gilt für dieses Gerät.</p>
      </section>`;
  }

  function renderData() {
    const active = Store.activeId();
    return `
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
        <p class="muted small">Ohne Backup gehen die Daten verloren, wenn der Browser-Speicher gelöscht wird. Die Datei kannst du auf ein anderes Gerät übertragen. Der Foto-Schlüssel ist nicht enthalten.</p>
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

  function renderPhotoSettings() {
    const ai = data.ai();
    return `<section class="card" id="ai-card">
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
    </section>`;
  }

  function renderProfile() {
    const sub = state.sub.profile;
    const body = { goals: renderGoals, look: renderLook, data: renderData, photo: renderPhotoSettings }[sub];
    return seg('profile', [['goals', 'Ziele'], ['look', 'Darstellung'], ['data', 'Daten'], ['photo', 'Foto']], sub) + body();
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
    cook: { title: 'Kochbuch', render: renderCook },
    progress: { title: 'Fortschritt', render: renderProgress },
    profile: { title: 'Profil', render: renderProfile },
  };

  function render() {
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const prof = Store.profiles().find((p) => p.id === Store.activeId());
    $('#profile-badge').textContent = prof ? prof.name : '';
    if (!prof) {
      $('#title').textContent = 'Start';
      $('#view').innerHTML = renderWelcome();
      $('#subbar').classList.remove('show');
      return;
    }
    const v = views[state.tab];
    $('#title').textContent = v.title;
    $('#view').innerHTML = v.render();
    updateSubbar();
  }

  // ---------- Overlays: Auswahl, Dialog, Editor, Meldungen ----------

  let toastTimer;
  let toastFn = null;
  function toast(msg, label, fn) {
    $('#toast-text').textContent = msg;
    const b = $('#toast-btn');
    b.hidden = !label;
    b.textContent = label || '';
    toastFn = fn || null;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, label ? 6000 : 3200);
  }

  function openModal(html) {
    $('#modal').innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet">${html}</div>`;
    $('#modal').hidden = false;
  }

  function closeModal() {
    Scanner.stop();
    state.picker = null;
    state.photo = null;
    $('#modal').hidden = true;
    $('#modal').innerHTML = '';
  }

  function openDialog(html) {
    $('#dialog').innerHTML = `<div class="backdrop" data-action="close-dialog"></div><div class="dlg">${html}</div>`;
    $('#dialog').hidden = false;
  }

  function closeDialog() {
    $('#dialog').hidden = true;
    $('#dialog').innerHTML = '';
  }

  // ---------- Auswahl-Fenster ----------
  // target: 'meal' (Tagebuch), 'draft' (Zutat im Gericht-Editor), 'swap' (Eintrag ersetzen) oder null (nur Kochbuch)

  function openPicker(opts) {
    state.picker = {
      target: null, meal: null, entryId: null, tab: 'foods', view: 'list',
      ls: { foods: newLs('food'), dishes: newLs('dish') },
      food: null, dishId: null, ean: '', error: '', added: '', ...opts,
    };
    renderPicker();
  }

  const pickerTitle = (p) => ({
    meal: mealLabel(p.meal), draft: 'Zutat hinzufügen', swap: 'Ersetzen durch',
  }[p.target] || 'Lebensmittel');

  function customForm(kind, food, ean, extra = '', label = 'Speichern') {
    const f = food || {};
    return `<form data-form="${kind}" class="stack">
      ${ean ? `<input type="hidden" name="ean" value="${esc(ean)}">` : ''}
      ${extra}
      ${field('Name', `<input name="name" value="${esc(f.name || '')}" required>`)}
      <div class="grid4">
        ${field('kcal', `<input name="kcal" type="number" step="any" inputmode="decimal" value="${f.kcal ?? ''}" required>`)}
        ${field('Eiweiß', `<input name="p" type="number" step="any" inputmode="decimal" value="${f.p ?? ''}" required>`)}
        ${field('Fett', `<input name="f" type="number" step="any" inputmode="decimal" value="${f.f ?? ''}" required>`)}
        ${field('KH', `<input name="c" type="number" step="any" inputmode="decimal" value="${f.c ?? ''}" required>`)}
      </div>
      ${field('Portionsgröße in g (optional, z. B. 1 Stück)', `<input name="piece" type="number" step="any" inputmode="decimal" value="${f.piece ?? ''}">`)}
      <p class="hint">Werte pro 100 g.</p>
      <button class="primary wide">${label}</button>
    </form>`;
  }

  function pickerBody(p) {
    if (p.view === 'amount' && p.food) {
      const f = p.food;
      const chips = [50, 100, 150, 200].map((g) => `<button type="button" class="chip" data-action="amount-set" data-v="${g}">${g} g</button>`)
        .concat(f.piece ? [`<button type="button" class="chip" data-action="amount-set" data-v="${f.piece}">1 Stück (${fmt(f.piece)} g)</button>`] : []);
      return `<form data-form="amount" class="stack">
        <button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        <h2>${esc(f.name)}</h2>
        <p class="muted small">Pro 100 g: ${fmt(f.kcal)} kcal · E ${fmt(f.p, 1)} · F ${fmt(f.f, 1)} · KH ${fmt(f.c, 1)}</p>
        ${f.complete === false ? '<div class="note warn">Angaben unvollständig. Bitte mit der Packung vergleichen.</div>' : ''}
        ${field('Menge in Gramm', `<input id="amount" name="amount" type="number" step="any" inputmode="decimal" value="${p.keepAmount || f.piece || 100}" data-input="amount" required>`)}
        <div class="chips">${chips.join('')}</div>
        <div id="amount-preview" class="line"></div>
        ${ownIds().has(f.id) ? '<button type="button" class="ghost" data-action="pk-edit">Werte stimmen nicht? Hier ändern</button>' : ''}
        <button class="primary wide">Eintragen</button>
        ${p.target !== 'swap' ? '<button type="button" class="ghost" data-action="amount-more">Eintragen und weiteres hinzufügen</button>' : ''}
        ${f.source === 'off' ? '<p class="hint">Daten: Open Food Facts (ODbL)</p>' : ''}
      </form>`;
    }
    if (p.view === 'dish' && p.dishId) {
      const d = data.dishes().find((x) => x.id === p.dishId);
      return `<form data-form="amount" class="stack">
        <button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        <h2>${esc(d.name)}</h2>
        ${field('Portionen', '<input id="amount" name="amount" type="number" step="0.25" inputmode="decimal" value="1" data-input="amount" required>')}
        <div id="amount-preview"></div>
        <button class="primary wide">Eintragen</button>
        ${p.target !== 'swap' ? '<button type="button" class="ghost" data-action="amount-more">Eintragen und weiteres hinzufügen</button>' : ''}
      </form>`;
    }
    if (p.view === 'new') {
      return `<button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        ${p.error ? `<div class="note warn">${esc(p.error)}</div>` : ''}
        <h2>Neues Lebensmittel</h2>
        ${customForm('food-new', null, p.ean, '', p.target ? 'Speichern und Menge wählen' : 'Speichern')}`;
    }
    if (p.view === 'edit' && p.food) {
      return `<button type="button" class="linkish left" data-action="pk-edit-back">‹ Zurück</button>
        <h2>Werte ändern</h2>
        <p class="muted small">Die Änderung gilt dauerhaft für dieses Produkt. Werte pro 100 g.</p>
        ${customForm('food-fix', p.food, '', `<input type="hidden" name="id" value="${esc(p.food.id)}">`, 'Speichern')}`;
    }
    if (p.view === 'info' && p.food) {
      const f = p.food;
      return `<h2>${esc(f.name)}</h2>
        <p class="muted small">Pro 100 g: ${fmt(f.kcal)} kcal · E ${fmt(f.p, 1)} · F ${fmt(f.f, 1)} · KH ${fmt(f.c, 1)}</p>
        <div class="note">Im Kochbuch gespeichert.</div>
        ${ownIds().has(f.id) ? '<button class="ghost" data-action="pk-edit">Werte stimmen nicht? Hier ändern</button>' : ''}
        <button class="primary wide" data-action="close-modal">Fertig</button>
        <p class="hint">Daten: Open Food Facts (ODbL)</p>`;
    }
    if (p.view === 'scan') {
      return `<button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        <div class="scanbox"><video id="scan-video" playsinline muted autoplay></video><div class="scanline"></div></div>
        <p class="hint" id="scan-status">Kamera wird gestartet …</p>
        <form data-form="ean" class="row">
          <input name="ean" inputmode="numeric" pattern="[0-9]{8,14}" placeholder="Nummer manuell eingeben" required aria-label="Barcode-Nummer">
          <button class="primary">Suchen</button>
        </form>`;
    }
    if (p.view === 'notfound') {
      return `<button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        <div class="note warn">${p.error ? esc(p.error) + ' ' : ''}Barcode ${esc(p.ean)} wurde nicht gefunden. Du kannst das Produkt selbst anlegen.</div>
        <button class="primary wide" data-action="pk-new">Von Hand anlegen</button>`;
    }

    // Liste
    const kind = p.tab === 'foods' ? 'food' : 'dish';
    const ls = p.ls[p.tab];
    const tabs = [['foods', 'Lebensmittel']];
    if (p.target !== 'draft') tabs.push(['dishes', 'Gerichte']);
    return `
      ${tabs.length > 1 ? `<div class="seg">${tabs.map(([k, l]) => `<button class="${p.tab === k ? 'on' : ''}" data-action="pk-tab" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="row search-row">
        <input id="pk-q" type="search" placeholder="Suchen" autocomplete="off" value="${esc(ls.q)}" data-input="q" data-scope="picker" aria-label="Suche">
        ${kind === 'food' ? '<button data-action="pk-scan">Scan</button>' : ''}
      </div>
      ${chipsHtml(kind, ls, 'picker')}
      <div id="list-picker">${listHtml(kind, ls, 'picker')}</div>
      ${kind === 'food'
    ? '<button class="ghost" data-action="pk-new">+ Neu von Hand</button>'
    : '<button class="ghost" data-action="dish-new-from-picker">+ Neues Gericht anlegen</button>'}
      ${kind === 'food' && p.target === 'meal' ? `<details>
        <summary>Mehrere per Text eintragen</summary>
        <form data-form="quick" class="stack">
          <input name="text" placeholder="80 g Haferflocken, 2 Eier, 200 ml Milch" autocomplete="off" required aria-label="Text">
          <button class="primary">Eintragen</button>
        </form>
      </details>` : ''}`;
  }

  function renderPicker() {
    const p = state.picker;
    if (!p) return;
    Scanner.stop();
    openModal(`
      <div class="line"><h2>${pickerTitle(p)}</h2><button class="linkish" data-action="close-modal">Fertig</button></div>
      ${p.added ? `<div class="note">${esc(p.added)}</div>` : ''}
      ${pickerBody(p)}`);
    if (p.view === 'scan') startScan();
    if (p.view === 'amount' || p.view === 'dish') {
      renderAmountPreview();
      const input = $('#amount');
      if (input) { input.focus(); input.select(); }
    }
  }

  function renderAmountPreview() {
    const box = $('#amount-preview');
    const p = state.picker;
    if (!box || !p) return;
    const amount = n($('#amount').value);
    if (p.view === 'amount') {
      const t = totals({ grams: amount, base: p.food });
      box.innerHTML = `<b>Nährwerte</b><b>${macroLine(t)}</b>`;
    } else {
      const d = data.dishes().find((x) => x.id === p.dishId);
      const per = Dish.perPortion(d);
      box.innerHTML = `<div class="line"><b>Nährwerte</b><b>${macroLine({
        kcal: per.kcal * amount, p: per.p * amount, f: per.f * amount, c: per.c * amount,
      })}</b></div><h2 class="sub">Auf den Teller</h2>${plateList(d, amount)}`;
    }
  }

  // Trägt Einträge je nach Ziel des Auswahl-Fensters ein
  function commitItems(items, more, label) {
    const p = state.picker;
    if (p.target === 'meal') {
      items.forEach((it) => addEntry(state.date, p.meal, it));
      render();
    } else if (p.target === 'draft') {
      state.draft.ingredients.push(...items);
      renderEditor();
    } else if (p.target === 'swap') {
      swapEntry(p.entryId, items[0]);
    }
    if (more && p.target !== 'swap') {
      Object.assign(p, { view: 'list', food: null, dishId: null, added: `✓ ${label} eingetragen` });
      return renderPicker();
    }
    return closeModal();
  }

  // Ersetzt Lebensmittel und Menge eines Eintrags, Mahlzeit und Kennung bleiben
  function swapEntry(id, item) {
    const day = data.day(state.date);
    const e = day.entries.find((x) => x.id === id);
    if (!e) return;
    const keep = { id: e.id, meal: e.meal };
    Object.keys(e).forEach((k) => delete e[k]);
    Object.assign(e, item, keep);
    data.saveDay(state.date, day);
    render();
  }

  // ---------- Scanner ----------

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
      await Scanner.start(video, (ean) => { Scanner.stop(); findProduct(ean); });
      if (!state.picker || state.picker.view !== 'scan') return Scanner.stop();
      setScanStatus('Halte den Barcode ins Bild.');
    } catch (err) {
      setScanStatus(cameraMessage(err));
    }
  }

  async function findProduct(ean) {
    const p = state.picker;
    if (!p) return;
    p.ean = ean;
    p.error = '';
    const known = data.products().find((x) => x.ean === ean) || data.custom().find((x) => x.ean === ean);
    let food = known || null;
    if (!food) {
      setScanStatus('Produkt wird gesucht …');
      try {
        food = await Scanner.lookup(ean);
        if (!state.picker) return;
        if (food) saveProduct(food);
      } catch (err) {
        if (!state.picker) return;
        p.error = err.message;
        p.view = 'notfound';
        return renderPicker();
      }
    }
    if (!food) {
      p.view = 'notfound';
      return renderPicker();
    }
    p.food = food;
    p.view = p.target ? 'amount' : 'info';
    return renderPicker();
  }

  // ---------- Gericht-Editor (Vollbild) ----------

  function plateList(d, portions) {
    return `<ul class="list">${Dish.scaled(d, portions).map((i) => `<li>
      <div class="grow"><b>${esc(i.name)}</b></div><span>${amountText(i.amount, i.unit)}</span></li>`).join('')}</ul>`;
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
      if (g > 0 && d.ingredients[Number(el.dataset.i)]) d.ingredients[Number(el.dataset.i)].grams = g;
    });
  }

  function renderEditor() {
    const host = $('#editor');
    const d = state.draft;
    if (!d) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const keep = host.querySelector('.page-body') ? host.querySelector('.page-body').scrollTop : 0;
    const tot = Calc.sumEntries(d.ingredients);
    const per = Dish.perPortion(d);
    host.innerHTML = `
      <div class="page-head">
        <button class="linkish" data-action="editor-close">Abbrechen</button>
        <b>${d.id ? 'Gericht ändern' : 'Neues Gericht'}</b>
        <button class="linkish strong" data-action="dish-save">Speichern</button>
      </div>
      <div class="page-body">
        <section class="card">
          <div class="stack">
            ${field('Name', `<input id="draft-name" value="${esc(d.name)}" placeholder="z. B. Chili con Carne">`)}
            ${field('Das Rezept reicht für (Portionen)', `<input id="draft-servings" type="number" step="any" inputmode="decimal" value="${d.servings}" data-change="draft-servings">`)}
          </div>
          <h2 class="sub">Zutaten für das ganze Rezept</h2>
          ${d.ingredients.length ? `<ul class="list">${d.ingredients.map((i, idx) => `<li>
            <div class="grow"><b>${esc(i.name)}</b><small class="muted">${fmt(Calc.entryTotals(i).kcal)} kcal</small></div>
            <input class="grams" type="number" step="any" inputmode="decimal" value="${i.grams}" data-change="draft-amount" data-i="${idx}" aria-label="Menge">
            <span class="unit">${unitLabel(i)}</span>
            <button class="icon danger" data-action="draft-del" data-i="${idx}" aria-label="Zutat entfernen">×</button>
          </li>`).join('')}</ul>` : '<p class="muted small">Noch keine Zutaten.</p>'}
          <button class="ghost" data-action="draft-add">+ Zutat hinzufügen</button>
        </section>
        <section class="card">
          <h2>Ergebnis</h2>
          <div class="line"><span class="muted">Gesamtes Rezept</span><span>${macroLine(tot)}</span></div>
          <div class="line"><b>Pro Portion</b><b>${macroLine(per)}</b></div>
          <h2 class="sub">Pro Portion auf den Teller</h2>
          ${d.ingredients.length ? plateList(d, 1) : '<p class="muted small">Füge Zutaten hinzu.</p>'}
        </section>
        ${d.id ? '<button class="ghost danger-btn" data-action="dish-del">Gericht löschen</button>' : ''}
      </div>`;
    host.hidden = false;
    host.querySelector('.page-body').scrollTop = keep;
  }

  function openEditor(dish, ingredients) {
    state.draft = dish
      ? JSON.parse(JSON.stringify(dish))
      : { id: null, name: '', servings: ingredients && ingredients.length ? 1 : 2, ingredients: ingredients || [] };
    renderEditor();
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
    renderEditor();
    toast('Gericht gespeichert.');
    const back = state.editorReturn;
    state.editorReturn = null;
    if (back) {
      // Das neue Gericht ist noch nie benutzt, deshalb „Alle“ statt „Zuletzt“ zeigen
      openPicker({
        target: 'meal', meal: back, tab: 'dishes',
        ls: { foods: newLs('food'), dishes: { q: '', filter: 'all', limit: 30 } },
      });
    } else {
      render();
    }
  }

  // ---------- Foto-Schätzung ----------

  function renderPhoto() {
    const ph = state.photo;
    if (!ph) return;
    const ai = data.ai();
    let body;
    if (!ai.key) {
      body = `<div class="note">Für die Foto-Schätzung brauchst du einen eigenen, kostenlosen Google-Schlüssel (Gemini).</div>
        <button class="primary wide" data-action="goto-photo-settings">Schlüssel eintragen</button>`;
    } else if (ph.busy) {
      body = '<p class="muted">Foto wird analysiert …</p>';
    } else if (ph.result && ph.mode === 'items') {
      const r = ph.result;
      const tot = Calc.sumEntries(r.items);
      body = `<h2>${esc(r.name)}</h2>
        ${r.confidence ? `<p class="muted small">Sicherheit: ${esc(r.confidence)}${r.note ? ' · ' + esc(r.note) : ''}</p>` : ''}
        ${r.items.length ? `<ul class="list">${r.items.map((it, i) => `<li>
          <div class="grow"><b>${esc(it.name)}</b><small class="muted">${macroLine(Calc.entryTotals(it))}</small></div>
          <input class="grams" type="number" step="any" inputmode="decimal" value="${it.grams}" data-change="ph-grams" data-i="${i}" aria-label="Gramm">
          <span class="unit">g</span>
          <button class="icon danger" data-action="ph-del" data-i="${i}" aria-label="Entfernen">×</button>
        </li>`).join('')}</ul>
        <div class="line"><b>Summe</b><b>${macroLine(tot)}</b></div>
        <button class="primary wide" data-action="ph-add">Alle eintragen</button>`
        : '<div class="note warn">Es wurde kein Essen erkannt.</div>'}
        <button class="ghost" data-action="ph-reset">Anderes Foto</button>`;
    } else if (ph.result && ph.mode === 'dish') {
      const r = ph.result;
      body = `<p class="muted small">Sicherheit: ${esc(r.confidence || 'unbekannt')}${r.note ? ' · ' + esc(r.note) : ''}</p>
        <form data-form="ph-dish" class="stack">
          ${field('Name', `<input name="name" value="${esc(r.name)}" required>`)}
          <div class="grid4">
            ${field('kcal', `<input name="kcal" type="number" step="any" inputmode="decimal" value="${r.total.kcal}" required>`)}
            ${field('Eiweiß', `<input name="p" type="number" step="any" inputmode="decimal" value="${r.total.p}" required>`)}
            ${field('Fett', `<input name="f" type="number" step="any" inputmode="decimal" value="${r.total.f}" required>`)}
            ${field('KH', `<input name="c" type="number" step="any" inputmode="decimal" value="${r.total.c}" required>`)}
          </div>
          <p class="hint">Werte für die ganze Portion. Du kannst sie vor dem Eintragen korrigieren.</p>
          <button class="primary wide">Als 1 Portion eintragen</button>
        </form>
        <button class="ghost" data-action="ph-reset">Anderes Foto</button>`;
    } else {
      body = `${ph.error ? `<div class="note warn">${esc(ph.error)}</div>` : ''}
        <div class="seg">
          <button class="${ph.mode === 'items' ? 'on' : ''}" data-action="ph-mode" data-v="items">Zutaten einzeln</button>
          <button class="${ph.mode === 'dish' ? 'on' : ''}" data-action="ph-mode" data-v="dish">Ganzes Gericht</button>
        </div>
        <p class="muted small">${ph.mode === 'items'
    ? 'Die Schätzung nennt jede erkannte Zutat mit Menge. Du kannst die Mengen danach anpassen.'
    : 'Für Gerichte mit unbekannten Zutaten, z. B. im Restaurant. Es kommt ein Wert für die ganze Portion.'}</p>
        <label class="filebtn bigbtn">Foto aufnehmen oder wählen<input type="file" accept="image/*" data-change="photo" hidden></label>
        <p class="hint">Das Foto wird verkleinert und zur Analyse an Google gesendet. Es wird nicht gespeichert. Schätzungen weichen oft um 20 bis 30 % ab.</p>`;
    }
    openModal(`
      <div class="line"><h2>Foto · ${mealLabel(ph.meal)}</h2><button class="linkish" data-action="close-modal">Fertig</button></div>
      ${body}`);
  }

  async function runPhoto(file) {
    const ph = state.photo;
    if (!ph) return;
    const ai = data.ai();
    ph.busy = true;
    ph.error = '';
    ph.result = null;
    renderPhoto();
    try {
      const result = await Vision.estimate(file, ai.key, ai.model || DEFAULT_MODEL, ph.mode);
      if (state.photo !== ph) return;
      ph.result = result;
    } catch (err) {
      if (state.photo !== ph) return;
      ph.error = err.message;
    }
    ph.busy = false;
    renderPhoto();
  }

  // ---------- Aktionen ----------

  function changeGrams(id, value) {
    const day = data.day(state.date);
    const e = day.entries.find((x) => x.id === id);
    const g = n(value);
    if (!e || g <= 0) return render();
    e.grams = g;
    data.saveDay(state.date, day);
    return render();
  }

  function mealEntries(meal) {
    return data.day(state.date).entries.filter((e) => e.meal === meal);
  }

  const stripEntry = (e) => ({
    name: e.name, grams: e.grams, ...(e.unit === 'port' ? { unit: 'port' } : {}), base: { ...e.base },
  });

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
        Store.set('favs', d.favs || []);
        state.tab = 'profile';
        state.sub.profile = 'data';
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
      version: 3,
      name: prof ? prof.name : 'Profil',
      data: {
        settings: Store.get('settings', null),
        days: data.days(),
        weights: data.weights(),
        workouts: data.workouts(),
        custom: data.custom(),
        dishes: data.dishes(),
        products: data.products(),
        favs: data.favs(),
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

  function openFoodDialog(id) {
    const food = allFoods().find((f) => f.id === id);
    if (!food) return;
    const own = ownIds().has(id);
    if (own) {
      openDialog(`<h2>Lebensmittel ändern</h2>
        ${customForm('food-edit', food, '', `<input type="hidden" name="id" value="${esc(id)}">`)}
        <div class="row">
          <button class="ghost danger-btn" data-action="food-del" data-id="${esc(id)}">Löschen</button>
          <button class="ghost" data-action="close-dialog">Abbrechen</button>
        </div>`);
    } else {
      openDialog(`<h2>${esc(food.name)}</h2>
        <p class="muted small">Pro 100 g: ${fmt(food.kcal)} kcal · E ${fmt(food.p, 1)} · F ${fmt(food.f, 1)} · KH ${fmt(food.c, 1)}</p>
        <p class="muted small">Das ist ein Standard-Eintrag mit Richtwerten. Er lässt sich nicht ändern, aber du kannst eine eigene Kopie anlegen.</p>
        <button class="primary wide" data-action="food-copy" data-id="${esc(id)}">Eigene Kopie anlegen</button>
        <button class="linkish" data-action="close-dialog">Schließen</button>`);
    }
  }

  function handleAction(action, ds) {
    switch (action) {
      case 'sub':
        state.sub[ds.group] = ds.v;
        render();
        return window.scrollTo(0, 0);
      case 'go-profile':
        state.tab = 'profile';
        state.sub.profile = 'goals';
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
        const idx = day.entries.findIndex((e) => e.id === ds.id);
        if (idx < 0) return undefined;
        const [removed] = day.entries.splice(idx, 1);
        data.saveDay(state.date, day);
        render();
        return toast('Eintrag gelöscht.', 'Rückgängig', () => {
          const d2 = data.day(state.date);
          d2.entries.splice(Math.min(idx, d2.entries.length), 0, removed);
          data.saveDay(state.date, d2);
          render();
        });
      }
      case 'toast-action': {
        const fn = toastFn;
        $('#toast').hidden = true;
        toastFn = null;
        return fn ? fn() : undefined;
      }
      case 'water': {
        const day = data.day(state.date);
        day.water = Math.max(0, day.water + Number(ds.ml));
        data.saveDay(state.date, day);
        return render();
      }
      case 'meal-copy': {
        const src = data.day(addDays(state.date, -1)).entries.filter((e) => e.meal === ds.meal);
        src.forEach((e) => {
          const { id, ...rest } = e;
          addEntry(state.date, ds.meal, JSON.parse(JSON.stringify(rest)));
        });
        return render();
      }
      case 'meal-save':
        return openDialog(`<h2>Als Gericht speichern</h2>
          <form data-form="meal-save" class="stack">
            <input type="hidden" name="meal" value="${esc(ds.meal)}">
            ${field('Name des Gerichts', '<input name="name" placeholder="z. B. Haferbrei mit Banane" required autocomplete="off">')}
            <p class="hint">Die Einträge von „${mealLabel(ds.meal)}“ werden als Gericht mit 1 Portion gespeichert. Du findest es danach im Kochbuch.</p>
            <button class="primary wide">Speichern</button>
            <button type="button" class="linkish" data-action="close-dialog">Abbrechen</button>
          </form>`);

      // Auswahl-Fenster
      case 'open-picker':
        return openPicker({ target: 'meal', meal: ds.meal, tab: ds.pk });
      case 'swap': {
        const e = data.day(state.date).entries.find((x) => x.id === ds.id);
        return openPicker({ target: 'swap', entryId: ds.id, meal: e ? e.meal : null });
      }
      case 'cook-scan':
        return openPicker({ target: null, view: 'scan' });
      case 'cook-new-food':
        return openPicker({ target: null, view: 'new' });
      case 'pk-tab':
        state.picker.tab = ds.v;
        return renderPicker();
      case 'pk-scan':
        state.picker.view = 'scan';
        return renderPicker();
      case 'pk-new':
        state.picker.view = 'new';
        return renderPicker();
      case 'pk-edit': {
        // Menge merken, damit sie nach dem Ändern nicht verloren geht
        const amountEl = $('#amount');
        Object.assign(state.picker, {
          editFrom: state.picker.view, keepAmount: amountEl ? amountEl.value : null, view: 'edit',
        });
        return renderPicker();
      }
      case 'pk-edit-back':
        state.picker.view = state.picker.editFrom || 'amount';
        return renderPicker();
      case 'pk-back':
        Object.assign(state.picker, { view: 'list', food: null, dishId: null, error: '', keepAmount: null });
        // Aus dem Kochbuch gibt es keine Liste zum Zurückgehen
        if (!state.picker.target) return closeModal();
        return renderPicker();
      case 'pk-food': {
        const food = allFoods().find((f) => f.id === ds.id);
        if (!food) return undefined;
        Object.assign(state.picker, { view: 'amount', food, added: '' });
        return renderPicker();
      }
      case 'pk-dish':
        Object.assign(state.picker, { view: 'dish', dishId: ds.id, added: '' });
        return renderPicker();
      case 'amount-set':
        $('#amount').value = ds.v;
        return renderAmountPreview();
      case 'amount-more':
        return submitAmount(true);
      case 'filter': {
        const { ls } = lsFor(ds.scope);
        ls.filter = ds.v;
        ls.q = '';
        ls.limit = 30;
        return ds.scope === 'picker' ? renderPicker() : render();
      }
      case 'more': {
        const { ls } = lsFor(ds.scope);
        ls.limit += 30;
        return refreshList(ds.scope);
      }
      case 'fav':
        toggleFav(ds.id);
        return refreshFavButtons();
      case 'close-modal':
        return closeModal();
      case 'close-dialog':
        return closeDialog();
      // Lebensmittel im Kochbuch
      case 'food-open':
        return openFoodDialog(ds.id);
      case 'food-copy': {
        const f = allFoods().find((x) => x.id === ds.id);
        const copy = { ...f, id: 'c' + uid(), name: `${f.name} (eigen)` };
        delete copy.complete;
        Store.set('custom', [...data.custom(), copy]);
        closeDialog();
        render();
        return openFoodDialog(copy.id);
      }
      case 'food-del': {
        const f = allFoods().find((x) => x.id === ds.id);
        if (!confirm(`„${f ? f.name : ''}“ löschen?`)) return undefined;
        Store.set('custom', data.custom().filter((x) => x.id !== ds.id));
        Store.set('products', data.products().filter((x) => x.id !== ds.id));
        Store.set('favs', data.favs().filter((x) => x !== ds.id));
        closeDialog();
        return render();
      }

      // Gerichte und Editor
      case 'dish-new':
        state.editorReturn = null;
        return openEditor(null);
      case 'dish-new-from-picker':
        state.editorReturn = state.picker.target === 'meal' ? state.picker.meal : null;
        closeModal();
        return openEditor(null);
      case 'dish-edit': {
        const d = data.dishes().find((x) => x.id === ds.id);
        state.editorReturn = null;
        return d ? openEditor(d) : undefined;
      }
      case 'draft-add':
        syncDraft();
        return openPicker({ target: 'draft', tab: 'foods' });
      case 'draft-del':
        syncDraft();
        state.draft.ingredients.splice(Number(ds.i), 1);
        return renderEditor();
      case 'dish-save':
        return saveDish();
      case 'dish-del': {
        if (!confirm(`Gericht „${state.draft.name}“ löschen?`)) return undefined;
        Store.set('dishes', data.dishes().filter((x) => x.id !== state.draft.id));
        Store.set('favs', data.favs().filter((x) => x !== state.draft.id));
        state.draft = null;
        renderEditor();
        return render();
      }
      case 'editor-close':
        state.draft = null;
        state.editorReturn = null;
        renderEditor();
        return render();

      // Foto
      case 'photo-open':
        state.photo = { meal: ds.meal, mode: 'items', busy: false, error: '', result: null };
        return renderPhoto();
      case 'ph-mode':
        state.photo.mode = ds.v;
        return renderPhoto();
      case 'ph-del':
        state.photo.result.items.splice(Number(ds.i), 1);
        return renderPhoto();
      case 'ph-reset':
        Object.assign(state.photo, { result: null, error: '' });
        return renderPhoto();
      case 'ph-add': {
        const items = state.photo.result.items.map((it) => ({ ...it, estimated: true }));
        if (!items.length) return toast('Keine Einträge vorhanden.');
        items.forEach((it) => addEntry(state.date, state.photo.meal, it));
        closeModal();
        return render();
      }
      case 'goto-photo-settings':
        closeModal();
        state.tab = 'profile';
        state.sub.profile = 'photo';
        window.scrollTo(0, 0);
        return render();
      case 'ai-clear':
        Store.set('ai', { key: '', model: data.ai().model });
        toast('Schlüssel entfernt.');
        return render();

      // Profil
      case 'theme-mode':
        themeSave({ mode: ds.v });
        return render();
      case 'accent':
        themeSave({ accent: ds.c });
        return render();
      case 'del-weight':
        Store.set('weights', data.weights().filter((w) => w.date !== ds.date));
        return render();
      case 'del-workout':
        Store.set('workouts', data.workouts().filter((w) => w.id !== ds.id));
        return render();
      case 'new-profile':
        return openDialog(`<h2>Neues Profil</h2>
          <form data-form="new-profile" class="stack">
            <input name="name" placeholder="Name" required aria-label="Name" autocomplete="off">
            <button class="primary wide">Anlegen</button>
            <button type="button" class="linkish" data-action="close-dialog">Abbrechen</button>
          </form>`);
      case 'profile-switch':
        Store.setActive(ds.id);
        state.cook = null;
        return render();
      case 'profile-delete': {
        const p = Store.profiles().find((x) => x.id === ds.id);
        if (!confirm(`Profil „${p ? p.name : ''}“ mit allen Daten löschen? Das kann nicht rückgängig gemacht werden.`)) return undefined;
        Store.deleteProfile(ds.id);
        state.cook = null;
        return render();
      }
      case 'export':
        return exportProfile();
      default:
        return undefined;
    }
  }

  // Sterne in Listen aktualisieren, ohne die Suche zu verlieren
  function refreshFavButtons() {
    ['picker', 'cook'].forEach((scope) => {
      if ($('#list-' + scope)) {
        const { ls } = lsFor(scope);
        // Im Favoriten-Filter verschwindet der Eintrag, sonst nur der Stern
        if (ls.filter === 'fav' && !ls.q) refreshList(scope);
        else {
          document.querySelectorAll(`#list-${scope} .star`).forEach((b) => {
            const on = isFav(b.dataset.id);
            b.classList.toggle('on', on);
            b.textContent = on ? '★' : '☆';
          });
        }
      }
    });
  }

  function submitAmount(more) {
    const p = state.picker;
    if (!p) return undefined;
    const amount = n($('#amount').value);
    if (amount <= 0) return toast('Bitte eine Menge über 0 angeben.');
    if (p.view === 'dish') {
      const d = data.dishes().find((x) => x.id === p.dishId);
      return commitItems([Dish.toEntry(d, amount)], more, d.name);
    }
    return commitItems([foodItem(p.food, amount)], more, p.food.name);
  }

  function handleSubmit(formName, form, f) {
    const get = (k) => String(f.get(k) ?? '');
    switch (formName) {
      case 'amount':
        return submitAmount(false);
      case 'quick': {
        const p = state.picker;
        const foods = allFoods();
        const missing = [];
        let added = 0;
        Parse.items(get('text')).forEach((item) => {
          const r = Parse.food(item, foods);
          if (r.missing) missing.push(r.missing);
          else {
            addEntry(state.date, p.meal, foodItem(r.food, r.grams));
            added += 1;
          }
        });
        if (missing.length) toast(`Nicht gefunden: ${missing.join(', ')}. Lege es mit „Neu von Hand“ an.`);
        p.added = added ? `✓ ${added} eingetragen` : '';
        render();
        return renderPicker();
      }
      case 'food-new': {
        const ean = get('ean');
        const food = {
          id: 'c' + uid(), name: get('name').trim(),
          kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')),
          piece: n(get('piece')) || null,
          ...(ean ? { ean } : {}),
        };
        Store.set('custom', [...data.custom(), food]);
        state.cook = null;
        const p = state.picker;
        if (p && p.target) {
          Object.assign(p, { view: 'amount', food, ean: '', error: '' });
          return renderPicker();
        }
        closeModal();
        toast('Lebensmittel gespeichert.');
        return render();
      }
      case 'food-edit': {
        const id = get('id');
        const next = {
          name: get('name').trim(), kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')),
          piece: n(get('piece')) || null,
        };
        const upd = (list) => list.map((x) => (x.id === id ? { ...x, ...next } : x));
        Store.set('custom', upd(data.custom()));
        Store.set('products', upd(data.products()));
        closeDialog();
        toast('Gespeichert.');
        return render();
      }
      case 'food-fix': {
        const id = get('id');
        const next = {
          name: get('name').trim(), kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')),
          piece: n(get('piece')) || null,
        };
        // Nach eigener Korrektur entfällt der Hinweis auf unvollständige Angaben
        const upd = (list) => list.map((x) => (x.id === id ? { ...x, ...next, ...(x.complete === undefined ? {} : { complete: true }) } : x));
        Store.set('custom', upd(data.custom()));
        Store.set('products', upd(data.products()));
        const p = state.picker;
        p.food = allFoods().find((x) => x.id === id) || { ...p.food, ...next };
        p.view = p.editFrom === 'info' ? 'info' : 'amount';
        toast('Werte gespeichert.');
        return renderPicker();
      }
      case 'meal-save': {
        const items = mealEntries(get('meal')).map(stripEntry);
        if (!items.length) return toast('Diese Mahlzeit ist leer.');
        const dish = { id: 'd' + uid(), name: get('name').trim(), servings: 1, ingredients: items };
        Store.set('dishes', [...data.dishes(), dish]);
        state.cook = null;
        closeDialog();
        return toast(`Gericht „${dish.name}“ gespeichert. Du findest es im Kochbuch.`);
      }
      case 'ean': {
        const ean = get('ean').trim();
        if (!/^\d{8,14}$/.test(ean)) return toast('Die Nummer hat 8 bis 14 Ziffern.');
        Scanner.stop();
        return findProduct(ean);
      }
      case 'ph-dish': {
        const item = {
          name: get('name').trim(), grams: 1, unit: 'port', estimated: true,
          base: { kcal: n(get('kcal')), p: n(get('p')), f: n(get('f')), c: n(get('c')) },
        };
        addEntry(state.date, state.photo.meal, item);
        closeModal();
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
      case 'ai': {
        const cur = data.ai();
        const key = get('key').trim() || cur.key;
        Store.set('ai', { key, model: get('model').trim() || DEFAULT_MODEL });
        toast('Gespeichert.');
        return render();
      }
      case 'goals': {
        const mode = get('targetMode') === 'manual' ? 'manual' : 'auto';
        const s = {
          name: get('name').trim() || 'Ich',
          sex: get('sex'),
          age: n(get('age')),
          height: n(get('height')),
          weight: n(get('weight')),
          activity: n(get('activity')),
          bodyFat: n(get('bodyFat')) || '',
          waist: n(get('waist')) || '',
          neck: n(get('neck')) || '',
          hip: n(get('hip')) || '',
          targetMode: mode,
          goal: get('goal') || 'maintain',
          pace: n(get('pace')),
          proteinPerKg: n(get('proteinPerKg')) || '',
          fatPct: n(get('fatPct')) || '',
          leanBasis: f.get('leanBasis') !== null,
          manual: { kcal: n(get('mkcal')) || '', p: n(get('mp')) || '', f: n(get('mf')) || '', c: n(get('mc')) || '' },
          setupDone: true,
        };
        if (mode === 'auto' && (s.age < 10 || s.age > 100 || s.height < 100 || s.height > 250 || s.weight < 30 || s.weight > 300)) {
          return toast('Bitte Alter, Größe und Gewicht prüfen.');
        }
        if (s.proteinPerKg && (s.proteinPerKg < 0.8 || s.proteinPerKg > 4)) return toast('Eiweiß: bitte einen Wert zwischen 0,8 und 4 g/kg nehmen.');
        if (s.fatPct && (s.fatPct < 10 || s.fatPct > 60)) return toast('Fett: bitte einen Wert zwischen 10 und 60 % nehmen.');
        if (mode === 'manual' && !s.manual.kcal) return toast('Bitte die Kalorien für deine Ziele eintragen.');
        Store.set('settings', s);
        Store.renameProfile(Store.activeId(), s.name);
        toast('Gespeichert.');
        return render();
      }
      case 'new-profile': {
        const name = get('name').trim() || 'Ich';
        Store.createProfile(name);
        Store.set('settings', { name });
        state.cook = null;
        state.tab = 'diary';
        closeDialog();
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
    return undefined;
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
        return renderEditor();
      case 'ph-grams': {
        const g = n(el.value);
        if (g > 0) state.photo.result.items[Number(el.dataset.i)].grams = g;
        return renderPhoto();
      }
      case 'photo': {
        const file = el.files[0];
        el.value = '';
        if (file) runPhoto(file);
        return undefined;
      }
      case 'target-mode':
        document.querySelectorAll('[data-mode-group]').forEach((g) => {
          g.hidden = g.dataset.modeGroup !== (el.value === 'manual' ? 'manual' : 'auto');
        });
        return undefined;
      case 'accent-custom':
        themeSave({ accent: el.value });
        return render();
      default:
        return undefined;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.input === 'q') {
      const { ls } = lsFor(el.dataset.scope);
      ls.q = el.value;
      ls.limit = 30;
      refreshList(el.dataset.scope);
    }
    if (el.dataset.input === 'amount') renderAmountPreview();
  });

  window.addEventListener('scroll', updateSubbar, { passive: true });

  themeApply(themeLoad());
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
