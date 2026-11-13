/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit & integration tests for:
 * - PNG-to-ICO multi-size binary builder (32x32, 64x64, 256x256)
 * - Generated public/favicon.ico, public/icon-192.png, public/icon-512.png
 * - GitHub Pages relative paths in index.html & public/manifest.json
 * - Cloud persistence schema & Admin/Shop UI .ico download/upload integration
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildIcoFromPngBuffers } from '../src/utils/icoConverter.ts';

describe('Windows .ico Binary Builder & Official Brand Assets', () => {
  it('builds a valid multi-size Windows .ico binary buffer with 32, 64, and 256 PNG frames', () => {
    const fakePng32 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const fakePng64 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8, 9]);
    const fakePng256 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 10, 11, 12, 13, 14, 15]);

    const ico = buildIcoFromPngBuffers([
      { size: 32, pngBytes: fakePng32 },
      { size: 64, pngBytes: fakePng64 },
      { size: 256, pngBytes: fakePng256 }
    ]);

    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

    // ICONDIR header: reserved=0, type=1, count=3
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);

    // Entry 0: 32x32
    expect(view.getUint8(6)).toBe(32);
    expect(view.getUint8(7)).toBe(32);
    expect(view.getUint32(6 + 8, true)).toBe(fakePng32.length);
    const offset0 = view.getUint32(6 + 12, true);
    expect(offset0).toBe(6 + 3 * 16);

    // Entry 1: 64x64
    expect(view.getUint8(22)).toBe(64);
    expect(view.getUint8(23)).toBe(64);
    expect(view.getUint32(22 + 8, true)).toBe(fakePng64.length);
    const offset1 = view.getUint32(22 + 12, true);
    expect(offset1).toBe(offset0 + fakePng32.length);

    // Entry 2: 256x256 (encoded as 0 per ICO spec)
    expect(view.getUint8(38)).toBe(0);
    expect(view.getUint8(39)).toBe(0);
    expect(view.getUint32(38 + 8, true)).toBe(fakePng256.length);
    const offset2 = view.getUint32(38 + 12, true);
    expect(offset2).toBe(offset1 + fakePng64.length);

    expect(ico.length).toBe(offset2 + fakePng256.length);
    expect(Array.from(ico.subarray(offset2, offset2 + 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('throws cleanly when given an empty PNG frame list', () => {
    expect(() => buildIcoFromPngBuffers([])).toThrow();
  });

  it('verifies public/favicon.ico exists with valid 32, 64, and 256 PNG frames', () => {
    const icoPath = path.resolve(process.cwd(), 'public/favicon.ico');
    expect(fs.existsSync(icoPath)).toBe(true);

    const buf = fs.readFileSync(icoPath);
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBe(3);

    const expectedDims = [32, 64, 0];
    expectedDims.forEach((dim, idx) => {
      const entryOffset = 6 + idx * 16;
      expect(buf.readUInt8(entryOffset)).toBe(dim);
      expect(buf.readUInt8(entryOffset + 1)).toBe(dim);
      const dataSize = buf.readUInt32LE(entryOffset + 8);
      const dataOffset = buf.readUInt32LE(entryOffset + 12);
      expect(dataSize).toBeGreaterThan(100);
      // Verify PNG magic signature at frame offset
      expect(buf.subarray(dataOffset, dataOffset + 4).toString('hex')).toBe('89504e47');
    });
  });

  it('verifies public/icon-192.png, public/icon-512.png exist and in-app UI uses the original official Amul logo', () => {
    const icon192 = fs.readFileSync(path.resolve(process.cwd(), 'public/icon-192.png'));
    const icon512 = fs.readFileSync(path.resolve(process.cwd(), 'public/icon-512.png'));
    const originalInAppLogo = fs.readFileSync(path.resolve(process.cwd(), 'src/assets/amul-logo.jpg'));

    // Check PNG signature and IHDR dimensions for PWA / Desktop icons
    expect(icon192.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(icon192.readUInt32BE(16)).toBe(192);
    expect(icon192.readUInt32BE(20)).toBe(192);

    expect(icon512.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(icon512.readUInt32BE(16)).toBe(512);
    expect(icon512.readUInt32BE(20)).toBe(512);

    // Original official Amul logo must remain the sole in-app logo
    expect(originalInAppLogo.length).toBeGreaterThan(1000);
    const logoTs = fs.readFileSync(path.resolve(process.cwd(), 'src/assets/logo.ts'), 'utf8');
    expect(logoTs).toContain('./amul-logo.jpg');
    expect(logoTs).not.toContain('amul-parlour-logo.png');

    const loginPage = fs.readFileSync(path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx'), 'utf8');
    expect(loginPage).toContain('src={amulLogo}');
    expect(loginPage).not.toContain('brandLogoPngBase64');
  });

  it('verifies index.html and public/manifest.json use GitHub Pages-compatible relative links', () => {
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    expect(indexHtml).toContain('href="./favicon.ico"');
    expect(indexHtml).toContain('href="./icon-192.png"');
    expect(indexHtml).toContain('href="./manifest.json"');

    const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/manifest.json'), 'utf8'));
    expect(manifest.short_name).toBe('Amul POS');
    expect(manifest.name).toBe('Amul Parlour POS & Management');
    expect(manifest.start_url).toBe('.');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#005A9C');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: './icon-192.png', sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ src: './icon-512.png', sizes: '512x512', type: 'image/png' })
      ])
    );
  });

  it('verifies Cloud Firestore config and Admin/Shop UI include .ico persistence & download actions', () => {
    const firebaseTs = fs.readFileSync(path.resolve(process.cwd(), 'src/storage/firebase.ts'), 'utf8');
    expect(firebaseTs).toContain('desktopIconIcoBase64');
    expect(firebaseTs).toContain('brandLogoPngBase64');

    const adminPortal = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/AdminPortal.tsx'), 'utf8');
    expect(adminPortal).toContain('Download Windows Desktop Icon (.ico)');
    expect(adminPortal).toContain('amul-parlour-pos.ico');
    expect(adminPortal).toContain('convertImageToIco');

    const shopProfile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/profile/ShopProfileManagement.tsx'), 'utf8');
    expect(shopProfile).toContain('Download Windows Desktop Icon (.ico)');
    expect(shopProfile).toContain('amul-parlour-pos.ico');
  });
});
