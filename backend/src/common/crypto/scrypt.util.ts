import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Hashes a plaintext secret (password or refresh token) using Node.js native scrypt
 * with a random 16-byte salt. Format: `<saltHex>:<derivedKeyHex>`.
 */
export async function hashSecret(plainText: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(plainText, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext secret against a stored `<saltHex>:<derivedKeyHex>` hash
 * using constant-time comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
 */
export async function verifySecret(plainText: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scrypt(plainText, salt, KEY_LENGTH)) as Buffer;
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(keyBuffer, derivedKey);
}

