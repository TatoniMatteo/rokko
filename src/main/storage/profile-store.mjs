import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  fsyncSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  connect,
  createDatabase,
  ProfileError,
  readDatabase,
  replaceRows,
  refuseFutureDatabase,
} from './database.mjs';
import { emptyProfile, validateProfile } from './profile-state.mjs';

const legacyNames = ['rokko-state.json', 'rokko-preferences.json'];
function syncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function writePrivate(path, text) {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function legacyJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  if (statSync(path).size > 64 * 1024 * 1024) throw new ProfileError('legacy');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Owns configuration only. Chromium partition directories are never read, moved or deleted. */
export class ProfileStore {
  constructor(directory, { fault = () => {} } = {}) {
    this.directory = directory;
    this.path = join(directory, 'rokko.sqlite');
    this.backupPath = join(directory, 'rokko.previous.sqlite');
    this.fault = fault;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (
      !existsSync(this.path) &&
      (existsSync(this.backupPath) ||
        ['-journal', '-wal', '-shm'].some((suffix) => existsSync(this.path + suffix)))
    )
      throw new ProfileError('corrupt');
    const notices = existsSync(this.path) ? [] : this.migrate();
    this.profile = readDatabase(this.path);
    this.profile.notices.push(...notices); // Validate future versions before opening for writes.
    chmodSync(this.path, 0o600);
    this.db = connect(this.path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  }
  migrate() {
    const defaults = emptyProfile();
    let profile;
    try {
      const legacy = legacyJson(join(this.directory, legacyNames[0]), defaults.data);
      const preferences = legacyJson(join(this.directory, legacyNames[1]), defaults.preferences);
      if (legacy?.version > 1 || preferences?.version > 1) throw new ProfileError('future');
      profile = validateProfile(legacy, preferences, legacy?.activeAppId ?? null);
    } catch (error) {
      throw error instanceof ProfileError ? error : new ProfileError('legacy', error);
    }
    const temporary = this.path + '.migrating-' + randomUUID();
    try {
      if (legacyNames.some((name) => existsSync(join(this.directory, name)))) {
        const backup = join(this.directory, 'legacy-backup-' + randomUUID());
        mkdirSync(backup, { mode: 0o700 });
        for (const name of legacyNames) {
          const source = join(this.directory, name);
          if (existsSync(source)) writePrivate(join(backup, name), readFileSync(source));
        }
        syncDirectory(backup);
      }
      this.fault('migration-backup');
      createDatabase(temporary, profile, this.fault);
      const verified = readDatabase(temporary);
      if (
        !isDeepStrictEqual(verified.data, profile.data) ||
        !isDeepStrictEqual(verified.preferences, profile.preferences) ||
        verified.activeAppId !== profile.activeAppId
      ) {
        throw new ProfileError('legacy');
      }
      this.fault('migration-promote');
      renameSync(temporary, this.path);
      syncDirectory(this.directory);
    } finally {
      rmSync(temporary, { force: true });
    }
    return profile.notices;
  }
  read() {
    return structuredClone(this.profile);
  }
  checkpoint() {
    const temporary = this.backupPath + '.' + randomUUID();
    try {
      writePrivate(temporary, Buffer.alloc(0));
      this.db.prepare('VACUUM INTO ?').run(temporary);
      chmodSync(temporary, 0o600);
      readDatabase(temporary);
      renameSync(temporary, this.backupPath);
      syncDirectory(this.directory);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  save(profile) {
    this.checkpoint();
    this.fault('save-backup');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      replaceRows(this.db, profile);
      this.fault('save-rows');
      this.db.exec('COMMIT');
      this.profile = profile;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  saveData(data, activeAppId = this.profile.activeAppId) {
    const profile = validateProfile(data, this.profile.preferences, activeAppId);
    this.save(profile);
    return this.read();
  }
  savePreferences(preferences) {
    this.save(validateProfile(this.profile.data, preferences, this.profile.activeAppId));
  }
  saveContext(workspaceId, activeAppId) {
    const profile = validateProfile(
      { ...this.profile.data, selectedWorkspaceId: workspaceId },
      this.profile.preferences,
      activeAppId,
    );
    this.db
      .prepare('UPDATE context SET workspace_id=?,active_id=? WHERE id=1')
      .run(profile.data.selectedWorkspaceId, profile.activeAppId);
    this.profile = profile;
  }
  exportLegacy(destination) {
    const profile = this.read();
    const temporary = join(destination, '.rokko-export-' + randomUUID());
    const target = join(destination, 'rokko-export-' + randomUUID());
    mkdirSync(temporary, { mode: 0o700 });
    try {
      writePrivate(
        join(temporary, legacyNames[0]),
        JSON.stringify({ ...profile.data, activeAppId: profile.activeAppId }, null, 2),
      );
      writePrivate(join(temporary, legacyNames[1]), JSON.stringify(profile.preferences, null, 2));
      syncDirectory(temporary);
      renameSync(temporary, target);
      syncDirectory(destination);
      return target;
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  close() {
    this.db?.close();
    this.db = null;
  }
}

export function recoveryInfo(directory, kind) {
  let canRestore = false;
  if (kind !== 'future') {
    try {
      readDatabase(join(directory, 'rokko.previous.sqlite'));
      canRestore = true;
    } catch {
      /* Keep damaged backups untouched. */
    }
  }
  return { kind, canRestore };
}
export function recoverProfile(directory, action, kind, { fault = () => {} } = {}) {
  if (kind === 'future' || !['restore', 'new'].includes(action))
    throw new Error('This profile needs a compatible version of Rokko');
  const path = join(directory, 'rokko.sqlite');
  const backup = join(directory, 'rokko.previous.sqlite');
  if (existsSync(path)) refuseFutureDatabase(path);
  if (action === 'restore') readDatabase(backup);
  const archive = join(directory, 'recovery-' + randomUUID());
  mkdirSync(archive, { mode: 0o700 });
  for (const name of [
    'rokko.sqlite',
    'rokko.previous.sqlite',
    'rokko.sqlite-journal',
    'rokko.sqlite-wal',
    'rokko.sqlite-shm',
    ...legacyNames,
  ]) {
    const source = join(directory, name);
    if (existsSync(source)) {
      copyFileSync(source, join(archive, name));
      chmodSync(join(archive, name), 0o600);
      const copied = openSync(join(archive, name), 'r');
      try {
        fsyncSync(copied);
      } finally {
        closeSync(copied);
      }
    }
  }
  syncDirectory(archive);
  fault('recovery-archive');
  const temporary = path + '.recovery-' + randomUUID();
  try {
    const profile = action === 'restore' ? readDatabase(backup) : emptyProfile();
    createDatabase(temporary, profile);
    readDatabase(temporary);
    // Remove the old database and its journals together before promoting a clean database.
    // If interrupted here, startup requests recovery instead of replaying an old journal.
    for (const name of [
      'rokko.sqlite',
      'rokko.sqlite-journal',
      'rokko.sqlite-wal',
      'rokko.sqlite-shm',
    ]) {
      const source = join(directory, name);
      // The exact bytes above are already durable in the private archive.
      rmSync(source, { force: true });
    }
    syncDirectory(directory);
    fault('recovery-promote');
    renameSync(temporary, path);
    syncDirectory(directory);
  } finally {
    rmSync(temporary, { force: true });
  }
  return new ProfileStore(directory);
}

export { emptyProfile } from './profile-state.mjs';
