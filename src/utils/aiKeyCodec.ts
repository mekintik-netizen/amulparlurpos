/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure isomorphic obfuscation codec for storing Admin Gemini API configuration
 * safely in Cloud Firestore (`adminSettings/aiConfig`) without plain-text exposure.
 * Works identically in both browser and Node.js runtimes.
 */

const CODEC_PREFIX = 'AMUL_OBF_V1:';
const CODEC_SALT = 'AmulParlourPOS-2026-Anand-SecureCodec';

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeAiApiKey(rawKey: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';

  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const saltBytes = encoder.encode(CODEC_SALT);
  const xored = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    xored[i] = data[i] ^ saltBytes[i % saltBytes.length] ^ ((i * 17 + 43) & 0xff);
  }
  return `${CODEC_PREFIX}${toBase64(xored)}`;
}

export function decodeAiApiKey(encoded: string | undefined | null): string {
  if (!encoded || typeof encoded !== 'string') return '';
  const trimmed = encoded.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith(CODEC_PREFIX)) {
    // Support legacy plain base64 fallback if ever present
    try {
      const bytes = fromBase64(trimmed);
      return new TextDecoder().decode(bytes).trim();
    } catch {
      return '';
    }
  }

  try {
    const b64Payload = trimmed.slice(CODEC_PREFIX.length);
    const xored = fromBase64(b64Payload);
    const saltBytes = new TextEncoder().encode(CODEC_SALT);
    const plain = new Uint8Array(xored.length);
    for (let i = 0; i < xored.length; i += 1) {
      plain[i] = xored[i] ^ saltBytes[i % saltBytes.length] ^ ((i * 17 + 43) & 0xff);
    }
    return new TextDecoder().decode(plain).trim();
  } catch {
    return '';
  }
}

export function maskApiKey(rawKey: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 6)}••••••••${trimmed.slice(-4)}`;
}
