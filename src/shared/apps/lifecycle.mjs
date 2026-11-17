/** A slow RPC response must not overwrite a newer asynchronous lifecycle event. */
export function mergeLifecycleSnapshot(previous, next) {
  if ((next.lifecycleRevision ?? 0) >= (previous.lifecycleRevision ?? 0)) return next;
  return {
    ...next,
    lifecycleRevision: previous.lifecycleRevision,
    loadedIds: previous.loadedIds,
    suspendedIds: previous.suspendedIds,
    suspensionReasons: previous.suspensionReasons,
  };
}
