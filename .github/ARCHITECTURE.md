# Architettura di Rokko

Baseline decisionale della fase 0, 13 novembre 2026; shell aggiornata con la fase 1. “Oggi” descrive il codice;
“decisione” indica il vincolo per il lavoro successivo, non una funzione già implementata.

## Confini e struttura

Il repository resta un singolo pacchetto pnpm: `src/main`, `src/preload`, `src/renderer`
e moduli puri in `src/shared`, con test corrispondenti. Niente monorepo, store/framework
o librerie di validazione aggiuntive senza una necessità concreta. Le regole e i validatori
esistenti sono il primo punto di riuso; i contratti rimangono in `shared/contracts/model.ts`.

Main possiede finestre, WebContentsView, sessioni, permessi, file e persistenza. React gestisce
la UI. Preload espone metodi specifici tramite contextBridge, senza ipcRenderer o filesystem
generici. La shell locale e i servizi remoti hanno viste distinte; nessun bridge Rokko remoto.
I canali notifiche hanno un contratto separato, verificato per origine/sessione/consenso.

Ogni servizio conserva la propria vista durante il cambio: il main la riaggancia con bounds
in DIP riferiti alla vista shell. Le pagine di impostazioni staccano la vista remota senza
ricrearla; i menu contestuali sono nativi. Non confondere visibilità con sospensione.

## Sessioni e lifecycle

La partizione persistente è un dato esplicito del servizio. Sessione privata per servizio,
oppure condivisa per scelta nel workspace; i globali restano privati. Spostare un servizio
non autorizza a copiare cookie o cancellare profili. Cambiare modalità può ricreare la vista,
ma conserva i dati della partizione precedente; le conseguenze devono essere visibili.

Oggi il caricamento espone loading/ready/failed e la vista può essere assente. Il modello
operativo distingue non creata, caricamento, attiva/background, errore e rimossa; un’eventuale
sospensione esplicita appartiene a #46. Non sospendere automaticamente per ridurre i consumi.

Alla rimozione: chiudere notifiche e popup del servizio, fermare soltanto worker di cui non
restano peer proprietari, chiudere webContents, eliminare riferimenti e stato UI. Alla chiusura
della finestra: avviare teardown di tutte le viste e completare arresto applicativo.
Istanza unica e riattivazione ripristinano la finestra esistente. Il tray offre mostra,
nascondi ed esci; chiudere la finestra termina l’app anche quando il desktop non espone il tray.
Un crash del renderer mostra una riprova senza cancellare la sessione; teardown concorrenti
condividono la stessa operazione e il cleanup dei worker ha un limite temporale. Standby e
recupero della configurazione corrotta restano in #47/#35.

## Persistenza: decisione e migrazione

Il formato legacy di registro e preferenze è JSON versione 1;
credenziali e cookie restano nelle sessioni Chromium. Dalla fase 2 il main usa SQLite integrato,
con importazione del JSON originale, backup privato e schema versionato con checksum.

Per #22 si usa SQLite tramite `node:sqlite` già incluso in Electron, anziché un addon
nativo o un database nel renderer. Provato nel main Electron 45.3.0 / Node 24.22.2:
SQLite 3.53.4, vincoli FK, rollback e riapertura persistente riusciti con dati sintetici.
L’API Node 24 è ancora release candidate: mantenere l’accesso confinato nel main e
ripetere la prova a ogni cambio runtime. Non sono necessarie dipendenze native esterne.

La migrazione e il recupero rispettano questi vincoli:

1. Validare interamente JSON e preferenze esistenti; file corrotti richiedono recupero,
   non sostituzione silenziosa con stato vuoto (#35).
2. Conservare backup locali protetti, creare un DB temporaneo e importare in transazione.
   Preservare ID, ordine, workspace nullable, partizioni, icone, consensi e preferenze.
3. Attivare foreign keys, usare statement parametrizzati e migrazioni numerate/checksum.
   Tabelle minime: workspace, app, preferenze e registro migrazioni; niente tabelle credenziali.
4. Verificare conteggi, invarianti e integrità prima della promozione atomica; l’interruzione
   o un errore non devono rendere attiva una migrazione parziale. Ripetizione idempotente.
5. Definire rollback senza perdita: prima di un downgrade esportare lo stato DB corrente
   nel formato supportato dal vecchio binario e verificarlo. Il backup iniziale non basta
   dopo nuove modifiche; schema futuro non supportato deve bloccare una scrittura distruttiva.

I cambi di vista non devono interrogare il DB o ricreare connessioni. Scritture e migrazioni
vanno misurate per evitare blocchi del main; spostare lavoro su worker solo se le misure
lo richiedono. Non introdurre un processo sempre attivo per un bisogno non dimostrato.

## IPC ed errori

Ogni handler autorizza il sender shell prima del payload e valida i dati a runtime:
i tipi TypeScript non proteggono dai messaggi manipolati. La prova negativa locale su
22 handler reali ha negato sender estranei e frame non principali (44 tentativi),
senza mutazioni; i canali senza risposta ignorano messaggi estranei senza eccezioni globali. La policy completa è in [SECURITY.md](SECURITY.md).

Errori di servizio mantengono stato locale sicuro e offrono riprova; non cancellano sessioni.
Gli errori dei moduli sono localizzabili nel renderer, senza trasferire credenziali nel bridge.
Crash, corruzione e scrittura fallita devono conservare l’ultimo stato valido e guidare
il recupero. Nessuna promessa di recupero completo finché #35/#47 non sono verificate.

## Alternative e conseguenze

Rimandare ogni decisione lascerebbe i task dati senza vincoli; riscrivere subito il prodotto
creerebbe invece migrazioni premature. Si conserva l’implementazione funzionante e si fissa
il percorso di #22. Il JSON originale rimane intatto; l’esportazione per il downgrade parte dai dati SQLite correnti. SQLite integrato evita rebuild
ABI di addon; l’API va comunque verificata sul runtime incluso, non sul Node di sviluppo.
Nessun nuovo ORM, Zod, Zustand, updater, backend, trasporto Push o supporto altri OS è deliberato.

## Persistenza operativa

`main/storage` separa validazione, schema e gestione dei file. SQLite conserva workspace e servizi
in ordine esplicito, riferimenti FK, preferenze e ultimo contesto. Le viste usano lo stato in memoria:
il cambio applicazione non interroga il DB; il contesto viene salvato con debounce di 150 ms e flush
alla chiusura. Modifiche al registro e preferenze usano transazioni e backup della revisione precedente.

Un profilo illeggibile mostra una pagina di recupero: ripristino della revisione precedente o nuova
configurazione con archivio dei file precedenti. Nessuna cancellazione delle partizioni Chromium.
Un formato futuro blocca ogni ripristino/sovrascrittura. La schermata impostazioni esporta i JSON
correnti in una nuova cartella privata, senza cookie: farlo prima di tornare a una versione precedente.
Non sostituire un database attivo con copie del file mentre Rokko è aperto.

Prova riproducibile: `pnpm qa:profile --executable node_modules/electron/dist/electron` dopo il setup
Linux e la build. Usa esclusivamente account sintetici e un profilo temporaneo; non verifica login
reali o Web Push. Migrazione/fault injection, schema futuro e rollback hanno test su SQLite reale.
