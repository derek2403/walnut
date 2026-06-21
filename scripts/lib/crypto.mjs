// AES-256-GCM encryption for the agent "brain", + sha256 data_hash commitment.
// Blob layout: [12-byte IV][16-byte auth tag][ciphertext].
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function sha256(buf) {
  return new Uint8Array(createHash('sha256').update(buf).digest());
}

export function newAesKey() {
  return randomBytes(32); // AES-256
}

export function aesEncrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]); // 12 + 16 + n
}

export function aesDecrypt(blob, key) {
  const buf = Buffer.from(blob);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function toHex(u8) {
  return Buffer.from(u8).toString('hex');
}
