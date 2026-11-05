// Oberfläche: vier Reiter (Tagebuch, Kochbuch, Fortschritt, Profil), Auswahl-Fenster, Gericht-Editor.
// Daten liegen über Store lokal im Browser.
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (x, d = 0) => Number(x || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  // Kalorien pro 100 g mit einer Nachkommastelle zeigen, wenn sie nicht ganzzahlig sind (1,5 statt 2)
  const fmtK = (x) => fmt(x, Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1);
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

  // Mahlzeiten-Katalog: [Schlüssel, Name, standardmäßig an]. Die Schlüssel der ersten vier bleiben gleich,
  // damit bestehende Einträge zugeordnet bleiben.
  const MEAL_CATALOG = [
    ['fruehstueck', 'Frühstück', true], ['vormittag', 'Vormittagssnack', false], ['mittag', 'Mittagessen', true],
    ['nachmittag', 'Nachmittagssnack', false], ['preworkout', 'Pre-Workout', false], ['postworkout', 'Post-Workout', false],
    ['abend', 'Abendessen', true], ['snack', 'Snacks', true], ['spaet', 'Spätmahlzeit', false],
  ];
  const ACTIVITY = [
    [1.2, 'Kaum Bewegung (Bürojob)'],
    [1.375, 'Leicht aktiv (1–3 Einheiten/Woche)'],
    [1.55, 'Aktiv (3–5 Einheiten/Woche)'],
    [1.725, 'Sehr aktiv (6–7 Einheiten/Woche)'],
    [1.9, 'Extrem (Training plus körperliche Arbeit)'],
  ];
  const GOALS = [['cut', 'Abnehmen (Cut)'], ['maintain', 'Halten'], ['bulk', 'Muskelaufbau (Bulk)']];
  const DEFAULT_MODEL = Vision.DEFAULT_MODEL;
  const APP_VERSION = 'v12'; // gleich wie CACHE in sw.js
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
    tdraft: null, // Training im Editor
    pdraft: null, // Trainingsplan im Editor
    show: { weightAll: false, trainOld: false, trainQ: '', trainLimit: 20 }, // eingeklappte Bereiche
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

  // Mahlzeiten des Profils: Liste aus {key, label, on}. Gespeichert in den Einstellungen.
  function mealConfig() {
    const base = MEAL_CATALOG.map(([key, label, on]) => ({ key, label, on }));
    const stored = Store.get('settings', {}).meals;
    if (!Array.isArray(stored)) return base;
    const out = stored.filter((m) => m && m.key && m.label).map((m) => ({ key: m.key, label: m.label, on: !!m.on }));
    base.forEach((b) => { if (!out.some((o) => o.key === b.key)) out.push({ ...b, on: false }); });
    return out;
  }
  const saveMealConfig = (list) => Store.set('settings', { ...Store.get('settings', {}), meals: list });
  const mealLabel = (k) => (mealConfig().find((m) => m.key === k) || { label: k }).label;
  // Eingeschaltete Mahlzeiten plus ausgeschaltete, die an diesem Tag Einträge haben (damit nichts verschwindet)
  function mealsForDay(entries) {
    const cfg = mealConfig();
    const shown = cfg.filter((m) => m.on || entries.some((e) => e.meal === m.key));
    const orphans = [...new Set(entries.map((e) => e.meal))].filter((k) => !cfg.some((m) => m.key === k));
    return [...shown, ...orphans.map((key) => ({ key, label: key, on: false }))];
  }
  // Gibt es in irgendeinem Tag noch Einträge in dieser Mahlzeit? Dann darf sie nicht gelöscht werden.
  const mealHasEntries = (key) => Object.values(data.days()).some((d) => d.entries.some((e) => e.meal === key));

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
    plans: () => Store.get('plans', []),
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
  // pieces = Anzahl Stück, falls die Menge in Stück angegeben wurde (grams ist dann schon umgerechnet)
  const foodItem = (food, grams, pieces) => ({
    name: food.name,
    grams,
    foodId: food.id,
    base: { kcal: food.kcal, p: food.p, f: food.f, c: food.c },
    ...(pieces ? { pieces, pieceG: food.piece } : {}),
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

  // Eiweißreiche, fettarme Lebensmittel aus der eigenen Liste des Nutzers (für Coach-Hinweise)
  function proteinIdeas(count) {
    return allFoods()
      .filter((f) => f.kcal > 0 && f.p >= 10 && f.f <= 5)
      .sort((a, b) => b.p / b.kcal - a.p / a.kcal)
      .slice(0, count)
      .map((f) => f.name);
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
    // Wasser wie die übrigen Werte nur über Tage mit Eintrag mitteln. Tage ohne Eintrag zählen nicht als 0 ml.
    const waterDays = dates.map((d) => data.day(d).water || 0).filter((v) => v > 0);

    return {
      loggedDays: logged.length,
      waterDays: waterDays.length,
      avg: {
        kcal: sum.kcal / count, p: sum.p / count, f: sum.f / count, c: sum.c / count,
        water: waterDays.length ? waterDays.reduce((t, v) => t + v, 0) / waterDays.length : 0,
      },
      weightRate: recent !== null && prev !== null ? recent - prev : null,
      weightKg: currentWeight(),
      proteinIdeas: proteinIdeas(3),
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
      <div class="entry-info"><small class="muted">${e.pieces ? `${fmt(e.pieces, 1)} Stück · ` : ''}${macroLine(t)}</small>${plateLine(e)}</div>
    </li>`;
  }

  // Ist diese Mahlzeit schon ein gespeichertes Gericht? Dann braucht sie kein „Als Gericht speichern“:
  // entweder besteht sie nur aus einem Gericht, oder es gibt ein Gericht mit denselben Zutaten (Mengen egal).
  function mealIsDish(list) {
    if (!list.length) return false;
    if (list.length === 1 && list[0].dishId) return true;
    const key = (xs) => xs.map((x) => x.name.trim().toLowerCase()).sort().join('|');
    const k = key(list);
    return data.dishes().some((d) => key(d.ingredients) === k);
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
        ${list.length && !mealIsDish(list) ? `<button class="linkish" data-action="meal-save" data-meal="${key}">Als Gericht speichern</button>` : ''}
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
      ${mealsForDay(day.entries).map((m) => mealCard(m.key, m.label, day.entries)).join('')}
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
    document.body.classList.toggle('scrolled', window.scrollY > 44);
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

  // Das Kochbuch startet ohne Liste. Erst eine Suche oder ein Filter blendet Einträge ein.
  // Nur die Auswahl im Tagebuch startet mit „Zuletzt“.
  function cookLs(sub) {
    if (!state.cook) {
      state.cook = {
        foods: { q: '', filter: '', limit: 30 },
        dishes: { q: '', filter: '', limit: 30 },
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
    // Name: irgendwo enthalten. Suchbegriffe (alias): nur als Wortanfang, damit "ei" nicht "heidelbeeren" findet.
    if (q) {
      return all.filter((x) => x.name.toLowerCase().includes(q)
        || (x.alias || '').split(' ').some((a) => a.startsWith(q))).sort(byName);
    }
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
      ? `${fmtK(x.kcal)} kcal · E ${fmt(x.p, 1)} · F ${fmt(x.f, 1)} · KH ${fmt(x.c, 1)} pro 100 g`
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
    // Ohne Suche und ohne Filter bleibt die Liste zu. Das vermeidet langes Scrollen.
    if (!ls.q.trim() && !ls.filter) {
      const total = (kind === 'food' ? allFoods() : data.dishes()).length;
      const noun = kind === 'food' ? 'Lebensmittel' : (total === 1 ? 'Gericht' : 'Gerichte');
      return `<p class="muted small empty">${total} ${noun} gespeichert. Suche oben oder wähle einen Filter.</p>
        ${total ? `<button class="ghost" data-action="filter" data-scope="${scope}" data-v="all">Alle anzeigen (${total})</button>` : ''}`;
    }
    const items = listItems(kind, ls);
    if (!items.length) {
      let msg = kind === 'food'
        ? 'Noch keine Lebensmittel. Scanne ein Produkt oder lege es von Hand an.'
        : 'Noch keine Gerichte. Lege eines an oder speichere eine Mahlzeit aus dem Tagebuch.';
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
    const newest = [...rows].reverse();
    const recent = newest.slice(0, state.show.weightAll ? 60 : 7);
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
        ${newest.length > 7 ? `<button class="ghost" data-action="w-toggle">${state.show.weightAll ? 'Weniger anzeigen' : `Ältere anzeigen (${Math.min(newest.length, 60) - 7})`}</button>` : ''}
      </section>`;
  }

  // ---------- Training: Tabelle, Pläne und Editoren ----------

  const fmtW = (x) => fmt(x, Number.isInteger(x) ? 0 : 1);
  const setText = (s) => `${fmtW(s.w)} × ${s.r}`; // Anzeige, z. B. 80 × 8
  const setCell = (s) => `${fmtW(s.w)}x${s.r}`; // Eingabefeld, z. B. 80x8
  const trainDateLabel = (str) => new Date(str + 'T12:00:00')
    .toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const maxSets = (w) => Math.max(3, ...w.exercises.map((e) => e.sets.length));
  const sortedWorkouts = () => [...data.workouts()]
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const olderCutoff = () => addDays(todayStr(), -6);

  // Ein Satz als Text: "80x8", "80 x 8", "82,5×6" → {w, r}. Leer → null, ungültig → false.
  function parseSetCell(txt) {
    const t = String(txt).trim();
    if (!t) return null;
    const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×*]\s*(\d+)$/i);
    return m ? { w: parseFloat(m[1].replace(',', '.')), r: parseInt(m[2], 10) } : false;
  }

  // Was beim letzten Mal gemacht wurde: zuerst im letzten Training desselben Plans, sonst im letzten mit dieser Übung
  function lastSets(exName, planName) {
    const key = String(exName).trim().toLowerCase();
    if (!key) return null;
    const list = sortedWorkouts();
    const find = (arr) => {
      for (const w of arr) {
        const ex = w.exercises.find((e) => e.name.toLowerCase() === key);
        if (ex) return ex.sets;
      }
      return null;
    };
    return (planName ? find(list.filter((w) => (w.title || '') === planName)) : null) || find(list);
  }

  const exerciseNames = () => {
    const names = new Set();
    data.plans().forEach((p) => p.exercises.forEach((e) => names.add(e)));
    data.workouts().forEach((w) => w.exercises.forEach((e) => names.add(e.name)));
    return [...names].sort((a, b) => a.localeCompare(b, 'de'));
  };
  const nameList = () => `<datalist id="ex-names">${exerciseNames().map((n2) => `<option value="${esc(n2)}">`).join('')}</datalist>`;

  function bestLifts() {
    const best = {};
    data.workouts().forEach((w) => w.exercises.forEach((ex) => ex.sets.forEach((s) => {
      const key = ex.name.toLowerCase();
      const e = Calc.e1rm(s.w, s.r);
      if (!best[key] || e > best[key].e1rm) best[key] = { name: ex.name, e1rm: e, w: s.w, r: s.r, date: w.date };
    })));
    return Object.values(best).sort((a, b) => b.e1rm - a.e1rm).slice(0, 10);
  }

  // Tabelle: Übung in der ersten Spalte, danach ein Feld pro Satz (mindestens 3)
  function workoutTable(w) {
    const cols = maxSets(w);
    return `<div class="tscroll"><table class="ttable">
      <thead><tr><th>Übung</th>${Array.from({ length: cols }, (_, i) => `<th>Satz ${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${w.exercises.map((ex) => `<tr><td>${esc(ex.name)}</td>${Array.from({ length: cols }, (_, i) => `<td>${ex.sets[i] ? setText(ex.sets[i]) : ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function workoutCard(w) {
    const volume = w.exercises.reduce((t, ex) => t + ex.sets.reduce((s, x) => s + x.w * x.r, 0), 0);
    return `<section class="card tcard">
      <div class="line">
        <div><b>${esc(w.title || 'Training')}</b> <span class="muted small">${trainDateLabel(w.date)}</span></div>
        <button class="linkish" data-action="t-edit" data-id="${w.id}">Ändern</button>
      </div>
      ${workoutTable(w)}
      <p class="muted small">Volumen ${fmt(volume)} kg</p>
    </section>`;
  }

  // Trainings, die älter als eine Woche sind. Mit Suche und Seitenweise-Anzeige.
  function olderHtml() {
    let list = sortedWorkouts().filter((w) => w.date < olderCutoff());
    const q = state.show.trainQ.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => `${w.title || ''} ${w.date} ${trainDateLabel(w.date)} ${w.exercises.map((e) => e.name).join(' ')}`
        .toLowerCase().includes(q));
    }
    const shown = list.slice(0, state.show.trainLimit);
    const rest = list.length - shown.length;
    return (shown.map(workoutCard).join('') || '<p class="muted small">Nichts gefunden.</p>')
      + (rest > 0 ? `<button class="ghost" data-action="t-more">Mehr anzeigen (${rest})</button>` : '');
  }

  function renderTrain() {
    const all = sortedWorkouts();
    const recent = all.filter((w) => w.date >= olderCutoff());
    const olderCount = all.length - recent.length;
    const lifts = bestLifts();
    return `
      <button class="primary wide" data-action="t-new">+ Training eintragen</button>
      <h2 class="sub">Letzte 7 Tage</h2>
      ${recent.length ? recent.map(workoutCard).join('') : '<p class="muted small">Keine Trainings in den letzten 7 Tagen.</p>'}
      ${olderCount ? (state.show.trainOld
    ? `<section class="card">
        <div class="line"><h2>Ältere Trainings</h2><button class="linkish" data-action="t-old-hide">Ausblenden</button></div>
        <input type="search" placeholder="Suchen (Plan, Übung, Datum)" autocomplete="off" value="${esc(state.show.trainQ)}" data-input="tq" aria-label="Ältere Trainings suchen">
      </section>
      <div id="train-old">${olderHtml()}</div>`
    : `<button class="ghost" data-action="t-old-show">Ältere Trainings anzeigen (${olderCount})</button>`) : ''}
      <details class="card">
        <summary>Bestwerte (geschätzte 1RM)</summary>
        ${lifts.length ? `<ul class="list">${lifts.map((l) => `<li><div class="grow"><b>${esc(l.name)}</b>
          <small class="muted">${fmtW(l.w)} kg × ${l.r} · ${l.date}</small></div><span>${fmt(l.e1rm, 1)} kg</span></li>`).join('')}</ul>`
    : '<p class="muted small">Noch keine Sätze erfasst.</p>'}
      </details>`;
  }

  // ---------- Pläne (Vorlagen für Trainingstage) ----------

  function renderPlans() {
    const plans = data.plans();
    return `
      <button class="primary wide" data-action="p-new">+ Neuer Plan</button>
      ${plans.length ? plans.map((p) => `<section class="card tcard">
        <div class="line"><b>${esc(p.name)}</b><button class="linkish" data-action="p-edit" data-id="${p.id}">Ändern</button></div>
        <p class="muted small">${p.exercises.length ? p.exercises.map(esc).join(' · ') : 'Keine Übungen'}</p>
        <button class="ghost" data-action="t-from-plan" data-id="${p.id}">Training mit diesem Plan starten</button>
      </section>`).join('')
    : `<section class="card"><p class="muted small">Noch keine Pläne. Ein Plan ist die Vorlage für einen Trainingstag, zum Beispiel „Push A“ mit allen Übungen. Damit musst du die Übungen nicht jedes Mal neu eintragen.</p></section>`}`;
  }

  // ---------- Training-Editor (Vollbild) ----------

  function openTrainEditor(w, plan) {
    state.draft = null;
    state.pdraft = null;
    if (w) {
      const cols = maxSets(w);
      state.tdraft = {
        id: w.id, date: w.date, planId: w.planId || '', planName: w.title || '', setCount: cols,
        rows: w.exercises.map((ex) => ({
          name: ex.name, sets: Array.from({ length: cols }, (_, i) => (ex.sets[i] ? setCell(ex.sets[i]) : '')),
        })),
      };
    } else {
      state.tdraft = {
        id: null, date: todayStr(), planId: plan ? plan.id : '', planName: plan ? plan.name : '', setCount: 3,
        rows: plan && plan.exercises.length
          ? plan.exercises.map((name) => ({ name, sets: ['', '', ''] }))
          : [{ name: '', sets: ['', '', ''] }],
      };
    }
    renderEditor();
  }

  // Liest die Felder des Editors in den Entwurf
  function syncTDraft() {
    const d = state.tdraft;
    if (!d) return;
    const dt = $('#t-date');
    if (dt && dt.value) d.date = dt.value;
    d.rows = [...document.querySelectorAll('#editor [data-trow]')].map((tr) => ({
      name: tr.querySelector('[data-tname]').value,
      sets: [...tr.querySelectorAll('[data-tset]')].map((i) => i.value),
    }));
  }

  function renderTrainEditor(host) {
    const d = state.tdraft;
    const keep = host.querySelector('.page-body') ? host.querySelector('.page-body').scrollTop : 0;
    const plans = data.plans();
    const rows = d.rows.map((r, i) => {
      const last = lastSets(r.name, d.planName) || [];
      return `<tr data-trow>
        <td><input data-tname list="ex-names" value="${esc(r.name)}" placeholder="Übung" autocomplete="off" aria-label="Übung" data-change="tname"></td>
        ${Array.from({ length: d.setCount }, (_, j) => `<td><input data-tset class="setin" value="${esc(r.sets[j] || '')}"
          placeholder="${last[j] ? esc(setCell(last[j])) : '80x8'}" autocomplete="off" aria-label="Satz ${j + 1}"></td>`).join('')}
        <td><button class="icon danger" data-action="t-del-ex" data-i="${i}" aria-label="Übung entfernen">×</button></td>
      </tr>`;
    }).join('');
    host.innerHTML = `
      <div class="page-head">
        <button class="linkish" data-action="train-close">Abbrechen</button>
        <b>${d.id ? 'Training ändern' : 'Training eintragen'}</b>
        <button class="linkish strong" data-action="train-save">Speichern</button>
      </div>
      <div class="page-body">
        <section class="card">
          <div class="grid2">
            ${field('Datum', `<input id="t-date" type="date" value="${d.date}">`)}
            ${field('Plan', `<select id="t-plan" data-change="t-plan">
              <option value="">Kein Plan</option>
              ${plans.map((p) => `<option value="${p.id}" ${p.id === d.planId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>`)}
          </div>
        </section>
        <section class="card">
          <div class="tscroll"><table class="ttable edit">
            <thead><tr><th>Übung</th>${Array.from({ length: d.setCount }, (_, j) => `<th>Satz ${j + 1}</th>`).join('')}<th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <div class="row tbtns">
            <button class="ghost" data-action="t-add-ex">+ Übung</button>
            <button class="ghost" data-action="t-add-set">+ Satz</button>
            ${d.setCount > 1 ? '<button class="ghost" data-action="t-del-set">− Satz</button>' : ''}
          </div>
          <p class="hint">Pro Satz: Gewicht x Wiederholungen, zum Beispiel 80x8 oder 82,5x6. Nicht gemachte Sätze leer lassen. Grau siehst du, was du beim letzten Mal gemacht hast.</p>
        </section>
        <button class="ghost" data-action="t-save-plan">Diese Übungen als Plan speichern</button>
        ${d.id ? '<button class="ghost danger-btn" data-action="t-delete">Training löschen</button>' : ''}
        ${nameList()}
      </div>`;
    host.hidden = false;
    host.querySelector('.page-body').scrollTop = keep;
  }

  function saveTraining() {
    syncTDraft();
    const d = state.tdraft;
    if (!d.date) return toast('Bitte ein Datum wählen.');
    const exercises = [];
    for (let i = 0; i < d.rows.length; i += 1) {
      const r = d.rows[i];
      const name = r.name.trim();
      const sets = [];
      for (let j = 0; j < r.sets.length; j += 1) {
        const s = parseSetCell(r.sets[j]);
        if (s === false) return toast(`„${r.sets[j]}“ bei ${name || 'Übung ' + (i + 1)} nicht lesbar. Format: 80x8`);
        if (s) sets.push(s);
      }
      if (!name && !sets.length) continue; // leere Zeile
      if (!name) return toast('Bitte jeder Übung mit Sätzen einen Namen geben.');
      if (sets.length) exercises.push({ name, sets });
    }
    if (!exercises.length) return toast('Trage mindestens eine Übung mit einem Satz ein.');
    const plan = data.plans().find((p) => p.id === d.planId);
    const workout = {
      id: d.id || 'w' + uid(), date: d.date, title: plan ? plan.name : d.planName, planId: d.planId || '', exercises,
    };
    const list = data.workouts();
    const idx = list.findIndex((x) => x.id === workout.id);
    if (idx >= 0) list[idx] = workout;
    else list.push(workout);
    Store.set('workouts', list);
    state.tdraft = null;
    renderEditor();
    toast('Training gespeichert.');
    render();
  }

  // ---------- Plan-Editor (Vollbild) ----------

  function openPlanEditor(plan) {
    state.draft = null;
    state.tdraft = null;
    state.pdraft = plan
      ? { id: plan.id, name: plan.name, exercises: [...plan.exercises] }
      : { id: null, name: '', exercises: [''] };
    renderEditor();
  }

  function syncPDraft() {
    const d = state.pdraft;
    if (!d) return;
    const nm = $('#p-name');
    if (nm) d.name = nm.value;
    d.exercises = [...document.querySelectorAll('#editor [data-pex]')].map((i) => i.value);
  }

  function renderPlanEditor(host) {
    const d = state.pdraft;
    const keep = host.querySelector('.page-body') ? host.querySelector('.page-body').scrollTop : 0;
    host.innerHTML = `
      <div class="page-head">
        <button class="linkish" data-action="p-close">Abbrechen</button>
        <b>${d.id ? 'Plan ändern' : 'Neuer Plan'}</b>
        <button class="linkish strong" data-action="p-save">Speichern</button>
      </div>
      <div class="page-body">
        <section class="card">
          ${field('Name des Plans', `<input id="p-name" value="${esc(d.name)}" placeholder="z. B. Push A" autocomplete="off">`)}
          <h2 class="sub">Übungen in der Reihenfolge</h2>
          <ul class="list">${d.exercises.map((ex, i) => `<li>
            <input data-pex list="ex-names" class="grow-input" value="${esc(ex)}" placeholder="Übung" autocomplete="off" aria-label="Übung ${i + 1}">
            <button class="icon" data-action="p-up" data-i="${i}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon" data-action="p-down" data-i="${i}" aria-label="Nach unten" ${i === d.exercises.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon danger" data-action="p-del-ex" data-i="${i}" aria-label="Übung entfernen">×</button>
          </li>`).join('')}</ul>
          <button class="ghost" data-action="p-add-ex">+ Übung</button>
        </section>
        ${d.id ? '<button class="ghost danger-btn" data-action="p-delete">Plan löschen</button>' : ''}
        ${nameList()}
      </div>`;
    host.hidden = false;
    host.querySelector('.page-body').scrollTop = keep;
  }

  function savePlan() {
    syncPDraft();
    const d = state.pdraft;
    const name = d.name.trim();
    const exercises = d.exercises.map((e) => e.trim()).filter(Boolean);
    if (!name) return toast('Bitte dem Plan einen Namen geben.');
    if (!exercises.length) return toast('Füge mindestens eine Übung hinzu.');
    const plan = { id: d.id || 'pl' + uid(), name, exercises };
    const list = data.plans();
    const idx = list.findIndex((x) => x.id === plan.id);
    if (idx >= 0) list[idx] = plan;
    else list.push(plan);
    Store.set('plans', list);
    state.pdraft = null;
    renderEditor();
    toast('Plan gespeichert.');
    render();
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
        ${s.waterDays
    ? row('Wasser', s.avg.water, g.water, 'ml')
    : '<div class="line"><span>Wasser</span><span class="muted">nichts eingetragen</span></div>'}
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
    const body = {
      weight: renderWeight, train: renderTrain, plans: renderPlans, stats: renderStats, coach: renderCoach,
    }[sub];
    return seg('progress', [['weight', 'Gewicht'], ['train', 'Training'], ['plans', 'Pläne'], ['stats', 'Auswertung'], ['coach', 'Coach']], sub) + body();
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
      </section>
      <section class="card">
        <h2>Mahlzeiten im Tagebuch</h2>
        <ul class="list">${mealConfig().map((m, i, all) => `<li>
          <label class="switch" aria-label="${esc(m.label)} anzeigen"><input type="checkbox" data-change="meal-on" data-i="${i}" ${m.on ? 'checked' : ''}><span></span></label>
          <input class="grow-input" value="${esc(m.label)}" data-change="meal-name" data-i="${i}" aria-label="Name der Mahlzeit" autocomplete="off">
          <button class="icon" data-action="meal-up" data-i="${i}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon" data-action="meal-down" data-i="${i}" aria-label="Nach unten" ${i === all.length - 1 ? 'disabled' : ''}>↓</button>
          ${MEAL_CATALOG.some((c) => c[0] === m.key) ? '' : `<button class="icon danger" data-action="meal-del" data-i="${i}" aria-label="Mahlzeit löschen">×</button>`}
        </li>`).join('')}</ul>
        <button class="ghost" data-action="meal-add">+ Eigene Mahlzeit</button>
        <p class="hint">Eingeschaltete Mahlzeiten erscheinen im Tagebuch, in der hier gezeigten Reihenfolge. Schaltest du eine aus, bleiben bereits eingetragene Einträge an ihrem Tag sichtbar.</p>
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
        <h2>Aufräumen</h2>
        <p class="muted small">Alte Trainings löschen, die du nicht mehr brauchst. Ernährung und Gewicht bleiben unberührt. Das lässt sich nicht rückgängig machen. Vorher am besten exportieren.</p>
        <div class="row">
          <select id="prune-months" aria-label="Alter">
            <option value="1">Älter als 1 Monat</option>
            <option value="3" selected>Älter als 3 Monate</option>
            <option value="6">Älter als 6 Monate</option>
            <option value="12">Älter als 12 Monate</option>
          </select>
          <button class="danger-btn" data-action="prune-train">Trainings löschen</button>
        </div>
      </section>
      <section class="card">
        <h2>App</h2>
        <p class="muted small">Version ${APP_VERSION}</p>
        <div class="row">
          <button data-action="update-now">Auf Update prüfen</button>
          <button data-action="reset-cache">Neu laden</button>
        </div>
        <p class="hint">„Neu laden“ leert nur den Zwischenspeicher der App-Dateien. Deine Einträge bleiben erhalten. Die Verknüpfung auf dem Home-Bildschirm musst du dafür nicht löschen.</p>
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
        ${field('Modell (leer lassen = automatisch)', `<input name="model" value="${esc(ai.model)}" placeholder="${esc(DEFAULT_MODEL)}" autocomplete="off">`)}
        <div class="row">
          <button class="primary">Speichern</button>
          <button type="button" data-action="ai-test">Verbindung testen</button>
          ${ai.key ? '<button type="button" data-action="ai-clear">Schlüssel entfernen</button>' : ''}
        </div>
        <div id="ai-test"></div>
      </form>
      <p class="hint">Schlüssel erstellen: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Google schaltet Modelle regelmäßig ab. Die App sucht dann selbst ein verfügbares Modell. „Verbindung testen“ zeigt, ob alles klappt und wie lange eine Antwort dauert.</p>
    </section>`;
  }

  function renderProfile() {
    const sub = state.sub.profile;
    const body = { goals: renderGoals, look: renderLook, data: renderData, photo: renderPhotoSettings }[sub];
    return seg('profile', [['goals', 'Ziele'], ['look', 'Anzeige'], ['data', 'Daten'], ['photo', 'Foto']], sub) + body();
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
    // Großer Titel wie in Apple-Apps. Beim Scrollen erscheint der kleine Titel oben.
    $('#view').innerHTML = `<h1 class="large-title">${esc(v.title)}</h1>${v.render()}`;
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
    // Läuft gerade eine Foto-Schätzung, wird sie mit dem Schließen abgebrochen
    if (state.photo) {
      if (state.photo.ctl) state.photo.ctl.abort();
      clearInterval(state.photo.ticker);
    }
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

  // Nährwerte pro 100 g. Eigene und gescannte Produkte sind direkt änderbar, Standard-Einträge nur lesbar.
  function valueFields(f) {
    if (!ownIds().has(f.id)) {
      return `<p class="muted small">Pro 100 g: ${fmtK(f.kcal)} kcal · E ${fmt(f.p, 1)} · F ${fmt(f.f, 1)} · KH ${fmt(f.c, 1)}${f.piece ? ` · 1 Stück = ${fmt(f.piece)} g` : ''}</p>`;
    }
    const num = (name, label, val) => field(label, `<input id="v-${name}" name="${name}" type="number" step="any" min="0"
      inputmode="decimal" value="${val}" data-input="amount" required>`);
    return `<div>
      <div class="muted small">Nährwerte pro 100 g (änderbar, wird beim Speichern übernommen)</div>
      <div class="grid4 values">
        ${num('kcal', 'kcal', f.kcal)}${num('p', 'Eiweiß', f.p)}${num('f', 'Fett', f.f)}${num('c', 'KH', f.c)}
      </div>
      ${field('Gewicht pro Stück oder Portion in g (optional)', `<input id="v-piece" type="number" step="any" min="0" inputmode="decimal"
        value="${f.piece || ''}" placeholder="z. B. 35" data-input="amount">`)}
    </div>`;
  }

  // Liest die Werte aus den Feldern. Gibt null zurück, wenn es keine Felder gibt (Standard-Eintrag).
  function readValues() {
    if (!$('#v-kcal')) return null;
    return {
      kcal: n($('#v-kcal').value), p: n($('#v-p').value), f: n($('#v-f').value), c: n($('#v-c').value),
      piece: n($('#v-piece').value) || null,
    };
  }

  // Speichert Felder eines eigenen oder gescannten Lebensmittels dauerhaft und gibt es aktualisiert zurück.
  // markComplete entfernt den Hinweis „Angaben unvollständig“, wenn der Nutzer die Werte selbst bestätigt.
  function persistValues(food, vals, markComplete = true) {
    const upd = (list) => list.map((x) => (x.id === food.id
      ? { ...x, ...vals, ...(markComplete && x.complete !== undefined ? { complete: true } : {}) } : x));
    Store.set('custom', upd(data.custom()));
    Store.set('products', upd(data.products()));
    return allFoods().find((x) => x.id === food.id) || { ...food, ...vals };
  }

  const valuesChanged = (food, v) => ['kcal', 'p', 'f', 'c'].some((k) => Math.abs((food[k] || 0) - v[k]) > 1e-9)
    || (food.piece || null) !== v.piece;

  // Standard-Einheit: Stück, wenn bekannt und gewünscht (eigene Lebensmittel merken sich die letzte Wahl)
  function defaultUnit(f) {
    if (!f.piece) return 'g';
    return ownIds().has(f.id) ? (f.unitPref === 'pc' ? 'pc' : 'g') : 'pc';
  }

  const amountChips = (p) => (p.unit === 'pc' ? [1, 2, 3, 4, 6] : [50, 100, 150, 200])
    .map((v) => `<button type="button" class="chip" data-action="amount-set" data-v="${v}">${v}${p.unit === 'pc' ? ' Stück' : ' g'}</button>`).join('');

  function pickerBody(p) {
    if (p.view === 'amount' && p.food) {
      const f = p.food;
      if (p.unitFor !== f.id) {
        p.unit = defaultUnit(f);
        p.unitFor = f.id;
      }
      const canPieces = !!f.piece || ownIds().has(f.id);
      const pc = p.unit === 'pc';
      return `<form data-form="amount" class="stack">
        <button type="button" class="linkish left" data-action="pk-back">‹ Zurück</button>
        <h2>${esc(f.name)}</h2>
        ${valueFields(f)}
        ${f.complete === false ? '<div class="note warn">Angaben unvollständig. Bitte mit der Packung vergleichen.</div>' : ''}
        ${canPieces ? `<div class="seg"><button type="button" class="${pc ? '' : 'on'}" data-action="amount-unit" data-v="g">Gramm</button>
          <button type="button" class="${pc ? 'on' : ''}" data-action="amount-unit" data-v="pc">Stück</button></div>` : ''}
        <label class="field"><span id="amount-label">${pc ? 'Anzahl Stück' : 'Menge in Gramm'}</span>
          <input id="amount" name="amount" type="number" step="any" inputmode="decimal" value="${pc ? 1 : (f.piece || 100)}" data-input="amount" required></label>
        <div class="chips" id="amount-chips">${amountChips(p)}</div>
        <div id="amount-preview" class="line"></div>
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
    if (p.view === 'info' && p.food) {
      const f = p.food;
      return `<form data-form="info-save" class="stack">
        <h2>${esc(f.name)}</h2>
        ${valueFields(f)}
        ${f.complete === false ? '<div class="note warn">Angaben unvollständig. Bitte mit der Packung vergleichen.</div>' : ''}
        <div class="note">Im Kochbuch gespeichert.</div>
        <button class="primary wide">Fertig</button>
        <p class="hint">Daten: Open Food Facts (ODbL)</p>
      </form>`;
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

  // Gewicht pro Stück: aus dem Feld, falls vorhanden, sonst aus dem Lebensmittel
  function pieceWeight(p) {
    const v = readValues();
    return v ? (v.piece || 0) : (p.food.piece || 0);
  }

  // Wechselt zwischen Gramm und Stück, ohne die Felder zu verlieren
  function applyUnit() {
    const p = state.picker;
    const pc = p.unit === 'pc';
    document.querySelectorAll('[data-action="amount-unit"]').forEach((b) => b.classList.toggle('on', b.dataset.v === p.unit));
    $('#amount-label').textContent = pc ? 'Anzahl Stück' : 'Menge in Gramm';
    $('#amount').value = pc ? 1 : (pieceWeight(p) || 100);
    $('#amount-chips').innerHTML = amountChips(p);
    renderAmountPreview();
  }

  function renderAmountPreview() {
    const box = $('#amount-preview');
    const p = state.picker;
    if (!box || !p) return;
    const amount = n($('#amount').value);
    if (p.view === 'amount') {
      const piece = pieceWeight(p);
      const pc = p.unit === 'pc';
      const grams = pc ? amount * piece : amount;
      const t = totals({ grams, base: readValues() || p.food });
      box.innerHTML = pc && !piece
        ? '<div class="note warn">Trage oben das Gewicht pro Stück ein, dann rechnet die App um.</div>'
        : `${pc ? `<div class="muted small">${fmt(amount, 2)} Stück × ${fmt(piece)} g = ${fmt(grams)} g</div>` : ''}
          <div class="line"><b>Nährwerte</b><b>${macroLine(t)}</b></div>`;
      box.classList.remove('line');
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
    if (state.tdraft) return renderTrainEditor(host);
    if (state.pdraft) return renderPlanEditor(host);
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
      body = `<div class="busy">
        <div class="spinner" aria-hidden="true"></div>
        <p><b>Foto wird analysiert …</b> <span class="muted" id="ph-sec">${Math.round((Date.now() - ph.started) / 1000)} s</span></p>
        <p class="muted small">Das kann bis zu 30 Sekunden dauern. Nach 60 Sekunden bricht die App ab.</p>
        <button class="ghost" data-action="ph-cancel">Abbrechen</button>
      </div>`;
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
    ph.ctl = new AbortController();
    ph.started = Date.now();
    ph.ticker = setInterval(() => {
      const el = $('#ph-sec');
      if (el) el.textContent = `${Math.round((Date.now() - ph.started) / 1000)} s`;
    }, 1000);
    renderPhoto();
    try {
      const result = await Vision.estimate(file, ai.key, ai.model || DEFAULT_MODEL, ph.mode, { signal: ph.ctl.signal });
      if (state.photo !== ph) return;
      ph.result = result;
      // Hat die App ein anderes Modell gefunden, bleibt es gespeichert
      if (result.model && result.model !== ai.model) {
        Store.set('ai', { ...ai, model: result.model });
        toast(`Modell automatisch auf ${result.model} gestellt.`);
      }
    } catch (err) {
      if (state.photo !== ph) return;
      ph.error = err.message === 'Abgebrochen.' ? '' : err.message;
    } finally {
      clearInterval(ph.ticker);
    }
    ph.busy = false;
    renderPhoto();
  }

  // Prüft Schlüssel und Modell und zeigt das Ergebnis direkt im Profil
  async function testAi() {
    const out = $('#ai-test');
    const form = document.querySelector('[data-form="ai"]');
    const cur = data.ai();
    const typedKey = form ? form.querySelector('[name="key"]').value.trim() : '';
    const key = typedKey || cur.key;
    if (!key) return toast('Bitte zuerst den Schlüssel eintragen.');
    const model = (form ? form.querySelector('[name="model"]').value.trim() : '') || cur.model;
    out.innerHTML = '<p class="muted small">Verbindung wird getestet … (bis zu 60 Sekunden)</p>';
    try {
      const r = await Vision.test(key, model);
      Store.set('ai', { key, model: r.model });
      if (form) {
        form.querySelector('[name="model"]').value = r.model;
        form.querySelector('[name="key"]').value = '';
      }
      out.innerHTML = `<div class="note">✓ Verbindung steht. Modell: ${esc(r.model)}${r.changed ? ' (automatisch gewählt)' : ''}. Antwort nach ${fmt(r.seconds, 1)} s. Schlüssel und Modell sind gespeichert.</div>`;
    } catch (err) {
      out.innerHTML = `<div class="note warn">${esc(err.message)}</div>`;
    }
  }

  // ---------- Aktionen ----------

  function changeGrams(id, value) {
    const day = data.day(state.date);
    const e = day.entries.find((x) => x.id === id);
    const g = n(value);
    if (!e || g <= 0) return render();
    e.grams = g;
    // Die Stückzahl passt nach einer Änderung in Gramm nicht mehr
    delete e.pieces;
    delete e.pieceG;
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
        Store.set('plans', d.plans || []);
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
      version: 4,
      name: prof ? prof.name : 'Profil',
      data: {
        settings: Store.get('settings', null),
        days: data.days(),
        weights: data.weights(),
        workouts: data.workouts(),
        plans: data.plans(),
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

  // Sucht nach einer neuen App-Version. Findet der Browser eine, lädt die App sich über controllerchange neu.
  async function checkUpdate() {
    if (!('serviceWorker' in navigator)) return toast('Updates sind in diesem Browser nicht verfügbar.');
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return toast('Noch kein Offline-Modus aktiv. Bitte die App einmal neu öffnen.');
    try {
      await reg.update();
    } catch (err) {
      return toast('Keine Verbindung. Update-Suche nicht möglich.');
    }
    return toast(reg.installing || reg.waiting ? 'Neue Version wird geladen …' : `Du hast die neueste Version (${APP_VERSION}).`);
  }

  // Leert nur den Zwischenspeicher der App-Dateien. Einträge im localStorage bleiben erhalten.
  async function resetCache() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (err) {
      /* ohne Service Worker genügt das Neuladen */
    }
    window.location.reload();
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
        <p class="muted small">Pro 100 g: ${fmtK(food.kcal)} kcal · E ${fmt(food.p, 1)} · F ${fmt(food.f, 1)} · KH ${fmt(food.c, 1)}</p>
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
      case 'pk-back':
        Object.assign(state.picker, { view: 'list', food: null, dishId: null, error: '' });
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
      case 'amount-unit':
        state.picker.unit = ds.v;
        return applyUnit();
      case 'amount-set':
        $('#amount').value = ds.v;
        return renderAmountPreview();
      case 'amount-more':
        return submitAmount(true);
      case 'filter': {
        const { ls } = lsFor(ds.scope);
        // Ein zweiter Klick auf den aktiven Filter blendet die Liste wieder aus
        ls.filter = !ls.q && ls.filter === ds.v ? '' : ds.v;
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
      case 'ph-cancel':
        if (state.photo && state.photo.ctl) state.photo.ctl.abort();
        return undefined;
      case 'ai-test':
        return testAi();
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

      // Mahlzeiten konfigurieren
      case 'meal-up':
      case 'meal-down': {
        const list = mealConfig();
        const i = Number(ds.i);
        const j = action === 'meal-up' ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return undefined;
        [list[i], list[j]] = [list[j], list[i]];
        saveMealConfig(list);
        return render();
      }
      case 'meal-add':
        return openDialog(`<h2>Eigene Mahlzeit</h2>
          <form data-form="meal-add" class="stack">
            ${field('Name', '<input name="name" placeholder="z. B. Intra-Workout" required autocomplete="off">')}
            <button class="primary wide">Hinzufügen</button>
            <button type="button" class="linkish" data-action="close-dialog">Abbrechen</button>
          </form>`);
      case 'meal-del': {
        const list = mealConfig();
        const m = list[Number(ds.i)];
        if (!m) return undefined;
        if (mealHasEntries(m.key)) return toast('Dafür gibt es noch Einträge. Schalte die Mahlzeit stattdessen aus.');
        if (!confirm(`Mahlzeit „${m.label}“ löschen?`)) return undefined;
        list.splice(Number(ds.i), 1);
        saveMealConfig(list);
        return render();
      }
      case 'accent':
        themeSave({ accent: ds.c });
        return render();
      case 'del-weight':
        Store.set('weights', data.weights().filter((w) => w.date !== ds.date));
        return render();
      case 'w-toggle':
        state.show.weightAll = !state.show.weightAll;
        return render();

      // Training
      case 't-new':
        return openTrainEditor(null, null);
      case 't-edit': {
        const w = data.workouts().find((x) => x.id === ds.id);
        return w ? openTrainEditor(w, null) : undefined;
      }
      case 't-from-plan': {
        const plan = data.plans().find((x) => x.id === ds.id);
        state.sub.progress = 'train';
        return plan ? openTrainEditor(null, plan) : undefined;
      }
      case 't-old-show':
        state.show.trainOld = true;
        state.show.trainLimit = 20;
        return render();
      case 't-old-hide':
        state.show.trainOld = false;
        state.show.trainQ = '';
        return render();
      case 't-more':
        state.show.trainLimit += 20;
        return render();
      case 't-add-ex':
        syncTDraft();
        state.tdraft.rows.push({ name: '', sets: Array(state.tdraft.setCount).fill('') });
        return renderEditor();
      case 't-del-ex':
        syncTDraft();
        state.tdraft.rows.splice(Number(ds.i), 1);
        if (!state.tdraft.rows.length) state.tdraft.rows.push({ name: '', sets: Array(state.tdraft.setCount).fill('') });
        return renderEditor();
      case 't-add-set':
        syncTDraft();
        if (state.tdraft.setCount >= 8) return toast('Mehr als 8 Sätze pro Übung sind nicht vorgesehen.');
        state.tdraft.setCount += 1;
        state.tdraft.rows.forEach((r) => r.sets.push(''));
        return renderEditor();
      case 't-del-set': {
        syncTDraft();
        const d = state.tdraft;
        const hasData = d.rows.some((r) => (r.sets[d.setCount - 1] || '').trim());
        if (hasData && !confirm('Die Werte im letzten Satz gehen verloren. Trotzdem entfernen?')) return undefined;
        d.setCount -= 1;
        d.rows.forEach((r) => r.sets.pop());
        return renderEditor();
      }
      case 't-save-plan': {
        syncTDraft();
        const names = state.tdraft.rows.map((r) => r.name.trim()).filter(Boolean);
        if (!names.length) return toast('Trage zuerst mindestens eine Übung ein.');
        return openDialog(`<h2>Als Plan speichern</h2>
          <form data-form="plan-quick" class="stack">
            ${field('Name des Plans', `<input name="name" value="${esc(state.tdraft.planName)}" placeholder="z. B. Push A" required autocomplete="off">`)}
            <p class="hint">Gespeichert werden die Übungen: ${esc(names.join(', '))}</p>
            <button class="primary wide">Speichern</button>
            <button type="button" class="linkish" data-action="close-dialog">Abbrechen</button>
          </form>`);
      }
      case 't-delete': {
        const w = data.workouts().find((x) => x.id === state.tdraft.id);
        if (!confirm(`Training${w && w.title ? ' „' + w.title + '“' : ''} vom ${w ? trainDateLabel(w.date) : ''} löschen?`)) return undefined;
        Store.set('workouts', data.workouts().filter((x) => x.id !== state.tdraft.id));
        state.tdraft = null;
        renderEditor();
        toast('Training gelöscht.');
        return render();
      }
      case 'train-save':
        return saveTraining();
      case 'train-close':
        state.tdraft = null;
        renderEditor();
        return render();
      case 'prune-train': {
        const months = Number($('#prune-months').value);
        const limit = new Date();
        limit.setMonth(limit.getMonth() - months);
        const cut = toDateStr(limit);
        const old = data.workouts().filter((w) => w.date < cut);
        if (!old.length) return toast(`Keine Trainings älter als ${months} Monat(e).`);
        if (!confirm(`${old.length} Training(s) vor dem ${cut} endgültig löschen?`)) return undefined;
        Store.set('workouts', data.workouts().filter((w) => w.date >= cut));
        return toast(`${old.length} Training(s) gelöscht.`);
      }

      // Pläne
      case 'p-new':
        return openPlanEditor(null);
      case 'p-edit': {
        const plan = data.plans().find((x) => x.id === ds.id);
        return plan ? openPlanEditor(plan) : undefined;
      }
      case 'p-add-ex':
        syncPDraft();
        state.pdraft.exercises.push('');
        return renderEditor();
      case 'p-del-ex':
        syncPDraft();
        state.pdraft.exercises.splice(Number(ds.i), 1);
        if (!state.pdraft.exercises.length) state.pdraft.exercises.push('');
        return renderEditor();
      case 'p-up':
      case 'p-down': {
        syncPDraft();
        const i = Number(ds.i);
        const j = action === 'p-up' ? i - 1 : i + 1;
        const list = state.pdraft.exercises;
        if (j < 0 || j >= list.length) return undefined;
        [list[i], list[j]] = [list[j], list[i]];
        return renderEditor();
      }
      case 'p-save':
        return savePlan();
      case 'p-close':
        state.pdraft = null;
        renderEditor();
        return render();
      case 'p-delete': {
        const plan = data.plans().find((x) => x.id === state.pdraft.id);
        if (!confirm(`Plan „${plan ? plan.name : ''}“ löschen? Bereits eingetragene Trainings bleiben erhalten.`)) return undefined;
        Store.set('plans', data.plans().filter((x) => x.id !== state.pdraft.id));
        state.pdraft = null;
        renderEditor();
        return render();
      }
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
      case 'update-now':
        return checkUpdate();
      case 'reset-cache':
        return resetCache();
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
    // Hat der Nutzer die Werte beim Eintragen geändert, gelten sie ab jetzt dauerhaft für dieses Produkt
    const vals = readValues();
    if (vals && valuesChanged(p.food, vals)) {
      p.food = persistValues(p.food, vals);
      toast('Geänderte Werte gespeichert.');
    }
    let grams = amount;
    let pieces = null;
    if (p.unit === 'pc') {
      if (!p.food.piece) return toast('Bitte zuerst das Gewicht pro Stück eintragen.');
      pieces = amount;
      grams = Math.round(amount * p.food.piece * 10) / 10;
    }
    // Eigene Lebensmittel merken sich, ob zuletzt in Gramm oder Stück gerechnet wurde
    if (ownIds().has(p.food.id) && p.food.piece && (p.food.unitPref || 'g') !== p.unit) {
      p.food = persistValues(p.food, { unitPref: p.unit }, false);
    }
    return commitItems([foodItem(p.food, grams, pieces)], more, p.food.name);
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
      case 'info-save': {
        // Kochbuch-Scan: geänderte Werte speichern und schließen
        const vals = readValues();
        const p = state.picker;
        if (vals && p && p.food && valuesChanged(p.food, vals)) {
          persistValues(p.food, vals);
          toast('Werte gespeichert.');
        }
        closeModal();
        return render();
      }
      case 'meal-save': {
        const items = mealEntries(get('meal')).map(stripEntry);
        if (!items.length) return toast('Diese Mahlzeit ist leer.');
        const dish = { id: 'd' + uid(), name: get('name').trim(), servings: 1, ingredients: items };
        Store.set('dishes', [...data.dishes(), dish]);
        state.cook = null;
        closeDialog();
        render(); // „Als Gericht speichern“ verschwindet, weil es das Gericht jetzt gibt
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
      case 'meal-add': {
        const label = get('name').trim();
        if (!label) return toast('Bitte einen Namen eingeben.');
        const list = mealConfig();
        list.push({ key: 'm' + uid(), label, on: true });
        saveMealConfig(list);
        closeDialog();
        return render();
      }
      case 'plan-quick': {
        // Plan aus den Übungen des gerade bearbeiteten Trainings
        const name = get('name').trim();
        const names = state.tdraft.rows.map((r) => r.name.trim()).filter(Boolean);
        const plan = { id: 'pl' + uid(), name, exercises: names };
        Store.set('plans', [...data.plans(), plan]);
        state.tdraft.planId = plan.id;
        state.tdraft.planName = plan.name;
        closeDialog();
        toast(`Plan „${name}“ gespeichert.`);
        return renderEditor();
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
        // Bestehende Einstellungen wie die Mahlzeiten-Auswahl bleiben erhalten
        Store.set('settings', { ...Store.get('settings', {}), ...s });
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
      case 'meal-on':
      case 'meal-name': {
        const list = mealConfig();
        const m = list[Number(el.dataset.i)];
        if (!m) return undefined;
        if (el.dataset.change === 'meal-on') m.on = el.checked;
        else m.label = el.value.trim() || m.label;
        saveMealConfig(list);
        return render();
      }
      case 'tname':
        // Übung geändert: Platzhalter mit den Werten vom letzten Mal neu laden
        syncTDraft();
        return renderEditor();
      case 't-plan': {
        syncTDraft();
        const d = state.tdraft;
        const plan = data.plans().find((x) => x.id === el.value);
        const hasData = d.rows.some((r) => r.sets.some((s) => s.trim()));
        if (plan && hasData && !confirm('Die Übungen werden durch den Plan ersetzt. Eingetragene Sätze gehen verloren. Fortfahren?')) {
          return renderEditor();
        }
        d.planId = plan ? plan.id : '';
        d.planName = plan ? plan.name : '';
        if (plan && plan.exercises.length) {
          d.rows = plan.exercises.map((name) => ({ name, sets: Array(d.setCount).fill('') }));
        }
        return renderEditor();
      }
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
    if (el.dataset.input === 'tq') {
      state.show.trainQ = el.value;
      state.show.trainLimit = 20;
      const box = $('#train-old');
      if (box) box.innerHTML = olderHtml();
    }
  });

  window.addEventListener('scroll', updateSubbar, { passive: true });

  themeApply(themeLoad());
  render();

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    // Übernimmt eine neue Version den Betrieb, lädt die App neu. Ist gerade ein Fenster offen, wird gefragt.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      const busy = !$('#modal').hidden || !$('#editor').hidden || !$('#dialog').hidden;
      if (busy) {
        toast('Neue Version bereit.', 'Neu laden', () => { reloading = true; window.location.reload(); });
      } else {
        reloading = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker.register('sw.js').then((reg) => {
      // iPhone-Apps bleiben oft im Hintergrund geöffnet. Beim Zurückkehren nach Updates suchen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
})();
