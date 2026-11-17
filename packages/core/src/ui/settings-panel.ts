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
export function createSettingsPanel(ctx: ReaderContext, onChange: (next: Settings) => void): SettingsPanel {
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
      field('Characters per chunk', 'maximum', number('chunkChars', 5, 80, 1)),
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
      field('Images and diagrams', 'seconds shown', number('imageDwellSeconds', 1, 60, 1)),
      field('Reader', 'in the browser', select('display', [['overlay', 'Overlay'], ['dock', 'Side panel']])),
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Speech'),
      (() => {
        const row = field('Text-to-speech', 'available in a later version', h('input', { type: 'checkbox', name: 'tts', disabled: true }));
        row.setAttribute('data-disabled', '');
        return row;
      })(),
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
    control('display').value = s.display;
    control('tts').checked = s.tts.enabled;
    enableSeconds();
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
      display: control('display').value as Settings['display'],
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

  const onInput = () => apply(false);
  const onCommit = () => apply(true);
  panel.addEventListener('input', onInput);
  panel.addEventListener('change', onCommit);

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
      backdrop.remove();
    },
  };
}
