import { normalizeSettings, type ExhibitMode, type Settings } from '../settings';
import type { ReaderContext, Zone } from './context';
import { cycleFocus, focusables, type Child } from './dom';

export interface SettingsPanel extends Zone {
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** Keys while the panel is open: Tab and Shift+Tab cycle within it, Esc closes it. */
  onKeyDown(event: KeyboardEvent): void;
}

const EXHIBIT_TYPES = [
  ['code', 'Code'],
  ['table', 'Tables'],
  ['math', 'Math'],
] as const;
const MODES: [ExhibitMode, string][] = [
  ['stop', 'Stop'],
  ['skip', 'Skip'],
  ['dwell', 'Dwell'],
];

let panels = 0;

/** The settings panel (gear button or `,`): every R12 setting, applied at once through `onChange`. */
export function createSettingsPanel(ctx: ReaderContext, onChange: (next: Settings) => void, charsMax?: () => number): SettingsPanel {
  const { h, reader } = ctx;
  const titleId = `sr-settings-title-${++panels}`;

  const number = (name: string, min: number, max: number, step: number, label?: string) =>
    h('input', { type: 'number', name, min, max, step, inputmode: 'numeric', 'aria-label': label });

  const field = (label: string, hint: string | null, ...controls: Child[]) =>
    h(
      'label',
      { class: 'sr-field' },
      h('span', { class: 'sr-field-label' }, label, hint ? h('span', { class: 'sr-field-hint' }, hint) : null),
      h('span', { class: 'sr-field-controls' }, ...controls),
    );

  const select = (name: string, options: [string, string][], label?: string) =>
    h('select', { name, 'aria-label': label }, ...options.map(([value, text]) => h('option', { value }, text)));

  const levels = h(
    'div',
    { class: 'sr-levels', role: 'group', 'aria-label': 'Heading levels that stop' },
    ...[1, 2, 3, 4, 5, 6].map((l) =>
      h('label', { class: 'sr-level' }, h('input', { type: 'checkbox', name: `stop-h${l}`, 'aria-label': `H${l}` }), h('span', { 'aria-hidden': 'true' }, `H${l}`)),
    ),
  );

  const ttsToggle = h('input', { type: 'checkbox', name: 'tts' });
  const voiceSelect = h('select', { name: 'tts-voice', 'aria-label': 'Voice' });
  const ttsNotes = h('div', { class: 'sr-tts-notes' });
  const voiceBadge = h('span', { class: 'sr-voice-badge' });
  let missingVoice = false;
  const done = h('button', { type: 'button', class: 'sr-settings-done' }, 'Done');
  const panel = h(
    'div',
    { class: 'sr-settings', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sr-settings-head' }, h('h2', { class: 'sr-settings-title', id: titleId }, 'Settings'), h('span', { class: 'sr-field-hint' }, 'Esc to close')),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Pacing'),
      field('Speed', 'words per minute', number('wpm', 100, 1000, 25)),
      field('Words per chunk', null, number('chunkWords', 1, 10, 1)),
      field('Characters per chunk', 'maximum', number('chunkChars', 5, charsMax?.() ?? 80, 1)),
    ),
    h('fieldset', {}, h('legend', {}, 'Stop at headings'), levels),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Code, tables and math'),
      ...EXHIBIT_TYPES.map(([kind, label]) =>
        field(label, null, select(`${kind}-mode`, MODES), number(`${kind}-seconds`, 1, 60, 1, `${label} dwell seconds`), h('span', { class: 'sr-field-hint' }, 's')),
      ),
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Display'),
      field('Reading mode', null, select('readingMode', [['chunk', 'Chunk-by-chunk'], ['flow', 'Three-row flow']], 'Reading mode')),
      field('Images and diagrams', 'seconds shown', number('imageDwellSeconds', 1, 60, 1)),
      field('Reader', 'in the browser', select('display', [['overlay', 'Overlay'], ['dock', 'Side panel']])),
      ctx.hostSettings.includes('pageFade')
        ? field('Page behind the reader', 'strength, 10-80 %', number('pageFade', 10, 80, 1), h('span', { class: 'sr-field-hint' }, '%'))
        : null,
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Speech'),
      field('Text-to-speech', 'read aloud', ttsToggle),
      (() => {
        const row = field('Voice', null, voiceSelect, voiceBadge);
        row.classList.add('sr-field-wide');
        return row;
      })(),
      ttsNotes,
    ),
    h('div', { class: 'sr-settings-foot' }, done),
  );
  const backdrop = h('div', { class: 'sr-settings-backdrop', hidden: true }, panel);
  reader.append(backdrop);

  const control = (name: string) => panel.querySelector(`[name="${name}"]`) as HTMLInputElement & HTMLSelectElement;

  /** Write `s` into the controls. */
  function show(s: Settings) {
    control('wpm').value = String(s.wpm);
    control('chunkWords').value = String(s.chunkWords);
    control('chunkChars').value = String(s.chunkChars);
    for (let l = 1; l <= 6; l++) control(`stop-h${l}`).checked = s.stopLevels.includes(l);
    for (const [kind] of EXHIBIT_TYPES) {
      control(`${kind}-mode`).value = s[kind].mode;
      control(`${kind}-seconds`).value = String(s[kind].dwellSeconds);
    }
    control('imageDwellSeconds').value = String(s.imageDwellSeconds);
    control('readingMode').value = s.readingMode;
    control('display').value = s.display;
    if (control('pageFade')) control('pageFade').value = String(Math.round(s.pageFade * 100));
    control('tts').checked = s.tts.enabled;
    showVoices(s.tts.voiceURI);
    enableSeconds();
  }

  /**
   * The voice list, grouped local and network and each labelled (p5b-r4), with `picked` selected; ''
   * is the automatic choice. A picked voice that is gone shows as Automatic (p5b-r7).
   */
  function showVoices(picked: string | null) {
    const { speech } = ctx;
    const voices = speech.voices();
    const auto = speech.defaultVoice();
    const option = (v: (typeof voices)[number]) => h('option', { value: v.uri }, `${v.name} (${v.lang}) · ${v.local ? 'local' : 'network'}`);
    const local = voices.filter((v) => v.local);
    const network = voices.filter((v) => !v.local);
    voiceSelect.replaceChildren(
      h('option', { value: '' }, auto ? `Automatic: ${auto.name}` : 'Choose a voice'),
      ...(local.length ? [h('optgroup', { label: 'Local (works offline)' }, ...local.map(option))] : []),
      ...(network.length ? [h('optgroup', { label: 'Network' }, ...network.map(option))] : []),
    );
    missingVoice = !!picked && voices.length > 0 && !voices.some((v) => v.uri === picked);
    voiceSelect.value = picked && !missingVoice && voices.some((v) => v.uri === picked) ? picked : '';
    showSpeechState();
  }

  /** Enable the controls and write the notes for the voice chosen in the select (spec section 9). */
  function showSpeechState() {
    const { speech } = ctx;
    const picked = voiceSelect.value;
    const voice = picked ? speech.voices().find((v) => v.uri === picked) : speech.defaultVoice();
    ttsToggle.disabled = !speech.available || !voice;
    voiceSelect.disabled = !speech.available;
    voiceBadge.hidden = !voice;
    voiceBadge.textContent = voice ? (voice.local ? 'local' : 'network') : '';
    voiceBadge.dataset.kind = voice?.local ? 'local' : 'network';
    const lines: [string, 'warning' | 'info'][] = [];
    if (!speech.available) lines.push(['Text-to-speech is not available here', 'warning']);
    else if (speech.failed) lines.push(['Speech failed: showing text only', 'warning']);
    if (speech.available && speech.noLocalVoice && !picked) lines.push(['No offline voice installed', 'warning']);
    if (missingVoice && !picked) lines.push(['Saved voice not found; using Automatic', 'info']);
    const active = speech.currentVoice();
    if (active && voice && active.uri !== voice.uri) lines.push([`Using ${active.name} after the selected voice failed to start`, 'info']);
    if (voice && !voice.local) lines.push(['This voice needs a network connection', 'warning']);
    lines.push(['Offline speech uses voices installed on this device', 'info']);
    ttsNotes.replaceChildren(...lines.map(([line, kind]) => h('p', { class: 'sr-tts-note sr-field-hint', 'data-kind': kind }, line)));
  }

  function enableSeconds() {
    for (const [kind] of EXHIBIT_TYPES) control(`${kind}-seconds`).disabled = control(`${kind}-mode`).value !== 'dwell';
  }

  /** Settings from the controls; an empty or unreadable number keeps the current value. */
  function read(): Settings {
    const current = ctx.settings;
    const num = (name: string, fallback: number) => {
      const value = Number.parseFloat(control(name).value);
      return Number.isFinite(value) ? value : fallback;
    };
    const exhibit = (kind: 'code' | 'table' | 'math') => ({
      mode: control(`${kind}-mode`).value as ExhibitMode,
      dwellSeconds: num(`${kind}-seconds`, current[kind].dwellSeconds),
    });
    return normalizeSettings({
      ...current,
      wpm: num('wpm', current.wpm),
      chunkWords: num('chunkWords', current.chunkWords),
      chunkChars: num('chunkChars', current.chunkChars),
      stopLevels: [1, 2, 3, 4, 5, 6].filter((l) => control(`stop-h${l}`).checked),
      code: exhibit('code'),
      table: exhibit('table'),
      math: exhibit('math'),
      imageDwellSeconds: num('imageDwellSeconds', current.imageDwellSeconds),
      readingMode: control('readingMode').value as Settings['readingMode'],
      display: control('display').value as Settings['display'],
      pageFade: control('pageFade') ? num('pageFade', current.pageFade * 100) / 100 : current.pageFade,
      tts: { enabled: ttsToggle.checked, voiceURI: voiceSelect.value || (missingVoice ? current.tts.voiceURI : null) },
    });
  }

  let applying = false;
  function apply(commit: boolean) {
    enableSeconds();
    applying = true;
    try {
      onChange(read());
    } finally {
      applying = false;
    }
    if (commit) show(ctx.settings);
  }

  const onInput = (e: Event) => ctx.accepts(e) && apply(false);
  const onCommit = (e: Event) => ctx.accepts(e) && apply(true);
  panel.addEventListener('input', onInput);
  panel.addEventListener('change', onCommit);
  // Picking any voice, Automatic included, replaces a saved voice that is gone.
  voiceSelect.addEventListener('change', () => {
    missingVoice = false;
  });
  const offVoices = ctx.speech.onVoices(() => showVoices(voiceSelect.value || null));

  function close() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    reader.focus({ preventScroll: true });
  }

  done.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return {
    isOpen: () => !backdrop.hidden,
    open() {
      // The characters maximum is what fits the stage now, which a resize may have changed.
      if (charsMax) control('chunkChars').max = String(charsMax());
      show(ctx.settings);
      backdrop.hidden = false;
      focusables(panel)[0]?.focus();
    },
    close,
    onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        cycleFocus(panel, event.shiftKey);
      }
    },
    refresh() {
      if (!backdrop.hidden && !applying) show(ctx.settings);
    },
    destroy() {
      panel.removeEventListener('input', onInput);
      panel.removeEventListener('change', onCommit);
      offVoices();
      backdrop.remove();
    },
  };
}
