'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../site/js/subnet.js');

function c(ip, prefix) {
  return S.calc(S.parseIPv4(ip), prefix);
}

test('/24: klassisches Heimnetz', () => {
  const r = c('192.168.1.10', 24);
  assert.equal(r.strings.network, '192.168.1.0');
  assert.equal(r.strings.broadcast, '192.168.1.255');
  assert.equal(r.strings.first, '192.168.1.1');
  assert.equal(r.strings.last, '192.168.1.254');
  assert.equal(r.strings.mask, '255.255.255.0');
  assert.equal(r.strings.wildcard, '0.0.0.255');
  assert.equal(r.hosts, 254);
  assert.equal(r.total, 256);
  assert.equal(r.strings.cidr, '192.168.1.0/24');
  assert.equal(r.binary.mask, '11111111.11111111.11111111.00000000');
  assert.equal(r.binary.ip, '11000000.10101000.00000001.00001010');
});

test('/8: Netzadresse wird aus beliebiger Hostadresse berechnet', () => {
  const r = c('10.20.30.40', 8);
  assert.equal(r.strings.network, '10.0.0.0');
  assert.equal(r.strings.broadcast, '10.255.255.255');
  assert.equal(r.strings.first, '10.0.0.1');
  assert.equal(r.strings.last, '10.255.255.254');
  assert.equal(r.hosts, 16777214);
  assert.equal(r.strings.mask, '255.0.0.0');
});

test('/0: das gesamte Adressraum-Netz', () => {
  const r = c('1.2.3.4', 0);
  assert.equal(r.strings.network, '0.0.0.0');
  assert.equal(r.strings.broadcast, '255.255.255.255');
  assert.equal(r.strings.mask, '0.0.0.0');
  assert.equal(r.strings.wildcard, '255.255.255.255');
  assert.equal(r.total, 4294967296);
  assert.equal(r.hosts, 4294967294);
  assert.ok(r.contains.length > 5, 'ein /0 enthält viele Sonderbereiche');
});

test('/30: 2 Hosts, Broadcast vorhanden', () => {
  const r = c('192.168.1.5', 30);
  assert.equal(r.strings.network, '192.168.1.4');
  assert.equal(r.strings.first, '192.168.1.5');
  assert.equal(r.strings.last, '192.168.1.6');
  assert.equal(r.strings.broadcast, '192.168.1.7');
  assert.equal(r.hosts, 2);
  assert.equal(r.hasBroadcast, true);
  assert.equal(r.kind, 'normal');
});

test('/31 (RFC 3021): beide Adressen nutzbar, kein Broadcast', () => {
  const r = c('10.0.0.1', 31);
  assert.equal(r.strings.network, '10.0.0.0');
  assert.equal(r.strings.first, '10.0.0.0');
  assert.equal(r.strings.last, '10.0.0.1');
  assert.equal(r.hosts, 2);
  assert.equal(r.hasBroadcast, false);
  assert.equal(r.kind, 'point-to-point');
  assert.match(r.note, /RFC 3021/);
});

test('/32: Einzeladresse', () => {
  const r = c('203.0.113.77', 32);
  assert.equal(r.strings.network, '203.0.113.77');
  assert.equal(r.strings.first, '203.0.113.77');
  assert.equal(r.strings.last, '203.0.113.77');
  assert.equal(r.hosts, 1);
  assert.equal(r.total, 1);
  assert.equal(r.hasBroadcast, false);
  assert.equal(r.kind, 'host');
  assert.equal(r.strings.mask, '255.255.255.255');
});

test('Netzgrenze im Oktett: /26 und /22', () => {
  const a = c('172.16.5.200', 26);
  assert.equal(a.strings.network, '172.16.5.192');
  assert.equal(a.strings.broadcast, '172.16.5.255');
  assert.equal(a.hosts, 62);
  const b = c('10.1.7.9', 22);
  assert.equal(b.strings.network, '10.1.4.0');
  assert.equal(b.strings.broadcast, '10.1.7.255');
  assert.equal(b.hosts, 1022);
});

test('Maske <-> Präfix: alle 33 Längen rund', () => {
  for (let p = 0; p <= 32; p++) {
    const mask = S.prefixToMask(p);
    assert.equal(S.maskToPrefix(mask), p, 'Präfix ' + p);
  }
  assert.equal(S.ipToString(S.prefixToMask(20)), '255.255.240.0');
  assert.equal(S.parseMask('255.255.255.252').prefix, 30);
  assert.equal(S.parseMask('0.0.0.0').prefix, 0);
  assert.equal(S.parseMask('255.255.255.255').prefix, 32);
});

test('Ungültige Masken werden erkannt', () => {
  assert.ok(S.parseMask('255.0.255.0').error, 'nicht zusammenhängend');
  assert.ok(S.parseMask('255.255.255.1').error);
  assert.ok(S.parseMask('abc').error);
  assert.match(S.parseMask('0.0.0.255').error, /Wildcard/);
  assert.equal(S.maskToPrefix(0x7FFFFFFF), null);
  assert.equal(S.prefixToMask(33), null);
  assert.equal(S.prefixToMask(-1), null);
  assert.equal(S.prefixToMask(24.5), null);
});

test('IPv4-Parser ist strikt', () => {
  assert.equal(S.parseIPv4('0.0.0.0'), 0);
  assert.equal(S.parseIPv4('255.255.255.255'), 4294967295);
  assert.equal(S.parseIPv4(' 10.0.0.1 '), 167772161);
  for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', '01.2.3.4', '1.2.3.04',
    'a.b.c.d', '1.2.3.4/24', '1..2.3', '1.2.3.4 5', '999.999.999.999', '::1', null, undefined, 42]) {
    assert.equal(S.parseIPv4(bad), null, 'sollte ungültig sein: ' + String(bad));
  }
});

test('parseInput: CIDR-Schreibweise, zwei Felder, Maske', () => {
  let r = S.parseInput('192.168.1.10/24', '');
  assert.deepEqual([r.ok, r.prefix, S.ipToString(r.ip)], [true, 24, '192.168.1.10']);
  r = S.parseInput('192.168.1.10', '/25');
  assert.deepEqual([r.ok, r.prefix], [true, 25]);
  r = S.parseInput('192.168.1.10', '255.255.255.128');
  assert.deepEqual([r.ok, r.prefix], [true, 25]);
  r = S.parseInput('192.168.1.10/255.255.0.0', '');
  assert.deepEqual([r.ok, r.prefix], [true, 16]);
  r = S.parseInput('10.0.0.1', '0');
  assert.deepEqual([r.ok, r.prefix], [true, 0]);
});

test('parseInput: ungültige Eingaben liefern verständliche Fehler', () => {
  const cases = [
    ['', '24'], ['   ', '24'], ['192.168.1.10', ''], ['192.168.1.10', '33'], ['192.168.1.10', '/abc'],
    ['192.168.1.10', '-1'], ['300.1.1.1', '24'], ['192.168.1.10/24', '24'], ['192.168.1.10/', ''],
    ['192.168.1.10', '255.0.255.0'], ['hallo', '24'], ['192.168.1.10', '24.5']
  ];
  for (const [ip, mask] of cases) {
    const r = S.parseInput(ip, mask);
    assert.equal(r.ok, false, JSON.stringify([ip, mask]));
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 10);
  }
});

test('Klassifikation: RFC 1918, CGNAT, Loopback, Link-Local, öffentlich', () => {
  const cl = (ip) => S.classify(S.parseIPv4(ip));
  assert.equal(cl('10.1.2.3').scope, 'private-10');
  assert.equal(cl('172.16.0.1').scope, 'private-172');
  assert.equal(cl('172.31.255.254').scope, 'private-172');
  assert.equal(cl('172.32.0.1').scope, 'public', '172.32 liegt schon außerhalb von 172.16/12');
  assert.equal(cl('172.15.255.255').scope, 'public');
  assert.equal(cl('192.168.0.1').scope, 'private-192');
  assert.equal(cl('100.64.0.1').scope, 'cgnat');
  assert.equal(cl('100.127.255.255').scope, 'cgnat');
  assert.equal(cl('100.128.0.1').scope, 'public');
  assert.equal(cl('127.0.0.1').scope, 'loopback');
  assert.equal(cl('169.254.10.10').scope, 'link-local');
  assert.equal(cl('8.8.8.8').scope, 'public');
  assert.equal(cl('8.8.8.8').category, 'öffentlich');
  assert.equal(cl('224.0.0.251').scope, 'multicast');
  assert.equal(cl('255.255.255.255').scope, 'limited-broadcast');
  assert.equal(cl('240.0.0.1').scope, 'reserved');
  assert.equal(cl('192.0.2.1').scope, 'test-net-1');
  assert.match(cl('100.64.0.1').rfc, /6598/);
  assert.equal(cl('100.64.0.1').category, 'shared');
});

test('Klassen A bis E', () => {
  const k = (ip) => S.classify(S.parseIPv4(ip)).class;
  assert.deepEqual(
    ['1.1.1.1', '127.0.0.1', '128.0.0.1', '191.255.0.1', '192.0.0.1', '223.1.1.1', '224.0.0.1', '239.1.1.1', '240.0.0.1', '255.0.0.1'].map(k),
    ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E']
  );
});

test('Netz, das Sonderbereiche umfasst, wird gemeldet', () => {
  const r = c('8.0.0.0', 5); // 8.0.0.0 - 15.255.255.255 enthält 10.0.0.0/8
  assert.ok(r.contains.some((l) => /10\.0\.0\.0\/8/.test(l)));
  assert.deepEqual(c('192.168.1.0', 24).contains, []);
});

test('Aufteilen: /24 in 4 Teilnetze', () => {
  const r = S.split(S.parseIPv4('192.168.1.77'), 24, 4);
  assert.equal(r.ok, true);
  assert.equal(r.newPrefix, 26);
  assert.deepEqual(r.subnets.map((s) => s.strings.cidr),
    ['192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26']);
  assert.equal(r.subnets[1].strings.first, '192.168.1.65');
  assert.equal(r.subnets[1].strings.broadcast, '192.168.1.127');
  assert.ok(r.subnets.every((s) => s.hosts === 62));
});

test('Aufteilen: Randfälle (1, /31, /32, 256 Teilnetze)', () => {
  const one = S.split(S.parseIPv4('10.0.0.0'), 8, 1);
  assert.equal(one.subnets.length, 1);
  assert.equal(one.subnets[0].strings.cidr, '10.0.0.0/8');

  const p2p = S.split(S.parseIPv4('10.0.0.0'), 30, 2);
  assert.deepEqual(p2p.subnets.map((s) => s.strings.cidr), ['10.0.0.0/31', '10.0.0.2/31']);
  assert.ok(p2p.subnets.every((s) => s.hosts === 2 && !s.hasBroadcast));

  const hosts = S.split(S.parseIPv4('10.0.0.0'), 30, 4);
  assert.deepEqual(hosts.subnets.map((s) => s.strings.cidr), ['10.0.0.0/32', '10.0.0.1/32', '10.0.0.2/32', '10.0.0.3/32']);

  const big = S.split(S.parseIPv4('10.0.0.0'), 8, 256);
  assert.equal(big.subnets.length, 256);
  assert.equal(big.subnets[255].strings.cidr, '10.255.0.0/16');
});

test('Aufteilen: ungültige Anzahl', () => {
  const ip = S.parseIPv4('192.168.0.0');
  for (const n of [0, -4, 3, 6, 1.5, NaN, '', 'abc']) {
    assert.equal(S.split(ip, 24, n).ok, false, String(n));
  }
  assert.match(S.split(ip, 24, 3).error, /Zweierpotenz/);
  assert.match(S.split(ip, 24, 512).error, /höchstens in 256 Teilnetze/);
  assert.match(S.split(ip, 8, 8192).error, /begrenzt/);
  assert.equal(S.split(ip, 24, '8').ok, true, 'Zahl als String erlaubt');
});

test('Die Teilnetze einer Aufteilung decken das Ursprungsnetz lückenlos ab', () => {
  const base = c('172.20.9.1', 20);
  const r = S.split(base.ip, 20, 16);
  assert.equal(r.subnets[0].network, base.network);
  assert.equal(r.subnets[15].broadcast, base.broadcast);
  for (let i = 1; i < r.subnets.length; i++) {
    assert.equal(r.subnets[i].network, r.subnets[i - 1].broadcast + 1);
  }
});
