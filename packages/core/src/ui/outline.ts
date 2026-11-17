import { sectionEstimate } from '../pacing';
import type { StepEvent } from '../player';
import type { ReaderContext, Zone } from './context';
import { icon, ICONS, replaceChildren } from './dom';
import { formatDuration } from './format';

export interface OutlineElements {
  outline: HTMLElement;
  bar: HTMLElement;
  layout: HTMLElement;
}

interface Row {
  sectionAt: number;
  button: HTMLButtonElement;
  fill: HTMLElement;
  time: HTMLElement;
}

/** The outline rail: one row per headed section with progress and remaining time; a bar and drawer when narrow. */
export function createOutline(ctx: ReaderContext, { outline, bar, layout }: OutlineElements): Zone & { closeDrawer(): boolean } {
  const { h, player } = ctx;
  const list = h('ol', { class: 'sr-outline-list' });
  outline.append(h('div', { class: 'sr-outline-head', 'aria-hidden': 'true' }, 'Contents'), list);
  const barText = h('span', { class: 'sr-outline-toggle-text' });
  const toggle = h(
    'button',
    { type: 'button', class: 'sr-outline-toggle', 'aria-expanded': 'false' },
    icon(ctx.document, ICONS.menu),
    barText,
  );
  bar.append(toggle);

  let rows: Row[] = [];
  /** prefix[i]: estimated ms of the steps before step i. */
  let prefix: number[] = [];
  let ends: number[] = [];
  let builtFor: unknown = null;

  function setDrawer(open: boolean) {
    if (open) layout.dataset.drawer = 'open';
    else delete layout.dataset.drawer;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function build() {
    const { steps, sections } = ctx.timeline;
    builtFor = ctx.timeline;
    prefix = [0];
    for (const step of steps) prefix.push(prefix[prefix.length - 1] + sectionEstimate([step], ctx.settings));
    ends = sections.map((s, i) => (i + 1 < sections.length ? sections[i + 1].firstStep : steps.length));
    rows = [];
    sections.forEach((section, sectionAt) => {
      if (section.title === undefined) return;
      const level = section.level ?? 1;
      const fill = h('span', { class: 'sr-row-fill' });
      const time = h('span', { class: 'sr-row-time' });
      const button = h(
        'button',
        { type: 'button', class: 'sr-outline-row', 'data-level': level, 'data-section': section.id },
        h('span', { class: 'sr-row-title' }, section.title),
        time,
        h('span', { class: 'sr-row-bar', 'aria-hidden': 'true' }, fill),
      );
      button.style.setProperty('--sr-level', String(level));
      button.addEventListener('click', () => {
        setDrawer(false);
        player.jumpToSection(section.id);
        ctx.reader.focus({ preventScroll: true });
      });
      rows.push({ sectionAt, button, fill, time });
    });
    replaceChildren(list, ...rows.map((r) => h('li', {}, r.button)));
    update(player.index);
  }

  function update(index: number) {
    // A step of a rebuilt timeline can arrive before `refresh`: rebuild first.
    if (builtFor !== ctx.timeline) return build();
    const { steps, sections } = ctx.timeline;
    const at = Math.min(index, steps.length - 1);
    const current = sections.findIndex((s, i) => s.firstStep <= at && at < ends[i]);
    for (const row of rows) {
      const first = sections[row.sectionAt].firstStep;
      const end = ends[row.sectionAt];
      const from = Math.min(Math.max(index, first), end);
      const pct = end > first ? ((from - first) / (end - first)) * 100 : 100;
      const remaining = prefix[end] - prefix[from];
      row.fill.style.width = `${Math.round(pct * 10) / 10}%`;
      row.time.textContent = from >= end ? 'done' : formatDuration(remaining);
      if (row.sectionAt === current) row.button.setAttribute('aria-current', 'true');
      else row.button.removeAttribute('aria-current');
    }
    let titled = current;
    while (titled > 0 && sections[titled]?.title === undefined) titled--;
    barText.textContent = sections[titled]?.title ?? sections.find((s) => s.title !== undefined)?.title ?? 'Contents';
  }

  toggle.addEventListener('click', () => setDrawer(layout.dataset.drawer !== 'open'));
  const off = player.on('step', (e: StepEvent) => update(e.index));
  build();

  return {
    refresh: build,
    closeDrawer() {
      if (layout.dataset.drawer !== 'open') return false;
      setDrawer(false);
      return true;
    },
    destroy: off,
  };
}
