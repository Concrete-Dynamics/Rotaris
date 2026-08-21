# docs/legal

Hier liegt nur, was zum Code gehört und mit ihm gepflegt werden muss.

- **[data-flows.md](data-flows.md)** — Inventur aller Datenflüsse von Rotaris. Sie ist
  die Grundlage für Datenschutzerklärung, Verarbeitungsverzeichnis, Empfängerliste und
  die technische Dokumentation nach der Cyberresilienz-Verordnung.

## Pflegeregel

`data-flows.md` ist die Wahrheit über das Produkt. **Jeder neue Endpunkt, jeder neue
Dienstleister und jede neue lokale Ablage gehört zuerst hierher** — und erst danach in
die Rechtstexte. Wer das umdreht, veröffentlicht früher oder später eine Erklärung, die
das Produkt nicht mehr beschreibt.

Betroffen sind unter anderem:

- ein weiterer Modellanbieter im `BUILTIN_PROVIDERS`-Katalog,
- ein Wechsel oder eine Ergänzung beim Vermittler hinter Rotaris Cloud,
- die Auslieferung von SWR-2208 (In-App-Supportmeldungen an einen eigenen Endpunkt),
- jede neue serverseitig gespeicherte Datenkategorie,
- eine Umstellung der Aktualisierungsauslieferung weg von GitHub.

## Die übrigen Unterlagen

Datenschutzerklärung, AGB, Widerrufsbelehrung, Endnutzerbedingungen, Richtlinie zur
zulässigen Nutzung, Verarbeitungsverzeichnis, TOM, Empfängerliste, Löschkonzept,
Meldeprozess, Verfahren für Betroffenenanfragen, Lizenzstrategie, Impressum-Befunde,
CRA-Fahrplan und die Markteintritt-Checkliste gehören dem Unternehmen, nicht der
Software. Sie liegen außerhalb dieses Repositorys im Paket
`rotaris-recht-<Datum>.zip`; dessen `00-LIESMICH.md` erklärt Aufbau und Verwendung.

Ebenfalls hier im Repository, aber an ihrem eigenen Platz:

- **[SECURITY.md](../../SECURITY.md)** in der Wurzel — die öffentliche
  Sicherheitsrichtlinie muss dort liegen, wo Sicherheitsforscher sie suchen.
- **`packaging/third_party_licences.py`** — erzeugt `THIRD-PARTY-LICENSES.txt` für jedes
  Release und bricht ab, wenn ein Paket keine Lizenz deklariert.
