/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * useBarcodeScanner Hook
 * Global keyboard-wedge listener for USB & Bluetooth barcode scanner guns.
 * 
 * Hardware scanners send keystrokes in ultra-fast bursts (< 40ms per char)
 * terminated by an Enter or Tab key.
 * This hook:
 * 1. Accurately detects barcode scanner bursts without interfering with normal typing.
 * 2. Emits an audible POS confirmation beep via Web Audio API.
 * 3. Dispatches the scanned barcode to the caller.
 */

import { useEffect, useRef, useCallback } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minBarcodeLength?: number;
  maxBarcodeLength?: number;
  maxInterKeyDelayMs?: number; // Burst threshold: hardware scanners are < 40ms
  enableAudioBeep?: boolean;
  enabled?: boolean;
}

/**
 * Play a crisp POS scanner confirmation beep (880Hz, 70ms)
 */
export function playScannerBeep(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch POS confirmation beep
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (err) {
    // Non-blocking if audio context is restricted
  }
}

export function useBarcodeScanner({
  onScan,
  minBarcodeLength = 6,
  maxBarcodeLength = 24,
  maxInterKeyDelayMs = 50,
  enableAudioBeep = true,
  enabled = true
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Terminal keys sent by barcode scanners at end of scan
      if (e.key === 'Enter' || e.key === 'Tab') {
        const barcode = bufferRef.current.trim();
        bufferRef.current = '';

        if (barcode.length >= minBarcodeLength && barcode.length <= maxBarcodeLength) {
          // Scanner burst confirmed!
          e.preventDefault();
          e.stopPropagation();

          if (enableAudioBeep) {
            playScannerBeep();
          }

          onScanRef.current(barcode);
        }
        return;
      }

      // Check if keystroke is part of a high-speed scanner burst
      // If time since last key is large, reset buffer (user is typing manually)
      if (timeSinceLastKey > maxInterKeyDelayMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Append printable single characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Auto-truncate if buffer grows unreasonably large
        if (bufferRef.current.length > maxBarcodeLength + 5) {
          bufferRef.current = bufferRef.current.slice(-maxBarcodeLength);
        }
      }
    },
    [enabled, minBarcodeLength, maxBarcodeLength, maxInterKeyDelayMs, enableAudioBeep]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, handleKeyDown]);
}
