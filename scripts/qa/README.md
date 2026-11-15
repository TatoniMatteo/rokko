# Misure delle risorse

Dopo `pnpm build`, su Linux:

```sh
pnpm qa:resources --executable node_modules/electron/dist/electron --app .
```

Opzioni condivise con lo smoke: `--output PERCORSO`, `--x11`, oppure `--prepared FILE` per un pacchetto estratto. Il profilo temporaneo è isolato e cancellato al termine. Il debugger ascolta solo su loopback e non viene attivato dall’app normale.

La prova serve fixture HTTPS sintetiche attraverso CDP, con rete Chromium diretta a un proxy locale non disponibile: non usa account, cookie personali o provider esterni. Misura l’intero albero dei processi con 0, 5 e 20 servizi, memoria RSS/PSS, CPU su un core, avvio e 100 cambi via IPC. I servizi restano caricati e i contatori in background devono avanzare. Il debugger viene scollegato prima della rimozione; processi e memoria vengono controllati anche dopo il cleanup.

`resource-budgets.json` contiene soglie locali di regressione, basate sulla macchina Ubuntu di sviluppo, non garanzie per tutti i PC. Richiede accesso a `/proc`, `getconf` ed Electron sandboxato funzionante. PSS ripartisce la memoria condivisa; la somma RSS la conta più volte e va letta separatamente.

Il comando fallisce se supera un budget o lascia processi dei servizi. Scrive `measurements.json` con ambiente, commit/working copy, campioni e risultati. Il tempo di cambio misura l’IPC, non il primo frame presentato; i risultati delle fixture non certificano prestazioni, login o Web Push di servizi reali. Ripetere sullo stesso ambiente a carico comparabile, senza modificare i budget per nascondere una regressione.

L’avvio misura un nuovo processo con cache del sistema non svuotata: non rappresenta un avvio a freddo del PC. I checkpoint con 5/20 servizi includono il dock aggiornato e le rispettive icone. Le soglie non sospendono servizi e non modificano timer o priorità delle applicazioni.


## Migrazione, sessioni e recupero

```sh
pnpm qa:profile --executable node_modules/electron/dist/electron
```

Dopo setup Linux e build, il comando verifica migrazione JSON, catalogo senza aprire servizi,
cookie persistenti privati/condivisi/globali, trasferimenti, ordine, policy HTTPS, esportazione,
riavvio, DB corrotto e rifiuto di formati futuri. Usa una entry di test esclusa dal pacchetto;
la cartella nativa di esportazione viene simulata dentro il profilo temporaneo. Non usa account
personali, non modifica partizioni reali e registra la versione effettiva del runtime.

## Interfaccia, tastiera e localizzazione

Dopo la build, `pnpm qa:interface --executable node_modules/electron/dist/electron` prova primo avvio, aggiunta/modifica/rimozione da tastiera, icona custom, annullamento dei draft, preferenze con salva/annulla, ripristino del tema, riordino e riavvio. Controlla nomi e landmark nell'albero accessibile, focus visibile, barra affollata sui quattro lati e layout a 820/1280/1920 px con scaling emulato 100/125/200%. Salva screenshot per tema/lato: sono artefatti da confrontare, non una certificazione automatica di ogni pixel. Come gli altri probe usa un profilo temporaneo, eliminato al termine.

`pnpm qa:connections --executable node_modules/electron/dist/electron` richiede OpenSSL. Induce un vero rifiuto TLS e un vero timeout di handshake (~30 secondi) su server locali, verifica riprova/cronologia e conservazione della sessione. La risposta di recupero dal timeout è sintetica. In una seconda esecuzione isolata autorizza soltanto la chiave SPKI del certificato effimero del test per verificare sul server l'header Accept-Language di servizi globali, privati e condivisi, oltre a navigator.language dopo il riavvio. Non modifica policy TLS o certificati del prodotto/del sistema.

Entrambi accettano `--x11` e vengono eseguiti in CI con Electron sandboxato. La prova con screen reader resta distinta dall'albero CDP: nella verifica locale con Orca su bus/display isolati sono controllati i testi generati per etichette IT/EN, errori e istruzioni di riordino; l'uscita audio e i display braille non sono certificati.

## Affidabilità e permessi

`pnpm qa:reliability --executable node_modules/electron/dist/electron` usa HTTPS locale,
profilo isolato e dispositivi multimediali sintetici. Verifica consenso e revoca per vista,
isolamento tra servizi nella stessa sessione, sospensione, crash, errore offline e ripresa,
popup, download/cancellazione/errori di destinazione e diagnostica priva di dati dei servizi.
Non usa credenziali personali. Non equivale a sospensione fisica del PC o login OAuth reale.

Su X11 isolato: `xvfb-run --auto-servernum dbus-run-session -- env ROKKO_QA_X11_SCREEN=1 pnpm qa:reliability --executable node_modules/electron/dist/electron --x11`.
La condivisione schermo seleziona esplicitamente una sorgente del solo display virtuale.
Il prodotto conserva la policy del portale Wayland. Il test non autorizza dispositivi nell'app normale.

La prova aggiuntiva del chooser nativo richiede `ROKKO_QA_NATIVE_CHOOSER=1`, Python GI/AT-SPI
ed è dipendente dal portale desktop. Annullamento e sostituzione sono stati verificati con il chooser Nautilus su display/bus isolati.
La CI verifica DownloadItem e opzioni del dialogo, non certifica ogni chooser di sistema.

## Produttività

`pnpm qa:productivity --executable node_modules/electron/dist/electron --x11` su Xvfb e bus isolati
verifica Ctrl+K da un vero servizio via input nativo, filtro e tastiera, bozze conservate,
due viste native affiancate senza duplicazione, ridimensionamento, mute per vista,
cache/reset con cookie e peer conservati, export/import con anteprima, reimport senza duplicati,
rifiuto di file non validi e layout persistente al riavvio. Non usa account reali.
I dialoghi per import/export sono indirizzati a file del profilo temporaneo; il chooser nativo
resta una verifica distinta. Nessun watcher o componente QA viene incluso nel pacchetto.
