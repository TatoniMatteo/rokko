import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, openSync, readSync } from 'node:fs';
import { validateProfile } from './profile-state.mjs';

export const schemaVersion = 1;
const applicationId = 0x524f4b4b;
const schema = `
CREATE TABLE migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);
CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL UNIQUE);
CREATE TABLE services(id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
 workspace_id TEXT REFERENCES workspaces(id), partition TEXT NOT NULL, icon TEXT, notification_origin TEXT,
 position INTEGER NOT NULL UNIQUE);
CREATE TABLE preferences(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE context(id INTEGER PRIMARY KEY CHECK(id=1), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 active_id TEXT REFERENCES services(id));
`;
const checksum = createHash('sha256').update(schema).digest('hex');
const tableDefinitions = schema
  .split(';')
  .map((sql) => sql.trim())
  .filter(Boolean);
const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();
function knownTables(db) {
  return tableDefinitions.every((sql) => {
    const name = sql.match(/^CREATE TABLE (\w+)/)[1];
    const actual = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name)?.sql;
    return actual && normalizeSql(actual) === normalizeSql(sql);
  });
}

export class ProfileError extends Error {
  constructor(kind, cause) {
    super('Profile configuration could not be opened', { cause });
    this.kind = kind;
  }
}
export function connect(path, readOnly = false) {
  return new DatabaseSync(path, { readOnly, allowExtension: false, defensive: true, timeout: 500 });
}
// Inspect the documented header before SQLite can attempt hot-journal recovery.
export function refuseFutureDatabase(path) {
  const fd = openSync(path, 'r');
  try {
    const header = Buffer.alloc(100);
    const size = readSync(fd, header, 0, header.length, 0);
    if (
      size >= 64 &&
      header.subarray(0, 16).equals(Buffer.from('SQLite format 3\0')) &&
      header.readUInt32BE(60) > schemaVersion
    ) {
      throw new ProfileError('future');
    }
  } finally {
    closeSync(fd);
  }
}
export function readDatabase(path) {
  let db;
  try {
    refuseFutureDatabase(path);
    db = connect(path, true);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > schemaVersion) throw new ProfileError('future');
    if (
      version !== schemaVersion ||
      !knownTables(db) ||
      db.prepare('PRAGMA application_id').get().application_id !== applicationId ||
      db.prepare('SELECT checksum FROM migrations WHERE version=?').get(schemaVersion)?.checksum !==
        checksum ||
      db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' ||
      db
        .prepare('PRAGMA foreign_key_check')
        .all()
        .some((row) => row.table !== 'context')
    ) {
      throw new ProfileError('corrupt');
    }
    const workspaces = db
      .prepare('SELECT id,name FROM workspaces ORDER BY position')
      .all()
      .map((row) => ({ ...row }));
    const apps = db
      .prepare('SELECT * FROM services ORDER BY position')
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        workspaceId: row.workspace_id,
        partition: row.partition,
        ...(row.icon === null ? {} : { icon: row.icon }),
        ...(row.notification_origin === null
          ? {}
          : { notificationOrigin: row.notification_origin }),
      }));
    const context = db.prepare('SELECT workspace_id,active_id FROM context WHERE id=1').get();
    return validateProfile(
      { version: 1, workspaces, apps, selectedWorkspaceId: context?.workspace_id },
      JSON.parse(db.prepare('SELECT value FROM preferences WHERE id=1').get()?.value),
      context?.active_id ?? null,
    );
  } catch (error) {
    throw error instanceof ProfileError ? error : new ProfileError('corrupt', error);
  } finally {
    db?.close();
  }
}
export function createDatabase(path, profile, fault = () => {}) {
  closeSync(openSync(path, 'wx', 0o600));
  const db = connect(path);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
    db.exec(schema);
    db.prepare('INSERT INTO migrations VALUES (?,?)').run(schemaVersion, checksum);
    replaceRows(db, profile);
    fault('migration-rows');
    db.exec(
      `PRAGMA application_id=${applicationId}; PRAGMA user_version=${schemaVersion}; COMMIT;`,
    );
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
  chmodSync(path, 0o600);
}
export function replaceRows(db, profile) {
  db.exec(
    'DELETE FROM context; DELETE FROM services; DELETE FROM workspaces; DELETE FROM preferences;',
  );
  const workspace = db.prepare('INSERT INTO workspaces VALUES (?,?,?)');
  profile.data.workspaces.forEach((row, index) => workspace.run(row.id, row.name, index));
  const service = db.prepare('INSERT INTO services VALUES (?,?,?,?,?,?,?,?)');
  profile.data.apps.forEach((row, index) =>
    service.run(
      row.id,
      row.name,
      row.url,
      row.workspaceId,
      row.partition,
      row.icon ?? null,
      row.notificationOrigin ?? null,
      index,
    ),
  );
  db.prepare('INSERT INTO preferences VALUES (1,?)').run(JSON.stringify(profile.preferences));
  db.prepare('INSERT INTO context VALUES (1,?,?)').run(
    profile.data.selectedWorkspaceId,
    profile.activeAppId,
  );
}
