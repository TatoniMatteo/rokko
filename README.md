<div align="center">

<img src="src/renderer/src/assets/brand/rokko-dark-icon.png" alt="Rokko" width="128" height="128">

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
| Raggruppa i servizi in workspace personali e di lavoro. | Aggiungi più istanze dello stesso servizio con sessioni indipendenti. | La configurazione resta locale; ogni servizio mantiene le proprie normali connessioni. |

### Già nell'alpha

- Catalogo a griglia con otto servizi e aggiunta libera tramite URL HTTPS.
- Pagine per configurare app e workspace: modifica, spostamento, riordino e trasferimento dei servizi.
- Favicon automatiche dove disponibili e icone personalizzate salvate localmente.
- Navigazione avanti/indietro, stato di caricamento e recupero dagli errori di connessione.
- Salvataggio locale della configurazione e sessioni persistenti separate.
- Notifiche desktop autorizzabili per servizio, con avvio in background e pulsante di prova.
- Interfaccia scura con avvio verificato su Ubuntu con Wayland.

### La direzione

**Leggero, senza rinunciare alla reattività.** Consumi contenuti e notifiche tempestive
sono obiettivi centrali, da dimostrare con misurazioni.
Sono in programma l'importazione guidata da Rambox,
temi personalizzabili e pacchetti Linux pronti da installare.

Rokko è ancora un'**alpha sperimentale**: importazione e pacchetti di distribuzione
non sono ancora pronti. Il supporto alle notifiche è ancora parziale; accesso e notifiche dei singoli servizi restano da verificare.

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
