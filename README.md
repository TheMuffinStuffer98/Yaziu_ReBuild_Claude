# Fitness-Tagebuch

Kostenlose Ernährungs- und Trainings-App für den Browser und den Home-Bildschirm (iPhone, Android, Desktop).
Kein Konto, kein Abo, keine Werbung. Die Daten bleiben auf dem Gerät.

Der Fokus liegt auf Kraftsport: Eiweißziel in g pro kg Körpergewicht, Kalorienziel je nach Phase
(Abnehmen, Halten, Muskelaufbau), Trainingslog mit geschätzter 1RM.

Die Planung, Entscheidungen und der Fortschritt stehen in [PROJEKT_STATUS.md](PROJEKT_STATUS.md).

## Funktionen

- **Tagebuch:** Mahlzeiten pro Tag, Kalorien und Makros, Schnelleingabe per Text, Wasser
- **Lebensmittel:** Start-Liste mit Richtwerten, eigene Lebensmittel anlegen
- **Gerichte:** Rezept mit Zutaten und Portionszahl eingeben, die App rechnet auf eine Portion herunter und zeigt, was pro Portion auf den Teller kommt. Mahlzeiten aus dem Tagebuch lassen sich als Gericht speichern.
- **Barcode-Scanner:** Verpackte Produkte per Kamera scannen. Die Daten kommen von Open Food Facts und werden danach lokal gespeichert.
- **Foto-Schätzung (optional):** Kalorien und Zutaten aus einem Foto schätzen, mit einem eigenen kostenlosen Google-Schlüssel (siehe Datenschutz)
- **Gewicht:** Einträge, Verlauf als Diagramm, Ø der letzten 7 Tage
- **Training:** Übungen mit Sätzen erfassen, Volumen, geschätzte 1RM als Bestwerte
- **Auswertung:** Ø der letzten 7 Tage, Kalorien der letzten 14 Tage
- **Coach:** Regelbasierte Hinweise aus deinen Daten, ohne Server
- **Rechner:** Grundumsatz, Gesamtumsatz, Kalorien- und Makroziel, Körperfett (Navy-Methode)
- **Profile:** Mehrere Personen auf einem Gerät, jede mit eigenen Daten
- **Backup:** Export und Import als JSON-Datei
- **Offline:** Nach dem ersten Laden funktioniert die App ohne Netz

## Starten

Die App ist eine statische Webseite ohne Build-Schritt. Lokal starten:

```bash
python -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen.

## Auf dem iPhone installieren

1. Die Adresse der App in **Safari** öffnen.
2. Teilen-Symbol antippen, dann **Zum Home-Bildschirm**.

Die App startet dann im Vollbild wie eine normale App.

## Hosting mit GitHub Pages

1. Repository auf GitHub anlegen und die Dateien hochladen.
2. Im Repository: **Settings → Pages → Deploy from a branch → main / (root)**.
3. Die angezeigte Adresse auf dem iPhone öffnen und zum Home-Bildschirm hinzufügen.

Mit einem kostenlosen GitHub-Konto muss das Repository öffentlich sein. Die Nutzerdaten liegen trotzdem nur im Browser des jeweiligen Geräts.

## Datenschutz

- Alle Einträge werden im `localStorage` des Browsers gespeichert. Es gibt keinen Server und keine Übertragung.
- Der Browser-Speicher kann gelöscht werden (z. B. bei „Website-Daten löschen“). Deshalb regelmäßig exportieren.
- Die Lebensmittel-Werte sind Richtwerte. Vor dem Tracken mit der Packung abgleichen.
- **Scanner:** Es wird nur die Barcode-Nummer an Open Food Facts gesendet. Die Kamera-Bilder bleiben im Gerät. Das Scannen braucht eine HTTPS-Adresse, z. B. GitHub Pages.
- **Foto-Schätzung:** Nur mit eigenem API-Schlüssel (Google AI Studio). Das Foto wird verkleinert, ohne Standort-Daten, an Google gesendet und nicht gespeichert. Im kostenlosen Tarif kann Google Eingaben zur Produktverbesserung nutzen. Der Schlüssel liegt nur im Browser des Geräts und ist nicht im Export enthalten.

## Quellen und Lizenzen

- Produktdaten: [Open Food Facts](https://world.openfoodfacts.org), Lizenz ODbL, Daten von der Community und teils unvollständig.
- Barcode-Erkennung: [ZXing](https://github.com/zxing-js/library) (Apache-2.0), Kopie in `vendor/` mit Lizenzdatei.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst und Navigation |
| `css/style.css` | Darstellung, Hell- und Dunkelmodus |
| `js/store.js` | Lokale Speicherung und Profile |
| `js/calc.js` | Formeln (Grundumsatz, Ziele, Makros, Navy, 1RM) |
| `js/foods.js` | Start-Liste der Lebensmittel |
| `js/parse.js` | Texteingabe für Lebensmittel und Übungen |
| `js/coach.js` | Regeln für die Hinweise |
| `js/dishes.js` | Gerichte: Portionen und Teller-Mengen |
| `js/scanner.js` | Kamera-Scan und Produktsuche |
| `js/vision.js` | Foto-Schätzung |
| `vendor/` | Barcode-Bibliothek (ZXing) |
| `icons/` | App-Icon |
| `js/app.js` | Ansichten und Eingaben |
| `sw.js` | Offline-Zwischenspeicher |

Nach Änderungen an den App-Dateien in `sw.js` die Version in `CACHE` erhöhen, sonst bleibt die alte Version im Cache.

## Hinweis

Die App liefert Schätzwerte für Planung und Übersicht. Sie ersetzt keine ärztliche oder ernährungsmedizinische Beratung.
