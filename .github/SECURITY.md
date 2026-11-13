# Sicurezza

Rokko è un’alpha: non è una certificazione di isolamento, di compatibilità dei provider
o di assenza di vulnerabilità. Il modello è locale e non prevede telemetria o account Rokko.

## Segnalazioni

Usa [la segnalazione privata di GitHub](https://github.com/TatoniMatteo/rokko/security/advisories/new).
Non aprire issue pubbliche con exploit, cookie, token, profili Chromium, URL di login o dati
personali. Includi versione/commit, ambiente, riproduzione sintetica e impatto, redigendo i segreti.
Se il canale privato non è disponibile, apri una issue senza dettagli sensibili per concordarne uno.
Obiettivi di triage e aggiornamenti sono in [CONTRIBUTING.md](CONTRIBUTING.md).

## Confini di fiducia e difese

- Main è privilegiato: possiede viste, sessioni, filesystem e decisioni sui permessi.
- La shell locale accede a un bridge limitato; i servizi remoti non ricevono il bridge Rokko.
  Gli handler shell verificano il sender; payload, ID e URL restano non attendibili.
- I servizi usano sandbox e contextIsolation, senza Node. La condivisione della sessione
  avviene per scelta del workspace; i servizi globali sono privati. Non si copiano credenziali.
- La compatibilità notifiche ha canali separati e controlli su origine, sessione e consenso;
  non è un bridge generico né un trasporto Web Push.
- Import Rambox: metadati con anteprima, scrittura atomica e nuove sessioni; niente cookie,
  script o autorizzazioni importate. Favicon scaricate senza credenziali e con limiti.
- Nessun bypass di login, TLS o sandbox; nessun updater automatico non verificato.
  Un profilo AppArmor di avvio non equivale a contenimento completo dell’applicazione.

## Modello delle minacce e gate

Priorità indica l’impatto potenziale, non una vulnerabilità dimostrata. Le difese presenti
non sostituiscono i gate residui; la tabella rende verificabile il lavoro necessario.

| Rischio | Priorità | Prova richiesta / attività residua |
|---|---|---|
| Servizio remoto raggiunge IPC/filesystem privilegiato | Critica | Sender estraneo negato; subframe, payload e ogni canale in #23 |
| Cookie/account condivisi o cancellati involontariamente | Critica | Due account, logout/riavvio/cambio profilo e nessuna cancellazione implicita: #30/#35 |
| Redirect/popup, permessi media, file e download | Alta | Schemi vietati, origini, diniego/revoca e salvataggi controllati: #32/#45/#51/#55 |
| Import/icon fetch malevoli o esaurimento risorse | Alta | Input limitati, rollback, redirect, SVG e URL privati/DNS: #32/#49 |
| Crash/worker residui o perdita di configurazione | Alta | Chiusura, errori in scrittura, corruzione, cleanup e standby: #29/#35/#47 |
| Dipendenze/build o aggiornamenti compromessi | Alta | Audit completo, patch Electron, lock, licenze/SBOM e artefatti: #12/#61/#73 |
| Log/esportazioni o accesso locale al disco | Alta | Redazione, conservazione e diagnostica volontaria: #26; keyring/cifratura dipendono dall’OS |

Prima della consegna servono prove negative riproducibili e report degli ambienti realmente
verificati; non inserire account o credenziali reali nei test CI. L’audit delle dipendenze
non copre tutti i rischi della tabella. Notifiche e rilascio rimangono attività differite.
Le vulnerabilità alte/critiche raggiungibili richiedono mitigazione prima della consegna.
