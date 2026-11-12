import test from 'node:test';
import assert from 'node:assert/strict';
import {contextMenuItems} from '../../src/main/navigation/context-menu.mjs';
const data={apps:[{id:'a'}],workspaces:[{id:'w'}]};
test('context menu guards',()=>{
  for(const input of [null,{}, {kind:'url',id:'a'}, {kind:'service',id:1}, {kind:'service',id:'missing'},
    {kind:'workspace',id:'missing'}, {kind:'global',id:'w'}]) assert.throws(()=>contextMenuItems(data,input,'it'));
});
test('context menus stay scoped',()=>{
  const service=contextMenuItems(data,{kind:'service',id:'a'},'it');
  assert.deepEqual(service.map(i=>i.action),['open','edit','reload','browser']);
  assert.equal(service[2].enabled,false);
  assert.equal(contextMenuItems(data,{kind:'service',id:'a'},'en',['a'])[2].enabled,true);
  assert.equal(service[0].label,'Apri applicazione');
  assert.equal(contextMenuItems(data,{kind:'workspace',id:'w'},'en')[0].label,'Workspace settings');
  assert.deepEqual(contextMenuItems(data,{kind:'workspace',id:'w'},'it').map(i=>i.action),['edit','services','hide']);
  assert.equal(contextMenuItems(data,{kind:'workspace',id:'w'},'en',[],['w'])[2].action,'show');
  assert.deepEqual(contextMenuItems(data,{kind:'global',id:'global'},'en').map(i=>i.action),['services']);
});
