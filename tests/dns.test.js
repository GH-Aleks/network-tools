'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Dns = require('../site/js/dns.js');

test('normalizeName: gültige Namen', () => {
  assert.deepEqual(Dns.normalizeName('example.com'), { ok: true, name: 'example.com' });
  assert.equal(Dns.normalizeName('  Example.COM.  ').name, 'example.com');
  assert.equal(Dns.normalizeName('_dmarc.example.com').name, '_dmarc.example.com');
  assert.equal(Dns.normalizeName('localhost').name, 'localhost');
});

test('normalizeName: URL wird auf den Hostnamen reduziert', () => {
  assert.equal(Dns.normalizeName('https://www.example.com/pfad?x=1').name, 'www.example.com');
});

test('normalizeName: Umlaut-Domain wird zu Punycode', () => {
  assert.equal(Dns.normalizeName('bücher.de').name, 'xn--bcher-kva.de');
});

test('normalizeName: ungültige Eingaben', () => {
  for (const bad of ['', '   ', 'a b.de', 'exa$mple.com', 'foo..bar', '.example.com', '-a.com', 'a-.com', 'user@example.com', 'example.com:8080', 'example.com/pfad', '8.8.8.8']) {
    const r = Dns.normalizeName(bad);
    assert.equal(r.ok, false, `sollte abgelehnt werden: "${bad}"`);
    assert.ok(r.error && r.error.length > 5);
  }
  assert.equal(Dns.normalizeName('a'.repeat(64) + '.de').ok, false);
  assert.equal(Dns.normalizeName(('a'.repeat(50) + '.').repeat(6) + 'de').ok, false);
});

test('buildUrl: Cloudflare und Google', () => {
  assert.equal(Dns.buildUrl('cloudflare', 'example.com', 'A'), 'https://cloudflare-dns.com/dns-query?name=example.com&type=A');
  assert.equal(Dns.buildUrl('google', 'example.com', 'MX'), 'https://dns.google/resolve?name=example.com&type=MX');
  assert.throws(() => Dns.buildUrl('foo', 'example.com', 'A'));
  assert.throws(() => Dns.buildUrl('google', 'example.com', 'XYZ'));
});

test('Cloudflare verlangt den Accept-Header dns-json, Google nicht', () => {
  assert.equal(Dns.PROVIDERS.cloudflare.headers.accept, 'application/dns-json');
  assert.deepEqual(Dns.PROVIDERS.google.headers, {});
});

test('alle geforderten Typen sind vorhanden', () => {
  for (const t of ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA']) {
    assert.ok(t in Dns.TYPES, t);
    assert.ok(Dns.TYPE_HELP[t], t);
  }
});

test('formatTTL', () => {
  assert.equal(Dns.formatTTL(30), '30 s');
  assert.equal(Dns.formatTTL(300), '300 s (5 min)');
  assert.equal(Dns.formatTTL(3600), '3600 s (1 h)');
  assert.equal(Dns.formatTTL(86400), '86400 s (1 d)');
  assert.equal(Dns.formatTTL(90061), '90061 s (1 d 1 h 1 min)');
  assert.equal(Dns.formatTTL(undefined), '–');
  assert.equal(Dns.formatTTL(-5), '–');
});

test('summarize: erfolgreiche A-Antwort', () => {
  const json = {
    Status: 0, TC: false, RD: true, RA: true, AD: true, CD: false,
    Question: [{ name: 'example.com', type: 1 }],
    Answer: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }]
  };
  const s = Dns.summarize(json, 'A');
  assert.equal(s.valid, true);
  assert.equal(s.outcome, 'ok');
  assert.equal(s.statusName, 'NOERROR');
  assert.equal(s.answers.length, 1);
  assert.equal(s.answers[0].type, 'A');
  assert.equal(s.answers[0].data, '93.184.216.34');
  assert.ok(s.flags.some((f) => f.key === 'AD'));
});

test('summarize: NXDOMAIN, SERVFAIL, NODATA', () => {
  const nx = Dns.summarize({ Status: 3, Authority: [{ name: 'com', type: 6, TTL: 900, data: 'a.gtld-servers.net. nstld.verisign-grs.com. 1 1800 900 604800 86400' }] }, 'A');
  assert.equal(nx.outcome, 'nxdomain');
  assert.equal(nx.statusName, 'NXDOMAIN');
  assert.match(nx.explanation, /existiert nicht/);
  assert.equal(nx.authority[0].type, 'SOA');

  const sf = Dns.summarize({ Status: 2 }, 'A');
  assert.equal(sf.outcome, 'error');
  assert.equal(sf.statusName, 'SERVFAIL');

  const nd = Dns.summarize({ Status: 0 }, 'AAAA');
  assert.equal(nd.outcome, 'nodata');
  assert.equal(nd.answers.length, 0);

  const unknown = Dns.summarize({ Status: 9 }, 'A');
  assert.equal(unknown.statusName, 'RCODE 9');
});

test('summarize: ungültige Antwort', () => {
  assert.equal(Dns.summarize(null).valid, false);
  assert.equal(Dns.summarize({}).valid, false);
  assert.equal(Dns.summarize('x').valid, false);
});

test('summarize: unbekannter Typ und Comment (Google)', () => {
  const s = Dns.summarize({ Status: 0, Comment: 'Response from 1.2.3.4.', Answer: [{ name: 'x.', type: 99, TTL: 1, data: 'abc' }] });
  assert.equal(s.answers[0].type, 'TYPE99');
  assert.deepEqual(s.comments, ['Response from 1.2.3.4.']);
});

test('formatData: TXT fügt Teilstrings zusammen', () => {
  assert.equal(Dns.formatData('TXT', '"v=spf1 include:_spf.example.com ~all"'), 'v=spf1 include:_spf.example.com ~all');
  assert.equal(Dns.formatData('TXT', '"abc" "def"'), 'abcdef');
  assert.equal(Dns.formatData('TXT', 'ohne anführungszeichen'), 'ohne anführungszeichen');
});

test('formatData: CAA aus dem generischen Format', () => {
  // Flags 0, Tag "issue" (5 Zeichen), Wert "letsencrypt.org"
  const hex = '00056973737565' + Buffer.from('letsencrypt.org').toString('hex');
  const len = hex.length / 2;
  assert.equal(Dns.formatData('CAA', `\\# ${len} ${hex}`), '0 issue "letsencrypt.org"');
  // bereits lesbare Form bleibt unveraendert
  assert.equal(Dns.formatData('CAA', '0 issue "pki.goog"'), '0 issue "pki.goog"');
});

test('parseSOA', () => {
  const r = Dns.parseSOA('ns.icann.org. noc.dns.icann.org. 2024081500 7200 3600 1209600 3600');
  assert.equal(r['Primärer Nameserver'], 'ns.icann.org.');
  assert.equal(r['Seriennummer'], '2024081500');
  assert.match(r['Expire'], /14 d/);
  assert.equal(Dns.parseSOA('kaputt'), null);
});
