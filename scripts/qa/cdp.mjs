export async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) pending.get(message.id)?.(message);
    else
      for (const listener of listeners.get(message.method) ?? [])
        listener(message.params, message.sessionId);
  });
  return {
    on(method, listener) {
      const values = listeners.get(method) ?? [];
      values.push(listener);
      listeners.set(method, values);
    },
    async send(method, params = {}, sessionId) {
      const id = ++next;
      let timer;
      const response = new Promise((resolve, reject) => {
        pending.set(id, resolve);
        timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 10000);
      });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      try {
        const result = await response;
        if (result.error) throw new Error(JSON.stringify(result.error));
        return result.result;
      } finally {
        clearTimeout(timer);
        pending.delete(id);
      }
    },
    close() {
      socket.close();
    },
  };
}
