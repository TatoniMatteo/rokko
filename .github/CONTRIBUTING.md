# Contribuire a Rokko

Apri una issue prima di un intervento sostanziale e mantieni le modifiche concentrate sul problema descritto.

- Branch relativi a issue: `ISSUE-<numero>`.
- Commit: `[#<numero>] - descrizione`, oppure `[closes #<numero>] - descrizione` per chiudere la issue.
- Usa lo stesso formato nel titolo della pull request, che diventa il titolo del commit squash.
- Prima della pull request esegui `corepack pnpm check` e descrivi le verifiche effettuate.
- Per modifiche all'interfaccia aggiungi una schermata; segnala esplicitamente gli ambienti non verificati.

Le modifiche passano attraverso pull request e controlli automatici. Mantieni sandbox, isolamento delle sessioni e convalida degli IPC.
Dati personali, credenziali, profili di prova, `.codex` e materiali intermedi restano locali.
