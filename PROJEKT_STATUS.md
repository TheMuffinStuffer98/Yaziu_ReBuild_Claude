# Fitness-Tagebuch – Konzept und Fortschritt

Dieses Dokument hält fest, was beschlossen wurde, was gebaut ist und was noch offen ist.
Es wird bei jedem Schritt aktualisiert.

---

## 1. Ziel

Eine kostenlose, werbefreie Nährwert- und Trainings-App, die dem Funktionsumfang von YAZIO
(https://www.yazio.com/de) nahekommt, aber für Kraftsportler optimiert ist.

- Läuft auf dem iPhone als Web-App (kein Xcode, kein Apple-Konto, kein Abo).
- Alle Daten bleiben lokal auf dem jeweiligen Gerät (Browser-Speicher). Kein Server, kein Login.
- Mehrere Personen können dieselbe App nutzen. Jedes Profil hat seine eigenen Daten.
- Alle Funktionen sind kostenlos, auch die "KI"-Funktionen.
- Design: schlicht und funktional. Keine Streaks, keine Abzeichen, kein Gamification-Kram.

## 2. Zusammenfassung meines Verständnisses

| Thema | Verstanden |
|---|---|
| Plattform | iPhone, ohne Store, ohne Abo. Web-App, die zum Home-Bildschirm hinzugefügt wird (PWA). |
| Daten | Lokal. Export/Import als Datei, damit Daten auf ein anderes Gerät können. |
| Nutzer | Du als Hauptnutzer, zusätzlich andere Personen mit eigenen Profilen. |
| Zielgruppe Fokus | Kraftsport/Bodybuilding: Protein-betont, Kalorienziel je nach Phase (Cut, Halten, Bulk). |
| Funktionen YAZIO | Tagebuch, Kalorien- und Makrotracking, Wasser, Gewicht, Rezepte, Statistiken, Ziele. |
| "KI" | Muss kostenlos sein. Umsetzung ohne Server und ohne Bezahl-API ist nur eingeschränkt möglich (siehe Abschnitt 4). |
| Repo | GitHub, möglichst unauffällig. Keine KI-Hinweise in Dateien, Commits oder README. |

## 3. Was ich ergänzen oder anders machen würde

1. **Kraftsport-Fokus statt Abnehmen-Fokus.** YAZIO legt den Schwerpunkt auf Gewichtsreduktion.
   Für Bodybuilder sind wichtiger: Proteinziel in g/kg Körpergewicht, Kalorienüberschuss
   im Bulk, Trainingslog mit Volumen und geschätzter 1RM.
2. **Trainingslog als eigenes Modul.** Sätze, Wiederholungen, Gewicht, Pausen, Volumen pro
   Muskelgruppe, geschätzte 1RM nach Epley (Gewicht × (1 + Wdh / 30)).
3. **Körperzusammensetzung.** Körperfett über die US-Navy-Methode (Taille, Hals, Hüfte) und
   Gewichtstrend als 7-Tage-Mittel. Das Tageswasserschwanken wird so herausgerechnet.
4. **Rechner-Modul.** Grundumsatz (Mifflin-St Jeor), Gesamtumsatz mit Aktivitätsfaktor,
   Kalorienziel je nach Phase, Makroverteilung.
5. **Mehrere Profile auf einem Gerät.** Jede Person hat eigene Ziele, Gewichte, Tagebücher.
6. **Lokaler Coach.** Regelbasierte Auswertung der letzten 7 Tage (siehe Abschnitt 4).
7. **Backup.** Export als JSON-Datei. Ohne Backup gehen Daten bei gelöschtem Browser-Speicher verloren.
   Das muss in der App klar sichtbar sein.
8. **Offline-Fähigkeit.** Ein Service Worker speichert die App-Dateien, damit sie ohne Netz laufen.

## 4. Die "KI"-Funktionen – ehrlich eingeordnet

Eine echte Foto-Erkennung von Mahlzeiten braucht ein großes Modell oder einen Server. Beides
ist ohne laufende Kosten nicht lokal machbar. Deshalb gibt es diese Varianten:

| Funktion | Umsetzung | Kosten |
|---|---|---|
| Texteingabe ("2 Eier, 80 g Haferflocken, 200 ml Milch") | Lokaler Parser, erkennt Menge und Lebensmittel | 0 € |
| Auto-Vorschläge ("Was passt noch zu meinen Makros?") | Regeln über die lokale Lebensmittel-Liste | 0 € |
| Coach-Hinweise (Protein zu niedrig, Gewicht stagniert, Schlaf/Wasser) | Regeln auf den Daten der letzten 7 Tage | 0 € |
| Barcode-Scan | Benötigt eine Online-Datenbank (z. B. Open Food Facts, kostenlos) und Kamera-Zugriff | 0 €, aber Netz nötig. Für später. |
| Foto-Erkennung | Nur mit externer API mit Schlüssel | Kostet Geld. Nicht umgesetzt. |

## 5. Technische Entscheidungen

- **Stack:** Reines HTML, CSS und JavaScript, ohne Build-Schritt und ohne Frameworks.
  Begründung: Keine Abhängigkeiten, die veralten. Der Code bleibt für Anfänger lesbar.
- **Speicher:** `localStorage` pro Profil, mit dem Präfix `ft.`. Für die Datenmenge reicht das.
- **Hosting:** GitHub Pages (kostenlos). Hinweis: Auf kostenlosem GitHub-Konto muss das Repo
  öffentlich sein. Die Daten der Nutzer liegen trotzdem nur auf deren Gerät.
- **Installation auf dem iPhone:** In Safari die URL öffnen, dann "Teilen" → "Zum Home-Bildschirm".

## 6. Berechnungsgrundlagen

- Grundumsatz (Mifflin-St Jeor):
  - Männer: 10 × kg + 6,25 × cm − 5 × Alter + 5
  - Frauen: 10 × kg + 6,25 × cm − 5 × Alter − 161
- Gesamtumsatz: Grundumsatz × Aktivitätsfaktor (1,2 bis 1,9).
- Kalorienziel:
  - Abnehmen (Cut): Gesamtumsatz − 400 bis 600 kcal (Tempo wählbar)
  - Halten: Gesamtumsatz
  - Muskelaufbau (Bulk): Gesamtumsatz + 200 bis 400 kcal
- Protein: 2,0 bis 2,2 g pro kg Körpergewicht (Kraftsport). Im Cut eher 2,2.
- Fett: mind. 0,8 g pro kg Körpergewicht.
- Kohlenhydrate: Rest der Kalorien. 4 kcal/g für Protein und KH, 9 kcal/g für Fett.
- Körperfett (Navy, Männer): 495 / (1,0324 − 0,19077 · log10(Taille − Hals) + 0,15456 · log10(Größe)) − 450
- Körperfett (Navy, Frauen): 495 / (1,29579 − 0,35004 · log10(Taille + Hüfte − Hals) + 0,22100 · log10(Größe)) − 450
- Geschätzte 1RM (Epley): Gewicht × (1 + Wdh / 30)

## 7. Fortschritt

- [x] Konzept und Entscheidungen festgehalten (dieses Dokument)
- [x] App-Grundgerüst (HTML, CSS, PWA-Dateien, Service Worker, Manifest)
- [x] Profile und Rechner (Grundumsatz, Kalorienziel, Makros, Navy-Körperfett)
- [x] Tagebuch, Lebensmittel-Liste (35 Einträge), eigene Lebensmittel, Wasser
- [x] Gewicht (Verlauf, Ø 7 Tage), Training (Sätze, Volumen, 1RM-Bestwerte), Auswertung (7 und 14 Tage)
- [x] Lokaler Coach (Regeln) und Texteingabe für Lebensmittel und Übungen
- [x] Export/Import als JSON
- [x] Lokales Git-Repo ohne KI-Hinweise, Commit ohne Co-Autor-Zeile
- [x] Logik getestet (Parser, Rechner, Coach per Node), Oberfläche im Browser-Test auf Mobil-Breite geprüft
- [x] Gewichtstrend-Bewertung im Coach, Schwellen aus der Fachliteratur (siehe Abschnitt 10)
- [x] Icon: Hantel mit Blatt, als SVG (`icons/icon.svg`) und PNG (192, 180, 512 px)
- [x] Design überarbeitet: Kalorien-Ring im Tagebuch, Makro-Farben, Glas-Tabbar, Dunkelmodus
- [x] Gerichte: Zutaten und Portionszahl, Berechnung pro Portion, Teller-Mengen, "Als Gericht speichern" aus dem Tagebuch (keine Fertiggewicht-Funktion, bewusst Portionen)
- [x] Hinzufügen-Fenster mit Tabs: Suche, Gerichte, Scan, Foto
- [x] Barcode-Scanner (ZXing lokal in `vendor/`, Produktdaten von Open Food Facts, Zwischenspeicher lokal). Abfrage getestet, Dekodierung mit erzeugtem Barcode getestet
- [x] Foto-Schätzung über eigenen Gemini-Schlüssel (optional, Schlüssel nicht im Export). Antwort-Parser getestet
- [x] Umbau der Bedienung nach Test auf dem iPhone: vier Reiter (Tagebuch, Kochbuch, Fortschritt, Profil), Mahlzeiten als Liste mit Auswahl-Fenster, Gericht-Editor im Vollbild, Favoriten und „Zuletzt“, Rückgängig, „Von gestern übernehmen“
- [x] Eiweiß-Skala anpassbar (g/kg), Fett in % der Kalorien, optional Magermasse-Bezug beim Abnehmen, oder Ziele komplett manuell (Abschnitt 11)
- [x] Foto-Schätzung auch als ganzes Gericht (Restaurant), Ergebnis vor dem Eintragen korrigierbar
- [x] Hell/Dunkel/System und wählbare Akzentfarbe
- [x] Scan getestet (Nutzer, iPhone). Nach dem Scannen lassen sich falsche Datenbank-Werte direkt ändern („Werte stimmen nicht? Hier ändern“), die Menge bleibt erhalten und die Änderung gilt dauerhaft
- [x] Update-Problem auf dem iPhone (Version v6): Der Service Worker lädt jetzt online zuerst aus dem Netz, übernimmt neue Versionen sofort (skipWaiting) und lädt die App neu. Beim Vorab-Laden wird der HTTP-Zwischenspeicher umgangen. Neu: Version, „Auf Update prüfen“ und „Neu laden“ unter Profil → Daten. Die Logik ist per Node-Simulation getestet, ein echter Test auf dem iPhone steht aus
- [x] Version v7: Nährwerte eines gescannten oder eigenen Produkts stehen direkt als Felder in der Mengen-Eingabe (Vorschau rechnet live, Änderungen werden beim Eintragen dauerhaft gespeichert). Kalorien pro 100 g zeigen eine Nachkommastelle (1,5 statt 2) und werden beim Scan nicht mehr gerundet
- [x] Version v8: Start-Liste gekürzt auf Obst, Gemüse und Eier (35 Einträge, ein Ei = 50 g essbarer Anteil). Alle verpackten Produkte legt jeder selbst an (Scan oder von Hand). Bereits eingetragene Mahlzeiten und Gerichte bleiben unverändert, weil sie die Werte mitspeichern. Die Coach-Vorschläge nutzen zuerst die eigenen Lebensmittel. Die Texteingabe erkennt auch Mehrzahl und Wortanfang („Kartoffeln“)
- [x] Version v9: Start-Liste um Fleisch (Hähnchen, Pute, Schwein, Rind), Hackfleisch (Rind 15 % und 5 %, Schwein, gemischt, Pute), Fisch (Lachs, Forelle roh und geräuchert, Thunfisch, Kabeljau, Garnelen), weiteres Obst und Gemüse sowie Wasser, Kaffee und Tee erweitert (68 Einträge). Suchbegriffe wie „Huhn“ oder „Möhre“ finden die passenden Einträge. Die Werte sind Richtwerte, besonders bei Fett und Räucherware. Fettige Teile (Nacken, Bauch, Keule mit Haut) fehlen bewusst, die legt jeder selbst an
- [x] Version v10: Start-Liste gegen USDA FoodData Central (SR Legacy, 2018, Rohwerte) geprüft. 66 von 66 Einträgen stimmen jetzt mit der Quelle überein. Korrigiert: Ei (143 statt 155 kcal, roh), Hähnchenbrust (120 statt 110), Putenbrust (114 statt 105), Rindfleisch mager (Eiweiß 23,6 statt 21), Schweineschnitzel (jetzt „Keule, mager“, 120/21,8/2,9), Rinderhack 15 % (Fett 15), Gemischtes Hack (als 50:50 aus Rinder- und Schweinehack gerechnet), Kartoffel gekocht (86 statt 70), Honigmelone, Kopfsalat, Paprika, Avocado. Entfernt: Lachs und Forelle geräuchert, weil die Quelle nur Wildlachs-Lox (117 kcal) kennt und Supermarkt-Ware deutlich darüber liegt. Der Abgleich lief mit einem Skript außerhalb des Repos
- [x] Version v11: Fehler in der Auswertung behoben: Das Wasser wurde über alle 7 Tage geteilt, auch über Tage ohne Eintrag (2.000 ml an einem Tag ergaben 286 ml). Jetzt zählt der Durchschnitt nur Tage mit Wasser-Eintrag, wie bei den übrigen Werten. Der Coach bewertet Wasser nur noch, wenn welches eingetragen wurde
- [x] Training neu: Eingabe als Tabelle (Übung, Satz 1–3, mit „+ Satz“ bis 8), Datum, Plan per Auswahl. Trainings sind nachträglich änderbar und löschbar. Beim Eintragen zeigen graue Platzhalter die Sätze vom letzten Mal. Letzte 7 Tage sichtbar, ältere auf Klick mit Suche und seitenweiser Anzeige. Bestwerte eingeklappt
- [x] Neuer Reiter „Pläne“ unter Fortschritt: Plan anlegen, ändern, Übungen verschieben, Training aus Plan starten, „Diese Übungen als Plan speichern“ im Training. Gewichtsliste zeigt 7 Einträge, ältere auf Klick
- [x] Aufräumen unter Profil → Daten: Trainings älter als 1, 3, 6 oder 12 Monate auf Wunsch löschen. Es wird nichts automatisch gelöscht. Export und Import enthalten jetzt die Pläne
- [x] Version v12 (Rückmeldung vom iPhone-Test): (1) Training-Editor: Datum und Plan überlappen nicht mehr (gleich breite Spalten). (3) Mahlzeiten im Tagebuch sind konfigurierbar (an/aus, Reihenfolge, Umbenennen, eigene), ausgeschaltete mit Einträgen bleiben an ihrem Tag sichtbar. (4) Mengen in Stück: Umschalter Gramm/Stück, Gewicht pro Stück als Feld am Produkt, Umrechnung wird angezeigt (3 Stück × 35 g = 105 g), die letzte Einheit wird pro Produkt gemerkt. (5) „Als Gericht speichern“ erscheint nicht, wenn die Mahlzeit schon ein Gericht ist oder ein Gericht mit denselben Zutaten existiert. (6) Foto-Schätzung: Das voreingestellte Modell gemini-2.5-flash ist laut Googles Abkündigungsliste frühestens ab 16.10.2026 abgeschaltet. Die App sucht jetzt selbst ein verfügbares Flash-Modell (Standard „gemini-flash-latest“) und speichert es, es gibt einen Verbindungstest, einen Abbrechen-Knopf und eine Zeitanzeige, Zeitgrenze 60 Sekunden. (7) Design im Stil der iPhone-Apps. (8) Kochbuch startet ohne Liste, Suche oder Filter blenden Einträge ein
- [x] Version v13: Serie („Streak“) auf Wunsch eingebaut. Ein Tag zählt, wenn im Tagebuch etwas eingetragen oder ein Training mit diesem Datum gespeichert ist. Die Serie fällt auf 0, wenn ein ganzer Tag ohne Eintrag bleibt. Ist heute noch nichts eingetragen, zählt sie bis gestern und lebt bis zum Tagesende weiter („in Gefahr“-Anzeige). Anzeige im Tagebuch und in der Auswertung (Serie, längste Serie), einmal pro Tag eine kurze Meldung, Schalter unter Profil → Anzeige. Mitteilungen (Push) sind ohne eigenen Server auf dem iPhone nicht möglich und bewusst nicht gebaut, siehe Abschnitt 12
- [x] Version v14: Cardio im Training (Radfahren, Laufen, Spazieren, Schwimmen). Eigener Editor mit Aktivitäts-Kacheln, Dauer, Strecke (Schwimmen in Metern) und Intensität, Karten mit Dauer/Strecke/Kalorien, Auswertung (Cardio der letzten 7 Tage), Cardio zählt für die Serie. Kalorien: aktive Kalorien = (MET − 1) × kg × Stunden, MET-Werte aus dem Compendium of Physical Activities 2024 (pacompendium.com, Tabellen Bicycling, Running, Walking, Water activities). Mit Strecke wird das Tempo berechnet und der passende MET-Wert genommen, ohne Strecke gilt Locker/Mittel/Intensiv. Beschluss zu den Kalorien: Krafttraining und Cardio werden standardmäßig NICHT zum Tagesziel gezählt (der Aktivitätsfaktor deckt Training schon ab, sonst doppelt gezählt). Optional Profil → Ziele: Cardio zu 50 % oder 100 % zum Tagesziel addieren. Krafttraining zählt nie, sein Verbrauch ist kaum verlässlich zu schätzen
- [x] Version v15: Wassertropfen in der Tagesübersicht (füllt sich von unten, immer blau unabhängig von der Akzentfarbe, mit +250-ml-Knopf, „Ziel erreicht“). Zoom-Sperre auf dem iPhone: Ursache war, dass Eingabefelder in beschrifteten Bereichen nur 13 px Schrift hatten (iOS zoomt bei Feldern unter 16 px beim Antippen heran). Jetzt haben alle Felder mindestens 16 px (60 Felder in allen Ansichten geprüft), dazu touch-action: manipulation gegen Doppeltipp-Zoom und im Viewport maximum-scale=1 / user-scalable=no. Hinweis: Das verhindert auch das absichtliche Vergrößern per Spreizen. Schriftgröße lässt sich weiter in den iPhone-Einstellungen anpassen
- [ ] Foto-Schätzung mit echtem Schlüssel auf dem iPhone testen (Nutzer prüft, Verbindungstest unter Profil → Foto) (im Browser-Test war die Kamera gesperrt, es gab keinen Schlüssel)
- [ ] Test auf dem iPhone in Safari (steht noch aus)
- [ ] Hosting auf GitHub Pages (Repo ist angelegt, Pages-Einstellung noch offen)

## 11. Tagesziele: Standardwerte und Quellen

Alle Werte lassen sich im Profil ändern oder durch eigene Zahlen ersetzen.

| Ziel | Eiweiß Standard (üblicher Bereich) | Fett |
|---|---|---|
| Abnehmen | 2,2 g/kg (2,0–2,6) | 25 % der Kalorien (üblich 15–30 %) |
| Halten | 1,8 g/kg (1,6–2,0) | 25 % |
| Muskelaufbau | 1,8 g/kg (1,6–2,2) | 25 % |

- Kohlenhydrate sind der Rest der Kalorien.
- Beim Abnehmen kann das Eiweiß auf die Magermasse bezogen werden (Standard 2,5 g/kg, üblich 2,3–3,1). Dafür braucht es einen Körperfett-Wert.
- Fett hat eine Untergrenze von 0,6 g/kg. Das ist eine Vorsichtsregel, keine Studienangabe.
- Quellen: Morton et al. 2018 (https://pubmed.ncbi.nlm.nih.gov/28698222/), ISSN Position Stand Aragon et al. 2017 (https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0174-y), Helms et al. 2014, Iraki et al. 2019. Einzelne Zahlen (z. B. 2,2 g/kg als vorsichtiger Wert) konnte ich nicht am Originaltext prüfen.
- Die Bedienung orientiert sich an gängigen Mustern (Suche zuerst, „Zuletzt benutzt“, Favoriten, wenige Reiter). Unabhängige Vergleichstests von Yazio und anderen Apps habe ich nicht gefunden.

## 10. Gewichtstrend: Schwellen und Quellen

Die Werte beziehen sich auf das Körpergewicht pro Woche. Die Rate entspricht der Differenz des
7-Tage-Mittels zum Mittel der Woche davor.

| Ziel | Zielbereich | Warnung "zu langsam" | Warnung "zu schnell" |
|---|---|---|---|
| Abnehmen | −0,5 bis −1 % | über −0,5 % | unter −1 % |
| Muskelaufbau | +0,25 bis +0,5 % | unter +0,25 % | über +0,5 % |
| Halten | ±0,5 % | – | über ±0,5 % |

Quellen:
- Helms, Aragon, Fitschen (2014): Evidence-based recommendations for natural bodybuilding contest preparation. JISSN. https://pubmed.ncbi.nlm.nih.gov/24864135 — Abnehmen 0,5 bis 1 % pro Woche zum Muskelerhalt.
- Iraki, Fitschen, Espinar, Helms (2019): Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review. Sports. https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/ — Zunahme 0,25 bis 0,5 % pro Woche für Fortgeschrittene.

Einschränkung: Die Datenlage speziell für natural Bodybuilder ist dünn. Die Werte sind praxisnahe
Richtwerte aus Übersichtsarbeiten, keine harten Grenzen. Wassereinlagerungen können die 7-Tage-Werte verzerren.

## 8. Offene Fragen an dich

- Soll das Repo öffentlich sein (nötig für kostenloses GitHub Pages)?
- Welche Lebensmittel sollen in der Start-Liste sein? Aktuell ist es eine kleine Auswahl mit Richtwerten.
- Soll der Coach mit Ampel-Farben arbeiten oder nur mit Text?

## 9. Backlog (nicht im ersten Durchgang)

- Barcode-Scan mit Open Food Facts
- Rezepte mit Zutaten und automatischer Berechnung pro Portion
- Fasten-Timer
- Export als CSV für Auswertungen in Tabellenprogrammen
- Icon als PNG für den iPhone-Home-Bildschirm

## 12. Mitteilungen zur Serie (Push)

Stand: nicht umgesetzt. Gründe:
- Eine Web-App auf dem iPhone kann zeitgesteuerte Mitteilungen nur über echten Web-Push bekommen. Dafür muss ein Server die Nachricht an Apples Push-Dienst schicken. Die App hat keinen Server, alle Daten bleiben lokal.
- Zeitgesteuerte lokale Mitteilungen ohne Server gibt es in Browsern nicht.
- Ein Push-Server bräuchte pro Nutzer gespeicherte Geräteadressen und müsste wissen, ob heute schon getrackt wurde. Das widerspricht dem Ziel, nichts außerhalb des Geräts zu speichern.

Möglichkeiten:
1. Ohne Server (aktuell): Erinnerung in der Erinnerungen-App oder Uhr-App des iPhones. Steht als Hinweis unter Profil → Anzeige.
2. Mit eigenem kleinen Server (z. B. Cloudflare Worker mit Zeitplan): echter Push mit Text wie „Deine Serie: 5 Tage“. Aufwand und Datenschutz müssen vorher entschieden werden.
