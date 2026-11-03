// Barcode-Scanner mit Kamera (ZXing, liegt lokal in vendor/) und Produktsuche bei Open Food Facts.
// Es wird nur die Barcode-Nummer ins Netz gesendet. Daten: Open Food Facts, Lizenz ODbL.
const Scanner = (() => {
  let reader = null;
  let loading = null;

  function loadLib() {
    if (window.ZXing) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/zxing.min.js';
        s.onload = resolve;
        s.onerror = () => { loading = null; reject(new Error('Scanner konnte nicht geladen werden.')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  // Startet die Kamera im video-Element. onCode wird einmal mit der erkannten Nummer aufgerufen.
  async function start(video, onCode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Kamera nicht verfügbar. Die Seite muss über HTTPS geöffnet sein.');
    }
    await loadLib();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ]);
    stop();
    const r = new ZXing.BrowserMultiFormatReader(hints, 250);
    reader = r;
    let done = false;
    await r.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, (result) => {
      if (result && !done) {
        done = true;
        onCode(result.getText());
      }
    });
  }

  function stop() {
    if (reader) {
      try { reader.reset(); } catch (err) { /* Kamera war schon beendet */ }
      reader = null;
    }
  }

  const round1 = (x) => Math.round(x * 10) / 10;
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

  // Macht aus einem Open-Food-Facts-Produkt einen Lebensmittel-Eintrag (Werte pro 100 g)
  function toFood(p, ean) {
    const n = p.nutriments || {};
    let kcal = n['energy-kcal_100g'];
    if (kcal === undefined && n.energy_100g !== undefined) kcal = num(n.energy_100g) / 4.184;
    const brand = p.brands ? String(p.brands).split(',')[0].trim() : '';
    const title = p.product_name ? String(p.product_name).trim() : '';
    const hasBrand = brand && title.toLowerCase().includes(brand.toLowerCase());
    const name = [hasBrand ? '' : brand, title].filter(Boolean).join(' – ') || `Produkt ${ean}`;
    return {
      id: 'ean:' + ean,
      name,
      kcal: Math.round(num(kcal)),
      p: round1(num(n.proteins_100g)),
      f: round1(num(n.fat_100g)),
      c: round1(num(n.carbohydrates_100g)),
      piece: parseFloat(p.serving_quantity) || null,
      ean,
      source: 'off',
      complete: kcal !== undefined && n.proteins_100g !== undefined
        && n.fat_100g !== undefined && n.carbohydrates_100g !== undefined,
    };
  }

  // Gibt das Produkt zurück oder null, wenn es nicht in der Datenbank ist.
  async function lookup(ean) {
    const fields = 'code,product_name,brands,nutriments,serving_quantity';
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Open Food Facts antwortet mit Fehler ' + res.status);
      const json = await res.json();
      if (!json.product || json.status === 0) return null;
      return toFood(json.product, ean);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Keine Antwort von Open Food Facts. Internet prüfen.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return { start, stop, lookup, toFood };
})();
