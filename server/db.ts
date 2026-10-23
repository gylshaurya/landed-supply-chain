import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { config } from './config.js';
import type { Activity, DB } from './types.js';
import { buildSeed } from './seed/data.js';
import { bus } from './bus.js';

export const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

let db: DB | null = null;

function file() {
  return path.resolve(config.dbPath);
}

export function getDb(): DB {
  if (db) return db;
  if (fs.existsSync(file())) {
    db = JSON.parse(fs.readFileSync(file(), 'utf8')) as DB;
  } else {
    db = buildSeed();
    save();
  }
  return db;
}

let timer: NodeJS.Timeout | null = null;
export function save() {
  if (!db) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 50);
}

export function flush() {
  if (!db) return;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(db, null, 2));
}

export function resetDb(next?: DB) {
  db = next ?? buildSeed();
  flush();
  bus.emit('change', { scope: 'all' });
  return db;
}

/** Swap the active store (used by tests). */
export function useDb(next: DB) {
  db = next;
}

export function log(entry: Omit<Activity, 'id' | 'ts'>) {
  const d = getDb();
  const item: Activity = { id: newId(), ts: new Date().toISOString(), ...entry };
  d.activity.unshift(item);
  d.activity = d.activity.slice(0, 300);
  save();
  bus.emit('activity', item);
  return item;
}
