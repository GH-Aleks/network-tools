/* Oberflaeche des Passwort-Generators. Erzeugung und Entropie: password.js (crypto.getRandomValues). */
(function () {
  'use strict';
  var P = window.Password;
  var C = window.Common;
  var el = C.el;

  var lengthRange = document.getElementById('length');
  var lengthNumber = document.getElementById('length-number');
  var boxes = {
    lower: document.getElementById('lower'),
    upper: document.getElementById('upper'),
    digits: document.getElementById('digits'),
    symbols: document.getElementById('symbols'),
    excludeAmbiguous: document.getElementById('ambiguous')
  };
  var out = document.getElementById('password-out');
  var message = document.getElementById('message');
  var stats = document.getElementById('stats');
  var meter = document.getElementById('meter-bar');
  var meterBox = document.getElementById('meter');
  var symbolsHint = document.getElementById('symbols-hint');

  var current = '';

  function options() {
    return {
      length: Number(lengthNumber.value),
      lower: boxes.lower.checked,
      upper: boxes.upper.checked,
      digits: boxes.digits.checked,
      symbols: boxes.symbols.checked,
      excludeAmbiguous: boxes.excludeAmbiguous.checked
    };
  }

  function generate() {
    C.clear(message);
    var r = P.generate(options());
    if (!r.ok) {
      current = '';
      out.textContent = '';
      C.clear(stats);
      meter.style.width = '0';
      meterBox.setAttribute('aria-valuenow', '0');
      message.appendChild(el('div', { class: 'notice error', role: 'alert' }, r.error));
      return;
    }
    current = r.password;
    out.textContent = r.password;
    C.clear(stats);
    var bits = Math.round(r.entropy);
    stats.appendChild(el('span', null, [el('strong', null, bits + ' Bit'), ' geschätzte Entropie · Zeichenvorrat: ' + r.pool + ' Zeichen · Bewertung: ']));
    stats.appendChild(el('span', { class: 'badge ' + (bits >= 64 ? 'ok' : bits >= 40 ? 'warn' : 'err') }, r.strength));
    meter.style.width = Math.min(100, Math.round(bits / 128 * 100)) + '%';
    meterBox.setAttribute('aria-valuenow', String(Math.min(bits, 128)));
  }

  function syncLength(from) {
    var v = Number(from.value);
    if (!isFinite(v) || from.value === '') return false;
    v = Math.max(P.MIN_LENGTH, Math.min(P.MAX_LENGTH, Math.round(v)));
    lengthRange.value = String(v);
    if (from === lengthRange) lengthNumber.value = String(v);
    return true;
  }

  lengthRange.addEventListener('input', function () { syncLength(lengthRange); generate(); });
  lengthNumber.addEventListener('input', function () { if (syncLength(lengthNumber)) generate(); });
  lengthNumber.addEventListener('change', function () { lengthNumber.value = lengthRange.value; generate(); });
  Object.keys(boxes).forEach(function (k) { boxes[k].addEventListener('change', generate); });
  document.getElementById('again').addEventListener('click', generate);
  document.getElementById('copy-slot').appendChild(C.copyButton('Kopieren', function () { return current; }));
  symbolsHint.textContent = P.SETS.symbols;

  lengthRange.min = lengthNumber.min = String(P.MIN_LENGTH);
  lengthRange.max = lengthNumber.max = String(P.MAX_LENGTH);
  generate();
})();
