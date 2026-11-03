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
    bmr, tdee, goalKcal, bodyFat, targets, e1rm, entryTotals, sumEntries, PROTEIN, LEAN, FAT,
  };
})();
