import * as vscode from 'vscode';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '@speed-read/core';

const SECTION = 'speedRead';

type Flat = Record<string, unknown>;

/** `{ code: { mode } }` -> `{ 'code.mode': … }`; arrays and null are values. */
export function flattenSettings(value: object, prefix = ''): Flat {
  const out: Flat = {};
  for (const [key, v] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flattenSettings(v, name));
    else out[name] = v;
  }
  return out;
}

const KEYS = Object.keys(flattenSettings(DEFAULT_SETTINGS));

/** The `speedRead.*` configuration as `Settings` (normalized: missing or invalid values are defaults). */
export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration(SECTION);
  const nested: Record<string, unknown> = {};
  for (const key of KEYS) {
    const value = config.get(key);
    if (value === undefined) continue;
    const path = key.split('.');
    let target = nested;
    for (const part of path.slice(0, -1)) target = (target[part] ??= {}) as Record<string, unknown>;
    target[path.at(-1)!] = value;
  }
  return normalizeSettings(nested as Partial<Settings>);
}

/** The scope a key's effective value comes from, so a write there takes effect. */
function targetOf(config: vscode.WorkspaceConfiguration, key: string): vscode.ConfigurationTarget {
  const inspected = config.inspect(key);
  if (inspected?.workspaceFolderValue !== undefined) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (inspected?.workspaceValue !== undefined) return vscode.ConfigurationTarget.Workspace;
  return vscode.ConfigurationTarget.Global;
}

/**
 * Write `settings` to the configuration, only the keys whose value changed, each to the scope its
 * effective value comes from (a user-level write under a workspace value would have no effect).
 */
export async function writeSettings(settings: Settings): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  const current = flattenSettings(readSettings());
  const next = flattenSettings(normalizeSettings(settings));
  for (const key of KEYS) {
    if (JSON.stringify(current[key]) === JSON.stringify(next[key])) continue;
    await config.update(key, next[key], targetOf(config, key));
  }
}

/** Calls `listener` with the new settings whenever `speedRead.*` changes. */
export function onSettingsChange(listener: (settings: Settings) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) listener(readSettings());
  });
}
