/*
 * Portreferenz: statische Daten und Filterfunktion, ohne DOM.
 * Quelle der Zuordnung: IANA Service Name and Transport Protocol Port Number Registry
 * sowie die jeweiligen RFCs. "Hinweis" beschreibt die uebliche Nutzung, nicht jede Sonderform.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ports = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // crypt: 'nein' = Klartext, 'ja' = verschluesselt, 'optional' = je nach Konfiguration / STARTTLS
  var PORTS = [
    { port: '20', proto: 'TCP', name: 'FTP-Daten', desc: 'Datenkanal des File Transfer Protocol (aktiver Modus)', crypt: 'nein', note: 'FTP überträgt Zugangsdaten im Klartext. Besser SFTP (Port 22) oder FTPS.' },
    { port: '21', proto: 'TCP', name: 'FTP', desc: 'Steuerkanal des File Transfer Protocol', crypt: 'nein', note: 'Klartext. Mit FTPS (explizites TLS) optional absicherbar.' },
    { port: '22', proto: 'TCP', name: 'SSH', desc: 'Secure Shell: Fernwartung per Kommandozeile, auch SFTP und SCP', crypt: 'ja', note: 'Sollte nicht offen aus dem Internet erreichbar sein, wenn es nicht nötig ist.' },
    { port: '23', proto: 'TCP', name: 'Telnet', desc: 'Unverschlüsselte Fernwartung per Kommandozeile', crypt: 'nein', note: 'Veraltet, nicht mehr verwenden. SSH ist der Ersatz.' },
    { port: '25', proto: 'TCP', name: 'SMTP', desc: 'Mailtransport zwischen Mailservern', crypt: 'optional', note: 'Für den Versand vom Mailprogramm aus wird Port 587 (oder 465) genutzt. Viele Provider sperren Port 25 für Endkunden.' },
    { port: '53', proto: 'UDP/TCP', name: 'DNS', desc: 'Namensauflösung (Domainname zu IP-Adresse)', crypt: 'nein', note: 'Normalerweise UDP, TCP bei großen Antworten und Zonentransfers. Verschlüsselt: DoT (853) und DoH (443).' },
    { port: '67', proto: 'UDP', name: 'DHCP (Server)', desc: 'Dynamic Host Configuration Protocol: der Server vergibt IP-Adressen', crypt: 'nein', note: 'Port 67 ist der Serverport.' },
    { port: '68', proto: 'UDP', name: 'DHCP (Client)', desc: 'Dynamic Host Configuration Protocol: Port des anfragenden Geräts', crypt: 'nein', note: 'Port 68 ist der Clientport.' },
    { port: '80', proto: 'TCP', name: 'HTTP', desc: 'Webseiten ohne Verschlüsselung', crypt: 'nein', note: 'Wird meist nur noch zur Weiterleitung auf HTTPS benutzt.' },
    { port: '110', proto: 'TCP', name: 'POP3', desc: 'Mail abholen (lädt Nachrichten meist herunter und löscht sie auf dem Server)', crypt: 'optional', note: 'Ohne STARTTLS im Klartext. Verschlüsselt: Port 995.' },
    { port: '123', proto: 'UDP', name: 'NTP', desc: 'Network Time Protocol: Zeitsynchronisation', crypt: 'nein', note: 'Falsche Uhrzeit verursacht z. B. Zertifikats- und Anmeldefehler.' },
    { port: '143', proto: 'TCP', name: 'IMAP', desc: 'Mail abrufen, Nachrichten bleiben auf dem Server', crypt: 'optional', note: 'Ohne STARTTLS im Klartext. Verschlüsselt: Port 993.' },
    { port: '389', proto: 'TCP/UDP', name: 'LDAP', desc: 'Verzeichnisdienst, z. B. Active Directory', crypt: 'optional', note: 'Mit STARTTLS absicherbar. Verschlüsselt von Beginn an: Port 636.' },
    { port: '443', proto: 'TCP/UDP', name: 'HTTPS', desc: 'Webseiten mit TLS-Verschlüsselung (UDP für HTTP/3 über QUIC)', crypt: 'ja', note: 'Auch DNS-over-HTTPS läuft über diesen Port.' },
    { port: '445', proto: 'TCP', name: 'SMB', desc: 'Windows-Datei- und Druckerfreigaben (Server Message Block)', crypt: 'optional', note: 'Darf nicht aus dem Internet erreichbar sein.' },
    { port: '465', proto: 'TCP', name: 'SMTPS / Submissions', desc: 'Mailversand mit TLS von Beginn an', crypt: 'ja', note: 'Wird von RFC 8314 für den Versand mit Mailprogramm empfohlen, gleichwertig zu 587 mit STARTTLS.' },
    { port: '587', proto: 'TCP', name: 'SMTP Submission', desc: 'Mailversand vom Mailprogramm zum Mailserver (mit Anmeldung)', crypt: 'optional', note: 'Verschlüsselung per STARTTLS; Server sollten sie verlangen.' },
    { port: '636', proto: 'TCP', name: 'LDAPS', desc: 'LDAP mit TLS von Beginn an', crypt: 'ja', note: 'Sicherer Zugriff auf Verzeichnisdienste.' },
    { port: '993', proto: 'TCP', name: 'IMAPS', desc: 'IMAP mit TLS von Beginn an', crypt: 'ja', note: 'Empfohlener Port für den Mailabruf per IMAP.' },
    { port: '995', proto: 'TCP', name: 'POP3S', desc: 'POP3 mit TLS von Beginn an', crypt: 'ja', note: 'Verschlüsselte Variante von Port 110.' },
    { port: '1433', proto: 'TCP', name: 'MS SQL Server', desc: 'Datenbankserver von Microsoft', crypt: 'optional', note: 'Nicht aus dem Internet erreichbar machen.' },
    { port: '3306', proto: 'TCP', name: 'MySQL / MariaDB', desc: 'Datenbankserver', crypt: 'optional', note: 'Nicht aus dem Internet erreichbar machen.' },
    { port: '3389', proto: 'TCP/UDP', name: 'RDP', desc: 'Remote Desktop Protocol: Fernzugriff auf Windows-Oberflächen', crypt: 'ja', note: 'Häufiges Angriffsziel. Nicht direkt ins Internet stellen, besser per VPN.' },
    { port: '5432', proto: 'TCP', name: 'PostgreSQL', desc: 'Datenbankserver', crypt: 'optional', note: 'Nicht aus dem Internet erreichbar machen.' },
    { port: '5900', proto: 'TCP', name: 'VNC', desc: 'Fernzugriff auf die grafische Oberfläche (Virtual Network Computing)', crypt: 'nein', note: 'Die Verbindung selbst ist oft unverschlüsselt. Nur durch einen Tunnel (SSH, VPN) verwenden.' },
    { port: '8080', proto: 'TCP', name: 'HTTP (alternativ)', desc: 'Häufig genutzter Ausweichport für Webserver, Proxys und Test-Server', crypt: 'nein', note: 'Keine feste Zuordnung, aber als „HTTP-alt“ bei der IANA eingetragen.' }
  ];

  var CRYPT_TEXT = { nein: 'Nein (Klartext)', ja: 'Ja', optional: 'Optional (z. B. STARTTLS)' };

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }

  /**
   * Filtert die Liste. Eine reine Zahl trifft die Portnummer (Anfang der Nummer),
   * sonst wird in Name, Beschreibung und Protokoll gesucht. Mehrere Woerter muessen alle vorkommen.
   */
  function filter(query, list) {
    list = list || PORTS;
    var q = fold(query).trim();
    if (q === '') return list.slice();
    var words = q.split(/\s+/);
    return list.filter(function (p) {
      return words.every(function (w) {
        if (/^\d+$/.test(w)) return p.port.indexOf(w) === 0 || fold(p.name + ' ' + p.desc).indexOf(w) !== -1;
        return fold(p.name + ' ' + p.desc + ' ' + p.proto + ' ' + p.note + ' ' + CRYPT_TEXT[p.crypt]).indexOf(w) !== -1;
      });
    });
  }

  return { PORTS: PORTS, CRYPT_TEXT: CRYPT_TEXT, filter: filter };
});
