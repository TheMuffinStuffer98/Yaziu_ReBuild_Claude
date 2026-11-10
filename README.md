# Fitness-Tagebuch

Kostenlose Ernährungs- und Trainings-App für den Browser und den Home-Bildschirm (iPhone, Android, Desktop).
Kein Konto, kein Abo, keine Werbung. Die Daten bleiben auf dem Gerät.

Der Fokus liegt auf Kraftsport: Eiweißziel in g pro kg Körpergewicht, Kalorienziel je nach Phase
(Abnehmen, Halten, Muskelaufbau), Trainingslog mit geschätzter 1RM.

Die Planung, Entscheidungen und der Fortschritt stehen in [PROJEKT_STATUS.md](PROJEKT_STATUS.md).

## Funktionen

Die App hat vier Reiter: **Tagebuch**, **Kochbuch**, **Fortschritt** und **Profil**.

- **Tagebuch:** Mahlzeiten als Liste. Du wählst das Lebensmittel (Bestand, von Hand oder per Barcode), die Nährwerte kommen automatisch, du gibst nur die Menge an. Mengen gehen in Gramm oder Stück (bei Produkten mit Gewicht pro Stück rechnet die App um). Oben in der Übersicht zeigt ein blauer Wassertropfen, wie viel du getrunken hast, mit Knopf für +250 ml. Dazu Gerichte, Foto-Schätzung, „Von gestern übernehmen“, Rückgängig und Wasser. Oben im Tagebuch steht die Serie (Tage in Folge mit Einträgen oder Training, schaltbar). Welche Mahlzeiten das Tagebuch zeigt (Frühstück, Pre-Workout, Post-Workout, eigene …), stellst du unter Profil → Anzeige ein.
- **Kochbuch:** Lebensmittel und Gerichte. Die Liste bleibt zu, bis du suchst oder einen Filter (Zuletzt, Favoriten, Alle, Eigene) wählst. Eigene Lebensmittel und Gerichte anlegen und ändern. Vorinstalliert ist nur Frisches ohne Barcode: Eier, Obst, Gemüse, rohes Fleisch und roher Fisch sowie Wasser, Kaffee und Tee. Die Werte stammen aus der USDA-Datenbank (SR Legacy, Rohwerte). Deutsche Tabellen und Packungen liegen etwa bei Geflügel oft etwas niedriger, Fettgehalt und Zuschnitt schwanken. Alles andere legst du selbst an, per Barcode-Scan oder von Hand, weil sich Marken in den Werten unterscheiden.
- **Gerichte:** Rezept mit Zutaten und Portionszahl eingeben, die App rechnet auf eine Portion herunter und zeigt, was pro Portion auf den Teller kommt. Mahlzeiten aus dem Tagebuch lassen sich mit einem Namen als Gericht speichern.
- **Barcode-Scanner:** Verpackte Produkte per Kamera scannen. Die Daten kommen von Open Food Facts und werden danach lokal gespeichert.
- **Foto-Schätzung (optional):** Kalorien aus einem Foto schätzen, mit einem eigenen kostenlosen Google-Schlüssel (siehe Datenschutz). Entweder pro Zutat oder als ganzes Gericht, z. B. im Restaurant. Google schaltet Modelle ab; die App sucht dann selbst ein verfügbares Modell. Unter Profil → Foto gibt es einen Verbindungstest.
- **Fortschritt:** Umschalter für Gewicht, Training, Pläne, Auswertung und Coach
- **Training:** Trainingstage als Tabelle (Datum, Plan, Übungen mit bis zu 3 Sätzen, bei Bedarf mehr). Nachträglich änderbar. Die letzten 7 Tage stehen oben, ältere Trainings blendest du auf Klick ein und kannst sie durchsuchen. Beim Eintragen siehst du grau, was du beim letzten Mal gemacht hast.
- **Zeitplan und Coach:** Du legst fest, was wann dran ist: feste Wochentage (Mo Brust, Mi Cardio …) oder eine Rotation mit Pausen (Tag 1, Tag 2 …). Pro Tag wählst du einen deiner Pläne oder Cardio mit Sportart und Dauer. Auf der Startseite steht, was heute ansteht, mit Startknopf. Ein gespeichertes Training wird automatisch abgehakt. Verpasstes lässt sich auf heute verschieben (bei der Rotation rutscht der Rest mit), auf morgen verschieben oder überspringen. Der Coach zeigt die Woche, Ziele für die heutigen Übungen (Doppelte Progression) und kann den Zeitplan als Kalenderdatei mit Erinnerung exportieren. Push-Mitteilungen gibt es nicht.
- **Foto-Schätzung:** Bei Zutaten einzeln kannst du erkannte Namen ändern (z. B. Kartoffeln zu Ananas). Die Werte werden dann aus deiner Lebensmittelliste übernommen oder von der KI neu geschätzt, die Menge bleibt. Beim ganzen Gericht kannst du den Namen ändern und die ganze Portion neu schätzen lassen.
- **Pauschale Produkte:** Eigene Lebensmittel können pro 100 g (mit optionalem Stückgewicht) oder pro Stück/Portion angelegt werden, zum Beispiel 1 Döner oder 1 Stück Kuchen. Beim Eintragen gibst du nur die Anzahl an.
- **Calisthenics:** Eigener Trainingstyp neben Kraft und Cardio (drei Knöpfe mit Symbol). Pro Übung nur Wiederholungen oder Haltezeit in Sekunden, kein Gewicht. Die Übungsliste ist nach Bewegungsmuster sortiert, eigene Übungen sind möglich, Varianten sind eigene Übungen. Pläne gibt es für Kraft und Calisthenics. Calisthenics fließt nie in die Kalorien ein.
- **Tagebuch:** Auf der Startseite stehen nur die Mahlzeiten als Zeilen (Name, Kalorien, Makros). Antippen öffnet das Mahlzeiten-Fenster mit vier Wegen zum Hinzufügen (Lebensmittel, Gericht, KI-Foto, Barcode) und darunter den eingetragenen Lebensmitteln.
- **Cardio:** Radfahren, Laufen, Spazieren und Schwimmen mit Dauer, optionaler Strecke und Intensität. Die App schätzt die aktiven Kalorien (Compendium of Physical Activities 2024) und berechnet bei Strecke das Tempo. Optional kannst du Cardio-Kalorien zum Tagesziel zählen (Profil → Ziele, Standard aus). Krafttraining fließt nie in die Kalorien ein.
- **Pläne:** Vorlagen für Trainingstage mit Übungen in fester Reihenfolge. Ein Training startest du direkt aus dem Plan.
- **Gewicht und Auswertung:** Verlauf, Ø 7 Tage, Kalorien und Makros der letzten 7 Tage (Ø nur über Tage mit Einträgen, auch beim Wasser)
- **Profil:** Ziele, Anzeige (Modus, Akzentfarbe, Mahlzeiten), Daten und Foto-Schlüssel
- **Ziele:** Automatisch aus Ziel und Körperdaten, mit anpassbarem Eiweiß (g/kg) und Fettanteil, oder komplett selbst vorgegeben. Eiweiß optional auf die Magermasse bezogen (beim Abnehmen).
- **Anzeige:** Aufbau und Aussehen orientieren sich an iPhone-Apps (große Titel, Tab-Leiste mit Symbolen, gruppierte Flächen). Hell, Dunkel oder wie das iPhone, dazu eine wählbare Akzentfarbe
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
- Start-Liste der Lebensmittel: [USDA FoodData Central](https://fdc.nal.usda.gov/) (SR Legacy, gemeinfrei).
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
