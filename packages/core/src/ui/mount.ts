import type { Doc } from '../model';
import { createPlayer, type Player, type Scheduler } from '../player';
import { normalizeSettings, type Settings, type SettingsStore } from '../settings';
import { buildTimeline, type Timeline } from '../timeline';
import { createSpeechDriver, type SpeechDriver, type SpeechSynth, type UtteranceLike } from '../tts';
import type { FrameSource, HostSetting, ReaderContext, Zone } from './context';
import { builder, icon, ICONS } from './dom';
import type { Host } from './host';
import { createExhibits } from './exhibits';
import { createLayout, type FreeBand } from './layout';
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
  /**
   * `panel` (default): one opaque reader with its zones side by side. `floating`: the outline, the
   * stage and the exhibits are separate cards over a transparent root (spec section 13).
   */
  layout?: 'panel' | 'floating';
  /** Settings only this host uses, shown in the settings panel (the browser overlay declares `pageFade`). */
  hostSettings?: readonly HostSetting[];
  /** Animation frames for the position dial's coast; the window's by default. */
  frame?: FrameSource;
  /** Text-to-speech; by default a driver over the window's `speechSynthesis` (unavailable without one). */
  speech?: SpeechDriver;
}

export interface ReaderHandle {
  player: Player;
  /** Resolves once the settings from `store.load()` are applied. */
  ready: Promise<void>;
  /** Apply settings that changed outside the reader (a host's configuration); they are not saved back. */
  applySettings(settings: Settings): void;
  /** Turn the position dial by a wheel event from outside the stage (the browser overlay's page). */
  wheel(event: WheelEvent): void;
  /** Recompute the narrow exhibit push now (it also follows resizes by itself). */
  relayout(): void;
  /**
   * The unobstructed band above the stage in viewport px (below the exhibit card when it sits above
   * the stage), and the stage's bottom: where a host can show the block being read (p5a-r8).
   */
  freeBand(): FreeBand;
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

function defaultFrame(win: Window): FrameSource {
  if (typeof win.requestAnimationFrame === 'function') {
    return { request: (fn) => win.requestAnimationFrame(fn), cancel: (handle) => win.cancelAnimationFrame(handle as number) };
  }
  return { request: (fn) => win.setTimeout(() => fn(win.performance?.now() ?? Date.now()), 16), cancel: (handle) => win.clearTimeout(handle as number) };
}

const sameExceptSpeed = (a: Settings, b: Settings) => JSON.stringify({ ...a, wpm: 0 }) === JSON.stringify({ ...b, wpm: 0 });

/** Build the reader inside `root` (spec section 6). */
export function mountReader(root: Element | ShadowRoot, doc: Doc, options: MountOptions): ReaderHandle {
  const { store, host } = options;
  const ownerDocument = root.ownerDocument;
  const win = ownerDocument.defaultView as Window;
  const h = builder(ownerDocument);
  let settings = normalizeSettings(options.settings);
  let timeline: Timeline = buildTimeline(doc, settings);
  const scheduler = options.scheduler ?? defaultScheduler(win);
  const ownSpeech = !options.speech;
  const speechWin = win as unknown as { speechSynthesis?: SpeechSynth; SpeechSynthesisUtterance?: new (text: string) => UtteranceLike };
  const speech =
    options.speech ??
    createSpeechDriver(speechWin.speechSynthesis, {
      Utterance: speechWin.SpeechSynthesisUtterance,
      lang: ownerDocument.documentElement.lang || win.navigator?.language,
    });
  speech.setVoice(settings.tts.voiceURI);
  const player = createPlayer(timeline, settings, scheduler, speech);

  const floating = options.layout === 'floating';
  const reader = h('div', { class: 'sr-reader', tabindex: 0, 'aria-label': 'Speed reader', 'data-state': player.state, 'data-layout': floating ? 'floating' : 'panel' });
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
  // Floating: the outline bar (used when the outline card has no room) heads the stage card.
  if (floating) {
    main.prepend(outlineBar);
    layout.append(outline, main, exhibits);
  } else layout.append(outlineBar, outline, main, exhibits);
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
    scheduler,
    frame: options.frame ?? defaultFrame(win),
    hostSettings: options.hostSettings ?? [],
    speech,
    h,
    reader,
    accepts: (event) => !options.trustedEventsOnly || event.isTrusted,
  };
  const outlineZone = createOutline(ctx, { outline, bar: outlineBar, layout });
  const exhibitZone = createExhibits(ctx, { pane: exhibits, root: layout });
  const panel = createSettingsPanel(ctx, (next) => applySettings(next));
  const stageZone = createStage(ctx, { stage, status, overallFill: overall.firstElementChild as HTMLElement });
  const zones: Zone[] = [
    stageZone,
    outlineZone,
    exhibitZone,
    createReading(ctx, { reading, layout }),
    panel,
  ];
  const push = createLayout({ reader, floating, main, stage, overall, exhibits, list: exhibits.querySelector<HTMLElement>('.sr-exhibit-list')! });
  zones.push(push);
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
      speech.setVoice(next.tts.voiceURI);
      if (saving) void store.save(next);
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
      saving = save;
      try {
        if (next.wpm !== settings.wpm) player.setSpeed(next.wpm);
      } finally {
        saving = true;
      }
      return;
    }
    settings = next;
    speech.setVoice(next.tts.voiceURI);
    timeline = buildTimeline(doc, next);
    player.replaceTimeline(timeline, next);
    for (const zone of zones) zone.refresh?.();
    if (save) void store.save(next);
  }

  let destroyed = false;
  /** False while settings from outside (load, applySettings) are applied: they are not saved back. */
  let saving = true;
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
    applySettings(next) {
      if (!destroyed) applySettings(next, false);
    },
    wheel(event) {
      if (!destroyed) stageZone.wheel(event);
    },
    relayout() {
      if (!destroyed) push.update();
    },
    freeBand: () => push.freeBand(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of unsubscribe) off();
      detachKeys();
      player.close();
      for (const zone of zones) zone.destroy();
      if (ownSpeech) speech.destroy();
      reader.remove();
      removeStyles();
    },
  };
}
