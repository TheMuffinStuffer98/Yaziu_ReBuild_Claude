// Start-Liste: nur Frisches ohne Barcode (Eier, Obst, Gemüse, Fleisch und Fisch von der Theke, Getränke ohne Kalorien).
// Alles Verpackte legt jeder selbst an, per Barcode-Scan oder von Hand, weil sich Marken in den Werten unterscheiden.
// Werte pro 100 g, Fleisch und Fisch roh bzw. wie benannt. Gerundete Richtwerte aus gängigen Nährwerttabellen (u. a. USDA).
// Fettgehalt und Zuschnitt schwanken stark. Für genaue Werte das eigene Produkt anlegen.
// piece = Gewicht eines Stücks in g (für Eingaben wie "2 Eier"). alias = weitere Suchbegriffe, klein geschrieben.
const Foods = (() => {
  const F = (id, name, kcal, p, f, c, piece = null, alias = '') => ({
    id, name, kcal, p, f, c, piece, alias,
  });

  const builtin = [
    // Eier. Ein Ei der Größe M wiegt mit Schale etwa 58 g, essbar sind etwa 50 g.
    F('ei', 'Ei', 155, 13, 11, 1.1, 50, 'eier hühnerei'),
    F('eiklar', 'Eiklar', 52, 11, 0.2, 0.7, 33, 'eiweiß eiweiss'),

    // Geflügel
    F('huhn-brust', 'Hähnchenbrust', 110, 23, 1.5, 0, null, 'huhn hühnchen chicken hähnchen'),
    F('huhn-schenkel', 'Hähnchenschenkel ohne Haut', 121, 20, 4, 0, null, 'huhn hühnchen keule chicken hähnchen'),
    F('pute-brust', 'Putenbrust', 105, 24, 1, 0, null, 'pute truthahn putenschnitzel'),

    // Schwein und Rind (mageres Muskelfleisch)
    F('schwein-filet', 'Schweinefilet', 110, 22, 2, 0, null, 'schwein'),
    F('schwein-schnitzel', 'Schweineschnitzel (Oberschale)', 108, 21.5, 2, 0, null, 'schwein'),
    F('rind-mager', 'Rindfleisch mager (Steak, Gulasch)', 120, 21, 3.5, 0, null, 'rind rindersteak rumpsteak gulasch'),

    // Hackfleisch (roh)
    F('hack-rind', 'Rinderhack (15 % Fett)', 215, 18.6, 14, 0, null, 'hackfleisch rind'),
    F('hack-rind-mager', 'Rinderhack mager (5 % Fett)', 137, 21.4, 5, 0, null, 'hackfleisch rind tatar'),
    F('hack-schwein', 'Schweinehack (20 % Fett)', 260, 17, 21, 0, null, 'hackfleisch schwein'),
    F('hack-gemischt', 'Gemischtes Hack (Rind/Schwein)', 237, 18, 17.5, 0, null, 'hackfleisch halb halb gemischt'),
    F('hack-pute', 'Putenhack (ca. 8 % Fett)', 150, 19, 8, 0, null, 'hackfleisch pute'),

    // Fisch und Meeresfrüchte
    F('lachs-roh', 'Lachs roh', 208, 20, 13, 0, null, 'lachsfilet salmon fisch'),
    F('lachs-geraeuchert', 'Lachs geräuchert', 180, 22, 10, 0, null, 'räucherlachs fisch'),
    F('forelle-roh', 'Forelle roh', 141, 20, 6, 0, null, 'fisch'),
    F('forelle-geraeuchert', 'Forelle geräuchert', 160, 23, 7, 0, null, 'räucherforelle fisch'),
    F('thunfisch-roh', 'Thunfisch roh (Steak)', 109, 24, 0.5, 0, null, 'fisch'),
    F('kabeljau-roh', 'Kabeljau roh', 82, 18, 0.7, 0, null, 'dorsch fisch'),
    F('garnelen-roh', 'Garnelen roh', 85, 20, 0.5, 0.2, null, 'shrimps krabben meeresfrüchte'),

    // Obst
    F('apfel', 'Apfel', 52, 0.3, 0.2, 14, 180),
    F('banane', 'Banane', 89, 1.1, 0.3, 23, 120),
    F('birne', 'Birne', 57, 0.4, 0.1, 15, 170),
    F('orange', 'Orange', 47, 0.9, 0.1, 12, 150),
    F('mandarine', 'Mandarine', 53, 0.8, 0.3, 13, 80, 'clementine'),
    F('grapefruit', 'Grapefruit', 42, 0.8, 0.1, 10.7, 200),
    F('zitrone', 'Zitrone', 29, 1.1, 0.3, 9.3, 80),
    F('weintrauben', 'Weintrauben', 69, 0.7, 0.2, 18, null, 'trauben'),
    F('kirschen', 'Kirschen', 63, 1.1, 0.2, 16),
    F('pflaume', 'Pflaume', 46, 0.7, 0.3, 11.4, 50, 'zwetschge'),
    F('pfirsich', 'Pfirsich', 39, 0.9, 0.3, 9.5, 150, 'nektarine'),
    F('erdbeeren', 'Erdbeeren', 32, 0.7, 0.3, 7.7),
    F('blaubeeren', 'Blaubeeren', 57, 0.7, 0.3, 14.5, null, 'heidelbeeren'),
    F('himbeeren', 'Himbeeren', 52, 1.2, 0.7, 11.9),
    F('kiwi', 'Kiwi', 61, 1.1, 0.5, 14.7, 75),
    F('ananas', 'Ananas', 50, 0.5, 0.1, 13),
    F('mango', 'Mango', 60, 0.8, 0.4, 15),
    F('melone', 'Wassermelone', 30, 0.6, 0.2, 7.6),
    F('honigmelone', 'Honigmelone', 34, 0.8, 0.2, 8.2),
    F('avocado', 'Avocado', 160, 2, 15, 9, 140),

    // Gemüse
    F('brokkoli', 'Brokkoli', 34, 2.8, 0.4, 6.6),
    F('blumenkohl', 'Blumenkohl', 25, 1.9, 0.3, 5),
    F('rosenkohl', 'Rosenkohl', 43, 3.4, 0.3, 9),
    F('weisskohl', 'Weißkohl', 25, 1.4, 0.1, 5.8),
    F('kohlrabi', 'Kohlrabi', 27, 1.7, 0.1, 6.2),
    F('spinat', 'Spinat', 23, 2.9, 0.4, 3.6),
    F('salat', 'Kopfsalat', 15, 1.4, 0.2, 2.9),
    F('tomate', 'Tomate', 18, 0.9, 0.2, 3.9, 100),
    F('gurke', 'Gurke', 15, 0.7, 0.1, 3.6),
    F('paprika', 'Paprika rot', 31, 1, 0.3, 6, 150),
    F('karotte', 'Karotte', 41, 0.9, 0.2, 9.6, 80, 'möhre'),
    F('rote-bete', 'Rote Bete', 43, 1.6, 0.2, 9.6),
    F('radieschen', 'Radieschen', 16, 0.7, 0.1, 3.4),
    F('fenchel', 'Fenchel', 31, 1.2, 0.2, 7.3),
    F('sellerie', 'Staudensellerie', 14, 0.7, 0.2, 3),
    F('zucchini', 'Zucchini', 17, 1.2, 0.3, 3.1),
    F('aubergine', 'Aubergine', 25, 1, 0.2, 6),
    F('bohnen', 'Grüne Bohnen', 31, 1.8, 0.2, 7),
    F('spargel', 'Spargel', 20, 2.2, 0.1, 3.9),
    F('champignons', 'Champignons', 22, 3.1, 0.3, 3.3, null, 'pilze'),
    F('zwiebel', 'Zwiebel', 40, 1.1, 0.1, 9.3, 80),
    F('kuerbis', 'Kürbis', 26, 1, 0.1, 6.5, null, 'hokkaido'),
    F('kartoffel-roh', 'Kartoffel roh', 77, 2, 0.1, 17.5, 100),
    F('kartoffel', 'Kartoffel gekocht', 70, 2, 0.1, 15),
    F('suesskartoffel', 'Süßkartoffel roh', 86, 1.6, 0.1, 20),

    // Getränke ohne nennenswerte Kalorien (1 ml ≈ 1 g)
    F('wasser', 'Wasser', 0, 0, 0, 0, 250, 'mineralwasser leitungswasser'),
    F('kaffee', 'Kaffee schwarz', 2, 0.1, 0, 0, 200),
    F('tee', 'Tee ungesüßt', 1, 0, 0, 0.2, 200),
  ];

  // Alle Lebensmittel: Start-Liste plus die eigenen Einträge des Profils
  const list = (custom = []) => [...builtin, ...custom];

  return { builtin, list };
})();
