import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

const key = createHash('sha256').update(env.COMMUNICATION_PAYLOAD_SECRET, 'utf8').digest();

export const secretEnvelopeService = {
  seal(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  },
  open(envelope: string): string {
    const [version, ivValue, tagValue, encryptedValue] = envelope.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue)
      throw new Error('INVALID_SECRET_ENVELOPE');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  },
};
