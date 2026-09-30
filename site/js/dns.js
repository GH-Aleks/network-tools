/*
 * Logik fuer die DNS-Abfrage per DNS-over-HTTPS (JSON-API).
 * Kein DOM-, kein fetch-Zugriff: nur Eingabepruefung, URL-Bau und Auswertung
 * der Antwort. Laeuft im Browser (window.Dns) und unter Node (tests/dns.test.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dns = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROVIDERS = {
    cloudflare: {
      id: 'cloudflare',
      label: 'Cloudflare',
      url: 'https://cloudflare-dns.com/dns-query',
      headers: { accept: 'application/dns-json' },
      privacy: 'https://www.cloudflare.com/privacypolicy/'
    },
    google: {
      id: 'google',
      label: 'Google Public DNS',
      url: 'https://dns.google/resolve',
      headers: {},
      privacy: 'https://developers.google.com/speed/public-dns/privacy'
    }
  };

  // Datensatztypen: Name -> Nummer (IANA DNS Parameters)
  var TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
  var TYPE_NAMES = {};
  Object.keys(TYPES).forEach(function (k) { TYPE_NAMES[TYPES[k]] = k; });

  var TYPE_HELP = {
    A: 'IPv4-Adresse des Namens',
    AAAA: 'IPv6-Adresse des Namens',
    CNAME: 'Alias: verweist auf einen anderen Namen',
    MX: 'Mailserver für die Domain (kleinere Zahl = höhere Priorität)',
    TXT: 'Freitext, u. a. für SPF, DKIM, DMARC und Bestätigungen',
    NS: 'Zuständige Nameserver der Zone',
    SOA: 'Start of Authority: Verwaltungsdaten der Zone',
    CAA: 'Welche Zertifizierungsstellen Zertifikate ausstellen dürfen'
  };

  // RCODE -> { name, kind, text }
  var RCODES = {
    0: { name: 'NOERROR', text: 'Die Abfrage war erfolgreich. Gibt es keine Einträge, existiert der Name zwar, hat aber keinen Datensatz dieses Typs (sog. NODATA).' },
    1: { name: 'FORMERR', text: 'Der DNS-Server hat die Anfrage als fehlerhaft formatiert abgelehnt.' },
    2: { name: 'SERVFAIL', text: 'Der Resolver konnte die Anfrage nicht beantworten. Häufige Ursachen: die zuständigen Nameserver sind nicht erreichbar oder antworten fehlerhaft, oder eine DNSSEC-Prüfung ist fehlgeschlagen. Das ist ein Serverproblem, nicht „Name existiert nicht“.' },
    3: { name: 'NXDOMAIN', text: 'Der Name existiert nicht. Häufig ein Tippfehler, eine nicht registrierte Domain oder ein nicht angelegter Eintrag.' },
    4: { name: 'NOTIMP', text: 'Der DNS-Server unterstützt diese Art von Anfrage nicht.' },
    5: { name: 'REFUSED', text: 'Der DNS-Server verweigert die Antwort (z. B. aus Richtlinien- oder Zugriffsgründen).' }
  };

  // ------------------------------------------------------- Eingabepruefung

  /**
   * Bereinigt die Eingabe eines Domainnamens. Akzeptiert auch eine eingefuegte URL
   * (nimmt dann den Hostnamen) und Umlaut-Domains (Umwandlung in Punycode).
   * Ergebnis: {ok:true, name} oder {ok:false, error}.
   */
  function normalizeName(input) {
    var s = String(input == null ? '' : input).trim();
    if (s === '') return { ok: false, error: 'Bitte einen Domainnamen eingeben, z. B. example.com.' };

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      try { s = new URL(s).hostname; } catch (e) { return { ok: false, error: 'Die eingegebene Adresse konnte nicht gelesen werden.' }; }
    }
    if (/\s/.test(s)) return { ok: false, error: 'Ein Domainname darf keine Leerzeichen enthalten.' };
    if (/[\/?#@:]/.test(s)) return { ok: false, error: 'Bitte nur den Domainnamen angeben (ohne Pfad, Port oder Benutzername).' };

    s = s.replace(/\.$/, '');
    if (s === '') return { ok: false, error: 'Bitte einen Domainnamen eingeben, z. B. example.com.' };

    // Nicht-ASCII-Zeichen: Punycode ueber die URL-Klasse des Browsers / von Node
    if (/[^\x00-\x7f]/.test(s)) {
      try { s = new URL('http://' + s).hostname; } catch (e) { return { ok: false, error: 'Der Name enthält ungültige Zeichen.' }; }
    }
    s = s.toLowerCase();

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
      return { ok: false, error: 'Das ist eine IP-Adresse. Diese Abfrage sucht Einträge zu Domainnamen (Rückwärtssuche per PTR ist hier nicht enthalten).' };
    }
    if (s.length > 253) return { ok: false, error: 'Der Name ist zu lang (maximal 253 Zeichen).' };
    var labels = s.split('.');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      if (l.length === 0) return { ok: false, error: 'Der Name enthält eine leere Stelle (zwei Punkte hintereinander oder Punkt am Anfang).' };
      if (l.length > 63) return { ok: false, error: 'Ein Namensteil ist länger als 63 Zeichen.' };
      // Buchstaben, Ziffern, Bindestrich; Unterstrich erlaubt fuer z. B. _dmarc
      if (!/^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/.test(l)) {
        return { ok: false, error: 'Ungültiges Zeichen im Namen. Erlaubt sind Buchstaben, Ziffern, Bindestrich (nicht am Rand) und Unterstrich.' };
      }
    }
    return { ok: true, name: s };
  }

  function buildUrl(providerId, name, type) {
    var p = PROVIDERS[providerId];
    if (!p) throw new Error('Unbekannter Anbieter: ' + providerId);
    if (!(type in TYPES)) throw new Error('Unbekannter Typ: ' + type);
    var q = new URLSearchParams();
    q.set('name', name);
    q.set('type', type);
    return p.url + '?' + q.toString();
  }

  // ------------------------------------------------------------ Darstellung

  function formatTTL(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '–';
    sec = Math.floor(sec);
    if (sec < 60) return sec + ' s';
    var parts = [];
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
      m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d) parts.push(d + ' d');
    if (h) parts.push(h + ' h');
    if (m) parts.push(m + ' min');
    if (s && !d) parts.push(s + ' s');
    return sec + ' s (' + parts.join(' ') + ')';
  }

  /** Dekodiert das generische Format "\# 19 0005697373756500..." (RFC 3597) fuer CAA; sonst null. */
  function decodeGeneric(data) {
    var m = /^\\#\s+(\d+)\s*([0-9a-fA-F\s]*)$/.exec(data);
    if (!m) return null;
    var hex = m[2].replace(/\s+/g, '');
    if (hex.length !== Number(m[1]) * 2) return null;
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
    return bytes;
  }

  function bytesToAscii(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  /** Text pro Datensatztyp lesbar aufbereiten. Gibt immer einen String zurueck. */
  function formatData(type, data) {
    data = String(data == null ? '' : data);
    if (type === 'CAA' || type === 257) {
      var bytes = decodeGeneric(data);
      if (bytes && bytes.length >= 2) {
        var tagLen = bytes[1];
        if (2 + tagLen <= bytes.length) {
          return bytes[0] + ' ' + bytesToAscii(bytes.slice(2, 2 + tagLen)) + ' "' +
            bytesToAscii(bytes.slice(2 + tagLen)) + '"';
        }
      }
      return data;
    }
    if (type === 'TXT' || type === 16) {
      // mehrere Zeichenketten "a" "b" werden (wie bei SPF/DKIM ueblich) zusammengefuegt
      var re = /"((?:[^"\\]|\\.)*)"/g, out = '', found = false, m;
      while ((m = re.exec(data)) !== null) { out += m[1].replace(/\\(.)/g, '$1'); found = true; }
      return found ? out : data;
    }
    return data;
  }

  /** SOA-Text in benannte Felder zerlegen, oder null. */
  function parseSOA(data) {
    var p = String(data).trim().split(/\s+/);
    if (p.length !== 7) return null;
    return {
      'Primärer Nameserver': p[0],
      'Verantwortlich (Adresse)': p[1],
      'Seriennummer': p[2],
      'Refresh': formatTTL(Number(p[3])),
      'Retry': formatTTL(Number(p[4])),
      'Expire': formatTTL(Number(p[5])),
      'Minimum (Negativ-Cache)': formatTTL(Number(p[6]))
    };
  }

  function toRows(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (r) {
      var typeName = TYPE_NAMES[r.type] || ('TYPE' + r.type);
      return {
        name: String(r.name == null ? '' : r.name),
        type: typeName,
        ttl: typeof r.TTL === 'number' ? r.TTL : NaN,
        ttlText: formatTTL(r.TTL),
        data: formatData(typeName, r.data),
        raw: String(r.data == null ? '' : r.data)
      };
    });
  }

  /**
   * Antwort-JSON (Cloudflare/Google, gleiches Format) in eine Darstellung fuer die Seite umwandeln.
   * outcome: 'ok' (Eintraege vorhanden) | 'nodata' (NOERROR ohne Eintrag) | 'nxdomain' | 'error'
   */
  function summarize(json, requestedType) {
    if (!json || typeof json !== 'object' || typeof json.Status !== 'number') {
      return { valid: false };
    }
    var rc = RCODES[json.Status] || { name: 'RCODE ' + json.Status, text: 'Unbekannter Antwortcode.' };
    var answers = toRows(json.Answer);
    var authority = toRows(json.Authority);
    var outcome;
    if (json.Status === 0) outcome = answers.length ? 'ok' : 'nodata';
    else if (json.Status === 3) outcome = 'nxdomain';
    else outcome = 'error';

    var flags = [];
    if (json.AD) flags.push({ key: 'AD', text: 'Antwort vom Resolver per DNSSEC geprüft (Authenticated Data)' });
    if (json.TC) flags.push({ key: 'TC', text: 'Antwort wurde gekürzt (Truncated)' });
    if (json.RA) flags.push({ key: 'RA', text: 'Resolver unterstützt rekursive Abfragen' });
    if (json.CD) flags.push({ key: 'CD', text: 'DNSSEC-Prüfung wurde abgeschaltet (Checking Disabled)' });

    var comments = [];
    if (Array.isArray(json.Comment)) comments = json.Comment.map(String);
    else if (typeof json.Comment === 'string') comments = [json.Comment];

    return {
      valid: true,
      status: json.Status,
      statusName: rc.name,
      explanation: rc.text,
      outcome: outcome,
      requestedType: requestedType || '',
      answers: answers,
      authority: authority,
      flags: flags,
      comments: comments
    };
  }

  return {
    PROVIDERS: PROVIDERS,
    TYPES: TYPES,
    TYPE_NAMES: TYPE_NAMES,
    TYPE_HELP: TYPE_HELP,
    RCODES: RCODES,
    normalizeName: normalizeName,
    buildUrl: buildUrl,
    formatTTL: formatTTL,
    formatData: formatData,
    parseSOA: parseSOA,
    summarize: summarize
  };
});
