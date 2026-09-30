'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Password = require('../site/js/password.js');

const ALL = { length: 16, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false };

test('Länge und Zeichenvorrat werden eingehalten', () => {
  for (const len of [4, 8, 16, 64, 128]) {
    const r = Password.generate({ ...ALL, length: len });
    assert.equal(r.ok, true);
    assert.equal(r.password.length, len);
  }
  const onlyDigits = Password.generate({ length: 30, digits: true });
  assert.match(onlyDigits.password, /^[0-9]{30}$/);
});

test('aus jeder gewählten Gruppe kommt mindestens ein Zeichen vor', () => {
  for (let i = 0; i < 300; i++) {
    const p = Password.generate({ ...ALL, length: 4 }).password;
    assert.match(p, /[a-z]/);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[^a-zA-Z0-9]/);
  }
});

test('mehrdeutige Zeichen werden ausgeschlossen', () => {
  for (let i = 0; i < 200; i++) {
    const p = Password.generate({ ...ALL, length: 64, excludeAmbiguous: true }).password;
    assert.doesNotMatch(p, /[0Oo1lI|]/);
  }
  assert.equal(Password.poolSize({ ...ALL, excludeAmbiguous: true }), 24 + 24 + 8 + Password.SETS.symbols.length);
});

test('Zeichenvorrat-Größe', () => {
  assert.equal(Password.poolSize({ lower: true }), 26);
  assert.equal(Password.poolSize({ lower: true, upper: true, digits: true }), 62);
  assert.equal(Password.poolSize({ lower: true, upper: true, digits: true, symbols: true }), 62 + Password.SETS.symbols.length);
  // Ausschluss: 0 O o 1 l I | => aus lower: o,l (2); upper: O,I (2); digits: 0,1 (2); symbols: | kommt nicht vor
  assert.equal(Password.poolSize({ lower: true, upper: true, digits: true, excludeAmbiguous: true }), 62 - 6);
});

test('Entropie: Länge x log2(Vorrat)', () => {
  assert.ok(Math.abs(Password.entropyBits(10, 2) - 10) < 1e-9);
  assert.ok(Math.abs(Password.entropyBits(16, 62) - 16 * Math.log2(62)) < 1e-9);
  assert.equal(Password.entropyBits(0, 62), 0);
  assert.equal(Password.entropyBits(10, 1), 0);
  const r = Password.generate({ ...ALL, length: 20 });
  assert.ok(Math.abs(r.entropy - 20 * Math.log2(r.pool)) < 1e-9);
});

test('Bewertungsstufen', () => {
  assert.equal(Password.strengthLabel(10), 'schwach');
  assert.equal(Password.strengthLabel(50), 'mäßig');
  assert.equal(Password.strengthLabel(80), 'gut');
  assert.equal(Password.strengthLabel(128), 'sehr stark');
});

test('ungültige Eingaben', () => {
  assert.equal(Password.generate({ ...ALL, length: 3 }).ok, false);
  assert.equal(Password.generate({ ...ALL, length: 129 }).ok, false);
  assert.equal(Password.generate({ ...ALL, length: 'abc' }).ok, false);
  assert.equal(Password.generate({ ...ALL, length: 8.5 }).ok, false);
  const none = Password.generate({ length: 12 });
  assert.equal(none.ok, false);
  assert.match(none.error, /Zeichengruppe/);
});

test('randomInt: Rejection Sampling verwirft Werte im verzerrten Bereich', () => {
  // max = 3: limit = floor(2^32/3)*3 = 4294967295; nur 0xFFFFFFFF liegt darueber und muss verworfen werden
  const seq = [0xffffffff, 0xffffffff, 7];
  let calls = 0;
  const fill = (a) => { a[0] = seq[calls++]; return a; };
  assert.equal(Password.randomInt(3, fill), 7 % 3);
  assert.equal(calls, 3);
});

test('randomInt: Grenzen und Fehler', () => {
  for (let i = 0; i < 1000; i++) {
    const v = Password.randomInt(10);
    assert.ok(v >= 0 && v < 10);
  }
  assert.equal(Password.randomInt(1), 0);
  assert.throws(() => Password.randomInt(0), RangeError);
  assert.throws(() => Password.randomInt(1.5), RangeError);
});

test('Verteilung ist grob gleichmäßig (Plausibilitätsprüfung, kein Zufallsbeweis)', () => {
  const counts = new Array(6).fill(0);
  const N = 60000;
  for (let i = 0; i < N; i++) counts[Password.randomInt(6)]++;
  for (const c of counts) assert.ok(Math.abs(c - N / 6) < N / 6 * 0.06, `Abweichung zu groß: ${c}`);
});

test('nutzt die übergebene Zufallsquelle (deterministisch reproduzierbar)', () => {
  const mk = () => { const b = crypto.createHash('sha256').update('seed').digest(); let i = 0; return (a) => { a[0] = b.readUInt32LE((i++ % 8) * 4); return a; }; };
  const a = Password.generate({ ...ALL, length: 12 }, mk()).password;
  const b = Password.generate({ ...ALL, length: 12 }, mk()).password;
  assert.equal(a, b);
});

test('Quelltext nutzt kein Math.random', () => {
  const src = require('node:fs').readFileSync(require.resolve('../site/js/password.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random/);
});
