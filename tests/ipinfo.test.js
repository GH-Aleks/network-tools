'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IpInfo = require('../site/js/ipinfo.js');

test('detectVersion: IPv4', () => {
  assert.equal(IpInfo.detectVersion('192.0.2.1'), 'IPv4');
  assert.equal(IpInfo.detectVersion(' 0.0.0.0 '), 'IPv4');
  assert.equal(IpInfo.detectVersion('255.255.255.255'), 'IPv4');
});

test('detectVersion: IPv6', () => {
  for (const ok of ['2001:db8::1', '::1', '::', '2001:0db8:0000:0000:0000:0000:0000:0001', 'fe80::1', '::ffff:192.0.2.1', '1:2:3:4:5:6:7:8', '1::']) {
    assert.equal(IpInfo.detectVersion(ok), 'IPv6', ok);
  }
});

test('detectVersion: ungültig', () => {
  for (const bad of ['', 'abc', '256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '2001:db8:::1', '1:2:3:4:5:6:7:8:9', '1::2::3', 'gggg::1', '12345::1', '1:2:3:4:5:6:7::8', '1.2.3.4::', '<script>']) {
    assert.equal(IpInfo.detectVersion(bad), null, bad);
  }
  assert.equal(IpInfo.detectVersion(undefined), null);
  assert.equal(IpInfo.detectVersion(42), null);
});

test('parseApiResponse: gültige Antwort', () => {
  const r = IpInfo.parseApiResponse({ ip: '203.0.113.7', userAgent: 'UA', acceptLanguage: 'de-DE' });
  assert.deepEqual(r, { ok: true, ip: '203.0.113.7', version: 'IPv4', userAgent: 'UA', acceptLanguage: 'de-DE' });
  const r6 = IpInfo.parseApiResponse({ ip: '2001:db8::5' });
  assert.equal(r6.ok, true);
  assert.equal(r6.version, 'IPv6');
  assert.equal(r6.userAgent, '');
});

test('parseApiResponse: fehlerhafte Antworten', () => {
  for (const bad of [null, undefined, 'text', [], {}, { ip: 5 }, { ip: 'kein-ip' }, { ip: '<b>x</b>' }]) {
    assert.equal(IpInfo.parseApiResponse(bad).ok, false);
  }
});
