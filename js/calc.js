// Berechnungen für Grundumsatz, Kalorienziel, Makros, Körperfett und 1RM.
// Alle Formeln sind Schätzungen. Die Werte sind Richtwerte, keine medizinische Diagnose.
const Calc = (() => {
  const pos = (v) => {
    const x = parseFloat(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };

  // Mifflin-St Jeor: Grundumsatz in kcal pro Tag
  function bmr(s, kg) {
    const base = 10 * kg + 6.25 * s.height - 5 * s.age;
    return s.sex === 'm' ? base + 5 : base - 161;
  }

  function tdee(s, kg) {
    return bmr(s, kg) * s.activity;
  }

  // Kalorienziel je nach Phase. pace = Abstand in kcal zum Gesamtumsatz.
  function goalKcal(s, kg) {
    const total = tdee(s, kg);
    const pace = Number(s.pace) || 0;
    if (s.goal === 'cut') return total - pace;
    if (s.goal === 'bulk') return total + pace;
    return total;
  }

  // US-Navy-Methode (Taille, Hals, bei Frauen Hüfte) oder ein selbst eingetragener Wert
  function bodyFat(s) {
    if (pos(s.bodyFat)) return pos(s.bodyFat);
    if (!s.waist || !s.neck || !s.height) return null;
    const lg = Math.log10;
    if (s.sex === 'm') {
      return 495 / (1.0324 - 0.19077 * lg(s.waist - s.neck) + 0.15456 * lg(s.height)) - 450;
    }
    if (!s.hip) return null;
    return 495 / (1.29579 - 0.35004 * lg(s.waist + s.hip - s.neck) + 0.2210 * lg(s.height)) - 450;
  }

  // Richtwerte für Eiweiß in g pro kg Körpergewicht (def = Standard, min/max = üblicher Bereich).
  // Quellen: Morton et al. 2018, Iraki et al. 2019, Helms et al. 2014, ISSN (Aragon et al. 2017).
  const PROTEIN = {
    cut: { def: 2.2, min: 2.0, max: 2.6 },
    maintain: { def: 1.8, min: 1.6, max: 2.0 },
    bulk: { def: 1.8, min: 1.6, max: 2.2 },
  };
  // Beim Abnehmen für Schlanke: g pro kg Magermasse (Helms 2014, ISSN)
  const LEAN = { def: 2.5, min: 2.3, max: 3.1 };
  // Fett in % der Kalorien (Helms 2014: 15 bis 30 %). Die Untergrenze pro kg ist eine Vorsichtsregel.
  const FAT = { def: 25, min: 15, max: 30, floorPerKg: 0.6 };

  // Tagesziele. Modus 'manual': eigene Werte. Modus 'auto': aus Ziel, Gewicht und Feintuning.
  function targets(s, kg) {
    const m = s.manual;
    if (s.targetMode === 'manual' && m && pos(m.kcal)) {
      const p = Math.round(pos(m.p) || 0);
      return {
        mode: 'manual', kcal: Math.round(pos(m.kcal)), p, f: Math.round(pos(m.f) || 0), c: Math.round(pos(m.c) || 0),
        perKg: kg ? p / kg : 0, lean: false, fatPct: null, overBudget: false,
      };
    }
    const kcal = goalKcal(s, kg);
    const range = PROTEIN[s.goal] || PROTEIN.maintain;
    const bf = bodyFat(s);
    const lean = s.goal === 'cut' && !!s.leanBasis && bf !== null;
    const base = lean ? kg * (1 - bf / 100) : kg;
    const perKg = pos(s.proteinPerKg) || (lean ? LEAN.def : range.def);
    const p = Math.round(base * perKg);
    const fatPct = pos(s.fatPct) || FAT.def;
    const f = Math.max(Math.round((kcal * fatPct) / 100 / 9), Math.round(kg * FAT.floorPerKg));
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { mode: 'auto', kcal: Math.round(kcal), p, f, c, perKg, lean, fatPct, overBudget: p * 4 + f * 9 > kcal };
  }

  // Cardio: Verbrauch nach dem Compendium of Physical Activities (2024), pacompendium.com.
  // MET = Vielfaches des Ruheumsatzes. Angezeigt werden die aktiven Kalorien: (MET − 1) × kg × Stunden,
  // also ohne den Grundumsatz, der ohnehin anfällt (wie „aktive Energie“ in Apple Health).
  // levels: Locker / Mittel / Intensiv, wenn keine Strecke bekannt ist.
  // Mit Strecke und Dauer wird das Tempo berechnet und der passende MET-Wert genommen.
  //   curve: Punkte [km/h, MET], dazwischen wird linear gerechnet. bands: Stufen [Obergrenze km/h, MET].
  const CARDIO = {
    bike: {
      label: 'Radfahren',
      levels: { low: 4.3, mid: 7.0, high: 9.0 }, // 01015, 01016, 01017: selbst gewähltes Tempo
      bands: [[16, 4.0], [19.3, 6.8], [22.5, 8.0], [25.7, 10.0], [32, 12.0], [Infinity, 16.8]], // 01010 bis 01060
    },
    run: {
      label: 'Laufen',
      levels: { low: 7.5, mid: 10.5, high: 12.5 }, // 12020 Jogging, 12145 Laufen, 12100 (7 min/Meile)
      curve: [ // 12028 bis 12135
        [6.4, 6.5], [7.3, 7.8], [8.2, 8.5], [9.0, 9.0], [9.9, 9.3], [10.8, 10.5], [11.3, 11.0], [12.1, 11.8],
        [12.9, 12.0], [13.8, 12.5], [14.5, 13.0], [16.1, 14.8], [17.7, 16.8], [19.3, 18.5], [20.9, 19.8], [22.5, 23.0],
      ],
    },
    walk: {
      label: 'Spazieren',
      levels: { low: 2.8, mid: 3.5, high: 4.8 }, // 17152 langsam, 17160 zum Vergnügen, 17200 zügig
      curve: [ // 17151 bis 17231
        [3.0, 2.3], [3.6, 2.8], [4.0, 3.0], [5.0, 3.8], [5.9, 4.8], [6.8, 5.5], [7.6, 7.0], [8.5, 8.5],
      ],
    },
    swim: {
      label: 'Schwimmen',
      levels: { low: 5.8, mid: 8.0, high: 9.8 }, // 18240 locker, 18290 mittel, 18230 schnell
    },
  };

  // MET-Wert zu einem Tempo in km/h, oder null (Schwimmen kennt kein Tempo-Modell)
  function speedMet(activity, kmh) {
    const def = CARDIO[activity];
    if (!def || !(kmh > 0)) return null;
    if (def.bands) return def.bands.find(([limit]) => kmh < limit)[1];
    if (!def.curve) return null;
    const c = def.curve;
    if (kmh <= c[0][0]) return c[0][1];
    if (kmh >= c[c.length - 1][0]) return c[c.length - 1][1];
    const i = c.findIndex(([v]) => v >= kmh);
    const [x0, y0] = c[i - 1];
    const [x1, y1] = c[i];
    return y0 + ((y1 - y0) * (kmh - x0)) / (x1 - x0);
  }

  // Schätzt eine Cardio-Einheit. minutes > 0 ist Pflicht, km und intensity sind optional.
  function cardio(activity, minutes, km, intensity, kg) {
    const def = CARDIO[activity] || CARDIO.walk;
    const hours = minutes / 60;
    const speed = km > 0 && minutes > 0 ? km / hours : null;
    const bySpeed = speed ? speedMet(activity, speed) : null;
    const met = bySpeed || def.levels[intensity] || def.levels.mid;
    return { met, speed, bySpeed: !!bySpeed, kcal: Math.max(0, (met - 1) * kg * hours) };
  }

  // Epley-Formel: geschätztes Maximalgewicht für eine Wiederholung
  const e1rm = (kg, reps) => kg * (1 + reps / 30);

  // Ein Eintrag hat eine Menge (grams) und Werte pro Einheit (base).
  // unit 'g' (Standard): base gilt pro 100 g. unit 'port': base gilt pro Portion.
  function entryTotals(e) {
    const k = e.unit === 'port' ? e.grams : e.grams / 100;
    return { kcal: e.base.kcal * k, p: e.base.p * k, f: e.base.f * k, c: e.base.c * k };
  }

  function sumEntries(list) {
    return list.reduce((t, e) => {
      const x = entryTotals(e);
      return { kcal: t.kcal + x.kcal, p: t.p + x.p, f: t.f + x.f, c: t.c + x.c };
    }, { kcal: 0, p: 0, f: 0, c: 0 });
  }

  return {
    bmr, tdee, goalKcal, bodyFat, targets, e1rm, entryTotals, sumEntries, PROTEIN, LEAN, FAT, CARDIO, speedMet, cardio,
  };
})();
