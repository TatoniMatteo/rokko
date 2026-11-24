import assert from 'node:assert/strict';
import { eventually } from './service-fixture.mjs';

/** Uses real keyboard events; DOM reads only identify controls and assert results. */
export function interfaceDriver(browser) {
  const run = browser.evaluate;
  const state = () => run('window.rokko.getSnapshot()');
  async function key(key, modifiers = 0) {
    const codes = {
      ' ': 32,
      ArrowDown: 40,
      ArrowUp: 38,
      ArrowLeft: 37,
      ArrowRight: 39,
      Tab: 9,
      Enter: 13,
      Escape: 27,
      Home: 36,
      End: 35,
    };
    const windowsVirtualKeyCode = codes[key] ?? key.toUpperCase().charCodeAt(0);
    const code = key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key;
    const text = modifiers ? undefined : key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
    await browser.command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await browser.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
    });
  }
  async function focus(selector) {
    await eventually(
      () => run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
      selector,
    );
    for (let step = 0; step < 300; step++) {
      if (await run(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
      await key('Tab');
    }
    throw new Error('Not reachable by keyboard: ' + selector);
  }
  async function activate(label) {
    await eventually(
      () =>
        run(`(() => {
      const button = [...document.querySelectorAll('button')].find(b => !b.disabled &&
        (b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent.trim() === ${JSON.stringify(label)} || b.querySelector('strong')?.textContent === ${JSON.stringify(label)}));
      if (!button) return false;
      document.querySelector('[data-qa-action]')?.removeAttribute('data-qa-action');
      button.dataset.qaAction='true'; return true;
    })()`),
      label,
    );
    await focus('[data-qa-action]');
    await key('Enter');
  }
  async function fill(selector, text) {
    await focus(selector);
    await key('a', 2);
    await browser.command('Input.insertText', { text });
  }
  async function select(selector, value) {
    await focus(selector);
    await key('Home');
    for (let step = 0; step < 40; step++) {
      if (
        await run(
          `document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(value)}`,
        )
      )
        return;
      await key('ArrowDown');
    }
    throw new Error('Option not reachable: ' + value);
  }
  async function heading(text) {
    await eventually(
      () => run(`document.querySelector('h1')?.textContent === ${JSON.stringify(text)}`),
      text,
    );
  }
  async function accessibility() {
    const tree = await browser.command('Accessibility.getFullAXTree');
    const nodes = tree.nodes.filter((node) => !node.ignored);
    const interactive = nodes.filter((node) =>
      ['button', 'textbox', 'combobox', 'checkbox', 'switch'].includes(node.role?.value),
    );
    for (const node of interactive)
      assert.ok(node.name?.value, 'Unnamed accessible ' + node.role?.value);
    assert.ok(nodes.some((node) => node.role?.value === 'heading'));
    assert.ok(nodes.some((node) => node.role?.value === 'toolbar'));
    assert.ok(nodes.some((node) => node.role?.value === 'main'));
    return nodes.map((node) => ({ role: node.role?.value, name: node.name?.value }));
  }
  return { run, state, key, focus, activate, fill, select, heading, accessibility };
}
