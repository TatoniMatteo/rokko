import { planHibernation } from '../../shared/hibernation/rules.mjs';
/** One deadline timer, no background polling and no persistent debugger. */
export class Hibernation {
  constructor({
    context,
    close,
    wake,
    changed,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    startup = false,
  }) {
    Object.assign(this, { context, close, wake, changed, now, setTimer, clearTimer });
    this.startup = startup;
    this.sleeping = new Map();
    this.lastUsed = new Map();
    this.visible = new Set();
    this.wakeRequested = new Set();
    this.closed = false;
    this.queued = false;
    this.deadline = Infinity;
  }
  has(id) {
    return this.sleeping.has(id);
  }
  reasons() {
    return Object.fromEntries([...this.sleeping].map(([id, entry]) => [id, entry.reason]));
  }
  touch(id) {
    this.lastUsed.set(id, this.now());
  }
  requestWake(id) {
    if (!this.sleeping.has(id)) return;
    this.wakeRequested.add(id);
    this.reconcile();
  }
  request() {
    if (this.queued || this.closed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.reconcile();
    });
  }
  reconcile() {
    if (this.closed) return;
    const { policy, ...context } = this.context(),
      now = this.now();
    context.startup = this.startup;
    context.wakeRequestedIds = [...this.wakeRequested];
    this.startup = false;
    const existing = new Set(context.services.map((service) => service.id));
    for (const id of this.lastUsed.keys()) if (!existing.has(id)) this.lastUsed.delete(id);
    for (const id of new Set([...this.visible, ...context.visibleIds])) {
      if (this.visible.has(id) !== context.visibleIds.includes(id)) this.lastUsed.set(id, now);
    }
    this.visible = new Set(context.visibleIds);
    for (const service of context.services)
      if (service.loaded && !this.lastUsed.has(service.id)) this.lastUsed.set(service.id, now);
    const { wanted, nextAt } = planHibernation(
      policy,
      context,
      this.lastUsed,
      this.sleeping,
      now,
    );
    let changed = false;
    for (const [id, reason] of wanted) {
      const previous = this.sleeping.get(id);
      if (previous) {
        if (JSON.stringify(previous.reason) !== JSON.stringify(reason)) {
          previous.reason = reason;
          changed = true;
        }
        continue;
      }
      const entry = {
        reason,
        wasLoaded: context.services.some((service) => service.id === id && service.loaded),
        closed: false,
      };
      this.sleeping.set(id, entry);
      changed = true;
      entry.task = Promise.resolve()
        .then(() => this.close(id))
        .catch(() => {})
        .then(() => {
          entry.closed = true;
          this.reconcile();
        });
    }
    for (const [id, entry] of this.sleeping) {
      if (wanted.has(id) || !entry.closed) continue;
      this.sleeping.delete(id);
      this.wakeRequested.delete(id);
      changed = true;
      if (existing.has(id) && !context.manualIds.includes(id)) this.wake(id, entry.wasLoaded);
    }
    if (changed) this.changed();
    if (nextAt !== this.deadline) {
      this.clearTimer(this.timer);
      this.deadline = nextAt;
      this.timer = Number.isFinite(nextAt)
        ? this.setTimer(
            () => {
              this.deadline = Infinity;
              this.reconcile();
            },
            Math.max(1, nextAt - this.now()),
          )
        : undefined;
      this.timer?.unref?.();
    }
  }
  async settle(id) {
    await this.sleeping.get(id)?.task;
    this.reconcile();
  }
  stop() {
    this.closed = true;
    this.clearTimer(this.timer);
  }
}
