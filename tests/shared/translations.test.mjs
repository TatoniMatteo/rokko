import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const italian=JSON.parse(readFileSync(new URL('../../src/renderer/preferences/it.json',import.meta.url),'utf8'));
const errors=JSON.parse(readFileSync(new URL('../../src/renderer/preferences/errors.en.json',import.meta.url),'utf8'));
test('translation coverage',()=>{
  function scan(directory){
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const file=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
      if(entry.isDirectory())scan(file);
      else if(entry.name.endsWith('.tsx')){
        const source=readFileSync(file,'utf8');
        for(const match of source.matchAll(/\bt\((['"])(.*?)\1/g)){
          assert.ok(Object.hasOwn(italian,match[2]),`${entry.name}: ${match[2]}`);
        }
      }
    }
  }
  scan(new URL('../../src/renderer/',import.meta.url));
  for(const [key,value] of Object.entries(italian)){
    assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),
      [...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),key);
  }
  for(const [value,key] of Object.entries(errors))assert.equal(italian[key],value);
});
