import type { Player } from '../player';
import { cycleFocus } from './dom';
import type { ExhibitZone } from './exhibits';

export interface KeyTargets {
  player: Player;
  reader: HTMLElement;
  stage: HTMLElement;
  exhibits: Pick<ExhibitZone, 'isExpanded' | 'closeExpanded'>;
  closeDrawer(): boolean;
  panel: { isOpen(): boolean; open(): void; onKeyDown(event: KeyboardEvent): void };
}

const SPEED_STEP = 25;
const FORM_CONTROL = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';

/** The reader shortcuts of R11, by `KeyboardEvent.key`. */
function shortcut(key: string, t: KeyTargets): (() => void) | null {
  const { player, exhibits } = t;
  switch (key) {
    case ' ':
      return () => player.toggle();
    case 'ArrowRight':
      return () => player.sentence(1);
    case 'ArrowLeft':
      return () => player.sentence(-1);
    case 'ArrowUp':
      return () => player.speed(SPEED_STEP);
    case 'ArrowDown':
      return () => player.speed(-SPEED_STEP);
    case 'n':
    case 'N':
      return () => player.section(1);
    case 'p':
    case 'P':
      return () => player.section(-1);
    case 'Tab':
      return () => {
        exhibits.closeExpanded();
        player.toggleReading();
      };
    case 'e':
    case 'E':
      return () => (exhibits.isExpanded() ? exhibits.closeExpanded() : player.expand());
    case 'Escape':
      return () => {
        if (exhibits.isExpanded()) exhibits.closeExpanded();
        else if (!t.closeDrawer()) player.close();
      };
    case ',':
      return () => t.panel.open();
    default:
      return null;
  }
}

/**
 * Keyboard handling on the reader root (spec section 6). Shortcuts act only when focus is on the
 * root or the stage; the settings panel and form controls own their keys; Tab never leaves the reader.
 */
export function attachKeys(t: KeyTargets): () => void {
  function onKeyDown(event: KeyboardEvent) {
    if (t.panel.isOpen()) return t.panel.onKeyDown(event);
    const target = event.target as Element | null;
    if (!target || target.closest(FORM_CONTROL)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const onReader = target === t.reader || t.stage.contains(target);
    if (!onReader) {
      if (event.key === 'Tab') {
        event.preventDefault();
        cycleFocus(t.reader, event.shiftKey);
      }
      return;
    }
    const run = shortcut(event.key, t);
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  }
  t.reader.addEventListener('keydown', onKeyDown);
  return () => t.reader.removeEventListener('keydown', onKeyDown);
}
