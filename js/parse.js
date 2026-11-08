// Erkennt Texteingaben für Lebensmittel wie "80 g Haferflocken, 2 Eier".
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
      else if ((f.alias || '').split(' ').some((a) => a.length >= 3 && (t === a || t.startsWith(a)))) score = 50;
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

    // Pauschale Produkte (1 Döner) zählen in Stück, nicht in Gramm
    if (found.per === 'port') return { food: found, grams: amount === null ? 1 : Math.round(amount * 100) / 100 };

    let grams;
    if (amount === null) grams = found.piece || 100;
    else if (PIECE_UNITS.includes(unit)) grams = amount * (found.piece || 100);
    else if (!unit && found.piece) grams = amount * found.piece;
    else grams = amount;

    return { food: found, grams: Math.round(grams) };
  }

  return { items, food };
})();
