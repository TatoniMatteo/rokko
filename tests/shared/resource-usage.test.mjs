import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateResourceUsage,
  resourceUsage,
} from '../../src/shared/resources/resource-usage.mjs';

test('resource usage attributes service processes and counts shared PIDs once in app totals', () => {
  const services = [
    { id: 'chat', workspaceId: 'work' },
    { id: 'mail', workspaceId: 'work' },
    { id: 'music', workspaceId: null },
    { id: 'stopped', workspaceId: 'work' },
  ];
  const result = resourceUsage(services, { chat: 12, mail: 12, music: 13 }, [
    { pid: 12, cpu: { percentCPUUsage: 4.5 }, memory: { workingSetSize: 1024 } },
    { pid: 13, cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 512 } },
    { pid: 14, cpu: { percentCPUUsage: 1 }, memory: { workingSetSize: 256 } },
  ], 123);
  assert.equal(result.sampledAt, 123);
  assert.equal(result.processCount, 3);
  assert.equal(result.total.cpuPercent, 7.5);
  assert.equal(result.total.memoryBytes, 1792 * 1024);
  assert.equal(result.services[0].memoryBytes, 1024 * 1024);
  assert.deepEqual(result.services[0].sharedWith, ['mail']);
  assert.equal(result.services[3].processId, null);
});

test('resource usage safely treats absent and invalid metric values as zero', () => {
  const result = resourceUsage([{ id: 'chat' }], {}, [
    { pid: 1, cpu: { percentCPUUsage: -1 }, memory: { workingSetSize: Number.NaN } },
  ]);
  assert.equal(result.total.cpuPercent, 0);
  assert.equal(result.total.memoryBytes, 0);
  assert.deepEqual(result.services[0], {
    id: 'chat', processId: null, cpuPercent: 0, memoryBytes: 0, sharedWith: [],
  });
});

test('workspace resource totals count a shared process only once', () => {
  assert.deepEqual(aggregateResourceUsage([
    { id: 'chat', processId: 12, cpuPercent: 4.5, memoryBytes: 1024 },
    { id: 'mail', processId: 12, cpuPercent: 4.5, memoryBytes: 1024 },
    { id: 'music', processId: 13, cpuPercent: 2, memoryBytes: 512 },
    { id: 'stopped', processId: null, cpuPercent: 0, memoryBytes: 0 },
  ]), { cpuPercent: 6.5, memoryBytes: 1536 });
});
