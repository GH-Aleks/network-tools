# Netzwerk-Werkzeuge

Fünf kleine Werkzeuge, wie sie im IT-Support und am Service Desk täglich gebraucht werden: Subnetz-Rechner, DNS-Abfrage, "Meine IP", Passwort-Generator und eine Port-Übersicht. Die Seite ist rein statisch (HTML, CSS, JavaScript), hat keinen Build-Schritt und keine Abhängigkeiten. Die Oberfläche ist deutsch.

Live: https://tools.aleksanderbauer.de

## Die Werkzeuge

| Werkzeug | Was es tut |
| --- | --- |
| **Subnetz-Rechner** (`subnetz.html`) | IPv4-Adresse mit Präfix (`/24`) oder Maske. Zeigt Netz, Broadcast, erste und letzte nutzbare Adresse, Hostanzahl, Maske, Wildcard, Binärdarstellung sowie Klasse und Art (privat nach RFC 1918, CGNAT, Loopback, Link-Local, öffentlich). `/31` (RFC 3021) und `/32` werden korrekt behandelt. Teilt ein Netz in N gleich große Subnetze auf (Tabelle). |
| **DNS-Abfrage** (`dns.html`) | Fragt A, AAAA, CNAME, MX, TXT, NS, SOA und CAA per DNS-over-HTTPS ab (Cloudflare oder Google umschaltbar). Tabelle mit TTL und einer verständlichen Erklärung von NOERROR, NXDOMAIN und SERVFAIL. |
| **Meine IP & Browser** (`meine-ip.html`) | Zeigt öffentliche IP (IPv4/IPv6) und Browserdaten, als Text kopierbar für Support-Tickets. Nutzt dafür den Endpunkt `/api/ip` des eigenen Servers. |
| **Passwort-Generator** (`passwort.html`) | Zufällige Passwörter mit `crypto.getRandomValues`, einstellbare Länge und Zeichengruppen, mehrdeutige Zeichen ausschließbar, geschätzte Entropie in Bit. Nichts wird gespeichert. |
| **Port-Übersicht** (`ports.html`) | Häufige TCP/UDP-Ports mit Dienst, Beschreibung und Angabe, ob das Protokoll verschlüsselt ist. Mit Suche. |

## Datenschutz: was bleibt im Browser, was geht wohin?

- **Subnetz-Rechner, Passwort-Generator, Port-Übersicht:** reine Berechnung im Browser. Es wird nichts gesendet und nichts gespeichert.
- **DNS-Abfrage:** Erst beim Klick auf "Abfragen" schickt der Browser die eingegebene Domain direkt an den gewählten Anbieter (Cloudflare `cloudflare-dns.com` oder Google `dns.google`). Dieser sieht Domain und IP-Adresse. Der Server dieser Seite erhält die Abfrage nicht. Die Seite weist im Formular darauf hin.
- **Meine IP:** Der Browser fragt `/api/ip` auf dem eigenen Server. Dort wird die Adresse gelesen, die bei ihm ankommt.
- Keine Cookies, keine Tracker, keine Analyse, keine externen Schriften oder Skripte. Jede Seite bringt eine strenge Content-Security-Policy per `<meta>` mit (`default-src 'none'`, Skripte und Styles nur von der eigenen Herkunft, `connect-src` je Seite so eng wie möglich).

Details stehen auf der Seite `datenschutz.html`.

## Aufbau

```
site/                 Webroot (wird 1:1 ausgeliefert)
  index.html          Startseite
  subnetz.html, dns.html, meine-ip.html, passwort.html, ports.html, datenschutz.html
  css/style.css       ein Stylesheet, helles/dunkles Farbschema per prefers-color-scheme
  js/
    subnet.js, dns.js, password.js, ipinfo.js, ports.js   Logik ohne DOM, testbar unter Node
    *-ui.js                                               Oberfläche je Werkzeug
    common.js                                             DOM-Hilfsfunktionen (Text nur per textContent)
  favicon.svg
tests/                Tests mit dem eingebauten Node-Testläufer
```

Die Logikmodule sind so geschrieben, dass sie im Browser (`window.Subnet` usw.) und unter Node (`require`) laufen. Die `*-ui.js`-Dateien verbinden sie mit der Seite.

## Lokal starten

```
python -m http.server -d site
```

Danach http://localhost:8000 öffnen. Jeder andere statische Server tut es auch (z. B. `npx serve site`). Ohne eigenen Server ist `/api/ip` nicht erreichbar, die Seite "Meine IP" zeigt dann einen Hinweis statt einer Fehlermeldung. Die DNS-Abfrage braucht eine Internetverbindung.

## Tests

```
node --test
```

Benötigt nur Node.js (Version 20 oder neuer), keine Pakete. Die Tests decken ab:

- die Rechenlogik (Subnetz inkl. `/31`, `/32`, ungültige Eingaben und Aufteilung, DNS-Auswertung und Statuscodes, Passwort-Erzeugung und Entropie, IP-Erkennung, Port-Suche),
- die Seiten selbst (alle Verweise vorhanden, CSP auf jeder Seite, keine externen Ressourcen, keine Inline-Skripte oder -Styles, keine `innerHTML`-Zuweisungen, Pflichtangaben im Footer).

Nicht automatisiert getestet ist das Zusammenspiel im Browser. Das habe ich von Hand geprüft (siehe unten).

## Betrieb

Die Seite ist als statisches Webroot gedacht und läuft beim Autor hinter Caddy auf einem eigenen Linux-Server (`file_server`). Zwei Dinge gehören zum Betrieb und nicht in dieses Repository:

1. **`/api/ip`:** Die Seite "Meine IP" erwartet `GET /api/ip` mit der Antwort `{"ip":"…","userAgent":"…","acceptLanguage":"…"}`. Der Endpunkt muss vom Betreiber in der Webserver-Konfiguration eingerichtet werden.
2. **Sicherheits-Header:** Die CSP per `<meta>` kann kein `frame-ancestors`. Wer das will (und z. B. `X-Content-Type-Options`, `Referrer-Policy`), setzt die Header im Webserver.

## Wie dieses Projekt entstanden ist

Das Projekt wurde KI-gestützt umgesetzt (mit Claude Code). Ich habe Aufgabenstellung, Funktionsumfang und Datenschutz-Vorgaben festgelegt, das Ergebnis geprüft und die Tests laufen lassen. Bei der Prüfung im Browser sind Fehler aufgefallen und behoben worden (z. B. eine doppelt angezeigte TTL und ein DNS-Beispiel, das statt "Name existiert nicht" nur "kein Eintrag" lieferte). Der Quelltext ist klein und lesbar gehalten, damit man ihn nachvollziehen kann.

## English summary

A small set of static, dependency-free network tools for IT support work, all computed in the browser: an IPv4 subnet calculator (incl. /31 and /32 per RFC 3021, subnet splitting), a DNS lookup over DNS-over-HTTPS (Cloudflare or Google, chosen by the user), a "my IP and browser" page (needs a `/api/ip` endpoint on the hosting server), a password generator based on `crypto.getRandomValues`, and a port reference. No build step, no cookies, no third-party scripts or fonts, strict per-page Content-Security-Policy. The calculation logic is covered by unit tests (`node --test`). The UI is in German. The project was implemented with AI assistance (Claude Code) and reviewed and tested by the author.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
