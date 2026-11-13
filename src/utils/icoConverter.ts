/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure Browser & Node PNG-to-ICO Converter Utility
 * Builds valid multi-size Windows .ico binary files (containing 32x32, 64x64, and 256x256 PNG frames)
 * directly in the browser using HTMLCanvasElement without external APIs.
 */

export interface IcoFrameInput {
  size: number;
  pngBytes: Uint8Array;
}

export interface ConvertedIcoResult {
  icoBytes: Uint8Array;
  icoBlob: Blob;
  icoDataUrl: string;
  brandLogoPngDataUrl: string;
}

/**
 * Encodes a Uint8Array cleanly to Base64 without stack overflow on large buffers.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Decodes a data URL or raw Base64 string to Uint8Array.
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64Part, 'base64'));
  }
  const binary = atob(base64Part);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Assembles a valid multi-frame Windows .ico binary buffer from PNG-encoded icon frames.
 * Spec: 6-byte ICONDIR header + (N * 16-byte ICONDIRENTRY) + concatenated PNG payloads.
 * Size 256 is encoded as width=0, height=0 per the Microsoft ICO specification.
 */
export function buildIcoFromPngBuffers(frames: IcoFrameInput[]): Uint8Array {
  if (!frames || frames.length === 0) {
    throw new Error('At least one PNG frame is required to build a .ico file.');
  }

  const count = frames.length;
  const headerSize = 6 + count * 16;
  const payloadSize = frames.reduce((sum, frame) => sum + frame.pngBytes.length, 0);
  const buffer = new ArrayBuffer(headerSize + payloadSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // ICONDIR header
  view.setUint16(0, 0, true);     // Reserved (must be 0)
  view.setUint16(2, 1, true);     // Image type: 1 = icon (.ico)
  view.setUint16(4, count, true); // Number of images

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const { size, pngBytes } = frames[i];
    const entryBase = 6 + i * 16;
    const dimByte = size >= 256 ? 0 : size & 0xff;

    view.setUint8(entryBase + 0, dimByte);                  // Width
    view.setUint8(entryBase + 1, dimByte);                  // Height
    view.setUint8(entryBase + 2, 0);                        // Color palette count (0 for >=8bpp)
    view.setUint8(entryBase + 3, 0);                        // Reserved
    view.setUint16(entryBase + 4, 1, true);                 // Color planes
    view.setUint16(entryBase + 6, 32, true);                // Bits per pixel (RGBA)
    view.setUint32(entryBase + 8, pngBytes.length, true);   // Image payload size in bytes
    view.setUint32(entryBase + 12, offset, true);           // Offset from start of file

    out.set(pngBytes, offset);
    offset += pngBytes.length;
  }

  return out;
}

async function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let objectUrl: string | null = null;

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode uploaded image. Please choose a valid PNG, JPG, or WebP file.'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}

async function renderSquarePngBytes(img: HTMLImageElement, targetSize: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available in this browser.');
  }

  ctx.clearRect(0, 0, targetSize, targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Aspect-fit source centered on square canvas cleanly
  const scale = Math.min(targetSize / img.naturalWidth, targetSize / img.naturalHeight);
  const drawW = Math.round(img.naturalWidth * scale);
  const drawH = Math.round(img.naturalHeight * scale);
  const offsetX = Math.floor((targetSize - drawW) / 2);
  const offsetY = Math.floor((targetSize - drawH) / 2);

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error(`Failed to encode ${targetSize}x${targetSize} PNG frame.`));
    }, 'image/png');
  });

  const arr = await blob.arrayBuffer();
  return new Uint8Array(arr);
}

/**
 * Converts a user-uploaded PNG/image File, Blob, or URL into:
 * - A valid multi-size Windows .ico binary Uint8Array / Blob / Base64 data URL (32, 64, 256)
 * - A Cloud-safe sized PNG Base64 data URL (< 350 KB) for Firestore persistence
 */
export async function convertImageToIco(
  source: File | Blob | string,
  sizes: number[] = [32, 64, 256]
): Promise<ConvertedIcoResult> {
  const img = await loadImageElement(source);

  const frames: IcoFrameInput[] = [];
  for (const size of sizes) {
    const pngBytes = await renderSquarePngBytes(img, size);
    frames.push({ size, pngBytes });
  }

  const icoBytes = buildIcoFromPngBuffers(frames);
  const icoArrayBuffer = new ArrayBuffer(icoBytes.byteLength);
  new Uint8Array(icoArrayBuffer).set(icoBytes);
  const icoBlob = new Blob([icoArrayBuffer], { type: 'image/x-icon' });
  const icoDataUrl = `data:image/x-icon;base64,${uint8ArrayToBase64(icoBytes)}`;

  // Build compact PNG data URL for Cloud Firestore doc budget (under 1MB total doc limit)
  let previewPngBytes = await renderSquarePngBytes(img, 256);
  if (icoBytes.length + previewPngBytes.length > 620_000) {
    previewPngBytes = await renderSquarePngBytes(img, 192);
  }
  const brandLogoPngDataUrl = `data:image/png;base64,${uint8ArrayToBase64(previewPngBytes)}`;

  return {
    icoBytes,
    icoBlob,
    icoDataUrl,
    brandLogoPngDataUrl
  };
}

/**
 * Downloads the ready-to-use Windows `.ico` file (`amul-parlour-pos.ico`) cleanly in the browser.
 * Falls back to fetching `./favicon.ico` when no custom cloud `.ico` source is provided.
 */
export async function downloadIcoFile(
  source?: string | Blob | null,
  filename = 'amul-parlour-pos.ico'
): Promise<void> {
  let blob: Blob;

  if (source instanceof Blob) {
    blob = source;
  } else if (typeof source === 'string' && source.trim().startsWith('data:')) {
    const bytes = dataUrlToUint8Array(source.trim());
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    blob = new Blob([buf], { type: 'image/x-icon' });
  } else {
    const targetUrl = (typeof source === 'string' && source.trim()) ? source.trim() : './favicon.ico';
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch Windows desktop icon (${response.status}).`);
    }
    const rawBuf = await response.arrayBuffer();
    blob = new Blob([rawBuf], { type: 'image/x-icon' });
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}

/**
 * Updates browser document head `<link rel="icon">` and `<link rel="apple-touch-icon">`
 * dynamically whenever a cloud-persisted custom brand icon is available.
 */
export function applyDynamicFavicon(icoHref?: string, pngHref?: string): void {
  if (typeof document === 'undefined') return;

  if (icoHref && icoHref.trim()) {
    let icoLink = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/x-icon"]');
    if (!icoLink) {
      icoLink = document.createElement('link');
      icoLink.rel = 'icon';
      icoLink.type = 'image/x-icon';
      document.head.appendChild(icoLink);
    }
    icoLink.href = icoHref.trim();
  }

  if (pngHref && pngHref.trim()) {
    let pngLink = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/png"]');
    if (!pngLink) {
      pngLink = document.createElement('link');
      pngLink.rel = 'icon';
      pngLink.type = 'image/png';
      document.head.appendChild(pngLink);
    }
    pngLink.href = pngHref.trim();

    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleLink) {
      appleLink.href = pngHref.trim();
    }
  }
}
