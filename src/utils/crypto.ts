import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

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

const EXPORT_MAGIC = Buffer.from('EXP1', 'utf8');
const EXPORT_VERSION = 0x01;
const EXPORT_SALT_LEN = 16;
const PBKDF2_ITERATIONS = 100_000;

function derivePassphraseKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

export function encryptWithPassphrase(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(EXPORT_SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = derivePassphraseKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    EXPORT_MAGIC,
    Buffer.from([EXPORT_VERSION]),
    salt,
    iv,
    ciphertext,
    tag,
  ]);
}

export function decryptWithPassphrase(blob: Buffer, passphrase: string): Buffer {
  const headerLen = EXPORT_MAGIC.length + 1 + EXPORT_SALT_LEN + IV_LEN;
  const minLen = headerLen + TAG_LEN;
  if (blob.length < minLen) {
    throw new Error('导出文件过短');
  }
  if (!blob.subarray(0, EXPORT_MAGIC.length).equals(EXPORT_MAGIC)) {
    throw new Error('导出文件 magic 不匹配（非 db-driver export 文件）');
  }
  if (blob[EXPORT_MAGIC.length] !== EXPORT_VERSION) {
    throw new Error(`导出文件版本不支持（${blob[EXPORT_MAGIC.length]}）`);
  }
  const salt = blob.subarray(EXPORT_MAGIC.length + 1, EXPORT_MAGIC.length + 1 + EXPORT_SALT_LEN);
  const iv = blob.subarray(
    EXPORT_MAGIC.length + 1 + EXPORT_SALT_LEN,
    EXPORT_MAGIC.length + 1 + EXPORT_SALT_LEN + IV_LEN
  );
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ciphertext = blob.subarray(headerLen, blob.length - TAG_LEN);
  const key = derivePassphraseKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}