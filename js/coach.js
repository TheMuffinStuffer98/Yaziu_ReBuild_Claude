// Lokaler Coach: feste Regeln auf den Werten der letzten 7 Tage. Kein Server, keine Kosten.
const Coach = (() => {
  const r1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');

  // Zielbereiche in Prozent des Körpergewichts pro Woche.
  // Abnehmen: 0,5 bis 1 % (Helms et al. 2014, JISSN). Mehr Verlust geht eher auf Muskelmasse.
  // Muskelaufbau: 0,25 bis 0,5 % (Iraki et al. 2019, Sports) für Fortgeschrittene.
  const TARGET = {
    cut: { slow: -0.5, fast: -1.0 },
    bulk: { slow: 0.25, fast: 0.5 },
  };

  // Bewertet den Gewichtstrend (rate in kg pro Woche, kg = aktuelles Körpergewicht).
  // Gibt {level, text} oder null zurück, wenn kein Trend bekannt ist.
  function weightVerdict(rate, goal, kg) {
    if (rate === null || !kg) return null;
    const pct = (rate / kg) * 100;
    const txt = (v) => `${(Math.round(v * 100) / 100).toString().replace('.', ',')} %`;

    if (goal === 'maintain') {
      if (Math.abs(pct) <= 0.5) return null;
      return { level: 'warn', text: `Gewicht ändert sich um ${txt(pct)} pro Woche, ohne Ziel. Prüfe die Kalorien.` };
    }

    const t = TARGET[goal];
    if (!t) return null;

    if (goal === 'cut') {
      if (pct < t.fast) return { level: 'warn', text: `Abnahme ${txt(pct)} pro Woche ist zu schnell. Das Risiko für Muskelverlust steigt. Ziel: 0,5 bis 1 % pro Woche. Kalorien etwas erhöhen.` };
      if (pct > t.slow) return { level: 'warn', text: `Abnahme liegt unter dem Ziel (${txt(pct)} pro Woche, Ziel 0,5 bis 1 %). Kalorien um 100 bis 150 senken oder mehr Schritte.` };
      return { level: 'info', text: `Abnahme ${txt(pct)} pro Woche liegt im Zielbereich.` };
    }

    if (pct > t.fast) return { level: 'warn', text: `Zunahme ${txt(pct)} pro Woche ist zu schnell. Das fördert Fettzuwachs. Ziel: 0,25 bis 0,5 % pro Woche. Kalorien etwas senken.` };
    if (pct < t.slow) return { level: 'warn', text: `Zunahme liegt unter dem Ziel (${txt(pct)} pro Woche, Ziel 0,25 bis 0,5 %). Kalorien um 100 bis 200 erhöhen.` };
    return { level: 'info', text: `Zunahme ${txt(pct)} pro Woche liegt im Zielbereich.` };
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
      // Zuerst eigene Lebensmittel des Nutzers, dann allgemeine Beispiele bis drei Vorschläge da sind
      const own = s.proteinIdeas || [];
      const generic = ['Magerquark', 'Skyr', 'Hähnchenbrust', 'Thunfisch']
        .filter((g) => !own.some((o) => o.toLowerCase().includes(g.toLowerCase())));
      const ideas = [...own, ...generic].slice(0, 3).join(', ');
      out.push({ level: 'warn', text: `Eiweiß Ø ${r1(s.avg.p)} g, Ziel ${g.p} g. Gute Quellen mit wenig Fett: ${ideas}.` });
    }

    if (s.goal === 'cut' && s.avg.kcal > g.kcal * 1.1) {
      out.push({ level: 'warn', text: `Kalorien Ø ${Math.round(s.avg.kcal)} kcal, Ziel ${g.kcal} kcal. Im Abnehmen-Plan bremst das den Fortschritt.` });
    }

    if (s.goal === 'bulk' && s.avg.kcal < g.kcal * 0.9) {
      out.push({ level: 'warn', text: `Kalorien Ø ${Math.round(s.avg.kcal)} kcal, Ziel ${g.kcal} kcal. Für Muskelaufbau fehlt Energie.` });
    }

    // Nur bewerten, wenn überhaupt Wasser eingetragen wurde. Der Durchschnitt zählt nur Tage mit Eintrag.
    if (s.waterDays > 0 && s.avg.water < g.water * 0.8) {
      out.push({ level: 'info', text: `Wasser Ø ${Math.round(s.avg.water)} ml an Tagen mit Eintrag, Ziel ${g.water} ml.` });
    }

    if (s.sessions < 2) {
      out.push({ level: 'info', text: `${s.sessions} Training(s) in 7 Tagen. Für Kraftaufbau sind meist 3 bis 5 Einheiten pro Woche üblich.` });
    }

    const trend = weightVerdict(s.weightRate, s.goal, s.weightKg);
    if (trend) out.push(trend);

    return out;
  }

  return { analyze, weightVerdict };
})();
