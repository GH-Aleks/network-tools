/*
 * Gemeinsame Helfer fuer die Seiten: DOM-Aufbau ohne innerHTML (Daten von aussen
 * werden immer als Text eingesetzt) und Kopieren in die Zwischenablage.
 */
(function (root) {
  'use strict';

  /** el('td', {class:'mono', 'data-label':'Netz'}, ['text', otherNode]) */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v == null) return;
        if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children == null ? [] : [].concat(children)).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    // Kein style-Attribut (die Content-Security-Policy erlaubt keine Inline-Styles), sondern CSSOM.
    var ta = el('textarea', { readonly: true, 'aria-hidden': 'true' });
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /** Kopier-Knopf; der Text wird erst beim Klick ueber getText() geholt. */
  function copyButton(label, getText) {
    var btn = el('button', { type: 'button', class: 'secondary small' }, label);
    var timer = null;
    btn.addEventListener('click', function () {
      var t = getText();
      if (!t) return;
      copyText(t).then(function (ok) {
        btn.textContent = ok ? 'Kopiert' : 'Kopieren nicht möglich';
        clearTimeout(timer);
        timer = setTimeout(function () { btn.textContent = label; }, 1800);
      });
    });
    return btn;
  }

  function fmtInt(n) {
    return Number(n).toLocaleString('de-DE');
  }

  root.Common = { el: el, clear: clear, copyText: copyText, copyButton: copyButton, fmtInt: fmtInt };
})(window);
