// Start-Lebensmittelliste. Werte pro 100 g, Richtwerte aus gängigen Nährwerttabellen.
// Bitte vor dem Tracken mit der Packung abgleichen. Eigene Einträge gibt es in der App.
// piece = Gewicht eines Stücks in g (für Eingaben wie "2 Eier").
const Foods = (() => {
  const F = (id, name, kcal, p, f, c, piece = null) => ({ id, name, kcal, p, f, c, piece });

  const builtin = [
    // Protein
    F('huhn', 'Hähnchenbrust', 110, 23, 1.5, 0),
    F('pute', 'Putenbrust', 105, 24, 1, 0),
    F('rind', 'Rinderhack 5 %', 137, 21, 5, 0),
    F('lachs', 'Lachs', 208, 20, 13, 0),
    F('thunfisch', 'Thunfisch in Wasser', 100, 24, 0.5, 0),
    F('ei', 'Ei', 155, 13, 11, 1.1, 60),
    F('eiklar', 'Eiklar', 52, 11, 0.2, 0.7, 33),
    F('quark', 'Magerquark', 67, 12, 0.3, 4),
    F('skyr', 'Skyr natur', 63, 11, 0.2, 4),
    F('joghurt', 'Joghurt 10 %', 120, 4, 10, 4),
    F('whey', 'Whey-Protein (Pulver)', 380, 80, 6, 7, 30),
    F('milch', 'Milch 1,5 %', 47, 3.4, 1.5, 4.8),
    F('gouda', 'Gouda 45 %', 356, 25, 27, 2.2),
    // Kohlenhydrate
    F('haferflocken', 'Haferflocken', 370, 13, 7, 59),
    F('reis', 'Reis gekocht', 130, 2.7, 0.3, 28),
    F('nudeln', 'Nudeln gekocht', 158, 5.8, 0.9, 31),
    F('kartoffel', 'Kartoffel gekocht', 70, 2, 0.1, 15),
    F('suesskartoffel', 'Süßkartoffel gekocht', 86, 1.6, 0.1, 20),
    F('linsen', 'Linsen gekocht', 116, 9, 0.4, 20),
    F('kidneybohnen', 'Kidneybohnen gekocht', 127, 8.7, 0.5, 22.8),
    F('brot', 'Vollkornbrot', 230, 9, 3, 40, 35),
    F('toast', 'Toastbrot', 265, 9, 3, 49, 25),
    // Obst und Gemüse
    F('banane', 'Banane', 89, 1.1, 0.3, 23, 120),
    F('apfel', 'Apfel', 52, 0.3, 0.2, 14, 180),
    F('beeren', 'Beeren (TK)', 50, 1, 0.5, 9),
    F('brokkoli', 'Brokkoli', 34, 2.8, 0.4, 7),
    F('spinat', 'Spinat', 23, 2.9, 0.4, 3.6),
    F('tomate', 'Tomate', 18, 0.9, 0.2, 3.9),
    F('gurke', 'Gurke', 15, 0.7, 0.1, 3.6),
    // Fette und Extras
    F('olivenoel', 'Olivenöl', 884, 0, 100, 0, 10),
    F('butter', 'Butter', 717, 0.9, 81, 0.1),
    F('erdnussbutter', 'Erdnussbutter', 588, 25, 50, 20),
    F('mandeln', 'Mandeln', 579, 21, 50, 22),
    F('avocado', 'Avocado', 160, 2, 15, 9, 150),
    F('honig', 'Honig', 304, 0.3, 0, 82),
    F('zartbitter', 'Zartbitterschokolade 70 %', 600, 8, 43, 46),
    F('kaffee', 'Kaffee schwarz', 2, 0.1, 0, 0, 200),
  ];

  // Alle Lebensmittel: Start-Liste plus die eigenen Einträge des Profils
  const list = (custom = []) => [...builtin, ...custom];

  // Lebensmittel mit viel Eiweiß pro kcal und wenig Fett, für Vorschläge im Coach
  function topProtein(n) {
    return builtin
      .filter((f) => f.p >= 10 && f.f <= 5)
      .sort((a, b) => b.p / b.kcal - a.p / a.kcal)
      .slice(0, n)
      .map((f) => f.name);
  }

  return { builtin, list, topProtein };
})();
