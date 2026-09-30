/* Oberflaeche des Subnetz-Rechners. Die Berechnung steckt in subnet.js. */
(function () {
  'use strict';
  var S = window.Subnet;
  var C = window.Common;
  var el = C.el;

  var form = document.getElementById('subnet-form');
  var ipInput = document.getElementById('ip');
  var maskInput = document.getElementById('mask');
  var message = document.getElementById('message');
  var resultBox = document.getElementById('result');
  var splitBox = document.getElementById('split-box');
  var splitSelect = document.getElementById('split-n');
  var splitOut = document.getElementById('split-result');

  var current = null; // letzte erfolgreiche Berechnung {ip, prefix, calc}

  function showError(text) {
    C.clear(message);
    message.appendChild(el('div', { class: 'notice error' }, [el('strong', null, 'Eingabe prüfen: '), text]));
    ipInput.setAttribute('aria-invalid', 'true');
    maskInput.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    C.clear(message);
    ipInput.removeAttribute('aria-invalid');
    maskInput.removeAttribute('aria-invalid');
  }

  /** Binaerstring "1100.0000" -> Netzanteil hervorgehoben, Hostanteil abgesetzt. */
  function bits(binary, prefix) {
    var wrap = el('span', { class: 'binary' });
    var count = 0;
    var netText = '';
    var hostText = '';
    for (var i = 0; i < binary.length; i++) {
      var ch = binary.charAt(i);
      if (ch === '.') {
        if (count < prefix) netText += ch; else hostText += ch;
        continue;
      }
      if (count < prefix) netText += ch; else hostText += ch;
      count++;
    }
    if (netText) wrap.appendChild(el('span', { class: 'bits-net' }, netText));
    if (hostText) wrap.appendChild(el('span', { class: 'bits-host' }, hostText));
    return wrap;
  }

  function row(list, label, value, extra) {
    list.appendChild(el('dt', null, label));
    var dd = el('dd', extra && extra.plain ? { class: 'plain' } : null);
    if (value instanceof Node) dd.appendChild(value); else dd.textContent = value;
    list.appendChild(dd);
  }

  function render(calc) {
    C.clear(resultBox);
    var s = calc.strings;
    var cl = calc.classification;

    resultBox.appendChild(el('h2', { id: 'result-heading' }, 'Ergebnis für ' + s.cidr));

    if (calc.note) resultBox.appendChild(el('div', { class: 'notice info' }, calc.note));

    var dl = el('dl', { class: 'kv' });
    row(dl, 'Eingegebene Adresse', s.ip);
    row(dl, 'Netzadresse', s.network + '/' + calc.prefix);
    row(dl, 'Subnetzmaske', s.mask + '  (/' + calc.prefix + ')');
    row(dl, 'Wildcard-Maske', s.wildcard);
    row(dl, 'Broadcast-Adresse', calc.hasBroadcast ? s.broadcast : 'keine (' + (calc.kind === 'host' ? '/32' : '/31, RFC 3021') + ')', calc.hasBroadcast ? null : { plain: true });
    row(dl, calc.kind === 'normal' ? 'Erste nutzbare Adresse' : 'Erste Adresse', s.first);
    row(dl, calc.kind === 'normal' ? 'Letzte nutzbare Adresse' : 'Letzte Adresse', s.last);
    row(dl, 'Nutzbare Hosts', C.fmtInt(calc.hosts), { plain: true });
    row(dl, 'Adressen insgesamt', C.fmtInt(calc.total), { plain: true });
    row(dl, 'Adressklasse', cl.class, { plain: true });
    var scope = cl.label + (cl.rfc ? ' – ' + cl.rfc : '');
    row(dl, 'Bereich', scope, { plain: true });
    if (calc.contains && calc.contains.length) {
      row(dl, 'Enthält Sonderbereiche', calc.contains.join('; '), { plain: true });
    }
    resultBox.appendChild(el('div', { class: 'card' }, dl));

    // Binaerdarstellung
    var bin = el('dl', { class: 'kv' });
    row(bin, 'Adresse', bits(calc.binary.ip, calc.prefix));
    row(bin, 'Subnetzmaske', bits(calc.binary.mask, calc.prefix));
    row(bin, 'Netzadresse', bits(calc.binary.network, calc.prefix));
    row(bin, 'Wildcard', bits(calc.binary.wildcard, calc.prefix));
    resultBox.appendChild(el('h3', null, 'Binärdarstellung'));
    resultBox.appendChild(el('p', { class: 'muted small' }, 'Fett: Netzanteil (die ersten ' + calc.prefix + ' Bit), blass: Hostanteil.'));
    resultBox.appendChild(el('div', { class: 'card' }, bin));

    var copy = el('div', { class: 'actions' }, [
      C.copyButton('CIDR kopieren', function () { return s.cidr; }),
      C.copyButton('Ergebnis als Text kopieren', function () {
        return [
          'Netzadresse: ' + s.network + '/' + calc.prefix,
          'Subnetzmaske: ' + s.mask,
          'Wildcard: ' + s.wildcard,
          'Broadcast: ' + (calc.hasBroadcast ? s.broadcast : '-'),
          'Erste Adresse: ' + s.first,
          'Letzte Adresse: ' + s.last,
          'Hosts: ' + calc.hosts
        ].join('\n');
      })
    ]);
    resultBox.appendChild(copy);
  }

  function updateSplitOptions(prefix) {
    var keep = splitSelect.value;
    var max = Math.min(32 - prefix, 12); // S.MAX_SPLIT = 4096 = 2^12
    C.clear(splitSelect);
    for (var b = 1; b <= max; b++) {
      var n = Math.pow(2, b);
      var opt = el('option', { value: String(n) }, C.fmtInt(n) + '  (→ /' + (prefix + b) + ')');
      splitSelect.appendChild(opt);
    }
    if (max < 1) {
      splitSelect.appendChild(el('option', { value: '' }, 'nicht möglich'));
      splitSelect.disabled = true;
      return;
    }
    splitSelect.disabled = false;
    if (keep && splitSelect.querySelector('option[value="' + keep + '"]')) splitSelect.value = keep;
  }

  function renderSplit() {
    C.clear(splitOut);
    if (!current || splitSelect.disabled) {
      if (current) splitOut.appendChild(el('p', { class: 'muted' }, 'Ein /' + current.prefix + ' lässt sich nicht weiter unterteilen.'));
      return;
    }
    var n = Number(splitSelect.value);
    var r = S.split(current.ip, current.prefix, n);
    if (!r.ok) {
      splitOut.appendChild(el('div', { class: 'notice error', role: 'alert' }, r.error));
      return;
    }
    var table = el('table', { class: 'stack' });
    table.appendChild(el('caption', null, C.fmtInt(n) + ' Teilnetze mit Präfix /' + r.newPrefix));
    table.appendChild(el('thead', null, el('tr', null, [
      el('th', { scope: 'col', class: 'num' }, '#'),
      el('th', { scope: 'col' }, 'Netz'),
      el('th', { scope: 'col' }, 'Erste Adresse'),
      el('th', { scope: 'col' }, 'Letzte Adresse'),
      el('th', { scope: 'col' }, 'Broadcast'),
      el('th', { scope: 'col', class: 'num' }, 'Hosts')
    ])));
    var tb = el('tbody');
    r.subnets.forEach(function (sn, i) {
      tb.appendChild(el('tr', null, [
        el('td', { class: 'num', 'data-label': '#' }, String(i + 1)),
        el('td', { class: 'mono', 'data-label': 'Netz' }, sn.strings.cidr),
        el('td', { class: 'mono', 'data-label': 'Erste Adresse' }, sn.strings.first),
        el('td', { class: 'mono', 'data-label': 'Letzte Adresse' }, sn.strings.last),
        el('td', { class: 'mono', 'data-label': 'Broadcast' }, sn.hasBroadcast ? sn.strings.broadcast : '–'),
        el('td', { class: 'num', 'data-label': 'Hosts' }, C.fmtInt(sn.hosts))
      ]));
    });
    table.appendChild(tb);
    splitOut.appendChild(table);
    splitOut.appendChild(el('div', { class: 'actions' }, [
      C.copyButton('Netze kopieren', function () {
        return r.subnets.map(function (sn) { return sn.strings.cidr; }).join('\n');
      })
    ]));
  }

  function compute() {
    var parsed = S.parseInput(ipInput.value, maskInput.value);
    if (!parsed.ok) {
      current = null;
      C.clear(resultBox);
      splitBox.hidden = true;
      showError(parsed.error);
      return;
    }
    clearError();
    var calc = S.calc(parsed.ip, parsed.prefix);
    current = { ip: parsed.ip, prefix: parsed.prefix, calc: calc };
    render(calc);
    splitBox.hidden = false;
    updateSplitOptions(calc.prefix);
    renderSplit();
  }

  form.addEventListener('submit', function (ev) { ev.preventDefault(); compute(); });
  splitSelect.addEventListener('change', renderSplit);
  document.getElementById('split-form').addEventListener('submit', function (ev) { ev.preventDefault(); renderSplit(); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (btn) {
    btn.addEventListener('click', function () {
      ipInput.value = btn.getAttribute('data-ip');
      maskInput.value = btn.getAttribute('data-mask');
      compute();
    });
  });

  compute();
})();
