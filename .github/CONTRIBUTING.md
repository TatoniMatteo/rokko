# Contribuire a Rokko

Apri una issue prima di un intervento sostanziale e mantieni le modifiche concentrate sul problema descritto.

- Branch relativi a issue: `ISSUE-<numero>`.
- Commit: `[#<numero>] - descrizione`, oppure `[closes #<numero>] - descrizione` per chiudere la issue.
- Usa lo stesso formato nel titolo della pull request, che diventa il titolo del commit squash.
- Prima della pull request esegui `corepack pnpm check` e descrivi le verifiche effettuate.
- Per modifiche all'interfaccia aggiungi una schermata; segnala esplicitamente gli ambienti non verificati.

Le modifiche passano attraverso pull request e controlli automatici. Mantieni sandbox, isolamento delle sessioni e convalida degli IPC.
Dati personali, credenziali, profili di prova, `.codex` e materiali intermedi restano locali.

## Sviluppo con AI e documentazione

Rokko è sviluppato con agenti AI sotto la direzione del suo autore. I contributi assistiti
da AI seguono lo stesso flusso: problema concreto, modifica circoscritta, revisione e prove.

Prima di **ogni PR**, confronta il comportamento del codice con README, guide IT/EN,
istruzioni Linux e documenti tecnici pertinenti. Aggiorna comandi, nomi dei controlli,
valori predefiniti, limiti e procedure nello stesso intervento. Rileggi anche gli esempi.
La guida nell’app importa direttamente `.github/GUIDA-UTENTE.md` e `.github/USER-GUIDE.md`:
non creare copie separate. Le sezioni `##` sono gli argomenti; i titoli `###` formano
l’indice della pagina. Sono supportati paragrafi, elenchi, grassetto, codice inline e tabelle.
Usa gli stessi argomenti, nello stesso ordine, in entrambe le lingue.

Nel corpo della PR indica i documenti verificati, i comportamenti confrontati e le modifiche
apportate; se non occorrono aggiornamenti, spiega concretamente perché. Una checklist
spuntata o un test automatico, da soli, non dimostrano che la documentazione corrisponde al codice.
Non aprire la PR finché la verifica non è completata.

La cronologia pubblica usa squash: una PR deve raccontare un cambiamento riconoscibile,
con titolo finale coerente e riferimenti alla issue pertinente. Non accumulare lavori
indipendenti sotto una issue generica.

## Ambiente di sviluppo

Per sviluppo e CI usare la versione esatta di Node in `.node-version` e pnpm in
`package.json#packageManager`, tramite Corepack. La CI fissa anche Corepack.
Gli intervalli `engines` indicano i prerequisiti dei tool, non certificano ogni
versione di Node o distribuzione Linux. La baseline verificata è Linux x64 con Node 26.13.1.
Gli utenti dei pacchetti desktop non devono installare Node o pnpm.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm audit --audit-level high
corepack pnpm dev
```

L'avvio scarica Electron se necessario. Su Ubuntu il controllo AppArmor può richiedere
un profilo dedicato: seguire `corepack pnpm linux:setup` in un terminale interattivo.
Non disabilitare sandbox o AppArmor globale. Aggiornare Electron può cambiare il percorso
del binario e richiedere nuovamente questa configurazione.

## Versioni e aggiornamenti

- Dipendenze dirette esatte, lockfile versionato, installazione normale frozen.
  Un aggiornamento modifica intenzionalmente manifest e lockfile nella stessa PR.
- Node di build e Node incluso in Electron sono ambienti distinti: controllare gli API
  disponibili nel runtime desktop. I tipi Node seguono la major inclusa in Electron.
- Usare Node LTS ancora mantenuto. Pianificare il passaggio prima dell'EOL;
  aggiornare insieme pin, CI, requisiti e verifiche, senza cambiare il Node globale dell'utente.
- Electron deve restare nelle tre major stabili mantenute upstream; verificare le patch
  disponibili almeno settimanalmente e anticipare la revisione in caso di advisory.
- Dependabot apre PR settimanali. Le PR raggruppate richiedono comunque riesame dei singoli
  aggiornamenti; niente merge automatico, `audit fix --force` o override indiscriminati.
- Ogni aggiornamento deve passare check e audit. Per Electron aggiungere avvio sandboxato,
  viste/sessioni, ripristino cookie, provider interessati e Wayland/X11; per il packaging,
  verificare gli artefatti prima di dichiarare il supporto. Non basta un typecheck.
- Le eccezioni a età minima/script di installazione sono puntuali e motivate;
  non allargarle a famiglie intere per aggirare un fallimento del package manager.

## Sicurezza e licenze

Obiettivi di triage: critiche entro 24 ore, alte entro 48 ore, moderate entro 7 giorni.
Obiettivi di correzione/mitigazione: critiche entro 72 ore, alte entro 7 giorni,
moderate entro 30 giorni. Sono obiettivi del progetto, non un servizio garantito.
Se manca una patch, registrare percorso vulnerabile, raggiungibilità, mitigazione,
responsabile e data di riesame nella issue; non ignorare il problema perché è una devDependency.
I rischi raggiungibili alti/critici bloccano la consegna; le emergenze anticipano la coda funzionale.

L'audit CI blocca high/critical ma gli avvisi moderati restano tracciati. L'audit npm non
sostituisce gli advisory Electron/Chromium, il modello delle minacce o i test di isolamento.
Le licenze dichiarate delle dipendenze dirette non equivalgono a inventario transitivo,
licenze di Chromium/asset o SBOM: queste verifiche restano necessarie prima del rilascio.

Una PR deve indicare problema, comportamento risultante, verifiche e limiti. Per rollback
ripristinare il commit precedente completo (manifest e lock), reinstallare frozen e ripetere
le verifiche; non copiare o eliminare partizioni Chromium e non fare downgrade ciechi dei profili.

## Matrice Linux

| Ambiente x86_64 | Stato delle prove | Limiti |
|---|---|---|
| Ubuntu 26.04.1, GNOME/Wayland | Riferimento desktop; avvio e QA shell/viste verificati | Account autenticati, multi-monitor e pacchetti richiedono prove dedicate |
| Stesso host, X11 virtuale Xvfb | QA shell/viste e scaling al 125% verificati | Non certifica una sessione Xorg fisica, GPU o tray |
| Ubuntu 24.04, GitHub Actions | Installazione frozen, check, audit, prove UI su Xvfb e installazione DEB | Runner headless: non è una prova del desktop fisico |
| Ubuntu 24.04 desktop, Xorg fisico | Candidati per la prossima matrice | Non ancora supporto certificato |
| Ubuntu 24.04 ARM64, CI/Xvfb | Packaging nativo, avvio e installazione DEB verificati nella alpha.5 | Non certifica hardware o desktop ARM fisici |
| Altre distro e altri OS | Fuori dalla baseline corrente | Solo dopo valutazione e prove esplicite |

Una prova desktop registra commit, architettura, distro, ambiente grafico, scaling e runtime.
Verificare avvio sandboxato, resize e quattro posizioni barra, menu/focus, due sessioni,
riavvio e cleanup. Le prove successive includono 100/125/200% DPI, due monitor, offline e
standby. Zoom 80/100/125/150%, recupero dopo crash e riavvio con cookie sono stati provati
su Wayland e X11 virtuale; il fallback tray è stato verificato con indisponibilità simulata.

Su GNOME non presumere la presenza del tray: Home/impostazioni e un comando esplicito per
uscire devono restare raggiungibili. Il menu tray offre mostra/nascondi/esci; chiudere la
finestra termina sempre l’app. Una seconda apertura ripristina la finestra nascosta o minimizzata.
Il permesso notifiche non garantisce banner se l'OS applica DND; Web Push resta una capacità
separata e il lavoro sulle notifiche è differito. La matrice non lo riattiva.
DEB/AppImage e installazioni pulite sono verifiche separate: stato e criteri in [RELEASE.md](RELEASE.md).

Per baseline e budget delle risorse usare la [procedura riproducibile](../scripts/qa/README.md).

Per triage e pubblicazione seguire [RELEASE.md](RELEASE.md); le indicazioni per gli utenti e i limiti sono in [LINUX.md](LINUX.md).
