import type { Doc } from '../model';
import { createPlayer, type Player, type Scheduler } from '../player';
import { normalizeSettings, type Settings, type SettingsStore } from '../settings';
import { buildTimeline, type Timeline } from '../timeline';
import { createSpeechDriver, speechBlockedReason, type SpeechDriver, type SpeechSynth, type UtteranceLike } from '../tts';
import type { FrameSource, HostSetting, ReaderContext, Zone } from './context';
import { chunkFit, FIT_MAX, PROBE_TEXT } from './chunk-fit';
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
  /** Browser reader: pin the chunk stage below a separate chapter/exhibit area. */
  bottomStage?: boolean;
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
  /** Recompute the narrow exhibit push in layouts that use it (also follows resizes). */
  relayout(): void;
  /**
   * The unobstructed band in viewport px, plus the reader's bottom: where a host can show the
   * block being read. The bottom-stage browser layout puts the stage on top, then the support
   * cards, and reserves the area below them: `top` is the bottom of the cards (of the stage when
   * there are none), `bottom` and `below` the reader's bottom.
   */
  freeBand(): FreeBand;
  /**
   * Call `fn` when the stage or the support cards change size, so the band's top may have moved
   * (a card appeared). Returns the unsubscribe; a no-op without ResizeObserver.
   */
  onBandChange(fn: () => void): () => void;
  /**
   * Show a note in the status line, or clear it with null: a host reports a failure the reader
   * cannot see itself (VS Code's configuration refusing a write: "Settings not saved").
   */
  setStatusNote(text: string | null): void;
  destroy(): void;
}

/** The status note shown when the store refuses a save. */
export const SETTINGS_NOT_SAVED = 'Settings not saved';

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

/** Equal apart from the live settings (speed, flow motion, red letters): none changes the timeline. */
const sameExceptLive = (a: Settings, b: Settings) =>
  JSON.stringify({ ...a, wpm: 0, flowMotion: 'word', redLetters: true }) === JSON.stringify({ ...b, wpm: 0, flowMotion: 'word', redLetters: true });

/** Build the reader inside `root` (spec section 6). */
export function mountReader(root: Element | ShadowRoot, doc: Doc, options: MountOptions): ReaderHandle {
  const { store, host } = options;
  const ownerDocument = root.ownerDocument;
  const win = ownerDocument.defaultView as Window;
  const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ?? globalThis.ResizeObserver;
  const h = builder(ownerDocument);
  // `settings` is what the user set (and what is saved); the reader runs on `effective(settings)`, whose
  // characters limit a bottom-stage host clamps to what fits its stage (`fit`, null until measured).
  let fit: number | null = null;
  /** The last fit measured in chunk mode, for the settings panel's maximum (flow's wide stage says nothing about it). */
  let seenFit: number | null = null;
  const effective = (s: Settings): Settings => (fit !== null && s.chunkChars > fit ? { ...s, chunkChars: fit } : s);
  let settings = normalizeSettings(options.settings);
  let timeline: Timeline = buildTimeline(doc, effective(settings));
  const scheduler = options.scheduler ?? defaultScheduler(win);
  const ownSpeech = !options.speech;
  const speechWin = win as unknown as { speechSynthesis?: SpeechSynth; SpeechSynthesisUtterance?: new (text: string) => UtteranceLike };
  const speech =
    options.speech ??
    createSpeechDriver(speechWin.speechSynthesis, {
      Utterance: speechWin.SpeechSynthesisUtterance,
      lang: ownerDocument.documentElement.lang || win.navigator?.language,
      estimateBoundaries: options.bottomStage,
      blockedReason: speechBlockedReason(win.navigator?.userAgent),
    });
  speech.setVoice(settings.tts.voiceURI);
  const player = createPlayer(timeline, effective(settings), scheduler, speech);

  const floating = options.layout === 'floating';
  const reader = h('div', { class: 'sr-reader', tabindex: 0, 'aria-label': 'Speed reader', 'data-state': player.state, 'data-layout': floating ? 'floating' : 'panel' });
  if (options.bottomStage) reader.setAttribute('data-bottom-stage', '');
  const layout = h('div', { class: 'sr-layout' });
  const outlineBar = h('div', { class: 'sr-outline-bar' });
  const outline = h('nav', { class: 'sr-outline', 'aria-label': 'Outline' });
  const status = h('div', { class: 'sr-status' });
  const settingsButton = h('button', { type: 'button', class: 'sr-icon-button sr-settings-button', 'aria-label': 'Settings', title: 'Settings (,)' }, icon(ownerDocument, ICONS.gear));
  const closeButton = h('button', { type: 'button', class: 'sr-icon-button sr-close-button', 'aria-label': 'Close reader', title: 'Close (Esc)' }, icon(ownerDocument, ICONS.close));
  const toolbar = h('div', { class: 'sr-toolbar' }, status, settingsButton, closeButton);
  const overall = h('div', { class: 'sr-overall', 'aria-hidden': 'true' }, h('span', { class: 'sr-overall-fill' }));
  const stage = h('section', { class: 'sr-stage', role: 'region', 'aria-label': 'Reader stage', tabindex: -1 });
  const probe = options.bottomStage ? h('span', { class: 'sr-fit-probe', 'aria-hidden': 'true' }, PROBE_TEXT) : null;
  if (probe) stage.append(probe);
  const reading = h('div', { class: 'sr-reading', role: 'region', 'aria-label': 'Normal reading', hidden: true });
  const main = h('div', { class: 'sr-main' }, toolbar, overall, stage, reading);
  // Empty from the start, so a narrow reader does not show the card fading out as it mounts.
  const exhibits = h('section', { class: 'sr-exhibits', role: 'region', 'aria-label': 'Exhibits', 'data-empty': true });
  // Floating: the outline bar (used when the outline card has no room) heads the stage card.
  const details = options.bottomStage ? h('div', { class: 'sr-stage-details', hidden: true }) : undefined;
  const support = details ? h('div', { class: 'sr-stage-support' }, details, exhibits) : null;
  if (support && floating) {
    main.prepend(outlineBar);
    layout.append(outline, main, support);
  } else if (support) {
    main.prepend(outlineBar);
    stage.after(support);
    layout.append(outline, main);
  } else if (floating) {
    main.prepend(outlineBar);
    layout.append(outline, main, exhibits);
  } else layout.append(outlineBar, outline, main, exhibits);
  reader.dataset.readingMode = settings.readingMode;
  setRedLetters(settings.redLetters);
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
  const exhibitZone = createExhibits(ctx, { pane: exhibits, root: layout, newestFirst: !!support });
  const panel = createSettingsPanel(ctx, (next) => applySettings(next), () => seenFit ?? FIT_MAX);
  const stageZone = createStage(ctx, { stage, status, details, overallFill: overall.firstElementChild as HTMLElement });
  const zones: Zone[] = [
    stageZone,
    outlineZone,
    exhibitZone,
    createReading(ctx, { reading, layout }),
    panel,
  ];
  const push = support ? null : createLayout({ reader, floating, main, stage, overall, exhibits, list: exhibits.querySelector<HTMLElement>('.sr-exhibit-list')! });
  if (push) zones.push(push);
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
    // The player only changes the speed; its settings carry the effective limits, which are not saved.
    player.on('settings', (next) => {
      settings = { ...settings, wpm: next.wpm, flowMotion: next.flowMotion };
      if (saving) saveSettings(settings);
    }),
    player.on('state', (state) => {
      reader.dataset.state = state;
      if (state === 'closed' && !destroyed) host.onClose();
    }),
  ];

  /** Red letters is pure presentation: the stylesheet reads this attribute. */
  function setRedLetters(on: boolean) {
    reader.dataset.redLetters = on ? 'on' : 'off';
  }

  /** Apply new settings at once: speed alone goes to the player, anything else rebuilds the timeline. */
  function applySettings(next: Settings, save = true) {
    next = normalizeSettings(next);
    if (sameExceptLive(next, settings)) {
      saving = save;
      try {
        if (next.wpm !== settings.wpm) player.setSpeed(next.wpm);
        if (next.flowMotion !== settings.flowMotion) player.setFlowMotion(next.flowMotion);
        if (next.redLetters !== settings.redLetters) {
          settings = { ...settings, redLetters: next.redLetters };
          setRedLetters(next.redLetters);
          if (save) saveSettings(settings);
        }
      } finally {
        saving = true;
      }
      return;
    }
    const modeChanged = next.readingMode !== settings.readingMode;
    settings = next;
    speech.setVoice(next.tts.voiceURI);
    // The stage's width follows the mode: set it first and take the new mode's fit before building, so there is one rebuild.
    reader.dataset.readingMode = next.readingMode;
    setRedLetters(next.redLetters);
    if (modeChanged && probe) fit = currentFit();
    rebuild();
    if (save) saveSettings(next);
  }

  /** Build the timeline for the effective settings and swap it in, keeping the position. */
  function rebuild() {
    const run = effective(settings);
    timeline = buildTimeline(doc, run);
    player.replaceTimeline(timeline, run);
    for (const zone of zones) zone.refresh?.();
  }

  /**
   * The bottom stage's fit: the chunk stage's width over one character of the chunk font (a prose sample's
   * width / length); chunk mode only, since flow steps one word at a time on a much wider stage. Null without layout.
   */
  function currentFit(): number | null {
    if (settings.readingMode !== 'chunk') return null;
    const room = stage.querySelector('.sr-display') ?? stage;
    const measured = chunkFit(room.getBoundingClientRect().width, probe!.getBoundingClientRect().width);
    if (measured !== null) seenFit = measured;
    return measured;
  }

  /** Measure the stage again; a changed effective characters limit rebuilds the timeline. */
  function updateFit() {
    const next = currentFit();
    if (next === fit) return;
    const before = effective(settings).chunkChars;
    fit = next;
    if (!destroyed && effective(settings).chunkChars !== before) rebuild();
  }

  /** Save through the store; a refused save (storage quota, a gone extension context) shows a note. */
  function saveSettings(next: Settings) {
    let pending: Promise<void>;
    try {
      pending = Promise.resolve(store.save(next));
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      () => {
        if (!destroyed && noteIsSave) {
          noteIsSave = false;
          stageZone.note(null);
        }
      },
      () => {
        if (destroyed) return;
        noteIsSave = true;
        stageZone.note(SETTINGS_NOT_SAVED);
      },
    );
  }
  let noteIsSave = false;

  let destroyed = false;
  /** False while settings from outside (load, applySettings) are applied: they are not saved back. */
  let saving = true;
  const ready = store
    .load()
    .then((loaded) => {
      if (!destroyed && loaded) applySettings({ ...settings, ...loaded }, false);
    })
    .catch(() => {});

  // Measured after the first layout and on every resize of the stage (a window resize, the reading mode's width).
  let fitObserver: ResizeObserver | null = null;
  if (probe) {
    updateFit();
    fitObserver = Observer ? new Observer(() => updateFit()) : null;
    fitObserver?.observe(stage);
  }

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
      if (!destroyed) push?.update();
    },
    freeBand() {
      if (push) return push.freeBand();
      const bottom = reader.getBoundingClientRect().bottom;
      const card = support?.getBoundingClientRect();
      return { top: card?.height ? card.bottom : main.getBoundingClientRect().bottom, bottom, below: bottom };
    },
    onBandChange(fn) {
      if (!Observer || destroyed) return () => {};
      const observer = new Observer(() => fn());
      observer.observe(main);
      if (support) observer.observe(support);
      return () => observer.disconnect();
    },
    setStatusNote(text) {
      if (destroyed) return;
      noteIsSave = false;
      stageZone.note(text);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      fitObserver?.disconnect();
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
