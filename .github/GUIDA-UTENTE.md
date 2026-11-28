# Guida utente di Rokko

Tieni le applicazioni web in una sola finestra e organizzale per contesto: personale,
lavoro, studio. Non serve un account Rokko: accedi direttamente ai siti che aggiungi.
Questa guida descrive le funzioni disponibili nell’alpha attuale, con i nomi dei comandi in italiano.

## Parti da qui

1. Apri Rokko e, nella Home, scegli **Aggiungi applicazione**.
2. Cerca un servizio nel catalogo oppure scegli **Servizio personalizzato** e inserisci il suo URL HTTPS.
3. Controlla il nome e scegli il workspace di destinazione, oppure **Sempre visibili**.
4. Conferma l’aggiunta e accedi al servizio come faresti nel browser.

Puoi aggiungere più volte lo stesso servizio per usare account diversi. Per tenerli separati,
scegli sessioni indipendenti o workspace diversi.

Puoi consultare questa guida anche offline da **Impostazioni → Guida utente**.
La ricerca della guida trova parole nei titoli e nel testo completo degli argomenti.
Puoi aprirla anche cercando **Guida utente** nella Ricerca rapida.

## Orientati nella finestra

La barra di navigazione contiene il logo, **Home**, **Impostazioni**, **Ricerca rapida** e le
icone dei servizi. Passa il puntatore su un’icona per leggerne il nome; fai clic per aprirla.
Ogni workspace ha una card riconoscibile dalla sua iniziale.

La **Home** è la dashboard da cui aggiungere servizi, creare workspace e organizzarli.
**Servizi configurati** raccoglie tutte le applicazioni, anche quelle di workspace nascosti;
**Tutti i workspace** permette di gestire i gruppi.

Con il tasto destro su un servizio o workspace apri il menu contestuale e i relativi comandi.
Il gruppo **Azioni rapide**, alla fine della barra, apre Home, Impostazioni e Ricerca rapida.

## Organizza workspace e barra

Dalla Home scegli **Nuovo workspace**, assegna un nome e salvalo. Puoi poi aggiungervi servizi
oppure spostare quelli esistenti dalla loro pagina di modifica.

Nella dashboard puoi:

- Trascinare le card per cambiare l’ordine dei gruppi nella barra.
- Scegliere un gruppo e trascinare i suoi servizi per riordinarli.
- Mostrare o nascondere i workspace dalla barra.

**Di default nascondere un workspace iberna i suoi servizi**, interrompendo anche notifiche,
chiamate e download. Puoi disabilitare questa regola in **Impostazioni → Ibernazione dei servizi**;
in quel caso nascondere il workspace non ferma le applicazioni già avviate. I servizi del gruppo **Sempre visibili** rimangono
accessibili indipendentemente dal workspace selezionato.

Quando elimini un workspace che contiene servizi, scegli dove trasferirli nella pagina di
conferma. Eliminare un servizio dalla configurazione non equivale a cancellare il suo account
presso il provider.

## Usa gli account nel modo giusto

Ogni servizio può usare una sessione indipendente oppure condividere quella del workspace.
Nelle impostazioni del workspace trovi la gestione degli account Google e Microsoft e le
opzioni di condivisione per i servizi presenti.

Per esempio, Gmail e Calendar nello stesso workspace con sessione condivisa possono usare
il login Google già effettuato, dove il provider lo consente. Un altro workspace mantiene
una sessione distinta. I servizi **Sempre visibili** usano sessioni private.
I login del tuo normale browser non vengono importati automaticamente in Rokko.

Cambiare workspace o modalità di sessione può mostrare un account diverso o richiedere un
nuovo accesso. Rokko non trasferisce automaticamente i cookie fra sessioni. Anche il logout
su un sito può coinvolgere altri servizi che condividono quella sessione.

## Cerca e cambia applicazione

Premi **Ctrl + K** oppure usa l’icona della ricerca nella barra. Digita il nome di un servizio,
di un workspace o di un comando di Rokko. Usa le frecce per scegliere, **Invio** per aprire e
**Esc** per tornare alla pagina precedente.

La ricerca riguarda i nomi nella configurazione: non cerca nei messaggi, nelle email o nei
contenuti delle applicazioni web.

## Affianca due servizi

1. Apri il primo servizio e i suoi **Controlli del servizio**.
2. Nella sezione **Vista affiancata**, scegli il secondo servizio in **Mostra accanto a questo servizio**.
3. Torna all’applicazione: entrambi i servizi occupano la stessa area di lavoro.

Trascina il separatore per modificare le dimensioni. Puoi anche selezionarlo con Tab e usare
le frecce destra/sinistra. La scelta del secondo servizio e la proporzione vengono salvate.
Con **Chiudi vista affiancata** torni alla vista singola. La modalità affiancata conserva le
sessioni configurate per ciascun servizio.

## Personalizza Rokko

Apri **Impostazioni** per scegliere tema chiaro, scuro o di sistema, colore e posizione della
barra: sopra, sotto, a destra o a sinistra. I cerchi colorati offrono colori predefiniti;
l’ultimo permette di scegliere un colore personalizzato.

Da **Uso risorse** puoi consultare CPU e memoria dei servizi, i totali per workspace e quelli
dell’applicazione. I campioni si aggiornano periodicamente; processi condivisi vengono contati
una sola volta nei totali aggregati.

Le modifiche all’aspetto e alla lingua hanno un’anteprima: usa **Salva modifiche** per
conservarle oppure **Annulla** per tornare alle impostazioni precedenti.

L’interfaccia supporta italiano e inglese. Per applicare la nuova lingua del browser ai
servizi serve riavviare Rokko; le preferenze dell’account o del sito possono comunque prevalere.
Le icone dei servizi vengono cercate automaticamente tramite favicon e possono essere
personalizzate dalla pagina di modifica dell’applicazione.

## Controlla un servizio

Apri i **Controlli del servizio** per navigare avanti/indietro, ricaricare la pagina, aprirla
nel browser esterno, modificarla o consultarne lo stato.

| Comando | Effetto |
|---|---|
| Silenzia servizio | Ferma l’audio della sola applicazione; le notifiche desktop mantengono le proprie impostazioni. |
| Svuota cache HTTP | Pulisce la cache della sessione, conservando cookie e dati dei siti. La conferma elenca gli altri servizi interessati. |
| Reimposta permessi del servizio | Rimuove i consensi per notifiche e dispositivi e ricarica il servizio; cookie conservati. |
| Sospendi servizio | Ferma il servizio fino alla ripresa manuale o al riavvio di Rokko. |

Ricarica, reset dei permessi e sospensione possono interrompere attività o far perdere bozze
non salvate nel sito. Leggi le conseguenze mostrate prima di confermare.

### Sospensione e consumo di risorse

Per fermare un’app che non ti serve, fai clic destro sulla sua icona e scegli **Iberna**.
Lo stesso menu mostra **Riprendi** quando il servizio è ibernato. Puoi usare anche i controlli
del servizio e il pulsante **Riprendi servizio** nella sua pagina.

Il login viene conservato, ma durante la sospensione quel servizio non lavora e non riceve
le proprie notifiche; i download attivi vengono annullati. Alcuni processi condivisi possono
restare attivi perché utilizzati da altri servizi del workspace. Riavviare Rokko cancella le
sospensioni manuali: le applicazioni potranno essere caricate nuovamente quando necessario.

La sospensione manuale resta disponibile anche quando usi le regole automatiche. L’ibernazione
non salva la memoria esatta della pagina: una bozza conservata soltanto nel sito può andare
persa. Per continuare a ricevere notifiche, il servizio deve restare attivo.

### Regole automatiche

Di default i servizi sono idonei all’ibernazione all’avvio. Le opzioni di avvio per singolo
servizio permettono di includerli o escluderli senza cambiare gli altri servizi.

Apri **Impostazioni → Ibernazione dei servizi**. La regola **Mantieni ibernati i servizi dei
workspace nascosti** è attiva di default e ha precedenza sulle altre regole. Mostrare nuovamente
il workspace rimuove la sospensione automatica; i servizi prima avviati vengono riattivati.
Una sospensione manuale resta invece in vigore fino alla ripresa o al riavvio.

Per configurare un singolo servizio, apri **Modifica applicazione → Configura ibernazione**,
oppure **Ibernazione del servizio** dal suo menu destro. Attiva **Iberna dopo un periodo di
inattività** e scegli i minuti: la scelta interessa soltanto quel servizio. Nella stessa pagina
trovi le **Regole avanzate** per combinare più condizioni. Le impostazioni generali permettono
anche regole comuni a tutti i servizi o a un workspace.

Con **Aggiungi regola automatica** puoi combinare condizioni:

- **Non utilizzato in primo piano:** attendi da 1 a 1440 minuti dall’ultimo utilizzo in primo piano.
- **Fuori dal workspace selezionato:** interessa i servizi appartenenti ad altri workspace;
  i servizi globali non soddisfano questa condizione.
- **Durante una fascia oraria:** scegli ore locali e giorni di inizio. Lunedì 22:00–08:00
  copre anche la mattina di martedì, fino alle 08:00 escluse.

**Tutte le condizioni** richiede che siano tutte vere; **Almeno una condizione** ne richiede
una sola. Per esempio, puoi ibernare un workspace fuori orario soltanto se i suoi servizi
sono anche inattivi da 30 minuti. Salva le modifiche per applicarle.

Le regole personalizzate non ibernano i servizi che stai visualizzando, neppure in vista
affiancata. Di default selezionare un servizio ibernato non lo riattiva: usa **Riprendi**, oppure abilita
il risveglio alla selezione nelle impostazioni di ibernazione. Sono disponibili
esclusioni per servizio e protezioni per audio, download e accesso ai dispositivi. La protezione
dei dispositivi conserva attivi i servizi con richieste pendenti o permessi concessi: non
controlla il contenuto delle chiamate. La regola dei workspace nascosti ha comunque precedenza.
Le regole vengono conservate al riavvio; l’export di configurazione attuale non le trasferisce.

### Leggi lo stato dalla barra

I servizi avviati hanno l’icona pulita, senza pallini. Il simbolo di pausa indica un servizio
ibernato; l’icona attenuata indica un servizio non ancora caricato. Un punto esclamativo
segnala un errore.
Passando il puntatore sull’icona trovi il nome e, se sospeso, il motivo della sospensione.

## Notifiche, dispositivi e download

Le notifiche si abilitano per servizio dalla sua pagina di modifica; il pulsante di prova
verifica le notifiche desktop di Rokko. Non garantisce che il singolo provider o il Web Push
funzionino: questo supporto resta parziale nell’alpha. Controlla anche le impostazioni di
notifica e la modalità Non disturbare del desktop.

Quando un servizio richiede camera, microfono o schermo, apri **Controlla permessi** per
consentire o negare l’accesso. La condivisione dello schermo richiede anche di scegliere una
sorgente. I permessi dei dispositivi sono temporanei; puoi revocarli da **Permessi dei servizi**.
La condivisione dell’audio di sistema non è disponibile su Linux.

Per un download scegli dove salvare il file nel dialogo di sistema. Da **Download**, nelle
impostazioni o nei controlli del servizio, puoi seguire l’avanzamento e annullarlo. La cronologia
mostrata dura fino alla chiusura di Rokko; i file salvati restano nella cartella scelta.

## Importa ed esporta la configurazione

In **Impostazioni → Importa ed esporta** puoi salvare un file di configurazione di Rokko o
sceglierne uno da importare. Il file contiene servizi, workspace, icone e aspetto; cookie,
credenziali delle sessioni e permessi non vengono trasferiti. Nomi e URL possono essere
personali: conserva il file privatamente.

Prima di importare, controlla l’anteprima:

- I workspace con lo stesso nome vengono associati. Nomi ambigui richiedono di rinominare i duplicati.
- Puoi saltare i servizi corrispondenti oppure creare copie aggiuntive.
- L’importazione di aspetto e lingua è facoltativa.

L’import non sostituisce i servizi esistenti. Un servizio importato con sessione condivisa
può usare gli account già collegati nel workspace di destinazione.

### Da Rambox

Apri **Importa da Rambox** nelle impostazioni. Se la tua versione di Rambox espone il server
MCP locale, abilitalo temporaneamente e inserisci porta e token nella pagina di Rokko.
Scegli **Leggi servizi**, poi disattiva MCP in Rambox appena compare l’anteprima.

Seleziona i servizi e assegna le destinazioni: workspace esistente, nuovo workspace o servizi
sempre visibili. Controlla nomi e URL prima di confermare. L’import trasferisce i servizi,
senza cookie o credenziali; la sorgente attuale non fornisce i workspace originali.
Il lettore non accetta direttamente gli export nativi di Rambox.

## Se qualcosa non funziona

Se un servizio mostra un errore, usa **Riprova** o aprilo nel browser esterno. Un problema di
accesso del provider non si risolve necessariamente cancellando la cache: questa operazione
conserva i cookie.

In **Impostazioni** puoi esportare la diagnostica locale per una segnalazione. Il report usa
eventi predefiniti e conteggi; non include nomi dei servizi, URL o contenuti delle pagine.
Per problemi di configurazione, la schermata di recupero offre le opzioni disponibili e
conserva un archivio dei file precedenti.

Per installazione e limiti degli ambienti Linux consulta [Usare Rokko su Linux](LINUX.md).

### Installazione e aggiornamento su Linux

Scarica il DEB della tua architettura da GitHub Releases e installalo con
`sudo apt install ./nome-del-pacchetto.deb`. Per aggiornarlo, chiudi Rokko e installa
il nuovo DEB allo stesso modo. Il runtime è incluso: Node e pnpm servono solo agli sviluppatori.
AppImage è un formato alternativo: scegli una sola installazione abituale per evitare
launcher duplicati. Non è presente un aggiornamento automatico.

## Scorciatoie utili

| Tasti | Azione |
|---|---|
| Ctrl + K | Ricerca rapida. |
| Ctrl + Tab / Ctrl + Maiusc + Tab | Passa al servizio successivo/precedente nella navigazione della barra. |
| Alt + 1…9 | Apre il servizio nella posizione corrispondente della barra. |
| Alt + PagSu / PagGiù | Passa al workspace precedente/successivo. |
| Alt + Home | Torna alla Home di Rokko. |

Le scorciatoie per cambiare servizio o workspace si fermano nelle pagine di configurazione per permetterti di
modificare i campi. Usa Tab e Maiusc + Tab per spostarti fra i controlli, Invio o Spazio per
attivarli. Il riepilogo completo è disponibile in **Impostazioni → Scorciatoie da tastiera**.
