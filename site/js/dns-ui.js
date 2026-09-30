/* Oberflaeche der DNS-Abfrage per DNS-over-HTTPS. Auswertung in dns.js. */
(function () {
  'use strict';
  var D = window.Dns;
  var C = window.Common;
  var el = C.el;

  var form = document.getElementById('dns-form');
  var nameInput = document.getElementById('name');
  var typeSelect = document.getElementById('type');
  var providerSelect = document.getElementById('provider');
  var submitBtn = document.getElementById('dns-submit');
  var typeHelp = document.getElementById('type-help');
  var providerInfo = document.getElementById('provider-info');
  var message = document.getElementById('message');
  var resultBox = document.getElementById('result');

  var TIMEOUT_MS = 10000;
  var running = 0; // Zaehler, damit eine alte Antwort eine neuere nicht ueberschreibt

  function updateHints() {
    typeHelp.textContent = D.TYPE_HELP[typeSelect.value] || '';
    var p = D.PROVIDERS[providerSelect.value];
    C.clear(providerInfo);
    providerInfo.appendChild(document.createTextNode('Die Abfrage geht direkt von Ihrem Browser an '));
    providerInfo.appendChild(el('strong', null, p.label));
    providerInfo.appendChild(document.createTextNode(' (' + new URL(p.url).host + '). Dieser Anbieter sieht die abgefragte Domain und Ihre IP-Adresse. '));
    providerInfo.appendChild(el('a', { href: p.privacy, rel: 'noopener noreferrer', target: '_blank' }, 'Datenschutzhinweise von ' + p.label));
    providerInfo.appendChild(document.createTextNode('. Dieser Server erhält die Abfrage nicht.'));
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Abfrage läuft …' : 'Abfragen';
    resultBox.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function showNotice(kind, title, text) {
    C.clear(message);
    message.appendChild(el('div', { class: 'notice ' + kind }, [el('strong', null, title + ' '), text]));
  }

  function rowsTable(caption, rows, type) {
    var table = el('table', { class: 'stack' });
    table.appendChild(el('caption', null, caption));
    table.appendChild(el('thead', null, el('tr', null, [
      el('th', { scope: 'col' }, 'Name'),
      el('th', { scope: 'col' }, 'Typ'),
      el('th', { scope: 'col' }, 'TTL'),
      el('th', { scope: 'col' }, 'Daten')
    ])));
    var tb = el('tbody');
    rows.forEach(function (r) {
      var ttl = el('td', { 'data-label': 'TTL' }, r.ttlText);
      var dataCell = el('td', { class: 'mono', 'data-label': 'Daten' }, r.data);
      tb.appendChild(el('tr', null, [
        el('td', { class: 'mono', 'data-label': 'Name' }, r.name),
        el('td', { 'data-label': 'Typ' }, r.type),
        ttl,
        dataCell
      ]));
    });
    table.appendChild(tb);
    return table;
  }

  function soaDetails(row) {
    var f = D.parseSOA(row.raw);
    if (!f) return null;
    var dl = el('dl', { class: 'kv' });
    Object.keys(f).forEach(function (k) {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, String(f[k])));
    });
    return dl;
  }

  function render(sum, name, type, provider, ms) {
    C.clear(resultBox);
    var kind = sum.outcome === 'ok' ? 'ok' : (sum.outcome === 'error' ? 'error' : 'warn');
    var title;
    if (sum.outcome === 'ok') title = sum.answers.length + (sum.answers.length === 1 ? ' Eintrag gefunden' : ' Einträge gefunden');
    else if (sum.outcome === 'nodata') title = 'Kein Eintrag vom Typ ' + type;
    else if (sum.outcome === 'nxdomain') title = 'Name existiert nicht';
    else title = 'Abfrage nicht erfolgreich';

    resultBox.appendChild(el('h2', { id: 'result-heading' }, 'Ergebnis: ' + name + ' (' + type + ')'));

    var head = el('div', { class: 'notice ' + kind }, [
      el('p', null, [el('strong', null, title + '. '), 'Status: ', el('span', { class: 'badge ' + (sum.outcome === 'ok' ? 'ok' : sum.outcome === 'error' ? 'err' : 'warn') }, sum.statusName)]),
      el('p', null, sum.outcome === 'ok' ? 'Die Abfrage war erfolgreich, der Resolver hat die Einträge geliefert.' : sum.explanation)
    ]);
    if (sum.outcome === 'nodata') {
      head.appendChild(el('p', null, 'Der Name ist bekannt, hat aber keinen Datensatz vom Typ ' + type + '. Anderen Typ probieren, z. B. A, AAAA oder NS.'));
    }
    resultBox.appendChild(head);

    if (sum.answers.length) {
      resultBox.appendChild(el('div', { class: 'card' }, rowsTable('Antwort', sum.answers, type)));
      var soa = sum.answers.filter(function (r) { return r.type === 'SOA'; })[0];
      if (soa) {
        var d = soaDetails(soa);
        if (d) {
          resultBox.appendChild(el('h3', null, 'SOA im Klartext'));
          resultBox.appendChild(el('div', { class: 'card' }, d));
        }
      }
    }
    if (sum.authority.length) {
      resultBox.appendChild(el('div', { class: 'card' }, rowsTable(
        sum.outcome === 'ok' ? 'Zuständigkeit (Authority)' : 'Zuständigkeit (Authority, z. B. SOA der Zone mit Negativ-TTL)', sum.authority, type)));
    }

    var meta = el('ul', { class: 'small muted' });
    meta.appendChild(el('li', null, 'Befragter Resolver: ' + provider.label + ', Antwortzeit ca. ' + ms + ' ms.'));
    sum.flags.forEach(function (f) { meta.appendChild(el('li', null, f.key + ': ' + f.text)); });
    sum.comments.forEach(function (c) { meta.appendChild(el('li', null, 'Hinweis des Resolvers: ' + c)); });
    resultBox.appendChild(meta);

    if (sum.answers.length) {
      resultBox.appendChild(el('div', { class: 'actions' }, [
        C.copyButton('Antwort kopieren', function () {
          return sum.answers.map(function (r) { return r.name + '\t' + r.ttl + '\t' + r.type + '\t' + r.data; }).join('\n');
        })
      ]));
    }
  }

  function friendlyNetworkError(provider, err) {
    if (err && err.name === 'AbortError') {
      return 'Keine Antwort von ' + provider.label + ' innerhalb von ' + (TIMEOUT_MS / 1000) + ' Sekunden. Später erneut versuchen oder den anderen Anbieter wählen.';
    }
    return provider.label + ' ist von diesem Browser aus nicht erreichbar. Mögliche Ursachen: keine Internetverbindung, ein Werbe-/Inhaltsblocker, eine Firmen-Firewall oder ein Proxy, der DNS-over-HTTPS sperrt. Es hilft oft, den anderen Anbieter zu wählen.';
  }

  function run() {
    var n = D.normalizeName(nameInput.value);
    if (!n.ok) {
      C.clear(resultBox);
      showNotice('error', 'Eingabe prüfen:', n.error);
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      return;
    }
    nameInput.removeAttribute('aria-invalid');
    C.clear(message);
    var type = typeSelect.value;
    var provider = D.PROVIDERS[providerSelect.value];
    var url = D.buildUrl(provider.id, n.name, type);
    var ticket = ++running;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var started = Date.now();
    setBusy(true);

    fetch(url, { headers: provider.headers, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (ticket !== running) return;
        var sum = D.summarize(json, type);
        if (!sum.valid) {
          C.clear(resultBox);
          showNotice('error', 'Unerwartete Antwort:', provider.label + ' hat etwas geliefert, das nicht wie eine DNS-Antwort aussieht.');
          return;
        }
        render(sum, n.name, type, provider, Date.now() - started);
      })
      .catch(function (err) {
        if (ticket !== running) return;
        C.clear(resultBox);
        showNotice('error', 'Abfrage fehlgeschlagen.', err && /^HTTP/.test(err.message)
          ? provider.label + ' antwortete mit ' + err.message + '. Später erneut versuchen oder den anderen Anbieter wählen.'
          : friendlyNetworkError(provider, err));
      })
      .then(function () {
        clearTimeout(timer);
        if (ticket === running) setBusy(false);
      });
  }

  form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
  typeSelect.addEventListener('change', updateHints);
  providerSelect.addEventListener('change', updateHints);
  Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (btn) {
    btn.addEventListener('click', function () {
      nameInput.value = btn.getAttribute('data-name');
      typeSelect.value = btn.getAttribute('data-type');
      updateHints();
      run();
    });
  });
  updateHints();
})();
