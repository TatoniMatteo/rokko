const html =
  '<!doctype html><title>Rokko local fixture</title><h1>Local service fixture</h1><input id="message"><script>window.fixtureTicks=0;setInterval(()=>window.fixtureTicks++,100)</script>';

export async function eventually(check, label, timeout = 10000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Not ready: ${label}`);
}

/** Controlled HTTPS pages, fulfilled before networking. No account/provider data is used. */
export async function serviceFixture(client) {
  const sessions = new Map();
  const errors = [];
  let closed = false;
  const failed = (error) => {
    if (!closed) errors.push(error.message);
  };
  client.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    if (targetInfo.type !== 'page') {
      void client.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(failed);
      return;
    }
    sessions.set(targetInfo.targetId, sessionId);
    void client
      .send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.rokko.test/*' }] }, sessionId)
      .then(() => client.send('Runtime.runIfWaitingForDebugger', {}, sessionId))
      .catch(failed);
  });
  client.on('Target.detachedFromTarget', ({ targetId }) => sessions.delete(targetId));
  client.on('Fetch.requestPaused', ({ requestId, request }, sessionId) => {
    void client
      .send(
        'Fetch.fulfillRequest',
        new URL(request.url).pathname === '/redirect-http'
          ? {
              requestId,
              responseCode: 302,
              responseHeaders: [{ name: 'location', value: 'http://blocked.rokko.test/' }],
              body: '',
            }
          : {
              requestId,
              responseCode: 200,
              responseHeaders: [{ name: 'content-type', value: 'text/html' }],
              body: Buffer.from(html).toString('base64'),
            },
        sessionId,
      )
      .catch(failed);
  });
  async function evaluate(session, expression) {
    const result = await client.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, userGesture: true },
      session,
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function ready(url) {
    return eventually(async () => {
      for (const [id, session] of sessions) {
        try {
          if (
            (await evaluate(session, 'location.href')) === url &&
            (await evaluate(session, 'typeof window.fixtureTicks === "number"'))
          )
            return { id, session };
        } catch {
          /* Detached/starting pages are not ready yet. */
        }
      }
    }, url);
  }
  await client.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
  return {
    errors,
    ready,
    evaluate,
    async detach() {
      closed = true;
      await client.send('Target.setAutoAttach', {
        autoAttach: false,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
    },
  };
}
