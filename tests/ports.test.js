'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ports = require('../site/js/ports.js');

test('alle geforderten Ports sind enthalten', () => {
  const have = new Set(Ports.PORTS.map((p) => p.port));
  for (const p of ['20', '21', '22', '23', '25', '53', '67', '68', '80', '110', '123', '143', '389', '443', '445', '465', '587', '636', '993', '995', '1433', '3306', '3389', '5432', '5900', '8080']) {
    assert.ok(have.has(p), 'fehlt: ' + p);
  }
});

test('Datensätze sind vollständig und eindeutig', () => {
  const seen = new Set();
  for (const p of Ports.PORTS) {
    for (const k of ['port', 'proto', 'name', 'desc', 'crypt', 'note']) assert.ok(p[k] && String(p[k]).length > 0, `${p.port}: ${k}`);
    assert.ok(/^\d+$/.test(p.port) && Number(p.port) >= 1 && Number(p.port) <= 65535);
    assert.ok(p.crypt in Ports.CRYPT_TEXT, p.port);
    assert.ok(!seen.has(p.port), 'doppelt: ' + p.port);
    seen.add(p.port);
  }
});

test('Liste ist nach Portnummer sortiert', () => {
  const nums = Ports.PORTS.map((p) => Number(p.port));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
});

test('filter: leere Suche liefert alles (Kopie)', () => {
  const r = Ports.filter('  ');
  assert.equal(r.length, Ports.PORTS.length);
  assert.notEqual(r, Ports.PORTS);
});

test('filter: Portnummer', () => {
  assert.deepEqual(Ports.filter('443').map((p) => p.port), ['443']);
  assert.ok(Ports.filter('80').map((p) => p.port).includes('80'));
  assert.ok(Ports.filter('80').map((p) => p.port).includes('8080'));
});

test('filter: Name, Umlaute und Groß-/Kleinschreibung', () => {
  assert.ok(Ports.filter('ssh').some((p) => p.port === '22'));
  assert.ok(Ports.filter('SSH').some((p) => p.port === '22'));
  assert.ok(Ports.filter('verschluesselt').length > 0);
  assert.ok(Ports.filter('verschlüsselt').length > 0);
  assert.ok(Ports.filter('mail').some((p) => p.port === '993'));
});

test('filter: mehrere Wörter verknüpft mit UND; kein Treffer', () => {
  const r = Ports.filter('mail tls');
  assert.ok(r.length > 0);
  assert.ok(r.every((p) => /mail/i.test(p.desc + p.name + p.note)));
  assert.deepEqual(Ports.filter('gibtesnicht'), []);
  assert.deepEqual(Ports.filter('99999'), []);
});
