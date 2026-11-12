// Read-only interoperability adapter; never enables MCP or changes Rambox configuration.
import { importUrl } from '../../shared/import/rambox.mjs';
export async function readMetadata({ endpoint, token, fetcher = fetch }) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/mcp' ||
      url.username || url.password || url.search || url.hash) throw new Error('Use a loopback Rambox MCP endpoint');
  if (typeof token !== 'string' || !token || token.length > 1024 || /[\r\n]/.test(token)) throw new Error('A local MCP token is required');
  let session;
  const headers = () => ({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`, ...(session ? { 'Mcp-Session-Id': session } : {}) });
  async function request(id, method, params) {
    const response = await fetcher(url.href, { method: 'POST', redirect: 'error', headers: headers(),
      signal: AbortSignal.timeout(5000), body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) });
    if (!response.ok) throw new Error(`Local Rambox request failed (${response.status})`);
    session = response.headers.get('mcp-session-id') ?? session;
    if (!id) { await response.body?.cancel(); return; }
    if (Number(response.headers.get('content-length')) > 1048576) throw new Error('Metadata response too large');
    let text = ''; const reader = response.body.getReader(); const decoder = new TextDecoder();
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break;
        text += decoder.decode(value, { stream: true }); if (text.length > 1048576) throw new Error('Metadata response too large'); }
      text += decoder.decode();
    } finally { await reader.cancel(); }
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
      ? text.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean).map(line => JSON.parse(line))
      : [JSON.parse(text)];
    const message = messages.find(message => message.id === id);
    if (!message || message.error) throw new Error('Rambox metadata protocol error');
    return message.result;
  }
  try {
    const init = await request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'rokko-metadata-probe', version: '0.1.0' } });
    if (init?.serverInfo?.name !== 'rambox-mcp-server') throw new Error('Unexpected local server');
    await request(null, 'notifications/initialized', {});
    const list = await request(2, 'tools/list', {});
    if (!list?.tools?.some(tool => tool.name === 'list_apps')) throw new Error('Read-only app listing unavailable');
    const reply = await request(3, 'tools/call', { name: 'list_apps', arguments: {} });
    if (reply.isError) throw new Error('App listing failed');
    const payload = reply.structuredContent ?? JSON.parse(reply.content?.find(item => item.type === 'text')?.text ?? 'null');
    if (!payload?.ok || !Array.isArray(payload.data) || payload.data.length > 100) throw new Error('Unsupported app listing shape');
    const warnings = []; const services = payload.data.map((item, index) => {
      if (typeof item?.id !== 'string' || typeof item.title !== 'string' || item.title.length > 256 || item.id.length > 256) throw new Error('Invalid service metadata');
      let target = null;
      try {
        target = importUrl(item.href);
      } catch { warnings.push({ index, reason: 'URL requires review' }); }
      return { id: item.id, name: item.title, url: target, workspaceId: null };
    });
    return { format: 'rokko-rambox-metadata', version: 1, source: { product: 'Rambox', adapter: 'mcp-list-apps' },
      services, workspaces: [], requiresWorkspaceAssignment: true, warnings };
  } finally {
    if (session) { try { await fetcher(url.href, { method: 'DELETE', headers: headers(), redirect: 'error',
      signal: AbortSignal.timeout(2000) }); } catch { /* MCP session expiry does not modify Rambox configuration. */ } }
  }
}
