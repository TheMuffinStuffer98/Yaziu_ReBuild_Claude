// Gerichte (Rezepte): Zutaten für mehrere Portionen, heruntergerechnet auf eine Portion.
// Eine Zutat hat dieselbe Form wie ein Tagebuch-Eintrag: {name, grams, unit?, base}.
const Dish = (() => {
  const servingsOf = (d) => (d.servings > 0 ? d.servings : 1);

  // Nährwerte für eine Portion
  function perPortion(d) {
    const t = Calc.sumEntries(d.ingredients);
    const n = servingsOf(d);
    return { kcal: t.kcal / n, p: t.p / n, f: t.f / n, c: t.c / n };
  }

  // Zutatenmengen für eine bestimmte Anzahl Portionen (das, was auf den Teller kommt)
  function scaled(d, portions) {
    const n = servingsOf(d);
    return d.ingredients.map((i) => ({
      name: i.name,
      amount: (i.grams / n) * portions,
      unit: i.unit === 'port' ? 'port' : 'g',
    }));
  }

  // Ein Tagebuch-Eintrag für n Portionen. base gilt pro Portion.
  function toEntry(d, portions) {
    return { name: d.name, grams: portions, unit: 'port', dishId: d.id, base: perPortion(d) };
  }

  return { perPortion, scaled, toEntry };
})();
