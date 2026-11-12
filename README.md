<div align="center">

<img src="assets/brand/rokko-dark-icon.png" alt="Rokko" width="128" height="128">

# Rokko

### Le tue applicazioni web. Uno spazio tutto tuo.

Un workspace desktop open source per Linux: riunisci servizi e account,
organizza lavoro e vita personale e mantieni il controllo dei tuoi dati.

**Linux first · Local first · GPL-3.0-or-later**

</div>

---

Rokko porta le applicazioni web in una finestra dedicata, con workspace per organizzarle
e sessioni separate per usare più account dello stesso servizio.
Nessun account Rokko richiesto, nessuna telemetria e nessun backend del progetto.

| Uno spazio ordinato | Account separati | Dati sul tuo PC |
| :--- | :--- | :--- |
| Raggruppa i servizi in workspace personali e di lavoro. | Scegli sessioni indipendenti o condividi il login tra i servizi di un workspace. | La configurazione resta locale; ogni servizio mantiene le proprie normali connessioni. |

### Già nell'alpha

- Catalogo a griglia con otto servizi e aggiunta libera tramite URL HTTPS.
- Servizi globali sempre visibili e sessioni condivise del workspace, con gestione account dalle sue impostazioni.
- Pagine per configurare app e workspace: modifica, spostamento, riordino e trasferimento dei servizi.
- Favicon automatiche dove disponibili e icone personalizzate salvate localmente.
- Navigazione avanti/indietro, stato di caricamento e recupero dagli errori di connessione.
- Importazione dei servizi Rambox tramite MCP locale, con anteprima e scelta dei workspace di destinazione.
- Salvataggio locale della configurazione e sessioni persistenti separate.
- Notifiche desktop autorizzabili per servizio, con avvio in background e pulsante di prova.
- Scorciatoie da tastiera per cambiare servizio e workspace, con riepilogo nell’interfaccia.
- Barra compatta sui quattro lati e dashboard per organizzare servizi e workspace.
- Tema chiaro, scuro o di sistema, colori personalizzabili e interfaccia in italiano e inglese.

### La direzione

**Leggero, senza rinunciare alla reattività.** Consumi contenuti e notifiche tempestive
sono obiettivi centrali, da dimostrare con misurazioni.
Sono in programma pacchetti Linux pronti da installare.

Rokko è ancora un'**alpha sperimentale**: i pacchetti di distribuzione non sono ancora pronti.
L’importazione Rambox trasferisce i servizi, senza ricostruire i workspace originali o le sessioni.
Il supporto alle notifiche è ancora parziale; accesso e notifiche dei singoli servizi restano da verificare.

### Provalo dai sorgenti

Con Node.js 22.12+ e Corepack disponibili, dalla cartella del progetto:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Su Ubuntu il primo avvio può richiedere la password amministrativa per configurare
il profilo AppArmor dedicato a Electron. Dopo la configurazione basta il comando di avvio.

---

<div align="center">

Realizzato con Electron, React e TypeScript.<br>
Distribuito con licenza <a href="LICENSE">GPL-3.0-or-later</a>.

</div>
