# OQ-12: Testkonzept für Stromverlust während eines Schreibvorgangs

Dieses Konzept zu [OQ-12](../architecture/open-questions.md#oq-12),
[ADR-0058](../architecture/adr/0058-the-workspace-database.md) und dem
[Spike-Protokoll](../architecture/spikes/power-loss.md) liefert keine Messung und trifft keine Entscheidung.
Maßgeblich sind die drei Ebenen von [REQ-SESSION-034](../spec/07-sessions-persistence.md):
Prozessabsturz-Atomizität aller erfolgreichen Writes, Beständigkeit bestätigter terminaler Commits und
abgeschlossener Backups bei Betriebssystem-/Stromverlust auf flush-treuem Speicher sowie erlaubter Verlust
dazwischenliegender Zwischenstände.

**Szenario.** Eine entbehrliche Testinstallation schreibt fortlaufend nummerierte Ledger-Transaktionen mit
`packages/store/spike/power-loss-writer.cjs`: gewöhnliche mit `NORMAL`, jede fünfzigste mit `FULL`.
Parallel ersetzt sie vollständige Dokumente über temporäre Datei, Datei-Flush und Rename; eine
Vergleichsvariante synchronisiert zusätzlich das Verzeichnis (ADR-0004). Mehrere Durchläufe unterbrechen
Transaktion, Datei-Write oder Rename. Ergänzende Produktdurchläufe unterbrechen terminalen Session-Save,
Backup-Erstellung und Restore zwischen dessen Renames (OQ-266). Erfasst werden Commit, Betriebssystem,
Dateisystem, SQLite-Version, Laufwerk/Firmware und Schreibcache. Prozessabsturz, Kernelabsturz und tatsächlicher
Stromverlust werden getrennt geprüft.

**Invarianten.** Der Produktpfad `openStore` öffnet den Store; `integrity_check` meldet `ok`.
Transaktionen und Session-Saves sind ganz vorhanden oder ganz abwesend; das Ledger bleibt lückenlos.
Jeder vor dem Fehler unabhängig bezeugte, bestätigte `FULL`-Commit und jedes als abgeschlossen bestätigte
Backup bleibt lesbar beziehungsweise wiederherstellbar. Zwischenstände nach dieser Grenze dürfen bei
Betriebssystem-/Stromverlust als Suffix fehlen; Anzahl und Zeitabstand werden gemessen. Ein unterbrochenes
Backup darf nicht als vollständig angeboten werden. Restore hinterlässt den alten oder den restaurierten
Store. Ersetzte Dokumente sind beim Prozessabsturz eine ganze alte oder neue Fassung. Beim Stromverlust
werden auch fehlende Dateien und Unterschiede mit/ohne Verzeichnis-Flush protokolliert; Rename-Beständigkeit
wird nicht vorausgesetzt.

**Aussagegrenze.** Ein überlebender Datenbankstand einschließlich seines letzten `FULL` beweist nicht, dass
kein später bereits bestätigter Commit verloren ging. Die vorhandene `verify`-Phase zählt Überlebende.
Für den Beständigkeitsnachweis braucht sie einen Abgleich mit einem **unabhängigen, dauerhaft gespeicherten
Bestätigungsprotokoll**, etwa auf einem zweiten Rechner: bestätigte Ordinalzahlen und Zeiten gegen den
wiederhergestellten Store. Gepuffertes lokales stdout reicht nicht. Nicht bezeugte Bestätigungen erlauben
keine Verlustbehauptung. Vor dem ersten Öffnen werden Store, WAL, SHM, Dokumente und Backups unverändert
kopiert; Recovery und das Schließen der letzten Verbindung können den WAL entfernen.

**Plattform-Check.** Unter Windows liefert `packages/store/src/power-loss.spike.test.ts` mit
`ROTARIS_POWER_LOSS_PHASE=kill` die Prozessabsturz-Baseline; `prepare` und `verify` bilden den physischen
Versuch mit `ROTARIS_POWER_LOSS_FAULT=power|crash` ab. Befehle und Ergebnistabelle stehen im Spike-Protokoll.
WAL-Trunkierung kontrolliert nur das Messinstrument. Linux-VM-Reset oder Device-Mapper-Fehlereinspeisung
können die Softwareseite untersuchen, niemals die Ehrlichkeit eines physischen Gerätecaches oder Windows/NTFS
belegen. Der Windows-Kill-Harness ist nicht portabel. Plattformnachweise auf macOS/Linux bleiben gemäß IC-3 offen.

**Nur der Owner** wählt und sichert die entbehrliche Hardware und löst Kernelabsturz beziehungsweise
vollständigen Stromentzug aus. Bei Notebook/USV ist Netzsteckerziehen allein kein Stromverlust.
Ergebnisse werden pro Plattform und Fehlerart mit Zeugenvergleich, verlorenen Saves/Millisekunden und
Integritätsbefunden ins Spike-Protokoll übernommen. OQ-12 bleibt bis dahin Messschuld.

**Weitere offene Befunde:** Das Backup benötigt eine eigene Phase; die bestehende
[Notiz zum fehlenden Backup-Flush](../defects/a-completed-backup-artifact-is-never-flushed.md) wird nicht repariert.
REQ-SHELL-131s Stromverlustzusage für die Theme-Datei und ADR-0004s Verzicht auf Verzeichnis-Flush bleiben zur
Klärung festgehalten.
