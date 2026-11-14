import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function attached(port, fn, binary = process.env.FIGCRAFT_CLI || 'figcraft-cli') {
  const child = spawn(binary, ['mcp', '--attach', String(port), '--timeout', '20'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let next = 0;
  let diagnostic = '';
  const reject = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  child.stdin.on('error', reject);
  child.on('error', reject);
  child.on('exit', () => reject(new Error(diagnostic || 'FigCraft connection closed')));
  child.stderr.on('data', (chunk) => {
    diagnostic = (diagnostic + chunk).slice(-2048);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      const value = JSON.parse(line);
      const p = pending.get(value.id);
      if (!p) return;
      pending.delete(value.id);
      value.error ? p.reject(new Error(value.error.message)) : p.resolve(value.result);
    } catch (error) {
      reject(error);
    }
  });
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const timer = setTimeout(() => {
    reject(new Error('FigCraft sync timed out'));
    child.kill();
  }, 25000);
  try {
    await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'Rokko design sync', version: '1.0' },
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    );
    return await fn(async (name, args) => {
      const result = await rpc('tools/call', { name, arguments: args });
      const text =
        result.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n') || '';
      if (result.isError) throw new Error(text);
      return JSON.parse(text);
    });
  } finally {
    clearTimeout(timer);
    lines.close();
    child.stdin.end();
    child.kill();
  }
}
