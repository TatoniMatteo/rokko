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
