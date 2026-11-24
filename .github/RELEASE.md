# Rilascio Linux

Il workflow `Linux packages and releases` costruisce pacchetti nativi x64 e ARM64.
L'avvio manuale genera candidati scaricabili dal run. Il push di un tag `v<versione>` che
corrisponde a `package.json` pubblica DEB, AppImage, checksum e report su GitHub Releases
dopo le verifiche di entrambe le architetture. Un suffisso come `-alpha.4` produce una
prerelease. I pacchetti sono unsigned e gli aggiornamenti si installano manualmente.

## Prima della pubblicazione

1. Chiudere i gate funzionali (#56/#58), verificare i diritti degli asset (#18/#63) e i metadati
   pubblici del manutentore (#60). Non inventare email o dichiarazioni di licenza del logo.
2. Partire da un commit pulito con versione e lock coerenti; eseguire check, audit high/critical,
   inventario licenze/SBOM e probe Linux. Per Electron ripetere le prove sul runtime incluso.
3. Costruire sull'architettura dichiarata; verificare manifest, report e checksum. Conservare
   licenze del prodotto, font, icone, dipendenze runtime ed Electron/Chromium nel pacchetto.
4. Installare e aggiornare DEB in un ambiente pulito; verificare desktop entry, sandbox,
   partizioni, dati e disinstallazione senza cancellazione del profilo. Per AppImage verificare
   estrazione e avvio, inclusa la policy user namespace sulle distro Ubuntu interessate.
5. Allegare soltanto artefatti e sorgenti del commit verificato, manifest, SBOM, licenze e
   checksum. Descrivere ambiente, limiti, cambiamenti e procedura di recupero. I checksum
   attestano integrità, non identità del produttore. Non promettere firma se non è presente.
6. Pubblicare tag immutabile e prerelease; chiudere soltanto le issue con evidenza riuscita.
   Per un pacchetto difettoso ritirare la release e pubblicare una versione corretta; non
   sostituire artefatti sotto lo stesso tag. Nessun updater automatico nella prima alpha.

## Supporto

Triage: bug con riproduzione sintetica e versione; priorità a perdita dati, isolamento e crash.
Chiedere solo diagnostica volontaria e rivedibile. Vulnerabilità sul canale privato GitHub;
obiettivi e aggiornamenti sono in CONTRIBUTING.md. Supportare le sole versioni dichiarate
nelle note: una build ARM64 riuscita non certifica GPU, portale o desktop di ogni dispositivo.

## Inventario della catena di build

`pnpm supply-chain` produce CycloneDX 1.6, licenze dichiarate e testi delle dipendenze runtime,
senza percorsi locali. Usa il lock frozen e fallisce su licenze nuove/non revisionate.
L'inventario copre i pacchetti installati sulla piattaforma: non certifica i binari opzionali
non installati né sostituisce le licenze Chromium o i diritti sugli asset.
Manifest e report includono commit, working copy e hash del lock. I report aggiunti ai
pacchetti vengono verificati per dimensione e SHA-256 da `pnpm release:verify`.

Rischio residuo verificato il 15 novembre 2026: GHSA-g3hv-75wg-m249 (minimatch, moderata)
nella catena electron-builder. Non incluso nel runtime delle pagine; i glob del packaging
sono definiti nel repository. Nessun override forzato a una major incompatibile. Audit
high/critical resta bloccante; riesaminare la patch upstream prima del prossimo rilascio e
comunque entro il 15 dicembre 2026. Questa annotazione non sopprime l'advisory in CI.
