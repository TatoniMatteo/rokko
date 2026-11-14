import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ProfileStore, recoveryInfo, recoverProfile } from '../../src/main/storage/profile-store.mjs';
import { emptyProfile } from '../../src/main/storage/profile-state.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rokko-profile-'));
  t.after(() => rmSync(directory, {recursive:true,force:true}));
  const profile = emptyProfile();
  profile.data.workspaces.push({id:'work',name:'Work'});
  profile.data.apps = [
    {id:'global',name:'Global',url:'https://global.example/',workspaceId:null,partition:'persist:rokko-global'},
    {id:'first',name:'First',url:'https://first.example/',workspaceId:'work',partition:'persist:rokko-workspace-work',notificationOrigin:'https://first.example'},
    {id:'second',name:'Second',url:'https://second.example/',workspaceId:'work',partition:'persist:rokko-workspace-work'}
  ];
  profile.data.selectedWorkspaceId='work'; profile.activeAppId='first';
  profile.preferences.cardOrder=['work','global','personal'];
  profile.preferences.hiddenWorkspaces=['personal'];
  writeFileSync(join(directory,'rokko-state.json'),JSON.stringify({...profile.data,activeAppId:profile.activeAppId}));
  writeFileSync(join(directory,'rokko-preferences.json'),JSON.stringify(profile.preferences));
  return {directory,profile};
}
test('complete legacy migration', t => {
  const {directory,profile}=fixture(t);
  const original=readFileSync(join(directory,'rokko-state.json'));
  const store=new ProfileStore(directory);
  assert.deepEqual(store.read(),profile);
  assert.equal(statSync(join(directory,'rokko.sqlite')).mode&0o777,0o600);
  store.close();
  assert.deepEqual(readFileSync(join(directory,'rokko-state.json')),original);
  const migrated=new ProfileStore(directory);assert.deepEqual(migrated.read(),profile);migrated.close();
  assert.equal(readdirSync(directory).filter(name=>name.startsWith('legacy-backup-')).length,1);
});
test('migration interruption', t => {
  const {directory,profile}=fixture(t);
  for(const point of ['migration-backup','migration-rows','migration-promote']) {
    assert.throws(()=>new ProfileStore(directory,{fault:p=>{if(p===point)throw Error('injected')}}),/injected/);
    assert.ok(!readdirSync(directory).includes('rokko.sqlite'));
    assert.ok(!readdirSync(directory).some(name=>name.includes('.migrating-')));
  }
  const store=new ProfileStore(directory);assert.deepEqual(store.read(),profile);store.close();
});
test('failed writes stay atomic', t => {
  const {directory,profile}=fixture(t);let failure;
  const store=new ProfileStore(directory,{fault:p=>{if(p===failure)throw Error('injected')}});
  const changed=structuredClone(profile.data);changed.apps.reverse();
  for(const point of ['save-backup','save-rows']) {
    failure=point;assert.throws(()=>store.saveData(changed),/injected/);assert.deepEqual(store.read(),profile);
  }
  store.close();const reopened=new ProfileStore(directory);assert.deepEqual(reopened.read(),profile);reopened.close();
});
test('rollback exports current data', t => {
  const {directory,profile}=fixture(t);const store=new ProfileStore(directory);
  const changed=structuredClone(profile.data);changed.apps.reverse();changed.workspaces[1].name='Renamed';
  store.saveData(changed);store.savePreferences({...profile.preferences,seed:'#bf4b6c'});
  store.saveContext('work','second');
  const exported=store.exportLegacy(directory);const expected=store.read();store.close();
  const rollback=new ProfileStore(exported);assert.deepEqual(rollback.read(),expected);rollback.close();
  assert.equal(statSync(join(exported,'rokko-state.json')).mode&0o777,0o600);
});
test('future schema is untouched', t => {
  const {directory}=fixture(t);const store=new ProfileStore(directory);store.close();
  const path=join(directory,'rokko.sqlite');const db=new DatabaseSync(path);db.exec('PRAGMA user_version=99');db.close();
  const before=readFileSync(path);
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='future');
  assert.deepEqual(readFileSync(path),before);
  assert.throws(()=>recoverProfile(directory,'new','future'),/compatible version/);
  assert.deepEqual(readFileSync(path),before);
});
test('corruption recovery preserves partitions', t => {
  const {directory,profile}=fixture(t);const partition=join(directory,'Partitions','untouched');mkdirSync(partition,{recursive:true});
  writeFileSync(join(partition,'cookie-fixture'),'not-a-real-cookie');
  const store=new ProfileStore(directory);store.saveData(profile.data);store.close();
  writeFileSync(join(directory,'rokko.sqlite'),'corrupt');
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='corrupt');
  assert.equal(recoveryInfo(directory,'corrupt').canRestore,true);
  const restored=recoverProfile(directory,'restore','corrupt');assert.deepEqual(restored.read(),profile);restored.close();
  assert.equal(readFileSync(join(partition,'cookie-fixture'),'utf8'),'not-a-real-cookie');
  const archive=readdirSync(directory).find(name=>name.startsWith('recovery-'));
  assert.equal(readFileSync(join(directory,archive,'rokko.sqlite'),'utf8'),'corrupt');
});
test('invalid legacy never becomes empty silently', t => {
  const {directory}=fixture(t);writeFileSync(join(directory,'rokko-state.json'),'{');
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='legacy');
  assert.ok(!readdirSync(directory).includes('rokko.sqlite'));
  const fresh=recoverProfile(directory,'new','legacy');assert.deepEqual(fresh.read(),emptyProfile());fresh.close();
});
test('navigation references are repaired', t => {
  const {directory,profile}=fixture(t);const data={...profile.data,selectedWorkspaceId:'missing',activeAppId:'missing'};
  writeFileSync(join(directory,'rokko-state.json'),JSON.stringify(data));
  const store=new ProfileStore(directory);const result=store.read();store.close();
  assert.equal(result.data.selectedWorkspaceId,'personal');assert.equal(result.activeAppId,null);assert.equal(result.notices.length,2);
  assert.deepEqual(result.data.apps,profile.data.apps);
});
test('invalid registry is rejected', t => {
  const {directory,profile}=fixture(t);const store=new ProfileStore(directory);
  for(const edit of [data=>data.apps.push(data.apps[0]), data=>{data.apps[0].workspaceId='missing'},
    data=>{data.apps[0].partition=data.apps[1].partition}, data=>{data.apps[0].partition='persist:rokko-../unsafe'},
    data=>{data.apps[0].url='file:///etc/passwd'},data=>{data.apps[0].password='not-stored'}]) {
    const bad=structuredClone(profile.data);edit(bad);assert.throws(()=>store.saveData(bad));assert.deepEqual(store.read(),profile);
  }
  store.close();
});

test('future legacy is untouched', t => {
  const {directory}=fixture(t);const path=join(directory,'rokko-state.json');writeFileSync(path,JSON.stringify({version:99}));
  const before=readFileSync(path);assert.throws(()=>new ProfileStore(directory),error=>error.kind==='future');
  assert.deepEqual(readFileSync(path),before);assert.ok(!readdirSync(directory).includes('rokko.sqlite'));
});

test('missing database requires recovery', t => {
  const {directory,profile}=fixture(t);const store=new ProfileStore(directory);store.saveData(profile.data);store.close();
  rmSync(join(directory,'rokko.sqlite'));
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='corrupt');
  const restored=recoverProfile(directory,'restore','corrupt');assert.deepEqual(restored.read(),profile);restored.close();
});

test('unexpected schema is preserved', t => {
  const {directory}=fixture(t);const store=new ProfileStore(directory);store.close();
  const path=join(directory,'rokko.sqlite');const db=new DatabaseSync(path);db.exec('ALTER TABLE services ADD COLUMN unknown_field TEXT');db.close();
  const bytes=readFileSync(path);assert.throws(()=>new ProfileStore(directory),error=>error.kind==='corrupt');assert.deepEqual(readFileSync(path),bytes);
});

test('lossy legacy values are rejected', t => {
  const {directory,profile}=fixture(t);profile.data.workspaces[0].name='Invalid \ud800';
  writeFileSync(join(directory,'rokko-state.json'),JSON.stringify(profile.data));
  const before=readFileSync(join(directory,'rokko-state.json'));
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='legacy');
  assert.deepEqual(readFileSync(join(directory,'rokko-state.json')),before);assert.ok(!readdirSync(directory).includes('rokko.sqlite'));
});

function crash(script, directory) {
  const module = new URL('../../src/main/storage/profile-store.mjs', import.meta.url).href;
  const code = `import {ProfileStore,recoverProfile} from ${JSON.stringify(module)}; const directory=process.argv[1]; ${script}`;
  const result = spawnSync(process.execPath,['--input-type=module','-e',code,directory],{timeout:10000,encoding:'utf8'});
  assert.equal(result.signal,'SIGKILL',result.stderr);
}
test('killed migration retries safely', t => {
  const {directory,profile}=fixture(t);
  crash(`new ProfileStore(directory,{fault:point=>{if(point==='migration-rows')process.kill(process.pid,'SIGKILL')}});`,directory);
  assert.ok(!readdirSync(directory).includes('rokko.sqlite'));
  const store=new ProfileStore(directory);assert.deepEqual(store.read(),profile);store.close();
});
test('killed write recovers previous data', t => {
  const {directory,profile}=fixture(t);const initial=new ProfileStore(directory);initial.close();
  crash(`const store=new ProfileStore(directory,{fault:point=>{if(point==='save-rows')process.kill(process.pid,'SIGKILL')}});
    store.db.exec('PRAGMA cache_size=1; PRAGMA cache_spill=1;');const data=store.read().data;
    data.apps=Array.from({length:100},(_,n)=>({id:'new'+n,name:'New '+n,url:'https://example.com/'+ 'a'.repeat(1500)+'?i='+n,workspaceId:null,partition:'persist:rokko-new'+n}));store.saveData(data);`,directory);
  let restored;
  try {restored=new ProfileStore(directory);} catch(error) {
    assert.equal(error.kind,'corrupt');restored=recoverProfile(directory,'restore','corrupt');
  }
  assert.deepEqual(restored.read(),profile);restored.close();
});
test('killed recovery retains a valid backup', t => {
  const {directory,profile}=fixture(t);const initial=new ProfileStore(directory);initial.saveData(profile.data);initial.close();
  writeFileSync(join(directory,'rokko.sqlite'),'corrupt');
  crash(`recoverProfile(directory,'restore','corrupt',{fault:point=>{if(point==='recovery-promote')process.kill(process.pid,'SIGKILL')}});`,directory);
  assert.throws(()=>new ProfileStore(directory),error=>error.kind==='corrupt');
  const restored=recoverProfile(directory,'restore','corrupt');assert.deepEqual(restored.read(),profile);restored.close();
});
test('recovery rechecks future versions', t => {
  const {directory}=fixture(t);const initial=new ProfileStore(directory);initial.close();
  const path=join(directory,'rokko.sqlite');const db=new DatabaseSync(path);db.exec('PRAGMA user_version=99');db.close();
  const before=readFileSync(path);assert.throws(()=>recoverProfile(directory,'new','corrupt'),error=>error.kind==='future');
  assert.deepEqual(readFileSync(path),before);
});
