// Foto-Schätzung von Mahlzeiten über die Gemini-Schnittstelle von Google.
// Optional: Es wird ein eigener, kostenloser Schlüssel des Nutzers benötigt. Er bleibt nur im Browser.
// Das Foto wird verkleinert (ohne Standort-Daten) und nur für die Anfrage gesendet, nicht gespeichert.
// Google schaltet Modelle regelmäßig ab. Deshalb sucht die App bei Bedarf selbst ein verfügbares Flash-Modell.
const Vision = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const DEFAULT_MODEL = 'gemini-flash-latest';
  const TIMEOUT_MS = 60000;

  // Modus 'items': Zutaten einzeln. Modus 'dish': ganzes Gericht (z. B. im Restaurant, Zutaten unbekannt).
  const PROMPTS = {
    items: [
      'Du bist ein erfahrener Ernährungsberater. Analysiere das Foto einer Mahlzeit.',
      'Antworte ausschließlich mit JSON in genau dieser Form, ohne weiteren Text:',
      '{"name": "Name des Gerichts", "confidence": "niedrig|mittel|hoch", "note": "kurzer Hinweis",',
      ' "items": [{"name": "Zutat", "grams": 0, "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}]}',
      'Regeln: Menge und Nährwerte beziehen sich auf die sichtbare Portion, nicht auf 100 g.',
      'Schätze die Mengen anhand von Tellergröße, Besteck und Verpackung. Nenne jede Zutat einzeln.',
      'Nutze deutsche Namen. Ist kein Essen zu sehen, gib items als leere Liste zurück.',
    ].join('\n'),
    dish: [
      'Du bist ein erfahrener Ernährungsberater. Das Foto zeigt ein fertiges Gericht, dessen Zutaten unbekannt sind,',
      'zum Beispiel aus einem Restaurant. Schätze die gesamte sichtbare Portion.',
      'Antworte ausschließlich mit JSON in genau dieser Form, ohne weiteren Text:',
      '{"name": "Name des Gerichts", "confidence": "niedrig|mittel|hoch", "note": "kurzer Hinweis",',
      ' "grams": 0, "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}',
      'Regeln: Alle Werte gelten für die gesamte Portion auf dem Foto, nicht pro 100 g.',
      'Rechne übliche Zubereitung mit ein (Öl, Butter, Saucen, Panade, Beilagen). Nutze deutsche Namen.',
      'Ist kein Essen zu sehen, setze kcal auf 0.',
    ].join('\n'),
  };

  // Verkleinert das Bild auf max. 896 px. Das entfernt auch Metadaten wie den Standort und beschleunigt das Senden.
  function toJpegBase64(file, max = 896) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
      img.src = url;
    });
  }

  const num = (v) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };

  function jsonFrom(text) {
    const cleaned = String(text).replace(/```json|```/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Die Antwort war nicht lesbar.');
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      throw new Error('Die Antwort war nicht lesbar.');
    }
  }

  // Liest die Antwort des Modells. Gibt {name, confidence, note, items} zurück.
  // items haben die Form eines Tagebuch-Eintrags: {name, grams, base} mit Werten pro 100 g.
  function parse(text) {
    const data = jsonFrom(text);
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

  // Liest die Antwort im Modus 'dish'. Gibt {name, confidence, note, total} mit Werten für die ganze Portion zurück.
  function parseDish(text) {
    const data = jsonFrom(text);
    const kcal = Math.round(num(data.kcal));
    if (kcal <= 0) throw new Error('Es wurde kein Essen erkannt.');
    return {
      name: String(data.name || 'Gericht').slice(0, 80),
      confidence: String(data.confidence || ''),
      note: String(data.note || '').slice(0, 300),
      total: {
        kcal,
        p: Math.round(num(data.protein) * 10) / 10,
        f: Math.round(num(data.fat) * 10) / 10,
        c: Math.round(num(data.carbs) * 10) / 10,
      },
    };
  }

  // ---------- Verbindung ----------

  // Ruft die Schnittstelle auf. Liefert {ok, status, message, json}. Wirft nur bei Abbruch, Zeitüberschreitung und Netzfehlern.
  async function call(path, key, init = {}, outerSignal = null) {
    const ctl = new AbortController();
    let reason = 'timeout';
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const onAbort = () => { reason = 'cancel'; ctl.abort(); };
    if (outerSignal) {
      if (outerSignal.aborted) onAbort();
      else outerSignal.addEventListener('abort', onAbort);
    }
    try {
      const res = await fetch(BASE + path, {
        ...init,
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      });
      const json = await res.json().catch(() => ({}));
      const message = json.error && json.error.message ? json.error.message : '';
      return { ok: res.ok, status: res.status, message, json };
    } catch (err) {
      if (ctl.signal.aborted) {
        throw new Error(reason === 'cancel'
          ? 'Abgebrochen.'
          : 'Keine Antwort von Google nach 60 Sekunden. Bitte erneut versuchen oder unter Profil → Foto die Verbindung testen.');
      }
      throw new Error('Keine Verbindung zu Google. Internet prüfen.');
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
    }
  }

  function explain(r) {
    if (r.status === 400 && /API key not valid|API_KEY_INVALID/i.test(r.message + JSON.stringify(r.json))) {
      return 'Der Schlüssel ist ungültig. Bitte unter Profil → Foto prüfen.';
    }
    if (r.status === 403) return 'Der Schlüssel hat keinen Zugriff. ' + r.message;
    if (r.status === 429) return 'Das Limit des kostenlosen Tarifs ist erreicht. Später erneut versuchen.';
    if (r.status === 404) return 'Das Modell ist bei Google nicht mehr verfügbar. ' + r.message;
    if (r.status >= 500) return `Google ist gerade überlastet (Fehler ${r.status}). Bitte gleich noch einmal versuchen.`;
    return `Fehler ${r.status}. ${r.message}`;
  }

  // Wählt aus den Modellnamen das beste Flash-Modell. Der Alias "gemini-flash-latest" hat Vorrang.
  function chooseModel(names) {
    const bad = /lite|image|live|tts|audio|embed|robotics|computer|customtools|thinking|exp|vision/i;
    const ok = names.filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !bad.test(n));
    if (ok.includes('gemini-flash-latest')) return 'gemini-flash-latest';
    const score = (n) => {
      const m = n.match(/gemini-(\d+(?:\.\d+)?)-flash/);
      return (m ? parseFloat(m[1]) : 0) * 10 - (/preview/.test(n) ? 3 : 0);
    };
    return ok.sort((a, b) => score(b) - score(a))[0] || null;
  }

  // Namen aller Modelle, die Inhalte erzeugen können (ohne "models/")
  async function listModels(key, signal) {
    const names = [];
    let token = '';
    for (let page = 0; page < 4; page += 1) {
      const r = await call(`/models?pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, key, { method: 'GET' }, signal);
      if (!r.ok) throw new Error(explain(r));
      (r.json.models || []).forEach((m) => {
        if ((m.supportedGenerationMethods || []).includes('generateContent')) names.push(String(m.name).replace(/^models\//, ''));
      });
      token = r.json.nextPageToken || '';
      if (!token) break;
    }
    return names;
  }

  // Erzeugt Inhalte. Zusatzoptionen (JSON-Ausgabe, wenig Nachdenken) werden bei Ablehnung weggelassen.
  async function generate(model, parts, key, signal) {
    const variants = [{ json: true, quick: true }, {}];
    let last;
    for (const v of variants) {
      const cfg = { temperature: 0.2 };
      if (v.json) cfg.responseMimeType = 'application/json';
      if (v.quick && /2\.5-flash/.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
      const body = JSON.stringify({ contents: [{ parts }], generationConfig: cfg });
      const path = `/models/${encodeURIComponent(model)}:generateContent`;
      last = await call(path, key, { method: 'POST', body }, signal);
      if (last.status >= 500) last = await call(path, key, { method: 'POST', body }, signal); // einmal wiederholen
      const unsupported = last.status === 400 && /mime|thinking|response/i.test(last.message);
      if (!unsupported) return last;
    }
    return last;
  }

  function textOf(json) {
    const cand = json.candidates && json.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) {
      const block = json.promptFeedback && json.promptFeedback.blockReason;
      throw new Error(block ? `Das Foto wurde von Google abgelehnt (${block}).` : 'Keine Antwort erhalten. Bitte mit anderem Foto erneut versuchen.');
    }
    // Gedanken-Teile des Modells nicht mitlesen
    return cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  }

  // Schätzt eine Mahlzeit. opts.signal bricht ab. Gibt das Ergebnis plus das tatsächlich genutzte Modell zurück.
  async function estimate(file, key, model, mode = 'items', opts = {}) {
    const data = await toJpegBase64(file);
    const parts = [{ text: PROMPTS[mode] || PROMPTS.items }, { inline_data: { mime_type: 'image/jpeg', data } }];
    let use = model || DEFAULT_MODEL;
    let r = await generate(use, parts, key, opts.signal);
    // Modell weg oder unbekannt: ein verfügbares suchen und noch einmal versuchen
    if (!r.ok && (r.status === 404 || /no longer available|not found|not supported/i.test(r.message))) {
      const found = chooseModel(await listModels(key, opts.signal));
      if (found && found !== use) {
        use = found;
        r = await generate(use, parts, key, opts.signal);
      }
    }
    if (!r.ok) throw new Error(explain(r));
    const text = textOf(r.json);
    return { ...(mode === 'dish' ? parseDish(text) : parse(text)), model: use };
  }

  // Verbindungstest: prüft Schlüssel, findet ein Modell und misst eine kurze Antwort
  async function test(key, model, signal) {
    const t0 = Date.now();
    const names = await listModels(key, signal);
    const wanted = model || DEFAULT_MODEL;
    const use = names.includes(wanted) ? wanted : chooseModel(names);
    if (!use) throw new Error('Für diesen Schlüssel wurde kein Gemini-Flash-Modell gefunden.');
    const r = await generate(use, [{ text: 'Antworte nur mit dem Wort OK.' }], key, signal);
    if (!r.ok) throw new Error(explain(r));
    return { model: use, changed: use !== wanted, count: names.length, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  }

  return { estimate, test, parse, parseDish, chooseModel, DEFAULT_MODEL };
})();
