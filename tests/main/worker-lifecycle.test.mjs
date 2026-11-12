import test from 'node:test';
import assert from 'node:assert/strict';
import { stopServiceWorkers } from '../../src/main/lifecycle/worker-lifecycle.mjs';
function fixture(context='own') {
  const calls=[];
  const debuggerApi={isAttached:()=>false,attach:()=>calls.push('attach'),detach:()=>calls.push('detach'),
    sendCommand:async(method,params)=>{calls.push([method,params]);
      if(method==='Target.getTargetInfo')return {targetInfo:{browserContextId:context}};
      if(method==='Target.getTargets')return {targetInfos:[
        {targetId:'own-shared',browserContextId:'own',type:'shared_worker'},
        {targetId:'own-sw',browserContextId:'own',type:'service_worker'},
        {targetId:'other-account',browserContextId:'other',type:'shared_worker'},
        {targetId:'missing-owner',type:'service_worker'},
        {targetId:'own-page',browserContextId:'own',type:'page'}]};
      return {success:true};
    }};
  return {calls,contents:{isDestroyed:()=>false,debugger:debuggerApi}};
}
test('stop only owned workers',async()=>{
  const {contents,calls}=fixture();await stopServiceWorkers(contents);
  assert.deepEqual(calls.filter(c=>c[0]==='Target.closeTarget').map(c=>c[1].targetId),['own-shared','own-sw']);
  assert.ok(calls.findIndex(c=>c[0]==='Page.setWebLifecycleState')<calls.findIndex(c=>c[0]==='Target.closeTarget'));
  assert.equal(calls.at(-1),'detach');
});
test('unknown session fails closed',async()=>{
  const {contents,calls}=fixture('');await assert.rejects(stopServiceWorkers(contents),/identify service session/);
  assert.ok(!calls.some(c=>c[0]==='Target.closeTarget'));assert.equal(calls.at(-1),'detach');
});
test('respect an existing debugger',async()=>{
  const {contents,calls}=fixture();contents.debugger.isAttached=()=>true;
  await assert.rejects(stopServiceWorkers(contents),/debugger/);assert.deepEqual(calls,[]);
});
test('detach after termination error',async()=>{
  const {contents,calls}=fixture();const command=contents.debugger.sendCommand;
  contents.debugger.sendCommand=async(method,params)=>method==='Target.closeTarget'?{success:false}:command(method,params);
  await assert.rejects(stopServiceWorkers(contents),/Could not stop/);assert.equal(calls.at(-1),'detach');
});
