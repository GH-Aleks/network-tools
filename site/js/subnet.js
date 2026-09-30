/*
 * Rechenlogik fuer den IPv4-Subnetzrechner.
 * Reine Funktionen ohne DOM-Zugriff: laeuft im Browser (window.Subnet)
 * und unter Node (require) - siehe tests/subnet.test.js.
 *
 * Adressen werden intern als vorzeichenlose 32-Bit-Zahlen (Number) gefuehrt.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Subnet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_SPLIT = 4096; // Obergrenze fuer die Teilnetz-Tabelle

  // ---------------------------------------------------------------- Parsen

  /** "192.168.1.1" -> Zahl, sonst null. Strikt: 4 Dezimalzahlen, keine fuehrenden Nullen. */
  function parseIPv4(text) {
    if (typeof text !== 'string') return null;
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text.trim());
    if (!m) return null;
    var n = 0;
    for (var i = 1; i <= 4; i++) {
      var part = m[i];
      if (part.length > 1 && part.charAt(0) === '0') return null; // mehrdeutig (oktal?)
      var v = Number(part);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n;
  }

  function ipToString(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  /** Zahl -> "11000000.10101000.00000001.00000001" */
  function ipToBinary(n) {
    var parts = [];
    for (var shift = 24; shift >= 0; shift -= 8) {
      var b = ((n >>> shift) & 255).toString(2);
      parts.push('00000000'.slice(b.length) + b);
    }
    return parts.join('.');
  }

  function prefixToMask(prefix) {
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  }

  function popcount(n) {
    var c = 0;
    n = n >>> 0;
    while (n) { c += n & 1; n >>>= 1; }
    return c;
  }

  /** Maske (Zahl) -> Praefixlaenge, oder null wenn die Einsen nicht zusammenhaengen. */
  function maskToPrefix(mask) {
    if (!Number.isInteger(mask) || mask < 0 || mask > 0xFFFFFFFF) return null;
    var inv = (~mask) >>> 0;
    if ((inv & ((inv + 1) >>> 0)) !== 0) return null; // inv muss 2^k-1 sein
    return 32 - popcount(inv);
  }

  /** "255.255.255.0" -> 24; liefert {prefix} oder {error}. */
  function parseMask(text) {
    var n = parseIPv4(text);
    if (n === null) return { error: 'Die Subnetzmaske ist keine gültige IPv4-Adresse (z. B. 255.255.255.0).' };
    var p = maskToPrefix(n);
    if (p === null) {
      if (maskToPrefix((~n) >>> 0) !== null) {
        return { error: 'Das sieht nach einer Wildcard-Maske aus. Bitte die Subnetzmaske angeben (z. B. 255.255.255.0 statt 0.0.0.255).' };
      }
      return { error: 'Ungültige Subnetzmaske: Die Einsen müssen im Binärwert lückenlos von links beginnen.' };
    }
    return { prefix: p };
  }

  /** "24", "/24" oder "255.255.255.0" -> {prefix} oder {error}. */
  function parsePrefixOrMask(text) {
    var s = String(text == null ? '' : text).trim();
    if (s === '') return { error: 'Bitte eine Präfixlänge (z. B. /24) oder Subnetzmaske angeben.' };
    if (s.indexOf('.') !== -1) return parseMask(s);
    var m = /^\/?(\d{1,2})$/.exec(s);
    if (!m) return { error: 'Ungültige Präfixlänge. Erlaubt sind ganze Zahlen von 0 bis 32, z. B. /24.' };
    var p = Number(m[1]);
    if (p > 32) return { error: 'Die Präfixlänge darf höchstens 32 sein.' };
    return { prefix: p };
  }

  /**
   * Eingabe aus zwei Feldern. ipText darf "ip/praefix" oder "ip/maske" enthalten,
   * dann bleibt maskText leer. Ergebnis: {ok:true, ip, prefix} oder {ok:false, error}.
   */
  function parseInput(ipText, maskText) {
    var ipPart = String(ipText == null ? '' : ipText).trim();
    var maskPart = String(maskText == null ? '' : maskText).trim();
    if (ipPart === '') return { ok: false, error: 'Bitte eine IPv4-Adresse eingeben.' };

    var slash = ipPart.indexOf('/');
    if (slash !== -1) {
      if (maskPart !== '') {
        return { ok: false, error: 'Präfix bzw. Maske bitte nur einmal angeben: entweder hinter dem Schrägstrich oder im zweiten Feld.' };
      }
      maskPart = ipPart.slice(slash + 1);
      ipPart = ipPart.slice(0, slash);
    }
    var ip = parseIPv4(ipPart);
    if (ip === null) {
      return { ok: false, error: 'Ungültige IPv4-Adresse. Erwartet werden vier Zahlen von 0 bis 255, durch Punkte getrennt (ohne führende Nullen).' };
    }
    var p = parsePrefixOrMask(maskPart);
    if (p.error) return { ok: false, error: p.error };
    return { ok: true, ip: ip, prefix: p.prefix };
  }

  // ---------------------------------------------------- Adressbereiche

  // [Startadresse, Praefix, id, Bezeichnung, Quelle, Kategorie]
  var SPECIAL = [
    ['0.0.0.0', 8, 'this-network', '„Dieses Netz“ (0.0.0.0/8)', 'RFC 791 / RFC 1122', 'sonder'],
    ['10.0.0.0', 8, 'private-10', 'Privates Netz (10.0.0.0/8)', 'RFC 1918', 'privat'],
    ['100.64.0.0', 10, 'cgnat', 'Carrier-Grade NAT, Shared Address Space (100.64.0.0/10)', 'RFC 6598', 'shared'],
    ['127.0.0.0', 8, 'loopback', 'Loopback (127.0.0.0/8)', 'RFC 1122', 'sonder'],
    ['169.254.0.0', 16, 'link-local', 'Link-Local / APIPA (169.254.0.0/16)', 'RFC 3927', 'sonder'],
    ['172.16.0.0', 12, 'private-172', 'Privates Netz (172.16.0.0/12)', 'RFC 1918', 'privat'],
    ['192.0.0.0', 24, 'ietf-protocol', 'IETF-Protokollzuweisungen (192.0.0.0/24)', 'RFC 6890', 'sonder'],
    ['192.0.2.0', 24, 'test-net-1', 'Dokumentation TEST-NET-1 (192.0.2.0/24)', 'RFC 5737', 'sonder'],
    ['192.168.0.0', 16, 'private-192', 'Privates Netz (192.168.0.0/16)', 'RFC 1918', 'privat'],
    ['198.18.0.0', 15, 'benchmark', 'Netzwerk-Benchmark-Tests (198.18.0.0/15)', 'RFC 2544', 'sonder'],
    ['198.51.100.0', 24, 'test-net-2', 'Dokumentation TEST-NET-2 (198.51.100.0/24)', 'RFC 5737', 'sonder'],
    ['203.0.113.0', 24, 'test-net-3', 'Dokumentation TEST-NET-3 (203.0.113.0/24)', 'RFC 5737', 'sonder'],
    ['224.0.0.0', 4, 'multicast', 'Multicast (224.0.0.0/4)', 'RFC 5771', 'sonder'],
    ['255.255.255.255', 32, 'limited-broadcast', 'Limited Broadcast (255.255.255.255)', 'RFC 919', 'sonder'],
    // Reihenfolge: Limited Broadcast liegt im Bereich 240/4, muss daher zuerst geprueft werden
    ['240.0.0.0', 4, 'reserved', 'Reserviert für zukünftige Nutzung (240.0.0.0/4)', 'RFC 1112', 'sonder']
  ].map(function (r) {
    var prefix = r[1];
    var start = parseIPv4(r[0]);
    var size = Math.pow(2, 32 - prefix);
    return { start: start, end: start + size - 1, prefix: prefix, id: r[2], label: r[3], rfc: r[4], category: r[5] };
  });

  var PUBLIC = {
    id: 'public', label: 'Öffentliche Adresse (global routbar)', rfc: '', category: 'öffentlich'
  };

  /** Adresstyp (Bereich) einer einzelnen Adresse. */
  function scopeOf(n) {
    for (var i = 0; i < SPECIAL.length; i++) {
      if (n >= SPECIAL[i].start && n <= SPECIAL[i].end) return SPECIAL[i];
    }
    return PUBLIC;
  }

  /** Historische Klasse nach erstem Oktett (heute bedeutungslos, CIDR ersetzt sie). */
  function classOf(n) {
    var first = n >>> 24;
    if (first < 128) return 'A';
    if (first < 192) return 'B';
    if (first < 224) return 'C';
    if (first < 240) return 'D';
    return 'E';
  }

  function classify(n) {
    var scope = scopeOf(n);
    return {
      class: classOf(n),
      scope: scope.id,
      label: scope.label,
      rfc: scope.rfc,
      category: scope.category
    };
  }

  /** Bezeichnungen der Sonderbereiche, die komplett in [net, bc] liegen (nur bei grossen Netzen relevant). */
  function containedSpecials(net, bc) {
    return SPECIAL.filter(function (s) {
      return s.start >= net && s.end <= bc && !(s.start === net && s.end === bc);
    }).map(function (s) { return s.label; });
  }

  // ---------------------------------------------------------- Berechnung

  /**
   * Alle Kennzahlen eines Netzes. ipInt: Adresse (Zahl), prefix: 0..32.
   * /31 (RFC 3021, Punkt-zu-Punkt): 2 nutzbare Adressen, kein Broadcast.
   * /32: Einzeladresse (Host-Route), 1 nutzbare Adresse.
   */
  function calc(ipInt, prefix) {
    var mask = prefixToMask(prefix);
    if (mask === null || !Number.isInteger(ipInt) || ipInt < 0 || ipInt > 0xFFFFFFFF) return null;
    var wildcard = (~mask) >>> 0;
    var network = (ipInt & mask) >>> 0;
    var broadcast = (network | wildcard) >>> 0;
    var total = wildcard + 1;

    var first, last, hosts, hasBroadcast, kind, note;
    if (prefix === 32) {
      first = last = network; hosts = 1; hasBroadcast = false; kind = 'host';
      note = '/32 bezeichnet genau eine Adresse (Host-Route). Es gibt weder Netz- noch Broadcast-Adresse.';
    } else if (prefix === 31) {
      first = network; last = broadcast; hosts = 2; hasBroadcast = false; kind = 'point-to-point';
      note = '/31 nach RFC 3021 (Punkt-zu-Punkt-Verbindung): beide Adressen sind nutzbar, es gibt keine Broadcast-Adresse.';
    } else {
      first = network + 1; last = broadcast - 1; hosts = total - 2; hasBroadcast = true; kind = 'normal';
      note = '';
    }

    return {
      prefix: prefix,
      ip: ipInt,
      mask: mask,
      wildcard: wildcard,
      network: network,
      broadcast: broadcast,
      hasBroadcast: hasBroadcast,
      first: first,
      last: last,
      hosts: hosts,
      total: total,
      kind: kind,
      note: note,
      strings: {
        ip: ipToString(ipInt),
        mask: ipToString(mask),
        wildcard: ipToString(wildcard),
        network: ipToString(network),
        broadcast: ipToString(broadcast),
        first: ipToString(first),
        last: ipToString(last),
        cidr: ipToString(network) + '/' + prefix
      },
      binary: {
        ip: ipToBinary(ipInt),
        mask: ipToBinary(mask),
        network: ipToBinary(network),
        wildcard: ipToBinary(wildcard)
      },
      classification: classify(ipInt),
      contains: containedSpecials(network, broadcast)
    };
  }

  // ------------------------------------------------------------ Aufteilen

  /**
   * Teilt das Netz von ipInt/prefix in n gleich grosse Teilnetze.
   * n muss eine Zweierpotenz sein (gleich grosse Teilnetze sind nur so moeglich).
   * Ergebnis: {ok:true, newPrefix, subnets:[calc(...)]} oder {ok:false, error}.
   */
  function split(ipInt, prefix, n) {
    var base = calc(ipInt, prefix);
    if (!base) return { ok: false, error: 'Ungültiges Netz.' };
    if (typeof n === 'string') n = n.trim() === '' ? NaN : Number(n);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, error: 'Die Anzahl der Teilnetze muss eine ganze Zahl ab 1 sein.' };
    }
    var bits = Math.round(Math.log2(n));
    if (Math.pow(2, bits) !== n) {
      var lower = Math.pow(2, Math.floor(Math.log2(n)));
      return {
        ok: false,
        error: 'Gleich große Teilnetze gibt es nur für Zweierpotenzen (1, 2, 4, 8, 16, …). ' +
          'Nächstkleinere bzw. -größere Möglichkeit: ' + lower + ' oder ' + (lower * 2) + '.'
      };
    }
    var newPrefix = prefix + bits;
    if (newPrefix > 32) {
      return {
        ok: false,
        error: 'Ein /' + prefix + '-Netz lässt sich höchstens in ' + Math.pow(2, 32 - prefix) +
          ' Teilnetze teilen (dann /32 je Teilnetz).'
      };
    }
    if (n > MAX_SPLIT) {
      return { ok: false, error: 'Die Tabelle ist auf ' + MAX_SPLIT + ' Teilnetze begrenzt.' };
    }
    var size = Math.pow(2, 32 - newPrefix);
    var subnets = [];
    for (var i = 0; i < n; i++) {
      subnets.push(calc(base.network + i * size, newPrefix));
    }
    return { ok: true, newPrefix: newPrefix, subnets: subnets };
  }

  return {
    MAX_SPLIT: MAX_SPLIT,
    parseIPv4: parseIPv4,
    ipToString: ipToString,
    ipToBinary: ipToBinary,
    prefixToMask: prefixToMask,
    maskToPrefix: maskToPrefix,
    parseMask: parseMask,
    parsePrefixOrMask: parsePrefixOrMask,
    parseInput: parseInput,
    classify: classify,
    calc: calc,
    split: split
  };
});
