# Usare Rokko su Linux

Rokko è un'alpha locale per raccogliere applicazioni web, anche in workspace con sessioni
condivise. Le credenziali rimangono nelle sessioni Chromium del computer. Non esiste un
account Rokko né un servizio di sincronizzazione remoto.

## Installazione

Finché il gate di rilascio non è concluso, gli artefatti del workflow sono candidati di prova,
non una release Linux supportata. DEB richiede i metadati pubblici del manutentore; non usare
pacchetti di un'architettura diversa dal computer. Il pacchetto include il runtime desktop:
Node e pnpm servono solo per lo sviluppo.

Su Ubuntu con restrizioni dei namespace utente è necessaria una policy AppArmor dedicata.
Seguire il messaggio del launcher o le istruzioni del pacchetto. Non usare `--no-sandbox`
e non disattivare la policy globale del sistema. Le AppImage estratte sono prove distinte
dall'integrazione completa con il desktop.

## Dati e recupero

Impostazioni → Importa ed esporta trasferisce configurazione, workspace e icone, senza
cookie e permessi. Il file contiene URL e nomi dei servizi: conservarlo privatamente.
Per tornare a una versione precedente usare l'export legacy in Impostazioni prima del downgrade.
Un profilo corrotto offre recupero con archivio dei file precedenti; non cancellare directory
Chromium per risolvere un problema di configurazione.

La sospensione è esplicita: ferma il servizio e le sue notifiche fino alla ripresa o al riavvio.
Pulire la cache HTTP conserva login e storage; una sessione condivisa interessa più servizi.
La diagnostica esportabile contiene eventi predefiniti e conteggi, non nomi, URL o contenuti.
Nessuna telemetria viene inviata automaticamente.

## Limiti verificati

Riferimento locale: Ubuntu 26.04.1 x64, GNOME/Wayland; prove aggiuntive su Xvfb e CI Ubuntu
24.04. Le fixture non certificano login dei provider, DND, hardware multimediale, sospensione
fisica o più monitor. Lingua del browser e del sito può essere superata dalle preferenze
dell'account del provider. Web Push rimane nel gate #53; non è garantito dalla sola notifica
locale di prova. Per un problema usare i template issue; per dati sensibili usare SECURITY.md.

## Matrice dei candidati AppImage

| Ambiente | Verifica riuscita | Limite |
|---|---|---|
| Ubuntu 26.04.1 x64, GNOME/Wayland | AppImage reale, due avvii, shell/IPC e persistenza | Avvio tramite AppImageLauncher; integrazione automatica nel menu non certificata |
| Ubuntu 24.04 x64, CI/Xvfb | Build nativa, checksum/licenze, launcher estratto e riavvio sandboxato | Ambiente headless, non desktop fisico |
| Ubuntu 24.04 ARM64, CI/Xvfb | Build nativa, architettura ELF, checksum/licenze e avvio sandboxato estratto | Non certifica FUSE o hardware ARM specifico |

I candidati sono unsigned. Le prove non sbloccano da sole i gate DEB, asset e notifiche.
