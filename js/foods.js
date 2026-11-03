// Start-Liste: nur Frisches ohne Barcode (Obst, Gemüse, Eier). Alles andere legt jeder selbst an,
// per Barcode-Scan oder von Hand, weil sich Marken in den Werten unterscheiden.
// Werte pro 100 g (essbarer Anteil), gerundete Richtwerte aus gängigen Nährwerttabellen (u. a. USDA).
// piece = Gewicht eines Stücks in g (für Eingaben wie "2 Eier").
const Foods = (() => {
  const F = (id, name, kcal, p, f, c, piece = null) => ({ id, name, kcal, p, f, c, piece });

  const builtin = [
    // Eier. Ein Ei der Größe M wiegt mit Schale etwa 58 g, essbar sind etwa 50 g.
    F('ei', 'Ei', 155, 13, 11, 1.1, 50),
    F('eiklar', 'Eiklar', 52, 11, 0.2, 0.7, 33),
    // Obst
    F('apfel', 'Apfel', 52, 0.3, 0.2, 14, 180),
    F('banane', 'Banane', 89, 1.1, 0.3, 23, 120),
    F('birne', 'Birne', 57, 0.4, 0.1, 15, 170),
    F('orange', 'Orange', 47, 0.9, 0.1, 12, 150),
    F('mandarine', 'Mandarine', 53, 0.8, 0.3, 13, 80),
    F('weintrauben', 'Weintrauben', 69, 0.7, 0.2, 18),
    F('erdbeeren', 'Erdbeeren', 32, 0.7, 0.3, 7.7),
    F('blaubeeren', 'Blaubeeren', 57, 0.7, 0.3, 14.5),
    F('himbeeren', 'Himbeeren', 52, 1.2, 0.7, 11.9),
    F('kiwi', 'Kiwi', 61, 1.1, 0.5, 14.7, 75),
    F('ananas', 'Ananas', 50, 0.5, 0.1, 13),
    F('mango', 'Mango', 60, 0.8, 0.4, 15),
    F('melone', 'Wassermelone', 30, 0.6, 0.2, 7.6),
    F('pfirsich', 'Pfirsich', 39, 0.9, 0.3, 9.5, 150),
    F('avocado', 'Avocado', 160, 2, 15, 9, 140),
    // Gemüse
    F('brokkoli', 'Brokkoli', 34, 2.8, 0.4, 6.6),
    F('blumenkohl', 'Blumenkohl', 25, 1.9, 0.3, 5),
    F('spinat', 'Spinat', 23, 2.9, 0.4, 3.6),
    F('tomate', 'Tomate', 18, 0.9, 0.2, 3.9, 100),
    F('gurke', 'Gurke', 15, 0.7, 0.1, 3.6),
    F('paprika', 'Paprika rot', 31, 1, 0.3, 6, 150),
    F('karotte', 'Karotte', 41, 0.9, 0.2, 9.6, 80),
    F('zucchini', 'Zucchini', 17, 1.2, 0.3, 3.1),
    F('zwiebel', 'Zwiebel', 40, 1.1, 0.1, 9.3, 80),
    F('champignons', 'Champignons', 22, 3.1, 0.3, 3.3),
    F('salat', 'Kopfsalat', 15, 1.4, 0.2, 2.9),
    F('aubergine', 'Aubergine', 25, 1, 0.2, 6),
    F('spargel', 'Spargel', 20, 2.2, 0.1, 3.9),
    F('kuerbis', 'Kürbis', 26, 1, 0.1, 6.5),
    F('weisskohl', 'Weißkohl', 25, 1.4, 0.1, 5.8),
    F('kartoffel-roh', 'Kartoffel roh', 77, 2, 0.1, 17.5, 100),
    F('kartoffel', 'Kartoffel gekocht', 70, 2, 0.1, 15),
    F('suesskartoffel', 'Süßkartoffel roh', 86, 1.6, 0.1, 20),
  ];

  // Alle Lebensmittel: Start-Liste plus die eigenen Einträge des Profils
  const list = (custom = []) => [...builtin, ...custom];

  return { builtin, list };
})();
