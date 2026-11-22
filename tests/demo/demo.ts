/** The core demo page: our fixture article, extracted and read with a clone host and a localStorage store. */
import { createCloneHost, DEFAULT_SETTINGS, extract, mountReader, type ReaderHandle, type SettingsStore } from '../../packages/core/src/index';

const STORE_KEY = 'speed-read-demo:settings';

const store: SettingsStore = {
  async load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  async save(settings) {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  },
};

const container = document.getElementById('reader') as HTMLElement;
const openButton = document.getElementById('open') as HTMLButtonElement;
let handle: ReaderHandle | null = null;

function close() {
  handle?.destroy();
  handle = null;
  container.hidden = true;
  openButton.focus();
}

function open() {
  if (handle) return;
  const content = document.getElementById('content') as HTMLElement;
  container.hidden = false;
  const host = createCloneHost(content, { wrapperClass: 'doc', onClose: close });
  // ?layout=floating mounts the floating cards (the browser overlay's layout) instead of the panel.
  // ?bottomStage mounts the bottom-stage reader every shipping host uses: floating by default,
  // `&layout=panel` for the docked panel.
  const params = new URLSearchParams(location.search);
  const bottomStage = params.has('bottomStage');
  const layoutParam = params.get('layout');
  const layout = layoutParam === 'floating' || (bottomStage && layoutParam !== 'panel') ? 'floating' : 'panel';
  handle = mountReader(container, extract(content), { settings: DEFAULT_SETTINGS, store, host, layout, bottomStage, hostSettings: ['display'] });
  (window as unknown as { __reader?: ReaderHandle }).__reader = handle;
}

async function main() {
  // ?doc=inline reads the long-inline-code fixture instead of the article.
  const fixture = new URLSearchParams(location.search).get('doc') === 'inline' ? 'inline-code.html' : 'article.html';
  const response = await fetch(new URL(`../fixtures/${fixture}`, location.href));
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  const content = parsed.getElementById('content');
  if (!content) throw new Error('fixture has no #content');
  document.getElementById('page')!.replaceChildren(document.importNode(content, true));
  openButton.addEventListener('click', open);
  if (!new URLSearchParams(location.search).has('closed')) open();
}

void main();
