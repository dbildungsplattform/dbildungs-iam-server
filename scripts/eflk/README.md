# EFLK LDIF Export (SPSH-4219)

Eigenständiges Node-Skript, das alle Personen mit E-Mail (Priorität 0/1) aus
`public`/`email`-Schema ausliest und als LDIF gemäß Transfer Ldap exportiert. 
Läuft unabhängig vom Server-Deployment. Verbindung ausschließlich
per SSH-Tunnel.

## Nutzung

```bash
cd dbildungs-iam-server
node scripts/eflk/export-eflk-ldif.mjs \
  --pg-user <user> --pg-database <db> \
  --ssh-host <jump-host> \
  --ssh-port <jump-host-port> \
  --ssh-user <ssh-benutzer> \
  --ssh-key <pfad-zum-private-key> \
  --db-host <ziel-db-host-aus-sicht-des-jump-hosts> \
  --root-organisation-id <root-organisation-id> \
  --out export.ldif
```

* `--db-host`/`--db-port` entsprechen dem, was in pgAdmin im "Connection"-Tab
  (nicht im "SSH Tunnel"-Tab) als Host/Port hinterlegt ist. `--db-port` hat
  Default `5432` (Standard-Postgres-Port), optional überschreibbar.
* `--base-dn` ändert sich normalerweise nicht (Default `dc=schule-sh,dc=de`),
  ist aber optional überschreibbar.
* `--root-organisation-id` ist die UUID der Wurzel-Organisation (siehe
  `DATA.ROOT_ORGANISATION_ID` in `config/config.json`). Davon ausgehend werden
  die zwei direkten Kinder "Öffentliche Schulen" und "Ersatzschulen" ermittelt,
  um jede Schule später dem richtigen `ou=oeffentlich`/`ou=ersatz` zuzuordnen.
  Ist in allen Umgebungen (Dev/Staging/Prod) meist identisch, aber Pflicht,
  weil das Skript nicht selbst danach sucht.
* `--local-port` ist rein lokal (Default `15432`, optional überschreibbar) – er
  hat mit dem Zielsystem nichts zu tun, sondern ist nur der Port auf deinem
  eigenen Rechner, an den `ssh` den Tunnel-Endpunkt legt.
* Die SSH-Key-Passphrase wird immer interaktiv abgefragt (Enter = keine
  Passphrase, z.B. wenn der Key bereits im ssh-agent geladen ist).
* Alle Optionen siehe `--help`.

// TODO: PR Review
## Getroffene Annahmen (bitte vor Prod-Nutzung gegenprüfen)

* **"Hat E-Mail"**: mindestens eine `email.address` mit `priority IN (0,1)` und
  aktuellstem Status `ACTIVE` oder `DEACTIVE`.
* **`uid`** = `person.id` (UUID), **`cn`** = `person.username`.
* **`deaktiviert`**: `TRUE`, wenn `person.org_unassignment_date` gesetzt ist
* **`gesperrt`**: `TRUE`, wenn ein `user_lock`-Eintrag existiert, dessen `locked_until` `NULL` ist oder in der Zukunft liegt.
* **Schulzugehörigkeit**: nur Personenkontexte, deren Rolle einen `service_provider` mit `kategorie = 'EMAIL'` hat.
* **Öffentlich vs. Ersatzschule**: repliziert
  `OrganisationRepository.findOrganisationZuordnungErsatzOderOeffentlich()`
  (Namenserkennung "Öffentliche"/"Ersatz" unter den direkten Kindern der
  Root-Organisation, danach Elternketten-Suche).
* **`ou`-Zuordnung der Person** (oeffentlich/ersatz im DN): Bucket der ersten
  gefundenen Schule der Person – analog zum Fallback-Verhalten von
  `mainSchool` im Zielschema. Bei Personen mit Schulen aus beiden Kategorien
  müsste das Verhalten fachlich noch bestätigt werden.
* **`objectClass` Namen** (`schulportalSHPerson` für Personen,
  `organizationalRole` für `cn=users/groups/lists`-Container): Platzhalter, da
  das eigene `schulportalsh.schema` laut Ticket noch nicht final vorliegt.
* Attribute wie `mailBoxType`, `hideFromAddressLists`, `dovecotQuota`,
  `groupwareQuota`, `mainSchool` werden **nicht** befüllt (nicht im
  Ticket-Scope der 5 geforderten Datenpunkte).

## Export validieren

`validate-eflk-ldif.mjs` prüft eine bereits erzeugte LDIF-Datei auf invalide Datenkonstellationen. 
Es schreibt einen Report in eine weitere Datei. 
Läuft rein auf der LDIF-Datei, ohne DB-/SSH-Zugriff:

```bash
node scripts/eflk/validate-eflk-ldif.mjs --file export.ldif
# schreibt den Report nach export-report.txt (neben export.ldif)
```

Geprüft werden u.a.: fehlende Pflichtfelder (`uid`/`cn`/`sn`/`mailPrimaryAddress`),
doppelte `dn`/`uid`/Gruppen-`cn`, doppelte E-Mailadressen (auch über
Primär-/Alternativadressen hinweg), `dn`, die nicht dem erwarteten Muster
entsprechen bzw. deren `uid`-Teil vom `uid`-Attribut abweicht, ungültige
Werte bei `gesperrt`/`deaktiviert` (erwartet `TRUE`/`FALSE`), E-Mail-Domain
vs. `ou=oeffentlich|ersatz`-Inkonsistenzen, verwaiste Gruppenmitgliedschaften
(`member`-DN ohne zugehörige Person) sowie fehlerhafte/unnötige
base64-Kodierung (RFC 2849). Ergebnisse werden als `ERROR` (eindeutig
invalide) oder `WARN` (auffällig, z.B. Person ohne Schul-Gruppe) klassifiziert.
