// Calisthenics: Übungsliste nach Bewegungsmustern. Jede Übung wird entweder in Wiederholungen ('reps')
// oder als Haltezeit in Sekunden ('hold') erfasst. Es gibt kein Gewicht, Varianten sind eigene Übungen
// (z. B. "Negative Klimmzüge" als Vorstufe zu "Klimmzüge"), so bleibt die Steigerung nachvollziehbar.
const Cali = (() => {
  const GROUPS = [
    ['Push', [
      ['Liegestütze', 'reps'], ['Diamant-Liegestütze', 'reps'], ['Breite Liegestütze', 'reps'],
      ['Pike-Liegestütze', 'reps'], ['Archer-Liegestütze', 'reps'], ['Dips (Barren)', 'reps'],
      ['Bank-Dips', 'reps'], ['Handstand-Liegestütze (Wand)', 'reps'],
    ]],
    ['Pull', [
      ['Klimmzüge', 'reps'], ['Chin-ups (Untergriff)', 'reps'], ['Negative Klimmzüge', 'reps'],
      ['Australian Klimmzüge', 'reps'], ['Muscle-ups', 'reps'],
    ]],
    ['Beine', [
      ['Kniebeugen', 'reps'], ['Ausfallschritte', 'reps'], ['Bulgarian Split Squats', 'reps'],
      ['Pistol Squats', 'reps'], ['Wadenheben', 'reps'], ['Hüftheben', 'reps'], ['Nordic Curls', 'reps'],
    ]],
    ['Core', [
      ['Crunches', 'reps'], ['Sit-ups', 'reps'], ['Beinheben (liegend)', 'reps'],
      ['Beinheben (hängend)', 'reps'], ['Knieheben (hängend)', 'reps'], ['Russian Twists', 'reps'],
    ]],
    ['Statik', [
      ['Plank', 'hold'], ['Seitstütz', 'hold'], ['Hollow Body Hold', 'hold'], ['L-Sit', 'hold'], ['V-Sit', 'hold'],
      ['Dead Hang', 'hold'], ['Wandsitz', 'hold'], ['Handstand', 'hold'], ['Tuck Planche', 'hold'],
      ['Tuck Front Lever', 'hold'],
    ]],
  ];

  const all = GROUPS.flatMap(([, list]) => list.map(([name, mode]) => ({ name, mode })));
  const byName = new Map(all.map((e) => [e.name.toLowerCase(), e]));

  // Erfassungsart einer Übung aus der Liste, sonst null
  const modeOf = (name) => {
    const hit = byName.get(String(name).trim().toLowerCase());
    return hit ? hit.mode : null;
  };

  return { GROUPS, all, modeOf };
})();
