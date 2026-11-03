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
- [ ] Foto-Schätzung mit echtem Schlüssel auf dem iPhone testen (Nutzer prüft) (im Browser-Test war die Kamera gesperrt, es gab keinen Schlüssel)
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
