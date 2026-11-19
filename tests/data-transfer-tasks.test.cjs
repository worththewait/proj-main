const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

function createApp(environment = 'internal', parent) {
  const nodes = new Map();
  const tasks = new Map();
  const storage = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, disabled: false, files: [], listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      click() {},
    });
    return nodes.get(id);
  };
  let exportTask;
  const context = vm.createContext({
    Blob, URL, URLSearchParams, crypto: { randomUUID }, location: { search: '?environment=' + environment + (parent ? '&embed=admin' : '') },
    document: { getElementById: node }, navigator: {},
    setTimeout: (callback) => queueMicrotask(callback),
    FileReader: class {
      readAsText(file) { this.result = file.content; queueMicrotask(() => this.onload()); }
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    BaigeUI: { escapeHtml: String, hydrate() {} },
    BaigeTransferHistory: { mount: ({ kind }) => ({
      records: () => [...tasks.values()].filter((r) => r.kind === kind),
      add: (r) => tasks.set(r.id, structuredClone(r)),
      update: (r) => tasks.set(r.id, structuredClone(r)),
      render() {}, refresh() {},
    }) },
    BaigeTransferExport: { mount: ({ onExport }) => { exportTask = onExport; } },
  });
  context.window = context;
  context.parent = parent || context;
  for (const file of ['src/data-transfer-demo.js', 'src/pages/data-transfer.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      await new Promise(setImmediate);
      if (![...tasks.values()].some((r) => r.state === 'running')) return [...tasks.values()].at(-1);
    }
    throw new Error('Task did not settle');
  };
  return {
    demo: context.BaigeTransferDemo, tasks, storage, node, settle,
    async upload(bundle) {
      const content = typeof bundle === 'string' ? bundle : JSON.stringify(bundle);
      node('transferFile').files = [{ name: 'test.json', size: new Blob([content]).size, content }];
      await node('transferFile').listeners.change();
      return settle();
    },
    export: (...args) => exportTask(...args),
  };
}

test('import records are the landing view and selected packages automatically import with auditable outcomes', async () => {
  const app = createApp();
  assert.equal(app.node('transferHistory').hidden, false);
  assert.equal(app.node('transferExport').hidden, true);
  const task = await app.upload(app.demo.examplePackage);
  assert.equal(task.kind, 'import');
  assert.equal(task.state, 'partial');
  assert.deepEqual(task.files.reduce((counts, f) => { counts[f.state] = (counts[f.state] || 0) + 1; return counts; }, {}),
    { success: 16, skipped: 4, failed: 8 });
  assert.equal(task.missingGrants, 23);
  assert(task.restoredPeople.every((p) => p.scope.includes('已有文档')));
  assert(task.files.some((f) => f.kind === 'library' && f.accessMode));
  assert.equal(task.inputText, null);
});

test('valid earlier entries are not written when a later entry fails whole-package validation', async () => {
  const app = createApp();
  const bundle = structuredClone(app.demo.examplePackage);
  bundle.items.at(-1).files[0].text = null;
  const task = await app.upload(bundle);
  assert.equal(task.state, 'failed');
  assert.match(task.error, /文件清单不完整/);
  assert.equal(app.storage.has('baige.transfer.demo.targets.v1'), false);
});

test('reimport is idempotent and an all-duplicate import completes successfully', async () => {
  const app = createApp();
  const bundle = structuredClone(app.demo.examplePackage);
  bundle.items = bundle.items.filter((item) => item.kind === 'enterprise');
  await app.upload(bundle);
  const before = app.storage.get('baige.transfer.demo.targets.v1');
  const task = await app.upload(bundle);
  assert.equal(task.state, 'complete');
  assert(task.files.every((file) => file.state === 'skipped'));
  assert.equal(app.storage.get('baige.transfer.demo.targets.v1'), before);
});

test('missing destinations fail without creating libraries or applying their personnel grants', async () => {
  const app = createApp();
  const bundle = structuredClone(app.demo.examplePackage);
  bundle.items = bundle.items.filter((item) => !app.demo.planImport(bundle).find((row) => row.item.id === item.id).targetName);
  const task = await app.upload(bundle);
  assert.equal(task.state, 'failed');
  assert(task.files.length && task.files.every((file) => file.state === 'failed'));
  assert.equal(task.grantsRestored, 0);
  assert.equal(app.storage.has('baige.transfer.demo.targets.v1'), false);
});

test('export submission returns to records and packages a frozen selection asynchronously', async () => {
  const app = createApp('external');
  app.node('transferNewTask').listeners.click();
  assert.equal(app.node('transferExport').hidden, false);
  const bundle = structuredClone(app.demo.examplePackage);
  const expectedCount = bundle.items.reduce((n, item) => n + item.files.length, 0);
  assert.equal(app.export(bundle, 'frozen.json').submitted, true);
  assert.equal(app.node('transferHistory').hidden, false);
  assert.equal([...app.tasks.values()][0].state, 'running');
  bundle.items.length = 0;
  const task = await app.settle();
  assert.equal(task.state, 'complete');
  assert.equal(task.files.length, expectedCount);
  assert(task.package.items.length > 0);
  assert(task.files.every((file) => file.state === 'success'));
});


test('embedded environment switch works when browser security forbids reading the parent address', () => {
  for (const environment of ['internal', 'external']) {
    const messages = [];
    const parent = {
      get location() { throw new Error('Cross-origin parent location is inaccessible'); },
      postMessage(message, origin) { messages.push([structuredClone(message), origin]); },
    };
    const app = createApp(environment, parent);
    assert.doesNotThrow(() => app.node('transferSwitchEnvironment').listeners.click());
    assert.deepEqual(messages, [[{
      type: 'baige:transfer-environment', environment: environment === 'internal' ? 'external' : 'internal',
    }, '*']]);
  }
});
