/* Oberflaeche "Meine IP & Browser". Die Adresse liefert /api/ip vom eigenen Server; der Rest kommt aus dem Browser. */
(function () {
  'use strict';
  var I = window.IpInfo;
  var C = window.Common;
  var el = C.el;

  var ipBox = document.getElementById('ip-box');
  var browserBox = document.getElementById('browser-box');
  var actions = document.getElementById('ip-actions');
  var reload = document.getElementById('reload');

  var collected = { ip: null, rows: [] };

  function kv(rows) {
    var dl = el('dl', { class: 'kv' });
    rows.forEach(function (r) {
      dl.appendChild(el('dt', null, r[0]));
      dl.appendChild(el('dd', { class: r[2] ? '' : 'plain' }, r[1]));
    });
    return dl;
  }

  function mq(q) {
    try { return window.matchMedia(q).matches; } catch (e) { return false; }
  }

  function browserRows() {
    var rows = [];
    rows.push(['Browser-Kennung (User-Agent)', navigator.userAgent || 'unbekannt', true]);
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
    rows.push(['Sprachen (Browser)', langs.join(', ') || 'unbekannt']);
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    rows.push(['Zeitzone', tz || 'unbekannt']);
    rows.push(['Bildschirm', screen.width + ' × ' + screen.height + ' px (Pixeldichte ' + (window.devicePixelRatio || 1) + ')']);
    rows.push(['Fenster (Inhalt)', window.innerWidth + ' × ' + window.innerHeight + ' px']);
    rows.push(['Farbschema', mq('(prefers-color-scheme: dark)') ? 'dunkel' : 'hell']);
    rows.push(['Touch-Bedienung', (navigator.maxTouchPoints || 0) > 0 ? 'ja (' + navigator.maxTouchPoints + ' Berührungspunkte)' : 'nein']);
    rows.push(['Cookies erlaubt', navigator.cookieEnabled ? 'ja' : 'nein']);
    rows.push(['Online-Status laut Browser', navigator.onLine ? 'online' : 'offline']);
    rows.push(['Sichere Verbindung (HTTPS)', window.isSecureContext ? 'ja' : 'nein']);
    return rows;
  }

  function renderBrowser() {
    C.clear(browserBox);
    collected.rows = browserRows();
    browserBox.appendChild(kv(collected.rows));
  }

  function supportText() {
    var lines = ['Support-Informationen (' + new Date().toLocaleString('de-DE') + ')'];
    lines.push('IP-Adresse: ' + (collected.ip ? collected.ip.ip + ' (' + collected.ip.version + ')' : 'nicht ermittelt'));
    collected.rows.forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
    return lines.join('\n');
  }

  function unavailable(reason) {
    C.clear(ipBox);
    ipBox.appendChild(el('div', { class: 'notice info' }, [
      el('p', null, [el('strong', null, 'Die IP-Adresse kann hier nicht angezeigt werden. '), reason]),
      el('p', null, 'Die Seite fragt dafür den Endpunkt /api/ip auf demselben Server ab. Er ist nur auf dem öffentlichen Server eingerichtet, nicht bei lokaler Nutzung oder in einer Vorschau. Die Browser-Angaben unten funktionieren trotzdem.')
    ]));
  }

  function renderIp(info) {
    C.clear(ipBox);
    collected.ip = info;
    ipBox.appendChild(el('div', { class: 'output-box', id: 'ip-value' }, info.ip));
    var rows = [
      ['Protokoll', info.version === 'IPv4' ? 'IPv4' : 'IPv6'],
      ['Gesehen vom Server', 'Ihre öffentliche Adresse, wie sie beim Server ankommt. Hinter einem Router oder Firmen-Proxy ist das nicht die Adresse Ihres Geräts im lokalen Netz.']
    ];
    if (info.acceptLanguage) rows.push(['Sprache laut Anfrage-Kopfzeile', info.acceptLanguage]);
    if (info.userAgent) rows.push(['Browser-Kennung laut Server', info.userAgent, true]);
    ipBox.appendChild(kv(rows));
    ipBox.appendChild(el('p', { class: 'muted small' },
      info.version === 'IPv6'
        ? 'Sie sind über IPv6 verbunden. Viele Anschlüsse haben zusätzlich IPv4; welche Adresse angezeigt wird, hängt davon ab, welches Protokoll der Browser für diese Seite wählt.'
        : 'Sie sind über IPv4 verbunden.'));
  }

  function load() {
    C.clear(ipBox);
    ipBox.appendChild(el('p', { class: 'muted' }, 'Wird ermittelt …'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    fetch('/api/ip', { cache: 'no-store', credentials: 'omit', headers: { accept: 'application/json' }, signal: ctrl.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var parsed = I.parseApiResponse(json);
        if (!parsed.ok) { unavailable(parsed.error); return; }
        renderIp(parsed);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') unavailable('Der Server hat nicht rechtzeitig geantwortet.');
        else if (err && /^HTTP/.test(err.message)) unavailable('Der Server antwortete mit „' + err.message + '“.');
        else unavailable('Der Server ist nicht erreichbar oder hat keine gültige Antwort geliefert.');
      })
      .then(function () { clearTimeout(timer); });
  }

  actions.appendChild(C.copyButton('Support-Informationen kopieren', supportText));
  reload.addEventListener('click', function () { renderBrowser(); load(); });
  window.addEventListener('resize', function () { /* Fenstergroesse aktuell halten */ renderBrowser(); });

  renderBrowser();
  load();
})();
