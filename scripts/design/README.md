# FigCraft → Rokko

Rokko usa `Button`, `TextField` e `Card` in `src/renderer/components/ui`.
Gli stili provengono da uno snapshot generato, insieme alla palette chiaro/scuro.

## Uso quotidiano

1. Apri la sorgente indicata da `figcraft.config.json` nella finestra FigCraft avviata con
   `--control 7979`. In questa macchina è già disponibile la sessione `figcraft-design-window`.
2. Avvia Rokko con `pnpm dev`: il collegamento parte con Vite.
3. Modifica il componente o le variabili in FigCraft e salva. L’anteprima si aggiorna
   senza ricaricare l’applicazione, le bozze o i servizi.

Per modifiche comuni usa la collezione **ROKKO · Geometria UI**:
`button-radius`, `field-radius`, `card-radius`, `control-height`.
Gli stati condividono queste variabili. La pagina **08 · Libreria collegata all’app** mostra
le primitive e la **09 · Specifiche di implementazione** descrive misure e vincoli.

Il file di studio rimane locale nella directory `.codex`, come previsto dalle convenzioni del progetto.
Per un altro documento imposta `FIGCRAFT_DOCUMENT=/percorso/file.figcraft`; i componenti devono
corrispondere agli identificatori del manifest. `FIGCRAFT_PORT` e `FIGCRAFT_CLI` possono cambiare
porta e percorso del CLI. Il CLI deve supportare `mcp --attach` (verificato con FigCraft 0.18.1).

## Comandi

| Comando | Comportamento |
| --- | --- |
| `pnpm dev` | Avvia Rokko e il collegamento automatico al salvataggio. |
| `pnpm design:sync` | Importa una volta il documento salvato. |
| `pnpm design:watch` | Avvia il solo collegamento, per un’anteprima già predisposta senza il plugin. |
| `pnpm check` | Verifica tipi, test e build. |

Non avviare `design:watch` insieme al collegamento già incluso in `pnpm dev`.
Non avviare una seconda finestra sulla stessa porta. Se FigCraft è stato aperto senza controllo,
una finestra dedicata può essere avviata con `FigCraft.AppImage --control 7979 PERCORSO_DOCUMENTO`.

## Contratto automatico

Il manifest mappa dodici varianti: pulsante normale/hover/focus/disabilitato/occupato,
secondario, distruttivo; campo normale/focus/errore/disabilitato; card.

Si sincronizzano raggi, colori solidi e variabili semantiche, bordi uniformi, opacità,
altezza minima dei controlli, tipografia Onest e padding del testo. Le card esportano
separatamente i quattro padding. Le azioni nelle pagine usano la larghezza del campione come minimo;
il contenuto può allargarle. Nei campi si esporta la superficie `Input`, non l’altezza dell’intero esempio.
Il focus aggiunge il bordo visivo con un’ombra interna per mantenere fermi testo e layout.

La palette di FigCraft vale per il seed predefinito. Gli altri colori scelti dall’utente
continuano a usare il generatore accessibile di Rokko. Il font rimane un asset locale dell’app.

Etichette tradotte, validazione, eventi, focus, sessioni e contenuti restano nel codice React.
L’aggiunta di icone, figli o nuovi componenti richiede di aggiornare l’implementazione e il manifest:
la firma della struttura impedisce di ignorare silenziosamente una modifica di questo tipo.
`Code Connect` associa inoltre i componenti nativi alle primitive React; non genera la logica applicativa.

## Errori e distribuzione

Il watcher controlla il salvataggio, risolve il documento tramite MCP nella finestra visibile,
valida il risultato e sostituisce atomicamente un unico file:
`src/renderer/styles/generated/figcraft.json`.
La console segnala sincronizzazioni ed errori. FigCraft assente, documento non salvato,
font non integrato, gradiente, palette non supportata o struttura cambiata conservano l’ultimo snapshot valido.
Se continui a modificare il disegno durante l’esportazione, salva di nuovo per sincronizzare lo stato completo.

La build include solo lo snapshot e i componenti React: nessun MCP, watcher, CLI o processo FigCraft
nell’app distribuita. Si può compilare e avviare Rokko anche senza FigCraft o senza lo studio locale.
Prima di creare una build delle ultime modifiche grafiche, attendi la sincronizzazione dell’anteprima
oppure esegui `pnpm design:sync`.
