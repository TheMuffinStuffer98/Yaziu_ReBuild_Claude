// Foto-Schätzung von Mahlzeiten über die Gemini-Schnittstelle von Google.
// Optional: Es wird ein eigener, kostenloser Schlüssel des Nutzers benötigt. Er bleibt nur im Browser.
// Das Foto wird verkleinert (ohne Standort-Daten) und nur für die Anfrage gesendet, nicht gespeichert.
const Vision = (() => {
  const PROMPT = [
    'Du bist ein erfahrener Ernährungsberater. Analysiere das Foto einer Mahlzeit.',
    'Antworte ausschließlich mit JSON in genau dieser Form, ohne weiteren Text:',
    '{"name": "Name des Gerichts", "confidence": "niedrig|mittel|hoch", "note": "kurzer Hinweis",',
    ' "items": [{"name": "Zutat", "grams": 0, "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}]}',
    'Regeln: Menge und Nährwerte beziehen sich auf die sichtbare Portion, nicht auf 100 g.',
    'Schätze die Mengen anhand von Tellergröße, Besteck und Verpackung. Nenne jede Zutat einzeln.',
    'Nutze deutsche Namen. Ist kein Essen zu sehen, gib items als leere Liste zurück.',
  ].join('\n');

  // Verkleinert das Bild auf max. 1024 px. Das entfernt auch Metadaten wie den Standort.
  function toJpegBase64(file, max = 1024) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
      img.src = url;
    });
  }

  const num = (v) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };

  // Liest die Antwort des Modells. Gibt {name, confidence, note, items} zurück.
  // items haben die Form eines Tagebuch-Eintrags: {name, grams, base} mit Werten pro 100 g.
  function parse(text) {
    const cleaned = String(text).replace(/```json|```/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Die Antwort war nicht lesbar.');
    const data = JSON.parse(cleaned.slice(start, end + 1));
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((i) => {
        const grams = num(i.grams);
        if (!i.name || grams <= 0) return null;
        const per100 = (v) => Math.round(((num(v) * 100) / grams) * 10) / 10;
        return {
          name: String(i.name).slice(0, 80),
          grams: Math.round(grams),
          base: { kcal: Math.round((num(i.kcal) * 100) / grams), p: per100(i.protein), f: per100(i.fat), c: per100(i.carbs) },
        };
      })
      .filter(Boolean);
    return {
      name: String(data.name || 'Mahlzeit').slice(0, 80),
      confidence: String(data.confidence || ''),
      note: String(data.note || '').slice(0, 300),
      items,
    };
  }

  async function estimate(file, key, model) {
    const data = await toJpegBase64(file);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data } }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Zeitüberschreitung. Bitte erneut versuchen.');
      throw new Error('Keine Verbindung. Internet prüfen.');
    } finally {
      clearTimeout(timer);
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error && json.error.message ? json.error.message : '';
      if (res.status === 429) throw new Error('Das Limit des kostenlosen Tarifs ist erreicht. Später erneut versuchen.');
      if (res.status === 400 || res.status === 403) throw new Error('Schlüssel oder Modell abgelehnt. ' + msg);
      throw new Error(`Fehler ${res.status}. ${msg}`);
    }
    const parts = json.candidates && json.candidates[0] && json.candidates[0].content
      ? json.candidates[0].content.parts : null;
    if (!parts || !parts.length) throw new Error('Keine Antwort erhalten. Bitte mit anderem Foto erneut versuchen.');
    return parse(parts.map((p) => p.text || '').join(''));
  }

  return { estimate, parse };
})();
