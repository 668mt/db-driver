import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SKILL_DEST } from '../utils/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_SOURCE = join(__dirname, '..', '..', 'skill');

export async function runInstall(): Promise<void> {
  if (!existsSync(SKILL_SOURCE)) {
    throw new Error(`Skill 源目录不存在: ${SKILL_SOURCE}`);
  }

  if (existsSync(SKILL_DEST)) {
    rmSync(SKILL_DEST, { recursive: true, force: true });
  }
  mkdirSync(dirname(SKILL_DEST), { recursive: true });

  cpSync(SKILL_SOURCE, SKILL_DEST, { recursive: true });
  console.log(`✅  Skill 已安装到 ${SKILL_DEST}`);
}