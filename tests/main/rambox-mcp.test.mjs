import test from 'node:test';
import assert from 'node:assert/strict';
import { readMetadata } from '../../src/main/import/rambox-mcp.mjs';
const endpoint='http://127.0.0.1:7822/mcp';
const sample=[{id:'one',title:'Chat équipe',href:'https://chat.example/',enabled:true,serviceId:'custom',path:'opaque-path',
  password:'must-not-export',cookies:'must-not-export',script:'must-not-export'},
  {id:'two',title:'Another account',href:'https://chat.example/'},
  {id:'three',title:'Review URL',href:'https://app.example/?access_token=must-not-export'}];
function server(sse=false) {
 const calls=[];
 return {calls,fetcher:async(url,options)=>{assert.equal(url,endpoint);calls.push(options.method==='DELETE'?{method:'DELETE'}:JSON.parse(options.body));
  if(options.method==='DELETE')return new Response(null,{status:204});
  const {id,method,params}=JSON.parse(options.body);if(!id)return new Response(null,{status:202});
  let result;
  if(method==='initialize')result={protocolVersion:'2025-03-26',serverInfo:{name:'rambox-mcp-server'}};
  if(method==='tools/list')result={tools:[{name:'list_apps'},{name:'execute_script'},{name:'signout'}]};
  if(method==='tools/call'){assert.equal(params.name,'list_apps');result={structuredContent:{ok:true,data:sample}};}
  const message=JSON.stringify({jsonrpc:'2.0',id,result});
  const body=sse?'event: message\ndata: '+message+'\n\n':message;const bytes=new TextEncoder().encode(body);const at=bytes.indexOf(0xc3)+1;const stream=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,at));controller.enqueue(bytes.slice(at));controller.close();}});
  return new Response(sse==='utf8'?stream:body,{headers:{'content-type':sse?'text/event-stream':'application/json','mcp-session-id':'synthetic-session'}});
 }};
}
for(const sse of [false,true,'utf8'])test(sse==='utf8'?'split UTF-8 metadata':sse?'SSE metadata contract':'JSON metadata contract',async()=>{
 const {calls,fetcher}=server(sse);const result=await readMetadata({endpoint,token:'synthetic-test-token',fetcher});
 assert.equal(result.services.length,3);assert.equal(result.services[0].name,'Chat équipe');assert.equal(result.services[0].url,result.services[1].url);
 assert.equal(result.services[2].url,null);assert.equal(result.warnings.length,1);
 assert.ok(result.requiresWorkspaceAssignment);assert.deepEqual(result.workspaces,[]);
 assert.ok(!JSON.stringify(result).includes('must-not-export'));assert.ok(!JSON.stringify(result).includes('opaque-path'));
 assert.deepEqual(calls.filter(call=>call.method==='tools/call').map(call=>call.params.name),['list_apps']);
 assert.equal(calls.at(-1).method,'DELETE');
});
test('loopback only',async()=>{
 for(const value of ['https://127.0.0.1:7822/mcp','http://example.com/mcp','http://127.0.0.1:7822/mcp?token=x','http://user:pass@127.0.0.1/mcp']){
  await assert.rejects(readMetadata({endpoint:value,token:'synthetic-test-token',fetcher:()=>{throw Error('No request allowed');}}),/loopback/);
 }
});
test('sanitize server failures',async()=>{
 await assert.rejects(readMetadata({endpoint,token:'synthetic-test-token',fetcher:async()=>new Response('private server details',{status:401})}),/failed \(401\)/);
});
