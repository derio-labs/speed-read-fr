import type { Doc } from '../model';
import { createPlayer, type Player, type Scheduler } from '../player';
import { normalizeSettings, type Settings, type SettingsStore } from '../settings';
import { buildTimeline, type Timeline } from '../timeline';
import type { ReaderContext, Zone } from './context';
import { builder, icon, ICONS } from './dom';
import type { Host } from './host';
import { createExhibits } from './exhibits';
import { attachKeys } from './keys';
import { createOutline } from './outline';
import { createReading } from './reading';
import { createSettingsPanel } from './settings-panel';
import { createStage } from './stage';
import { READER_CSS, SENTINEL_PROPERTY } from './styles';

export interface MountOptions {
  settings: Settings;
  store: SettingsStore;
  host: Host;
  /** Timers for the player; the window's by default. */
  scheduler?: Scheduler;
  /**
   * Ignore keyboard and settings events a script dispatched (`isTrusted` false). A host whose
   * reader shares a page with untrusted scripts (the browser extension) sets it; default false.
   */
  trustedEventsOnly?: boolean;
}

export interface ReaderHandle {
  player: Player;
  /** Resolves once the settings from `store.load()` are applied. */
  ready: Promise<void>;
  destroy(): void;
}

type StyleScope = (Document | ShadowRoot) & { adoptedStyleSheets?: CSSStyleSheet[] };

/**
 * Apply the reader stylesheet: a constructable sheet adopted by the root's scope, verified by
 * reading the sentinel back; a `<style>` element in the root when that fails. Returns the undo.
 */
function applyStyles(root: Element | ShadowRoot, reader: HTMLElement): () => void {
  const scope = (root instanceof Element ? root.getRootNode() : root) as StyleScope;
  const win = reader.ownerDocument.defaultView;
  try {
    const Sheet = (win as unknown as { CSSStyleSheet?: typeof CSSStyleSheet })?.CSSStyleSheet ?? globalThis.CSSStyleSheet;
    if (Sheet && Array.isArray(scope.adoptedStyleSheets)) {
      const sheet = new Sheet();
      sheet.replaceSync(READER_CSS);
      scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sheet];
      const remove = () => {
        scope.adoptedStyleSheets = (scope.adoptedStyleSheets ?? []).filter((s) => s !== sheet);
      };
      const sentinel = win?.getComputedStyle(reader).getPropertyValue(SENTINEL_PROPERTY).trim();
      if (sentinel === '1') return remove;
      remove();
    }
  } catch {
    // A blocked or missing constructable stylesheet: fall back to a <style> element.
  }
  const style = reader.ownerDocument.createElement('style');
  style.textContent = READER_CSS;
  reader.before(style);
  return () => style.remove();
}

const defaultScheduler = (win: Window): Scheduler => ({
  setTimeout: (fn, ms) => win.setTimeout(fn, ms),
  clearTimeout: (handle) => win.clearTimeout(handle as number),
  now: () => win.performance?.now() ?? Date.now(),
});

const sameExceptSpeed = (a: Settings, b: Settings) => JSON.stringify({ ...a, wpm: 0 }) === JSON.stringify({ ...b, wpm: 0 });

/** Build the reader inside `root` (spec section 6). */
export function mountReader(root: Element | ShadowRoot, doc: Doc, options: MountOptions): ReaderHandle {
  const { store, host } = options;
  const ownerDocument = root.ownerDocument;
  const win = ownerDocument.defaultView as Window;
  const h = builder(ownerDocument);
  let settings = normalizeSettings(options.settings);
  let timeline: Timeline = buildTimeline(doc, settings);
  const player = createPlayer(timeline, settings, options.scheduler ?? defaultScheduler(win));

  const reader = h('div', { class: 'sr-reader', tabindex: 0, 'aria-label': 'Speed reader', 'data-state': player.state });
  const layout = h('div', { class: 'sr-layout' });
  const outlineBar = h('div', { class: 'sr-outline-bar' });
  const outline = h('nav', { class: 'sr-outline', 'aria-label': 'Outline' });
  const status = h('div', { class: 'sr-status' });
  const settingsButton = h('button', { type: 'button', class: 'sr-icon-button sr-settings-button', 'aria-label': 'Settings', title: 'Settings (,)' }, icon(ownerDocument, ICONS.gear));
  const closeButton = h('button', { type: 'button', class: 'sr-icon-button sr-close-button', 'aria-label': 'Close reader', title: 'Close (Esc)' }, icon(ownerDocument, ICONS.close));
  const toolbar = h('div', { class: 'sr-toolbar' }, status, settingsButton, closeButton);
  const overall = h('div', { class: 'sr-overall', 'aria-hidden': 'true' }, h('span', { class: 'sr-overall-fill' }));
  const stage = h('section', { class: 'sr-stage', role: 'region', 'aria-label': 'Reader stage', tabindex: -1 });
  const reading = h('div', { class: 'sr-reading', role: 'region', 'aria-label': 'Normal reading', hidden: true });
  const main = h('div', { class: 'sr-main' }, toolbar, overall, stage, reading);
  const exhibits = h('section', { class: 'sr-exhibits', role: 'region', 'aria-label': 'Exhibits' });
  layout.append(outlineBar, outline, main, exhibits);
  reader.append(layout);
  root.appendChild(reader);
  const removeStyles = applyStyles(root, reader);

  const ctx: ReaderContext = {
    doc,
    host,
    player,
    get timeline() {
      return timeline;
    },
    get settings() {
      return settings;
    },
    document: ownerDocument,
    h,
    reader,
    accepts: (event) => !options.trustedEventsOnly || event.isTrusted,
  };
  const outlineZone = createOutline(ctx, { outline, bar: outlineBar, layout });
  const exhibitZone = createExhibits(ctx, { pane: exhibits, main });
  const panel = createSettingsPanel(ctx, (next) => applySettings(next));
  const zones: Zone[] = [
    createStage(ctx, { stage, status, overallFill: overall.firstElementChild as HTMLElement }),
    outlineZone,
    exhibitZone,
    createReading(ctx, { reading, layout }),
    panel,
  ];
  const detachKeys = attachKeys({
    accepts: ctx.accepts,
    player,
    reader,
    stage,
    exhibits: exhibitZone,
    closeDrawer: outlineZone.closeDrawer,
    panel,
  });

  const unsubscribe = [
    player.on('position', (e) => host.onPosition(e.source)),
    player.on('settings', (next) => {
      settings = next;
      void store.save(next);
    }),
    player.on('state', (state) => {
      reader.dataset.state = state;
      if (state === 'closed' && !destroyed) host.onClose();
    }),
  ];

  /** Apply new settings at once: speed alone goes to the player, anything else rebuilds the timeline. */
  function applySettings(next: Settings, save = true) {
    next = normalizeSettings(next);
    if (sameExceptSpeed(next, settings)) {
      if (next.wpm !== settings.wpm) player.setSpeed(next.wpm);
      return;
    }
    settings = next;
    timeline = buildTimeline(doc, next);
    player.replaceTimeline(timeline, next);
    for (const zone of zones) zone.refresh?.();
    if (save) void store.save(next);
  }

  let destroyed = false;
  const ready = store
    .load()
    .then((loaded) => {
      if (!destroyed && loaded) applySettings({ ...settings, ...loaded }, false);
    })
    .catch(() => {});

  closeButton.addEventListener('click', () => player.close());
  settingsButton.addEventListener('click', () => panel.open());
  reader.focus({ preventScroll: true });

  return {
    player,
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of unsubscribe) off();
      detachKeys();
      player.close();
      for (const zone of zones) zone.destroy();
      reader.remove();
      removeStyles();
    },
  };
}
