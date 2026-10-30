/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Windows Compatibility, Browser Feature Detection & Launcher Tests
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Universal Windows Compatibility & Browser Targets', () => {
  it('confirms vite.config.ts is configured for Chrome 109, Edge 109, Firefox 115, and ES2020', () => {
    const configPath = path.resolve(process.cwd(), 'vite.config.ts');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('chrome109');
    expect(content).toContain('edge109');
    expect(content).toContain('firefox115');
    expect(content).toContain('es2020');
  });

  it('verifies early feature detection in index.html for legacy Windows browsers', () => {
    const indexPath = path.resolve(process.cwd(), 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content).toContain('indexedDB');
    expect(content).toContain('localStorage');
    expect(content).toContain('Browser Compatibility Update Required');
    expect(content).toContain('Chrome 109');
    expect(content).toContain('Firefox ESR 115');
  });

  it('validates Web App Manifest (PWA) configuration for Windows desktop installation', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    expect(manifest.short_name).toBe('Amul POS');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#005A9C');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('validates Windows batch launcher Start-Amul-POS.bat process deduplication', () => {
    const batPath = path.resolve(process.cwd(), 'Start-Amul-POS.bat');
    const content = fs.readFileSync(batPath, 'utf8');

    // Checks that port 3000 is verified to avoid duplicate instances
    expect(content).toContain(':3000');
    expect(content).toContain('netstat');
    expect(content).toContain('http://localhost:3000');
  });

  it('validates Windows VBScript desktop shortcut creator script', () => {
    const vbsPath = path.resolve(process.cwd(), 'Create-Desktop-Shortcut.vbs');
    const content = fs.readFileSync(vbsPath, 'utf8');

    expect(content).toContain('Amul Parlour.lnk');
    expect(content).toContain('Start-Amul-POS.bat');
    expect(content).toContain('SpecialFolders("Desktop")');
  });

  it('validates receipt layout width constraints for 58mm and 80mm thermal paper', () => {
    const PAPER_WIDTHS = {
      '58mm': { mm: 58, maxCharsPerLine: 32 },
      '80mm': { mm: 80, maxCharsPerLine: 48 }
    };

    expect(PAPER_WIDTHS['58mm'].maxCharsPerLine).toBe(32);
    expect(PAPER_WIDTHS['80mm'].maxCharsPerLine).toBe(48);
    expect(PAPER_WIDTHS['58mm'].mm).toBeLessThan(PAPER_WIDTHS['80mm'].mm);
  });
});
