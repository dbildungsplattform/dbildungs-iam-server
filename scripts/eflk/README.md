# EFLK LDIF Export

Eigenständiges Node-Skript, das alle Personen mit E-Mail (Priorität 0/1) aus
`public`/`email`-Schema ausliest und als LDIF gemäß Transfer Ldap exportiert. 

## Nutzung

```bash
node scripts/eflk/export-eflk-ldif.mjs \
  --environment stage \
  --kubeconfig-dir /pfad/zu/kubeconfigs \
  --pg-user <user> --pg-database <db> \
  --root-organisation-id <root-organisation-id> \
  --out ../export-stage.ldif
```

* `--environment` ist verpflichtend und akzeptiert `dev`, `stage` oder `prod`.
  `kubectl` muss installiert sein und Zugriff auf den ausgewählten Cluster
  haben.

  | Parameter | Kubeconfig-Datei |
  | :-- | :-- |
  | `dev` | `spsh-dev-schulportal.yaml` |
  | `stage` | `spsh-staging-schulportal.yaml` |
  | `prod` | `spsh-prod-schulportal.yaml` |

* `--base-dn` ändert sich normalerweise nicht (Default `dc=schule-sh,dc=de`),
  ist aber optional überschreibbar.
* `--root-organisation-id` ist die UUID der Wurzel-Organisation (siehe
  `DATA.ROOT_ORGANISATION_ID` in `config/config.json`). Davon ausgehend werden
  die zwei direkten Kinder "Öffentliche Schulen" und "Ersatzschulen" ermittelt,
  um jede Schule später dem richtigen `ou=oeffentlich`/`ou=ersatz` zuzuordnen.
  Ist in allen Umgebungen (Dev/Staging/Prod) meist identisch, aber Pflicht,
  weil das Skript nicht selbst danach sucht.
* `--exclude-schools` unterdrückt alle Schul-/Gruppen-Einträge. Ohne diesen
  Schalter bleiben sie im Export enthalten.
* Exporter und Validator ordnen die Domain der gelesenen E-Mail-Adresse
  unabhängig vom Kubernetes-Cluster zu:

  | Umgebung | Öffentlich | Ersatzschulen |
  | :-- | :-- | :-- |
  | Prod | `schule-sh.de` | `ersatzschule-sh.de` |
  | Stage/QS | `qs.schule-sh.de` | `qs.ersatzschule-sh.de` |
  | Test (im Stage-Cluster) | `test.schule-sh.de` | `test.ersatzschule-sh.de` |
  | Dev (Seed-Daten) | `qs.schule-sh.de` | `qs.ersatzschule-sh.de` |
* `--local-port`: lokaler Forward-Port (Default `5433`, Cluster-Zielport `5432`).
* `--kubeconfig-dir`: Kubeconfig-Verzeichnis (Default `~/.kube`), keine einzelne YAML-Datei.
* Alle Optionen siehe `--help`.

## Export validieren

`validate-eflk-ldif.mjs` prüft eine bereits erzeugte LDIF-Datei auf invalide Datenkonstellationen. 
Es schreibt einen Report in eine weitere Datei. 
Läuft rein auf der LDIF-Datei, ohne DB-/SSH-Zugriff:

```bash
node scripts/eflk/validate-eflk-ldif.mjs --file ../export.ldif
# schreibt den Report nach export-report.txt (neben export.ldif)
```

```bash
node scripts/eflk/validate-eflk-ldif.mjs --file export.ldif --include-containers
```
