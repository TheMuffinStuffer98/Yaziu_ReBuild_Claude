// Erkennt Texteingaben wie "80 g Haferflocken, 2 Eier" oder "Bankdrücken 80 x 8, 82.5 x 6".
// Lokal und ohne Server: reine Textmuster.
const Parse = (() => {
  const PIECE_UNITS = ['stk', 'stück', 'stueck', 'x'];

  // Trennt eine Eingabe in einzelne Posten
  function items(text) {
    return String(text)
      .split(/[,;\n+]|\sund\s/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Findet das beste Lebensmittel zu einem Begriff (Plural und Teilwörter erlaubt)
  // Rangfolge: genauer Name, Name als Wortanfang, Eingabe als Namensanfang, erstes Wort (Kartoffeln → Kartoffel roh).
  // Bei Gleichstand gewinnt der frühere Eintrag der Liste.
  function find(term, foods) {
    const t = term.toLowerCase();
    let best = null;
    let bestScore = 0;
    foods.forEach((f) => {
      const n = f.name.toLowerCase();
      const first = n.split(/[\s(]/)[0];
      let score = 0;
      if (n === t) score = 1000;
      else if (t.startsWith(n) && n.length >= 2) score = 500 + n.length;
      else if (n.startsWith(t) && t.length >= 4) score = 400 + t.length;
      else if (first.length >= 3 && t.startsWith(first)) score = 100 + first.length;
      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    });
    return best;
  }

  // "80 g Haferflocken" -> {food, grams: 80}; "2 Eier" -> {food, grams: 120}
  function food(item, foods) {
    const m = item.match(/^(\d+(?:[.,]\d+)?)\s*(?:(g|gramm|ml|stk\.?|stück|stueck|x)\s+)?(.+)$/i);
    const amount = m ? parseFloat(m[1].replace(',', '.')) : null;
    const unit = m && m[2] ? m[2].toLowerCase().replace('.', '') : '';
    const term = m ? m[3].trim() : item.trim();

    const found = find(term, foods);
    if (!found) return { missing: term };

    let grams;
    if (amount === null) grams = found.piece || 100;
    else if (PIECE_UNITS.includes(unit)) grams = amount * (found.piece || 100);
    else if (!unit && found.piece) grams = amount * found.piece;
    else grams = amount;

    return { food: found, grams: Math.round(grams) };
  }

  // "Bankdrücken 80 x 8, 82.5 x 6" -> {name, sets: [{w, r}, ...]}
  function exercise(line) {
    const idx = line.search(/\d/);
    if (idx <= 0) return null;
    const name = line.slice(0, idx).replace(/[:\-–]\s*$/, '').trim();
    const sets = [...line.slice(idx).matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×]\s*(\d+)/gi)]
      .map((m) => ({ w: parseFloat(m[1].replace(',', '.')), r: parseInt(m[2], 10) }));
    return name && sets.length ? { name, sets } : null;
  }

  return { items, food, exercise };
})();
