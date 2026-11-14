/** Privileged requests come only from the shell's top-level frame, never a service or iframe. */
export function isShellSender(event, shell) {
  return Boolean(shell && !shell.isDestroyed() && event.sender === shell &&
    event.senderFrame && event.senderFrame === shell.mainFrame);
}
