// Berechnungen für Grundumsatz, Kalorienziel, Makros, Körperfett und 1RM.
// Alle Formeln sind Schätzungen. Die Werte sind Richtwerte, keine medizinische Diagnose.
const Calc = (() => {
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
    if (s.goal === 'cut') return total - s.pace;
    if (s.goal === 'bulk') return total + s.pace;
    return total;
  }

  // Protein 2,0 g/kg (2,2 g/kg im Abnehmen), Fett 0,9 g/kg, Rest Kohlenhydrate
  function macros(s, kg, kcal) {
    const p = Math.round(kg * (s.goal === 'cut' ? 2.2 : 2.0));
    const f = Math.round(kg * 0.9);
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { kcal: Math.round(kcal), p, f, c };
  }

  // US-Navy-Methode. Braucht Taille, Hals (und bei Frauen Hüfte), Größe in cm.
  function bodyFat(s) {
    if (!s.waist || !s.neck || !s.height) return null;
    const lg = Math.log10;
    if (s.sex === 'm') {
      return 495 / (1.0324 - 0.19077 * lg(s.waist - s.neck) + 0.15456 * lg(s.height)) - 450;
    }
    if (!s.hip) return null;
    return 495 / (1.29579 - 0.35004 * lg(s.waist + s.hip - s.neck) + 0.2210 * lg(s.height)) - 450;
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

  return { bmr, tdee, goalKcal, macros, bodyFat, e1rm, entryTotals, sumEntries };
})();
