---
status: aktiv
owner: Geschäftsführung
purpose: >
  Faktische Inventur aller Datenflüsse von Rotaris. Grundlage für die
  Datenschutzerklärung (Art. 13 DSGVO), das Verarbeitungsverzeichnis (Art. 30),
  die Empfängerliste und die technische Dokumentation nach der
  Cyberresilienz-Verordnung. Beschreibt, was der Code tut — nicht, was die
  Rechtstexte sagen.
---

# Rotaris — Inventur der Datenflüsse

Erhoben am Quellstand 0.116.1, ergänzt um die Betriebsangaben der Geschäftsführung vom
21.08.2026. Jede Aussage lässt sich am Code oder an einer Betriebsangabe festmachen.

## 0. Betriebsangaben

- **Hosting:** eigener virtueller Server bei der Contabo GmbH, Standort Deutschland.
  Dort laufen der Proxy `rotaris.ai/v1`, Keycloak und die Datenbank.
- **Modellzugang:** ausschließlich über **OpenRouter, Inc.** als Vermittler.
- **Zahlungen:** Stripe.
- **Serverseitig gespeichert:** Registrierungsdaten (E-Mail, Passwort-Hash) sowie die
  für Guthaben und Abrechnung nötigen Buchungen. **Anfrageinhalte werden nicht
  gespeichert.**
- **Zielmarkt:** zunächst DACH, später global.

## 1. Ausgehende Verbindungen

| # | Ziel | Auslöser | Inhalt | Unsere Rolle |
| --- | --- | --- | --- | --- |
| 1 | `https://rotaris.ai/v1` (**Rotaris Cloud**, Vorauswahl und „recommended") | jeder Modellaufruf bei gewähltem Anbieter | Anfrageinhalt: Aufgabentext, Quellcodeausschnitte, Befehlsausgaben, Werkzeugergebnisse — kann personenbezogene Daten Dritter enthalten | Verantwortlicher für das Konto, Auftragsverarbeiter für den Inhalt |
| 1a | von dort weiter an **OpenRouter, Inc.** und den jeweiligen Modellanbieter | dito | derselbe Inhalt | Drittlandübermittlung, Art. 46 Abs. 2 lit. c |
| 2 | Keycloak-Issuer (`ROTARIS_OIDC_ISSUER`), Authorization Code mit PKCE, Rückruf über Loopback `:*/callback` | Anmeldung | Identitätsmerkmale, Zugriffs- und Erneuerungstoken | Verantwortlicher |
| 3 | `GET /v1/account/usage-status` | Guthabenanzeige, Zulassungsprüfung je Lauf | Kontokennung, Guthaben, Verbrauch, Zulassungsentscheidung | Verantwortlicher |
| 4 | `GET /v1/models` | Modellauswahl | Bearer-Token | Verantwortlicher |
| 5 | `api.anthropic.com`, `api.openai.com`, `api.deepseek.com`, `api.githubcopilot.com`, `chatgpt.com/backend-api/codex`, Claude Agent SDK als lokale Laufzeit | Modellaufruf bei selbst gewähltem Anbieter | derselbe Inhalt wie bei 1 | **keine** — die Nutzerin ist Verantwortliche, wir informieren nur |
| 6 | `api.github.com/repos/Concrete-Dynamics/Rotaris/releases/latest` sowie Herunterladen von Artefakt und Prüfsummendatei | Prüfung beim Start, nur bei eingefrorenen Installationen (`NOT_FROZEN` prüft nie) | IP, User-Agent, mittelbar die Version | Informationspflicht; GitHub ist Empfänger in den USA |
| 7 | `feedback.geraet.ai/api/v1/tickets` — **SWR-2208, Entwurf, nicht ausgeliefert** | Absenden einer Supportmeldung | Freitext, **auf gesonderte Auswahl** Diagnoseprotokoll und Sitzungsmetadaten mit Pfaden, Benutzernamen und Quellcodeausschnitten | Verantwortlicher, sobald aktiv |
| 8 | `mcp.tavily.com` und selbst eingerichtete MCP-Server | Recherche der Rolle `librarian` | aus der Aufgabe abgeleitete Suchanfragen | vom Nutzer eingerichtet |

## 2. Lokale Ablage

| Pfad | Inhalt | Anmerkung |
| --- | --- | --- |
| `<Arbeitsverzeichnis>/.rotaris/sessions/` | vollständige Verläufe, Werkzeugaufrufe, Diagnosen, Prüfpunkte | im Klartext |
| `<Arbeitsverzeichnis>/.rotaris/litellm_cache/` | zwischengespeicherte Modellantworten | im Klartext |
| `<Arbeitsverzeichnis>/.rotaris/worktrees/` | Git-Arbeitsbäume je Lauf | Kopien des Quellcodes |
| `~/.config/rotaris/` | globale Konfiguration | — |
| `~/.local/share/rotaris/tokens/` | Zugangstoken und API-Schlüssel | dateibasiert, Rechte `0600`, **kein** Systemschlüsselbund |

Nichts davon erreicht uns.

## 3. Lokale Ausführung

Der Agent führt Systembefehle aus und schreibt Dateien im Arbeitsverzeichnis der
Nutzerin, gesteuert durch eine Rechteverwaltung, die je Werkzeugaufruf zwischen
Zulassen, Rückfragen und Ablehnen entscheidet. Das ist die produktsicherheits- und
haftungsrechtliche Fläche, nicht die datenschutzrechtliche: sie gehört in die
Endnutzerbedingungen und in die CRA-Dokumentation.

## 4. Integrität der Aktualisierungen

`rotaris_core.updates.apply` installiert kein Artefakt, dessen SHA-256 von der
veröffentlichten Prüfsumme abweicht, und verweigert die Installation vollständig, wenn
ein Release keine Prüfsummen veröffentlicht. Das ist beizubehalten — die
Cyberresilienz-Verordnung erwartet genau das.

## 5. Lizenzlage der Bestandteile Dritter

Erhoben mit `packaging/third_party_licences.py`: 189 Laufzeitpakete.

- **PySide6, PySide6-Addons, PySide6-Essentials, shiboken6 sowie pyte — LGPLv3;
  `func_timeout` — LGPLv2.** Die Auslieferung in einem kommerziellen Binärpaket ist
  zulässig, verlangt aber den Lizenztext, die Möglichkeit des erneuten Bindens und
  Endnutzerbedingungen, die das von der LGPL erlaubte Zurückentwickeln nicht
  verbieten.
- **PyInstaller — GPLv2 mit Bootloader-Ausnahme**: Bauwerkzeug; die Ausnahme trägt die
  proprietäre Auslieferung. Hinweis mitliefern.
- **certifi, pathspec, orjson, tqdm — MPL-2.0**: dateibezogenes Copyleft, Hinweis genügt.
- **`openhands-sdk`, `openhands-tools` und `lmnr-claude-code-proxy` deklarieren keine
  Lizenz.** `openhands-sdk` ist die Kernabhängigkeit der Engine. Vor dem Marktstart zu
  klären; der Generator bricht deshalb mit Fehlercode ab.
- Mitgelieferte Schriften stehen unter der SIL Open Font License; deren Text gehört
  ebenfalls in die Auslieferung.
