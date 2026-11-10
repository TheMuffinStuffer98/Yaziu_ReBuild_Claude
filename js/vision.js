// Foto-Schätzung von Mahlzeiten über die Gemini-Schnittstelle von Google.
// Optional: Es wird ein eigener, kostenloser Schlüssel des Nutzers benötigt. Er bleibt nur im Browser.
// Das Foto wird verkleinert (ohne Standort-Daten) und nur für die Anfrage gesendet, nicht gespeichert.
//
// Schnell und verlässlich: Es wird ein festes Flash-Lite-Modell mit minimalem "Nachdenken" benutzt. Antwortet ein
// Modell nicht rechtzeitig oder ist es nicht verfügbar, versucht die App das nächste. Bei Zutaten nennt die KI nur
// Name und Menge. Die Nährwerte kommen aus der Lebensmittelliste der App, nur Unbekanntes wird geschätzt.
const Vision = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const FALLBACKS = ['gemini-3.6-flash'];
  // Früher gespeicherte Modelle, die langsam sind oder abgeschaltet werden: sie zählen als "automatisch"
  const OLD_DEFAULTS = ['gemini-flash-latest', 'gemini-2.5-flash'];
  const TIMEOUT_MS = 25000;
  const MAX_KNOWN = 200;

  const normalizeModel = (m) => {
    const s = String(m || '').trim();
    return !s || OLD_DEFAULTS.includes(s) ? DEFAULT_MODEL : s;
  };

  // known = Lebensmittel der App (Name, Werte pro 100 g). Nur ihre Namen gehen in die Anfrage.
  const knownNames = (known) => [...new Set((known || []).map((f) => String(f.name).trim()).filter(Boolean))].slice(0, MAX_KNOWN);

  // Modus 'items': Zutaten einzeln. Modus 'dish': ganzes Gericht (z. B. im Restaurant, Zutaten unbekannt).
  function prompt(mode, known, hint = '') {
    // Hat der Nutzer den erkannten Namen korrigiert, gilt er als feste Vorgabe
    const clean = String(hint || '').replace(/[\r\n"„“]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    const hintLine = clean ? `Hinweis des Nutzers: Das Essen auf dem Foto ist „${clean}“. Richte dich danach, auch wenn es anders aussieht.` : '';
    if (mode === 'dish') {
      return [
        hintLine,
        'Du bist ein erfahrener Ernährungsberater. Das Foto zeigt ein fertiges Gericht, dessen Zutaten unbekannt sind,',
        'zum Beispiel aus einem Restaurant. Schätze die gesamte sichtbare Portion.',
        'Antworte ausschließlich mit JSON in genau dieser Form, ohne weiteren Text:',
        '{"name": "Name des Gerichts", "confidence": "niedrig|mittel|hoch", "note": "kurzer Hinweis",',
        ' "grams": 0, "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}',
        'Regeln: Alle Werte gelten für die gesamte Portion auf dem Foto, nicht pro 100 g.',
        'Rechne übliche Zubereitung mit ein (Öl, Butter, Saucen, Panade, Beilagen). Nutze deutsche Namen.',
        'Ist kein Essen zu sehen, setze kcal auf 0.',
      ].filter(Boolean).join('\n');
    }
    const names = knownNames(known);
    return [
      hintLine,
      'Du bist ein erfahrener Ernährungsberater. Analysiere das Foto einer Mahlzeit.',
      'Antworte ausschließlich mit JSON in genau dieser Form, ohne weiteren Text:',
      '{"name": "Name des Gerichts", "confidence": "niedrig|mittel|hoch", "note": "kurzer Hinweis",',
      ' "items": [{"name": "Zutat", "match": "Name aus der Liste oder null", "grams": 0,',
      '  "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}]}',
      'Regeln: grams ist die sichtbare Menge der Zutat in Gramm (Schätzung nach Tellergröße, Besteck, Verpackung).',
      'Nenne jede Zutat einzeln und nutze deutsche Namen.',
      names.length ? `Bekannte Lebensmittel: ${names.join('; ')}.` : '',
      'Passt eine Zutat eindeutig zu einem Eintrag dieser Liste, setze match auf genau diesen Namen',
      'und lasse kcal, protein, fat und carbs bei 0.',
      'Sonst setze match auf null und gib kcal, protein, fat und carbs pro 100 g dieses Lebensmittels an, nicht für die Portion.',
      'Ist kein Essen zu sehen, gib items als leere Liste zurück.',
    ].filter(Boolean).join('\n');
  }

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
  const round1 = (x) => Math.round(x * 10) / 10;

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

  // Werte pro 100 g aus der Antwort. Sieht es nach Werten für die ganze Portion aus (mehr als 100 g Nährstoffe
  // oder über 950 kcal pro 100 g), werden sie auf 100 g heruntergerechnet.
  function per100(i, grams) {
    const kcal = num(i.kcal);
    const p = num(i.protein);
    const f = num(i.fat);
    const c = num(i.carbs);
    const k = p + f + c > 105 || kcal > 950 ? 100 / grams : 1;
    return { kcal: Math.round(kcal * k), p: round1(p * k), f: round1(f * k), c: round1(c * k) };
  }

  // Liest die Antwort des Modells. Gibt {name, confidence, note, items} zurück.
  // items haben die Form eines Tagebuch-Eintrags: {name, grams, base, foodId?} mit Werten pro 100 g.
  // Passt eine Zutat zu einem Lebensmittel aus known, kommen die Werte von dort (mit foodId).
  function parse(text, known = []) {
    const data = jsonFrom(text);
    const byName = new Map((known || []).map((f) => [String(f.name).trim().toLowerCase(), f]));
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((i) => {
        const grams = num(i.grams);
        if (!i.name || grams <= 0) return null;
        const hit = i.match ? byName.get(String(i.match).trim().toLowerCase()) : null;
        if (hit) {
          return { name: hit.name, grams: Math.round(grams), foodId: hit.id, base: { kcal: hit.kcal, p: hit.p, f: hit.f, c: hit.c } };
        }
        return { name: String(i.name).slice(0, 80), grams: Math.round(grams), base: per100(i, grams) };
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

  // Ruft die Schnittstelle auf. Liefert {ok, status, message, json}.
  // Wirft nur bei Abbruch, Zeitüberschreitung und Netzfehlern (err.kind: cancel, timeout, network).
  async function call(path, key, init = {}, outerSignal = null) {
    const ctl = new AbortController();
    let reason = 'timeout';
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const onAbort = () => { reason = 'cancel'; ctl.abort(); };
    if (outerSignal) {
      if (outerSignal.aborted) onAbort();
      else outerSignal.addEventListener('abort', onAbort);
    }
    const fail = (kind, message) => Object.assign(new Error(message), { kind });
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
        throw reason === 'cancel'
          ? fail('cancel', 'Abgebrochen.')
          : fail('timeout', `Keine Antwort von Google nach ${TIMEOUT_MS / 1000} Sekunden. Bitte erneut versuchen.`);
      }
      throw fail('network', 'Keine Verbindung zu Google. Internet prüfen.');
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

  // Wählt aus den Modellnamen das beste schnelle Modell: erst die festen Standardmodelle, sonst das neueste stabile
  // Flash-Modell (Flash-Lite leicht bevorzugt, Vorschau-Modelle nur, wenn nichts anderes da ist).
  function chooseModel(names) {
    const preferred = [DEFAULT_MODEL, ...FALLBACKS].find((m) => names.includes(m));
    if (preferred) return preferred;
    const bad = /image|live|tts|audio|embed|robotics|computer|customtools|thinking|exp|vision/i;
    const ok = names.filter((n) => /^gemini-\d/.test(n) && /flash/.test(n) && !bad.test(n));
    const score = (n) => {
      const m = n.match(/gemini-(\d+(?:\.\d+)?)-flash(-lite)?/);
      return (m ? parseFloat(m[1]) * 10 + (m[2] ? 2 : 0) : 0) - (/preview/.test(n) ? 30 : 0);
    };
    return ok.sort((a, b) => score(b) - score(a))[0] || (names.includes('gemini-flash-latest') ? 'gemini-flash-latest' : null);
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

  // Einstellung für wenig "Nachdenken": je nach Modellfamilie Stufe oder Budget. Unbekannte Modelle: keine.
  function thinkingFor(model) {
    if (/^gemini-3\.8-flash/.test(model)) return { thinkingLevel: 'low' };
    if (/^gemini-3(\.\d+)?-flash/.test(model)) return { thinkingLevel: 'minimal' };
    if (/^gemini-2\.5-flash(?!-lite)/.test(model)) return { thinkingBudget: 0 };
    return null;
  }

  // Erzeugt Inhalte. Zusatzoptionen (JSON-Ausgabe, wenig Nachdenken) werden bei Ablehnung weggelassen.
  async function generate(model, parts, key, signal) {
    const variants = [{ json: true, quick: true }, {}];
    let last;
    for (const v of variants) {
      const cfg = { temperature: 0.2 };
      if (v.json) cfg.responseMimeType = 'application/json';
      const thinking = v.quick ? thinkingFor(model) : null;
      if (thinking) cfg.thinkingConfig = thinking;
      const body = JSON.stringify({ contents: [{ parts }], generationConfig: cfg });
      last = await call(`/models/${encodeURIComponent(model)}:generateContent`, key, { method: 'POST', body }, signal);
      const unsupported = last.status === 400 && /mime|thinking|response|level|budget/i.test(last.message);
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

  // Soll bei diesem Ergebnis das nächste Modell versucht werden? Nicht bei falschem Schlüssel oder fehlendem Zugriff.
  const retryable = (r) => r.status === 404 || r.status === 429 || r.status >= 500
    || /no longer available|not found|not supported/i.test(r.message);

  // Schätzt eine Mahlzeit. opts.signal bricht ab, opts.foods sind die bekannten Lebensmittel (Werte pro 100 g).
  // Gibt das Ergebnis plus das tatsächlich genutzte Modell zurück.
  // opts.image ist ein schon verkleinertes Bild (Base64) für eine erneute Schätzung, opts.hint der korrigierte Name.
  // Das Ergebnis enthält das verkleinerte Bild (image), damit es nur im Arbeitsspeicher wiederverwendet werden kann.
  async function estimate(file, key, model, mode = 'items', opts = {}) {
    const data = opts.image || await toJpegBase64(file);
    const parts = [{ text: prompt(mode, opts.foods, opts.hint) }, { inline_data: { mime_type: 'image/jpeg', data } }];
    const { r, use } = await runModels(parts, key, model, opts.signal);
    const text = textOf(r.json);
    return { ...(mode === 'dish' ? parseDish(text) : parse(text, opts.foods)), model: use, image: data };
  }

  // Schickt die Anfrage an das Standardmodell und bei Zeitüberschreitung, Überlastung, Limit oder abgeschaltetem Modell
  // an das nächste. Gibt die erfolgreiche Antwort r und das benutzte Modell zurück.
  async function runModels(parts, key, model, signal) {
    const first = normalizeModel(model);
    let chain = [first, ...FALLBACKS.filter((m) => m !== first)];
    let discovered = false;
    let r = null;
    let use = first;
    let lastErr = null;
    for (let i = 0; i < chain.length; i += 1) {
      use = chain[i];
      try {
        r = await generate(use, parts, key, signal);
        lastErr = null;
      } catch (err) {
        if (err.kind === 'cancel') throw err;
        lastErr = err; // Zeitüberschreitung oder Netzfehler: nächstes Modell
        r = null;
      }
      if (r && r.ok) break;
      if (r && !retryable(r)) break;
      // Kein Standardmodell verfügbar: ein vorhandenes Modell suchen und anhängen
      if (i === chain.length - 1 && !discovered && r && r.status === 404) {
        discovered = true;
        const found = chooseModel(await listModels(key, signal));
        if (found && !chain.includes(found)) chain = [...chain, found];
      }
    }
    if (!r) throw lastErr;
    if (!r.ok) throw new Error(explain(r));
    return { r, use };
  }

  // Zweite Runde: Nährwerte pro 100 g für ein Lebensmittel nur nach dem Namen schätzen, ohne Foto.
  // Gibt {name, base: {kcal, p, f, c}, model} zurück.
  async function estimateFood(name, key, model, opts = {}) {
    const clean = String(name).replace(/[\r\n"„“]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) throw new Error('Bitte einen Namen eingeben.');
    const text = [
      `Gib die durchschnittlichen Nährwerte pro 100 g für dieses Lebensmittel an: "${clean}".`,
      'Gemeint ist die übliche Form, wie es gegessen wird. Antworte ausschließlich mit JSON in genau dieser Form:',
      '{"name": "Name", "kcal": 0, "protein": 0, "fat": 0, "carbs": 0}',
      'Alle Werte gelten für 100 g. Ist es kein Lebensmittel, setze kcal auf 0.',
    ].join('\n');
    const { r, use } = await runModels([{ text }], key, model, opts.signal);
    const data = jsonFrom(textOf(r.json));
    const base = per100(data, 100);
    if (base.kcal <= 0) throw new Error(`Für „${clean}“ konnten keine Werte geschätzt werden.`);
    return { name: clean, base, model: use };
  }

  // Verbindungstest: prüft Schlüssel, findet ein Modell und misst eine kurze Antwort
  async function test(key, model, signal) {
    const t0 = Date.now();
    const names = await listModels(key, signal);
    const wanted = normalizeModel(model);
    const use = names.includes(wanted) ? wanted : chooseModel(names);
    if (!use) throw new Error('Für diesen Schlüssel wurde kein Gemini-Flash-Modell gefunden.');
    const r = await generate(use, [{ text: 'Antworte nur mit dem Wort OK.' }], key, signal);
    if (!r.ok) throw new Error(explain(r));
    return { model: use, changed: use !== wanted, count: names.length, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  }

  return {
    estimate, estimateFood, test, parse, parseDish, chooseModel, normalizeModel, thinkingFor, prompt, DEFAULT_MODEL,
  };
})();
