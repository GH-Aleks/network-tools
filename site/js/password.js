/*
 * Passwort-Generator: Logik ohne DOM. Zufall kommt ausschliesslich aus
 * crypto.getRandomValues (nie aus Math.random). Nichts wird gespeichert.
 * Die Zufallsquelle ist austauschbar, damit sich die Logik mit Node testen laesst.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Password = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?'
  };
  // Zeichen, die in vielen Schriftarten leicht verwechselt werden
  var AMBIGUOUS = '0Oo1lI|';
  var MIN_LENGTH = 4;
  var MAX_LENGTH = 128;

  function defaultFill(arr) {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || typeof c.getRandomValues !== 'function') {
      throw new Error('crypto.getRandomValues ist in diesem Browser nicht verfügbar.');
    }
    return c.getRandomValues(arr);
  }

  /** Gleichverteilte Zufallszahl 0..max-1 ohne Modulo-Verzerrung (Rejection Sampling). */
  function randomInt(max, fill) {
    if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new RangeError('max ausserhalb des Bereichs');
    fill = fill || defaultFill;
    var limit = Math.floor(0x100000000 / max) * max; // groesstes Vielfaches von max <= 2^32
    var buf = new Uint32Array(1);
    do {
      fill(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function shuffle(arr, fill) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randomInt(i + 1, fill);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function filterChars(chars, excludeAmbiguous) {
    if (!excludeAmbiguous) return chars;
    return chars.split('').filter(function (ch) { return AMBIGUOUS.indexOf(ch) === -1; }).join('');
  }

  /** Aktive Zeichengruppen (nach Ausschluss mehrdeutiger Zeichen). */
  function activeSets(opts) {
    var out = [];
    ['lower', 'upper', 'digits', 'symbols'].forEach(function (k) {
      if (opts[k]) out.push(filterChars(SETS[k], opts.excludeAmbiguous));
    });
    return out;
  }

  function poolSize(opts) {
    return activeSets(opts).reduce(function (n, s) { return n + s.length; }, 0);
  }

  /** Rechnerische Entropie in Bit: Laenge x log2(Zeichenvorrat). */
  function entropyBits(length, pool) {
    if (!pool || pool < 2 || !length) return 0;
    return length * Math.log2(pool);
  }

  function strengthLabel(bits) {
    if (bits < 40) return 'schwach';
    if (bits < 64) return 'mäßig';
    if (bits < 100) return 'gut';
    return 'sehr stark';
  }

  /**
   * opts: {length, lower, upper, digits, symbols, excludeAmbiguous}; fill optional (Tests).
   * Aus jeder gewaehlten Gruppe kommt mindestens ein Zeichen vor; die restlichen
   * Stellen werden gleichverteilt aus dem gesamten Vorrat gezogen, danach wird gemischt.
   * Ergebnis: {ok:true, password, pool, entropy, strength} oder {ok:false, error}.
   */
  function generate(opts, fill) {
    var length = Number(opts.length);
    if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
      return { ok: false, error: 'Die Länge muss zwischen ' + MIN_LENGTH + ' und ' + MAX_LENGTH + ' liegen.' };
    }
    var sets = activeSets(opts);
    if (sets.length === 0) return { ok: false, error: 'Bitte mindestens eine Zeichengruppe auswählen.' };
    if (length < sets.length) return { ok: false, error: 'Die Länge reicht nicht für alle gewählten Zeichengruppen.' };

    var all = sets.join('');
    var chars = [];
    sets.forEach(function (s) { chars.push(s.charAt(randomInt(s.length, fill))); });
    while (chars.length < length) chars.push(all.charAt(randomInt(all.length, fill)));
    shuffle(chars, fill);

    var bits = entropyBits(length, all.length);
    return {
      ok: true,
      password: chars.join(''),
      pool: all.length,
      entropy: bits,
      strength: strengthLabel(bits)
    };
  }

  return {
    SETS: SETS,
    AMBIGUOUS: AMBIGUOUS,
    MIN_LENGTH: MIN_LENGTH,
    MAX_LENGTH: MAX_LENGTH,
    randomInt: randomInt,
    poolSize: poolSize,
    entropyBits: entropyBits,
    strengthLabel: strengthLabel,
    generate: generate
  };
});
