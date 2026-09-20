import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const MAGIC = Buffer.from('DBC1', 'utf8');
const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + IV_LEN;

export function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, ciphertext, tag]);
}

export function decrypt(blob: Buffer, key: Buffer): Buffer {
  const minLen = HEADER_LEN + TAG_LEN;
  if (blob.length < minLen) {
    throw new Error('配置数据格式错误（文件过短）');
  }
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('配置数据格式错误（magic 不匹配，可能不是 db-driver 配置）');
  }
  const version = blob[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`配置数据格式错误（不支持的版本 ${version}）`);
  }
  const iv = blob.subarray(MAGIC.length + 1, HEADER_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ciphertext = blob.subarray(HEADER_LEN, blob.length - TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}