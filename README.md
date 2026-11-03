# Fitness-Tagebuch

Kostenlose Ernährungs- und Trainings-App für den Browser und den Home-Bildschirm (iPhone, Android, Desktop).
Kein Konto, kein Abo, keine Werbung. Die Daten bleiben auf dem Gerät.

Der Fokus liegt auf Kraftsport: Eiweißziel in g pro kg Körpergewicht, Kalorienziel je nach Phase
(Abnehmen, Halten, Muskelaufbau), Trainingslog mit geschätzter 1RM.

Die Planung, Entscheidungen und der Fortschritt stehen in [PROJEKT_STATUS.md](PROJEKT_STATUS.md).

## Funktionen

Die App hat vier Reiter: **Tagebuch**, **Kochbuch**, **Fortschritt** und **Profil**.

- **Tagebuch:** Mahlzeiten als Liste. Du wählst das Lebensmittel (Bestand, von Hand oder per Barcode), die Nährwerte kommen automatisch, du gibst nur die Menge an. Dazu Gerichte, Foto-Schätzung, „Von gestern übernehmen“, Rückgängig und Wasser.
- **Kochbuch:** Lebensmittel und Gerichte mit Suche, Favoriten und „Zuletzt benutzt“. Eigene Lebensmittel und Gerichte anlegen und ändern. Vorinstalliert sind nur Obst, Gemüse und Eier (Richtwerte). Alles andere legst du selbst an, per Barcode-Scan oder von Hand, weil sich Marken in den Werten unterscheiden.
- **Gerichte:** Rezept mit Zutaten und Portionszahl eingeben, die App rechnet auf eine Portion herunter und zeigt, was pro Portion auf den Teller kommt. Mahlzeiten aus dem Tagebuch lassen sich mit einem Namen als Gericht speichern.
- **Barcode-Scanner:** Verpackte Produkte per Kamera scannen. Die Daten kommen von Open Food Facts und werden danach lokal gespeichert.
- **Foto-Schätzung (optional):** Kalorien aus einem Foto schätzen, mit einem eigenen kostenlosen Google-Schlüssel (siehe Datenschutz). Entweder pro Zutat oder als ganzes Gericht, z. B. im Restaurant.
- **Fortschritt:** Umschalter für Gewicht (Verlauf, Ø 7 Tage), Training (Sätze, Volumen, geschätzte 1RM), Auswertung und Coach (regelbasierte Hinweise)
- **Profil:** Ziele, Darstellung, Daten und Foto-Schlüssel
- **Ziele:** Automatisch aus Ziel und Körperdaten, mit anpassbarem Eiweiß (g/kg) und Fettanteil, oder komplett selbst vorgegeben. Eiweiß optional auf die Magermasse bezogen (beim Abnehmen).
- **Darstellung:** Hell, Dunkel oder wie das iPhone, dazu eine wählbare Akzentfarbe
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
| `js/calc.js` | Formeln (Grundumsatz, Tagesziele, Eiweiß- und Fett-Richtwerte, Navy, 1RM) |
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

Nach Änderungen an den App-Dateien in `sw.js` die Version in `CACHE` erhöhen und `APP_VERSION` in `js/app.js` gleich setzen.

## Updates auf dem iPhone

- Die App lädt online immer die neuesten Dateien und nutzt den Zwischenspeicher nur offline. Neue Versionen übernimmt sie selbst und lädt sich dann neu.
- GitHub Pages braucht nach einem Push etwa eine Minute, bis die neue Version online ist.
- Unter **Profil → Daten → App** steht die Version. Dort gibt es „Auf Update prüfen“ und „Neu laden“.
- Die Verknüpfung auf dem Home-Bildschirm nicht löschen. Auf dem iPhone hat jede Home-Bildschirm-App ihren eigenen Speicher, beim Löschen gehen die Einträge verloren. Vorher unter **Profil → Daten** exportieren.

## Hinweis

Die App liefert Schätzwerte für Planung und Übersicht. Sie ersetzt keine ärztliche oder ernährungsmedizinische Beratung.
