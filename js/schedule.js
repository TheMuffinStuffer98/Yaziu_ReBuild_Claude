// Trainingszeitplan: welcher Plan an welchem Tag dran ist. Reine Logik ohne Oberfläche.
//
// Ein Zeitplan sc hat die Form
//   { mode: 'week' | 'cycle', week: [7 Einträge Mo..So], cycle: [Einträge Tag 1..n], anchor: 'JJJJ-MM-TT',
//     shifts: [Datum, ...], moves: [{ from, to }], skips: { 'Datum|Schlüssel': true }, time: 'HH:MM' }
// Ein Eintrag (slot) ist null (Ruhetag), { kind: 'plan', planId } oder { kind: 'cardio', activity, minutes }.
//
// Wochentage: jeder Wochentag hat seinen Eintrag. Rotation: Tag 1..n wiederholen sich ab dem Startdatum anchor.
// Verschieben: Bei der Rotation rutscht der ganze Rest nach hinten (shifts), bei Wochentagen wird nur der
// einzelne Termin auf einen anderen Tag gelegt (moves).
const Schedule = (() => {
  const DAY = 86400000;
  const toNum = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
  const fromNum = (k) => new Date(k * DAY).toISOString().slice(0, 10);
  const add = (s, k) => fromNum(toNum(s) + k);
  const mod = (a, m) => ((a % m) + m) % m;
  // Montag = 1 … Sonntag = 7 (der 1.1.1970 war ein Donnerstag)
  const dow = (s) => mod(toNum(s) + 3, 7) + 1;
  const mondayOf = (s) => add(s, 1 - dow(s));

  const keyOf = (slot) => (slot.kind === 'plan' ? slot.planId : 'cardio');
  const skipKey = (date, slot) => `${date}|${keyOf(slot)}`;

  // Position in der Rotation. Jede Verschiebung ab einem Datum schiebt die Rotation um einen Tag zurück.
  function cycleIndex(sc, date) {
    const shifts = (sc.shifts || []).filter((d) => d <= date).length;
    return toNum(date) - toNum(sc.anchor) - shifts;
  }

  // Der ursprünglich geplante Eintrag an einem Tag (ohne Verschiebungen von Terminen)
  function baseSlot(sc, date) {
    if (!sc) return null;
    if (sc.mode === 'cycle') {
      const days = sc.cycle || [];
      if (!days.length || !sc.anchor || date < sc.anchor) return null;
      return days[mod(cycleIndex(sc, date), days.length)] || null;
    }
    return (sc.week || [])[dow(date) - 1] || null;
  }

  // Alle Termine eines Tages. exists(planId) sagt, ob es den Plan noch gibt.
  function slotsFor(sc, date, exists = () => true) {
    if (!sc) return [];
    const ok = (s) => s && (s.kind === 'cardio' || exists(s.planId));
    const moves = sc.moves || [];
    const out = [];
    const base = baseSlot(sc, date);
    if (ok(base) && !moves.some((m) => m.from === date)) out.push({ ...base });
    moves.filter((m) => m.to === date).forEach((m) => {
      const s = baseSlot(sc, m.from);
      if (ok(s)) out.push({ ...s, from: m.from });
    });
    return out;
  }

  const matches = (slot, w) => (slot.kind === 'cardio' ? w.type === 'cardio' : w.planId === slot.planId);

  // done | skip | open (heute) | missed (vorbei) | later (kommt noch)
  function statusOf(sc, date, slot, workouts, today) {
    if (workouts.some((w) => w.date === date && matches(slot, w))) return 'done';
    if ((sc.skips || {})[skipKey(date, slot)]) return 'skip';
    if (date > today) return 'later';
    return date === today ? 'open' : 'missed';
  }

  function dayInfo(sc, date, workouts, today, exists) {
    return {
      date,
      slots: slotsFor(sc, date, exists).map((slot) => ({ slot, status: statusOf(sc, date, slot, workouts, today) })),
    };
  }

  // Montag bis Sonntag der Woche, in der today liegt
  function week(sc, today, workouts, exists) {
    const mon = mondayOf(today);
    return Array.from({ length: 7 }, (_, i) => dayInfo(sc, add(mon, i), workouts, today, exists));
  }

  // Verpasste Termine der letzten Tage, neueste zuerst
  function missed(sc, today, workouts, exists, days = 7) {
    const out = [];
    for (let i = 1; i <= days; i += 1) {
      const date = add(today, -i);
      dayInfo(sc, date, workouts, today, exists).slots
        .filter((x) => x.status === 'missed')
        .forEach((x) => out.push({ date, slot: x.slot }));
    }
    return out;
  }

  // Nächster Tag nach today mit mindestens einem Termin (für „als Nächstes“)
  function next(sc, today, workouts, exists, days = 14) {
    for (let i = 1; i <= days; i += 1) {
      const info = dayInfo(sc, add(today, i), workouts, today, exists);
      if (info.slots.length) return info;
    }
    return null;
  }

  const clone = (sc) => JSON.parse(JSON.stringify(sc));

  // Legt den Termin von fromDate auf toDate. Bei der Rotation rutscht dafür der Rest ab toDate nach hinten.
  // Gibt den neuen Zeitplan zurück oder null, wenn es nichts zu verschieben gibt.
  function move(sc, fromDate, toDate, slot) {
    const next2 = clone(sc);
    // Ein Termin wird höchstens einmal verschoben: frühere Verschiebung desselben Ausgangstags ersetzen
    next2.moves = (next2.moves || []).filter((m) => m.from !== fromDate);
    next2.skips = next2.skips || {};
    if (sc.mode === 'cycle') {
      const len = (sc.cycle || []).length;
      if (!len) return null;
      const k = mod(cycleIndex(sc, toDate) - cycleIndex(sc, fromDate), len);
      if (!k) return null;
      next2.shifts = [...(sc.shifts || []), ...Array(k).fill(toDate)];
    } else if (slotsFor(sc, toDate).some((s) => s.kind === slot.kind && keyOf(s) === keyOf(slot))) {
      return null;
    }
    next2.moves.push({ from: fromDate, to: sc.mode === 'cycle' ? null : toDate });
    return next2;
  }

  function skip(sc, date, slot) {
    const next2 = clone(sc);
    next2.skips = { ...(next2.skips || {}), [skipKey(date, slot)]: true };
    return next2;
  }

  // Kalenderdatei (iCalendar) mit wiederkehrenden Terminen und Erinnerung zur gewählten Uhrzeit.
  // label(slot) liefert den Titel eines Termins. Verschiebungen sind darin nicht enthalten.
  function ics(sc, label, today, stamp) {
    const time = /^\d\d:\d\d$/.test(sc.time || '') ? sc.time : '18:00';
    const hhmm = time.replace(':', '');
    const compact = (s) => s.replace(/-/g, '');
    const endTime = (() => {
      const k = (+time.slice(0, 2)) * 60 + (+time.slice(3)) + 60;
      return String(Math.floor((k % 1440) / 60)).padStart(2, '0') + String(k % 60).padStart(2, '0');
    })();
    const esc = (t) => String(t).replace(/([,;\\])/g, '\\$1');
    const events = [];
    const push = (id, start, rule, title) => {
      events.push(['BEGIN:VEVENT', `UID:${id}@fitness-tagebuch`, `DTSTAMP:${stamp}`,
        `DTSTART:${compact(start)}T${hhmm}00`, `DTEND:${compact(start)}T${endTime}00`, `RRULE:${rule}`,
        `SUMMARY:${esc(title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT0M', 'END:VALARM',
        'END:VEVENT'].join('\r\n'));
    };
    if (sc.mode === 'cycle') {
      const days = sc.cycle || [];
      days.forEach((slot, i) => {
        if (slot) push(`z${i}-${sc.anchor}`, add(sc.anchor, i), `FREQ=DAILY;INTERVAL=${days.length}`, label(slot));
      });
    } else {
      const mon = mondayOf(today);
      const byday = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      (sc.week || []).forEach((slot, i) => {
        // Erster Termin ist das nächste Vorkommen ab heute, nicht ein Tag dieser Woche in der Vergangenheit
        const first = add(mon, i) < today ? add(mon, i + 7) : add(mon, i);
        if (slot) push(`w${i}`, first, `FREQ=WEEKLY;BYDAY=${byday[i]}`, label(slot));
      });
    }
    if (!events.length) return '';
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fitness-Tagebuch//DE', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  return {
    add, dow, mondayOf, keyOf, slotsFor, statusOf, dayInfo, week, missed, next, move, skip, ics,
  };
})();
