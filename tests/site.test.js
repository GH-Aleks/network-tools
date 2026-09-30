'use strict';
// Hygiene-Tests fuer die statische Seite: Verweise, CSP, keine externen Ressourcen,
// keine Inline-Skripte/-Styles, sichere DOM-Ausgabe, keine verbotenen Inhalte.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const read = (p) => fs.readFileSync(p, 'utf8');
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const uiScripts = fs.readdirSync(path.join(SITE, 'js')).filter((f) => f.endsWith('-ui.js'));

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

test('es gibt die erwarteten sieben Seiten', () => {
  ['index', 'subnetz', 'dns', 'meine-ip', 'passwort', 'ports', 'datenschutz'].forEach((n) => {
    assert.ok(pages.includes(n + '.html'), n + '.html fehlt');
  });
});

test('alle lokalen Verweise (href/src) zeigen auf vorhandene Dateien', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    const re = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const ref = m[1];
      if (/^(https?:|mailto:|#)/.test(ref)) continue;
      const file = ref.split('#')[0];
      assert.ok(fs.existsSync(path.join(SITE, file)), f + ' verweist auf fehlende Datei ' + ref);
    }
  });
});

test('Ankerziele (#...) existieren auf der Seite', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    const re = /href="#([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      assert.ok(html.includes('id="' + m[1] + '"'), f + ': Anker #' + m[1] + ' fehlt');
    }
  });
});

test('jede Seite hat lang, Titel, Viewport, Referrer-Policy und restriktive CSP', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    assert.match(html, /<html lang="de">/, f);
    assert.match(html, /<title>[^<]+<\/title>/, f);
    assert.match(html, /name="viewport"/, f);
    assert.match(html, /name="referrer" content="no-referrer"/, f);
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp, f + ': CSP fehlt');
    assert.match(csp[1], /default-src 'none'/, f);
    assert.match(csp[1], /script-src 'self'/, f);
    assert.doesNotMatch(csp[1], /unsafe-inline|unsafe-eval|\*/, f + ': CSP zu weit');
  });
});

test('connect-src ist pro Seite so eng wie noetig', () => {
  const connect = (f) => /connect-src ([^;"]+)/.exec(read(path.join(SITE, f)))[1].trim();
  assert.strictEqual(connect('dns.html'), 'https://cloudflare-dns.com https://dns.google');
  assert.strictEqual(connect('meine-ip.html'), "'self'");
  ['index.html', 'subnetz.html', 'passwort.html', 'ports.html', 'datenschutz.html'].forEach((f) => {
    assert.strictEqual(connect(f), "'none'", f);
  });
});

test('keine externen Skripte, Stylesheets, Schriften oder Bilder', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    assert.doesNotMatch(html, /<script[^>]+src="https?:/i, f);
    assert.doesNotMatch(html, /<link[^>]+href="https?:/i, f);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/i, f);
  });
  const css = read(path.join(SITE, 'css', 'style.css'));
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i, 'CSS laedt Externes');
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/i);
});

test('keine Inline-Skripte, Inline-Styles oder Event-Handler-Attribute', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, f + ': Inline-Skript');
    assert.doesNotMatch(html, /<style[\s>]/i, f + ': style-Element');
    assert.doesNotMatch(html, /\sstyle="/i, f + ': style-Attribut');
    assert.doesNotMatch(html, /\son[a-z]+="/i, f + ': Event-Handler-Attribut');
    assert.doesNotMatch(html, /javascript:/i, f);
  });
});

test('Footer mit Pflichtangaben auf jeder Seite', () => {
  pages.forEach((f) => {
    const html = read(path.join(SITE, f));
    assert.match(html, /Ein Projekt von <a href="https:\/\/aleksanderbauer\.de">Aleksander Bauer<\/a>/, f);
    assert.ok(html.includes('href="https://github.com/GH-Aleks/network-tools"'), f);
    assert.ok(html.includes('Quellcode auf GitHub'), f);
  });
});

test('Seiten mit Skripten haben einen noscript-Hinweis', () => {
  pages.filter((f) => f !== 'datenschutz.html' && f !== 'index.html').forEach((f) => {
    assert.match(read(path.join(SITE, f)), /<noscript>/, f);
  });
});

test('Oberflaechen-Skripte schreiben nie per innerHTML/outerHTML/document.write/eval', () => {
  assert.ok(uiScripts.length >= 5);
  const files = uiScripts.concat(['common.js']).map((f) => path.join(SITE, 'js', f));
  files.forEach((p) => {
    const code = read(p);
    assert.doesNotMatch(code, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, path.basename(p));
    assert.doesNotMatch(code, /setAttribute\(\s*['"]style['"]/, path.basename(p) + ': style-Attribut gesetzt');
  });
});

test('Berechnungsmodule sind frei von DOM-Zugriff (testbar unter Node)', () => {
  ['subnet.js', 'dns.js', 'password.js', 'ipinfo.js', 'ports.js'].forEach((f) => {
    const code = read(path.join(SITE, 'js', f));
    assert.doesNotMatch(code, /\bdocument\./, f);
    assert.doesNotMatch(code, /\bwindow\.(location|document)/, f);
  });
});

test('keine verbotenen Inhalte im Repo (Kontaktdaten, Tokens, Fremdthemen)', () => {
  const files = walk(ROOT).filter((p) => /\.(html|css|js|json|md|svg|yml|yaml|txt)$/.test(p) || /LICENSE|\.gitignore|\.gitattributes/.test(p));
  assert.ok(files.length > 10);
  const self = path.join(__dirname, 'site.test.js');
  files.forEach((p) => {
    if (p === self) return;
    const txt = read(p);
    const rel = path.relative(ROOT, p);
    // E-Mail-Adressen (die no-reply-Adresse steht nur im Git-Verlauf, nicht in Dateien)
    assert.doesNotMatch(txt, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, rel + ': E-Mail-Adresse');
    assert.doesNotMatch(txt, /orion|krypto|crypto-?trading|bybit|binance/i, rel + ': Fremdthema');
    assert.doesNotMatch(txt, /\b(ghp_|github_pat_|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{12})/, rel + ': Token');
    assert.doesNotMatch(txt, /(\+49|0049)[\s\d\/-]{6,}|\b0\d{2,4}[\s\/-]\d{6,}\b/, rel + ': Telefonnummer');
  });
});

test('die im Repo vorhandene Lizenz ist MIT mit dem richtigen Namen', () => {
  const lic = read(path.join(ROOT, 'LICENSE'));
  assert.match(lic, /MIT License/);
  assert.match(lic, /Copyright \(c\) 2026 Aleksander Bauer/);
});

test('favicon.svg ist ein gueltiges, skriptfreies SVG', () => {
  const svg = read(path.join(SITE, 'favicon.svg'));
  assert.match(svg, /<svg[\s>]/);
  assert.doesNotMatch(svg, /<script|on[a-z]+=|https?:\/\/(?!www\.w3\.org)/i);
});
