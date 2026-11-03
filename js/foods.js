// Start-Liste: nur Frisches ohne Barcode (Eier, Obst, Gemüse, Fleisch und Fisch von der Theke, Getränke ohne Kalorien).
// Alles Verpackte legt jeder selbst an, per Barcode-Scan oder von Hand, weil sich Marken in den Werten unterscheiden.
//
// Quelle: USDA FoodData Central, Datensatz "SR Legacy" (2018), Rohwerte pro 100 g, auf eine Nachkommastelle gerundet.
// Abgeglichen am 04.11.2026. Ausnahme: "Gemischtes Hack" ist als 50:50-Mittel aus Rinder- und Schweinehack gerechnet.
// Hinweis: Deutsche Tabellen (BLS) und Packungsangaben liegen bei Geflügel oft etwas niedriger.
// Geräucherter Fisch fehlt bewusst: In der Quelle gibt es nur Wildlachs-Lox (117 kcal), der Zuchtlachs aus dem
// Supermarkt liegt deutlich höher. Wer ihn braucht, scannt das Produkt.
//
// piece = Gewicht eines Stücks in g (für Eingaben wie "2 Eier"). alias = weitere Suchbegriffe, klein geschrieben.
const Foods = (() => {
  const F = (id, name, kcal, p, f, c, piece = null, alias = '') => ({
    id, name, kcal, p, f, c, piece, alias,
  });

  const builtin = [
    // Eier (roh). Ein Ei der Größe M wiegt mit Schale etwa 58 g, essbar sind etwa 50 g.
    F('ei', 'Ei', 143, 12.6, 9.5, 0.7, 50, 'eier hühnerei'),
    F('eiklar', 'Eiklar', 52, 10.9, 0.2, 0.7, 33, 'eiweiß eiweiss'),

    // Geflügel
    F('huhn-brust', 'Hähnchenbrust', 120, 22.5, 2.6, 0, null, 'huhn hühnchen chicken hähnchen'),
    F('huhn-schenkel', 'Hähnchenschenkel ohne Haut', 121, 19.7, 4.1, 0, null, 'huhn hühnchen keule chicken hähnchen'),
    F('pute-brust', 'Putenbrust', 114, 23.7, 1.5, 0, null, 'pute truthahn putenschnitzel'),

    // Schwein und Rind (mageres Muskelfleisch)
    F('schwein-filet', 'Schweinefilet', 109, 21, 2.2, 0, null, 'schwein'),
    F('schwein-schnitzel', 'Schweineschnitzel (Keule, mager)', 120, 21.8, 2.9, 0, null, 'schwein keule oberschale'),
    F('rind-mager', 'Rindfleisch mager (Steak, Gulasch)', 120, 23.6, 2.9, 0, null, 'rind rindersteak rumpsteak gulasch'),

    // Hackfleisch (roh)
    F('hack-rind', 'Rinderhack (15 % Fett)', 215, 18.6, 15, 0, null, 'hackfleisch rind'),
    F('hack-rind-mager', 'Rinderhack mager (5 % Fett)', 137, 21.4, 5, 0, null, 'hackfleisch rind tatar'),
    F('hack-schwein', 'Schweinehack (20 % Fett)', 263, 16.9, 21.2, 0, null, 'hackfleisch schwein'),
    F('hack-gemischt', 'Gemischtes Hack (Rind/Schwein)', 239, 17.7, 18.1, 0, null, 'hackfleisch halb halb gemischt'),
    F('hack-pute', 'Putenhack (ca. 8 % Fett)', 148, 19.7, 7.7, 0, null, 'hackfleisch pute'),

    // Fisch und Meeresfrüchte (roh)
    F('lachs-roh', 'Lachs roh', 208, 20.4, 13.4, 0, null, 'lachsfilet salmon fisch'),
    F('forelle-roh', 'Forelle roh', 141, 19.9, 6.2, 0, null, 'fisch'),
    F('thunfisch-roh', 'Thunfisch roh (Steak)', 109, 24.4, 0.5, 0, null, 'fisch'),
    F('kabeljau-roh', 'Kabeljau roh', 82, 17.8, 0.7, 0, null, 'dorsch fisch'),
    F('garnelen-roh', 'Garnelen roh', 85, 20.1, 0.5, 0, null, 'shrimps krabben meeresfrüchte'),

    // Obst
    F('apfel', 'Apfel', 52, 0.3, 0.2, 13.8, 180),
    F('banane', 'Banane', 89, 1.1, 0.3, 22.8, 120),
    F('birne', 'Birne', 57, 0.4, 0.1, 15.2, 170),
    F('orange', 'Orange', 47, 0.9, 0.1, 11.8, 150),
    F('mandarine', 'Mandarine', 53, 0.8, 0.3, 13.3, 80, 'clementine'),
    F('grapefruit', 'Grapefruit (rosa)', 42, 0.8, 0.1, 10.7, 200),
    F('zitrone', 'Zitrone', 29, 1.1, 0.3, 9.3, 80),
    F('weintrauben', 'Weintrauben', 69, 0.7, 0.2, 18.1, null, 'trauben'),
    F('kirschen', 'Kirschen', 63, 1.1, 0.2, 16),
    F('pflaume', 'Pflaume', 46, 0.7, 0.3, 11.4, 50, 'zwetschge'),
    F('pfirsich', 'Pfirsich', 39, 0.9, 0.3, 9.5, 150, 'nektarine'),
    F('erdbeeren', 'Erdbeeren', 32, 0.7, 0.3, 7.7),
    F('blaubeeren', 'Blaubeeren', 57, 0.7, 0.3, 14.5, null, 'heidelbeeren'),
    F('himbeeren', 'Himbeeren', 52, 1.2, 0.7, 11.9),
    F('kiwi', 'Kiwi', 61, 1.1, 0.5, 14.7, 75),
    F('ananas', 'Ananas', 50, 0.5, 0.1, 13.1),
    F('mango', 'Mango', 60, 0.8, 0.4, 15),
    F('melone', 'Wassermelone', 30, 0.6, 0.2, 7.6),
    F('honigmelone', 'Honigmelone', 36, 0.5, 0.1, 9.1),
    F('avocado', 'Avocado', 160, 2, 14.7, 8.5, 140),

    // Gemüse
    F('brokkoli', 'Brokkoli', 34, 2.8, 0.4, 6.6),
    F('blumenkohl', 'Blumenkohl', 25, 1.9, 0.3, 5),
    F('rosenkohl', 'Rosenkohl', 43, 3.4, 0.3, 9),
    F('weisskohl', 'Weißkohl', 25, 1.3, 0.1, 5.8),
    F('kohlrabi', 'Kohlrabi', 27, 1.7, 0.1, 6.2),
    F('spinat', 'Spinat', 23, 2.9, 0.4, 3.6),
    F('salat', 'Kopfsalat', 13, 1.4, 0.2, 2.2),
    F('tomate', 'Tomate', 18, 0.9, 0.2, 3.9, 100),
    F('gurke', 'Gurke', 15, 0.7, 0.1, 3.6),
    F('paprika', 'Paprika rot', 26, 1, 0.3, 6, 150),
    F('karotte', 'Karotte', 41, 0.9, 0.2, 9.6, 80, 'möhre'),
    F('rote-bete', 'Rote Bete', 43, 1.6, 0.2, 9.6),
    F('radieschen', 'Radieschen', 16, 0.7, 0.1, 3.4),
    F('fenchel', 'Fenchel', 31, 1.2, 0.2, 7.3),
    F('sellerie', 'Staudensellerie', 14, 0.7, 0.2, 3),
    F('zucchini', 'Zucchini', 17, 1.2, 0.3, 3.1),
    F('aubergine', 'Aubergine', 25, 1, 0.2, 5.9),
    F('bohnen', 'Grüne Bohnen', 31, 1.8, 0.2, 7),
    F('spargel', 'Spargel', 20, 2.2, 0.1, 3.9),
    F('champignons', 'Champignons', 22, 3.1, 0.3, 3.3, null, 'pilze'),
    F('zwiebel', 'Zwiebel', 40, 1.1, 0.1, 9.3, 80),
    F('kuerbis', 'Kürbis', 26, 1, 0.1, 6.5),
    F('kartoffel-roh', 'Kartoffel roh', 77, 2.1, 0.1, 17.5, 100),
    F('kartoffel', 'Kartoffel gekocht', 86, 1.7, 0.1, 20),
    F('suesskartoffel', 'Süßkartoffel roh', 86, 1.6, 0.1, 20.1),

    // Getränke ohne nennenswerte Kalorien (1 ml ≈ 1 g)
    F('wasser', 'Wasser', 0, 0, 0, 0, 250, 'mineralwasser leitungswasser'),
    F('kaffee', 'Kaffee schwarz', 1, 0.1, 0, 0, 200),
    F('tee', 'Tee ungesüßt', 1, 0, 0, 0.3, 200),
  ];

  // Alle Lebensmittel: Start-Liste plus die eigenen Einträge des Profils
  const list = (custom = []) => [...builtin, ...custom];

  return { builtin, list };
})();
