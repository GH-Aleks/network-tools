/*
 * Hilfsfunktionen fuer die Seite "Meine IP & Browser": IP-Version erkennen
 * und die Antwort von /api/ip pruefen. Kein DOM, kein fetch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IpInfo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isIPv4(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return false;
    for (var i = 1; i <= 4; i++) {
      if (m[i].length > 1 && m[i].charAt(0) === '0') return false;
      if (Number(m[i]) > 255) return false;
    }
    return true;
  }

  function isIPv6(s) {
    if (s.indexOf(':') === -1) return false;
    if (/[^0-9a-fA-F:.]/.test(s)) return false;
    if (s.indexOf(':::') !== -1) return false;
    var dbl = s.split('::');
    if (dbl.length > 2) return false;

    function groups(part) {
      if (part === '') return [];
      var g = part.split(':');
      var count = 0;
      for (var i = 0; i < g.length; i++) {
        if (g[i].indexOf('.') !== -1) {
          // eingebettetes IPv4 nur als allerletzter Teil
          if (i !== g.length - 1 || !isIPv4(g[i])) return null;
          count += 2;
        } else if (/^[0-9a-fA-F]{1,4}$/.test(g[i])) {
          count += 1;
        } else {
          return null;
        }
      }
      return count;
    }

    if (dbl.length === 1) return groups(s) === 8;
    var left = groups(dbl[0]);
    var right = groups(dbl[1]);
    if (left === null || right === null) return false;
    // IPv4-Endstueck darf nur rechts vom "::" bzw. am Ende stehen
    if (dbl[0].indexOf('.') !== -1) return false;
    return (Array.isArray(left) ? 0 : left) + (Array.isArray(right) ? 0 : right) <= 7;
  }

  /** 'IPv4' | 'IPv6' | null */
  function detectVersion(text) {
    if (typeof text !== 'string') return null;
    var s = text.trim();
    if (isIPv4(s)) return 'IPv4';
    if (isIPv6(s)) return 'IPv6';
    return null;
  }

  /**
   * Prueft das JSON von /api/ip: {"ip":"…","userAgent":"…","acceptLanguage":"…"}.
   * Nur "ip" ist Pflicht und muss eine gueltige Adresse sein.
   */
  function parseApiResponse(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'Die Antwort hat nicht das erwartete Format.' };
    }
    var ip = typeof obj.ip === 'string' ? obj.ip.trim() : '';
    var version = detectVersion(ip);
    if (!version) return { ok: false, error: 'Die Antwort enthält keine gültige IP-Adresse.' };
    return {
      ok: true,
      ip: ip,
      version: version,
      userAgent: typeof obj.userAgent === 'string' ? obj.userAgent : '',
      acceptLanguage: typeof obj.acceptLanguage === 'string' ? obj.acceptLanguage : ''
    };
  }

  return { detectVersion: detectVersion, parseApiResponse: parseApiResponse };
});
