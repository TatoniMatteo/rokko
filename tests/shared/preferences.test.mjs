import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, validatePreferences, dockApps, orderedCards, moveApp, languageList } from '../../src/shared/preferences/preferences.mjs';
import { themeTokens, contrast } from '../../src/shared/preferences/theme.mjs';
import { shortcutTarget } from '../../src/main/navigation/shortcuts.mjs';
const data = { selectedWorkspaceId: 'a', workspaces: [{id:'a'},{id:'b'}], apps: [
  {id:'one', workspaceId:'a',partition:'persist:one'}, {id:'two',workspaceId:'a',partition:'persist:two'},
  {id:'global',workspaceId:null,partition:'persist:global'}, {id:'three',workspaceId:'b',partition:'persist:three'}] };
test('preferences reject unsafe payloads', () => {
  assert.deepEqual(validatePreferences(defaultPreferences()), defaultPreferences());
  for (const patch of [{theme:'custom'}, {dock:'diagonal'}, {seed:'url(x)'}, {language:'fr'}, {version:2},
    {hiddenWorkspaces:['global']}, {cardOrder:['a','a']}, {cardOrder:['x'.repeat(129)]}, {unexpected:true}]) {
    assert.throws(() => validatePreferences({...defaultPreferences(),...patch}));
  }
  assert.equal(defaultPreferences('en-GB').language,'en');
  assert.equal(languageList('it'),'it-IT,it,en-US,en');
});
test('layout preserves services and sessions', () => {
  const p={...defaultPreferences(), cardOrder:['b','global'],hiddenWorkspaces:['a']};
  assert.deepEqual(orderedCards(data,p),['b','global','a']);
  assert.deepEqual(dockApps(data,p).map(a=>a.id),['three','global']);
  const next=moveApp(data,'one','two',true);
  assert.deepEqual(next.apps.map(a=>a.id),['two','one','global','three']);
  assert.equal(next.apps.find(a=>a.id==='one'),data.apps[0]);
  assert.throws(()=>moveApp(data,'one','three',false));
  assert.throws(()=>moveApp(data,'one','missing',false));
  assert.throws(()=>moveApp(data,'one','two','yes'));
  assert.equal(data.apps[0].id,'one');
});
test('shortcuts follow visible card order', () => {
  const p={...defaultPreferences(),cardOrder:['b','global','a'],hiddenWorkspaces:['a']};
  assert.deepEqual(shortcutTarget(data,null,{type:'keyDown',alt:true,key:'1'},false,p),{appId:'three',workspaceId:'b'});
  assert.deepEqual(shortcutTarget(data,'three',{type:'keyDown',control:true,key:'Tab'},false,p),{appId:'global',workspaceId:'a'});
  assert.equal(shortcutTarget(data,null,{type:'keyDown',alt:true,key:'3'},false,p),null);
  assert.equal(shortcutTarget(data,null,{type:'keyDown',alt:true,key:'PageDown'},false,{...p,hiddenWorkspaces:['a','b']}),null);
});
test('generated palettes maintain contrast', () => {
  for(const seed of ['#000000','#ffffff','#245dc5','#ff0000','#00ff00','#0000ff','#ffff00','#00ffff','#ff00ff','#808080']) {
    for(const dark of [false,true]) {
      const tokens=themeTokens(seed,dark);
      for(const surface of ['bg','panel','panel2','accent-container']) {
        for(const foreground of ['text','muted','accent','danger']) assert.ok(contrast(tokens[foreground],tokens[surface])>=4.5,`${seed} ${dark} ${foreground}/${surface}`);
        assert.ok(contrast(tokens.border,tokens[surface])>=3);
      }
      assert.ok(contrast(tokens['on-accent'],tokens.accent)>=4.5);
    }
  }
});
