import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = join(homedir(), '.db-driver');
export const SKILL_DEST = join(homedir(), '.agents', 'skills', 'db-driver');
export const USAGE_FILE = join(CONFIG_DIR, 'usage.db');

export function ensureConfigDir(): void {
  const { mkdirSync } = require('fs') as typeof import('fs');
  mkdirSync(CONFIG_DIR, { recursive: true });
}