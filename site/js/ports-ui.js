/* Oberflaeche der Port-Referenz. Daten und Suche: ports.js. */
(function () {
  'use strict';
  var P = window.Ports;
  var C = window.Common;
  var el = C.el;

  var input = document.getElementById('q');
  var body = document.getElementById('ports-body');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  var tableEl = document.getElementById('ports-table');

  function badgeClass(c) { return c === 'ja' ? 'ok' : c === 'nein' ? 'warn' : 'info'; }

  function render() {
    var list = P.filter(input.value);
    C.clear(body);
    list.forEach(function (p) {
      body.appendChild(el('tr', null, [
        el('td', { class: 'mono nowrap', 'data-label': 'Port' }, p.port + '/' + p.proto),
        el('td', { 'data-label': 'Dienst' }, el('strong', null, p.name)),
        el('td', { 'data-label': 'Beschreibung' }, p.desc),
        el('td', { 'data-label': 'Verschlüsselt' }, el('span', { class: 'badge ' + badgeClass(p.crypt) }, P.CRYPT_TEXT[p.crypt] || p.crypt)),
        el('td', { 'data-label': 'Hinweis' }, p.note)
      ]));
    });
    count.textContent = list.length === P.PORTS.length
      ? P.PORTS.length + ' Ports'
      : list.length + ' von ' + P.PORTS.length + ' Ports';
    empty.hidden = list.length > 0;
    tableEl.hidden = list.length === 0;
  }

  input.addEventListener('input', render);
  document.getElementById('ports-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
  render();
})();
