// Lokaler Coach: feste Regeln auf den Werten der letzten 7 Tage. Kein Server, keine Kosten.
const Coach = (() => {
  const r1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');

  // Bewertet den Gewichtstrend (kg pro Woche). Gibt {level, text} oder null zurück.
  function weightVerdict(rate, goal) {
    // TODO(human): Lege hier die Schwellenwerte für den Gewichtstrend fest.
    // rate = Veränderung in kg pro Woche (Ø letzte 7 Tage minus Ø davor), goal = 'cut' | 'maintain' | 'bulk'.
    // Gib {level: 'info' | 'warn', text} zurück oder null, wenn alles passt.
    return null;
  }

  // stats kommt aus app.js (weekStats) und enthält Durchschnittswerte und Ziele
  function analyze(s) {
    if (s.loggedDays === 0) {
      return [{ level: 'info', text: 'In den letzten 7 Tagen gibt es keine Einträge.' }];
    }

    const out = [];
    const g = s.goals;

    if (s.loggedDays < 3) {
      out.push({ level: 'info', text: `Nur ${s.loggedDays} Tag(e) mit Einträgen. Die Auswertung wird mit mehr Daten genauer.` });
    }

    if (s.avg.p < g.p * 0.9) {
      const ideas = Foods.topProtein(3).join(', ');
      out.push({ level: 'warn', text: `Eiweiß Ø ${r1(s.avg.p)} g, Ziel ${g.p} g. Gute Quellen mit wenig Fett: ${ideas}.` });
    }

    if (s.goal === 'cut' && s.avg.kcal > g.kcal * 1.1) {
      out.push({ level: 'warn', text: `Kalorien Ø ${Math.round(s.avg.kcal)} kcal, Ziel ${g.kcal} kcal. Im Abnehmen-Plan bremst das den Fortschritt.` });
    }

    if (s.goal === 'bulk' && s.avg.kcal < g.kcal * 0.9) {
      out.push({ level: 'warn', text: `Kalorien Ø ${Math.round(s.avg.kcal)} kcal, Ziel ${g.kcal} kcal. Für Muskelaufbau fehlt Energie.` });
    }

    if (s.avg.water < g.water * 0.8) {
      out.push({ level: 'info', text: `Wasser Ø ${Math.round(s.avg.water)} ml, Ziel ${g.water} ml.` });
    }

    if (s.sessions < 2) {
      out.push({ level: 'info', text: `${s.sessions} Training(s) in 7 Tagen. Für Kraftaufbau sind meist 3 bis 5 Einheiten pro Woche üblich.` });
    }

    const trend = weightVerdict(s.weightRate, s.goal);
    if (trend) out.push(trend);

    return out;
  }

  return { analyze, weightVerdict };
})();
