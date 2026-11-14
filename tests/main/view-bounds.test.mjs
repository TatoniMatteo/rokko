import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeViewBounds } from '../../src/main/lifecycle/view-bounds.mjs';

test('zoomed native geometry', () => {
  assert.deepEqual(nativeViewBounds({x:76,y:0,width:1124,height:800},1200,800,1),{x:76,y:0,width:1124,height:800});
  assert.deepEqual(nativeViewBounds({x:61,y:0,width:899,height:640},1200,800,1.25),{x:76,y:0,width:1123,height:800});
  assert.deepEqual(nativeViewBounds({x:76,y:0,width:1424,height:1000},1200,800,.8),{x:61,y:0,width:1139,height:800});
});
test('invalid native geometry', () => {
  for (const value of [null,{}, {x:-1,y:0,width:20,height:20}, {x:0,y:0,width:1201,height:800}]) {
    assert.equal(nativeViewBounds(value,1200,800,1),null);
  }
  assert.equal(nativeViewBounds({x:0,y:0,width:10,height:10},1200,800,NaN),null);
});
