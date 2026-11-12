/** Stop workers only in this service's isolated session, immediately before disposal. */
export async function stopServiceWorkers(contents) {
  if (contents.isDestroyed()) return;
  const debuggerApi = contents.debugger;
  if (debuggerApi.isAttached()) throw new Error('Cannot dispose a service while its debugger is attached');
  debuggerApi.attach('1.3');
  try {
    const { targetInfo } = await debuggerApi.sendCommand('Target.getTargetInfo');
    if (!targetInfo.browserContextId) throw new Error('Cannot identify service session');
    // Only the service being disposed is frozen; other services keep running normally.
    await debuggerApi.sendCommand('Page.setWebLifecycleState', { state: 'frozen' });
    const { targetInfos } = await debuggerApi.sendCommand('Target.getTargets');
    for (const target of targetInfos) {
      if (target.browserContextId !== targetInfo.browserContextId ||
          !['shared_worker', 'service_worker'].includes(target.type)) continue;
      const result = await debuggerApi.sendCommand('Target.closeTarget', { targetId: target.targetId });
      if (!result.success) throw new Error('Could not stop a service worker');
    }
  } finally {
    debuggerApi.detach();
  }
}
