/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Duplicate Product Detection & Resolution Engine
 * Scans products from the live shop inventory and identifies duplicates sharing:
 * - Identical or near-identical names (English & Gujarati)
 * - Identical barcodes
 * - Identical SKUs
 */

import { Product } from '../types/index.ts';

export interface DuplicateGroup {
  id: string;
  title: string;
  matchType: 'BARCODE' | 'SKU' | 'NAME' | 'MULTIPLE';
  reasonLabel: string;
  items: Product[];
  totalStock: number;
  primaryItem: Product;
}

/**
 * Normalizes a product name for fuzzy and exact duplicate comparison.
 * Standardizes units (e.g., 500 ml -> 500ml, 1 kg -> 1kg, 200 gm -> 200g)
 * and strips punctuation/extra spacing.
 */
export function normalizeProductName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .toLowerCase()
    .replace(/[-()[\]{}.,/\\+_]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s*(ml|milli|ltr|liter|litre|l|gm|gram|g|kg|kilo|piece|pc|pouch|pack|cup|cone|tub|tin|bottle|brick)\b/gi, '$1$2')
    .trim();
}

/**
 * Scans a list of shop products and returns grouped duplicates.
 * Each group contains 2 or more products that share the same barcode, SKU, or normalized name.
 */
export function detectDuplicateGroups(products: Product[]): DuplicateGroup[] {
  if (!products || products.length < 2) return [];

  // Adjacency graph to connect products that are duplicates of each other
  const adj = new Map<string, Set<string>>();
  const productMap = new Map<string, Product>();

  for (const p of products) {
    productMap.set(p.id, p);
    if (!adj.has(p.id)) {
      adj.set(p.id, new Set());
    }
  }

  // 1. Group by Barcode
  const barcodeMap = new Map<string, string[]>();
  for (const p of products) {
    const bc = p.barcode ? p.barcode.trim() : '';
    if (bc && bc !== '-' && bc !== '0') {
      const list = barcodeMap.get(bc) || [];
      list.push(p.id);
      barcodeMap.set(bc, list);
    }
  }
  for (const ids of barcodeMap.values()) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          adj.get(ids[i])!.add(ids[j]);
          adj.get(ids[j])!.add(ids[i]);
        }
      }
    }
  }

  // 2. Group by SKU
  const skuMap = new Map<string, string[]>();
  for (const p of products) {
    const sk = p.sku ? p.sku.trim().toLowerCase() : '';
    if (sk && sk !== '-' && sk !== 'na') {
      const list = skuMap.get(sk) || [];
      list.push(p.id);
      skuMap.set(sk, list);
    }
  }
  for (const ids of skuMap.values()) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          adj.get(ids[i])!.add(ids[j]);
          adj.get(ids[j])!.add(ids[i]);
        }
      }
    }
  }

  // 3. Group by Normalized Name
  const nameMap = new Map<string, string[]>();
  for (const p of products) {
    const norm = normalizeProductName(p.name);
    if (norm) {
      const list = nameMap.get(norm) || [];
      list.push(p.id);
      nameMap.set(norm, list);
    }
  }
  for (const ids of nameMap.values()) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          adj.get(ids[i])!.add(ids[j]);
          adj.get(ids[j])!.add(ids[i]);
        }
      }
    }
  }

  // 4. Find connected components (disjoint sets of duplicate products)
  const visited = new Set<string>();
  const rawGroups: Product[][] = [];

  for (const p of products) {
    if (!visited.has(p.id)) {
      const componentIds: string[] = [];
      const queue = [p.id];
      visited.add(p.id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        componentIds.push(curr);
        const neighbors = adj.get(curr) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (componentIds.length > 1) {
        const groupProducts = componentIds
          .map(id => productMap.get(id)!)
          .filter(Boolean);
        rawGroups.push(groupProducts);
      }
    }
  }

  // 5. Structure each DuplicateGroup with diagnostics and primary item recommendation
  return rawGroups.map((groupItems, index) => {
    // Pick the primary keeper item:
    // 1. Highest active stock
    // 2. Has valid barcode
    // 3. Most recently updated
    const sorted = [...groupItems].sort((a, b) => {
      // 1. Active stock preferred
      if ((b.currentStock || 0) !== (a.currentStock || 0)) {
        return (b.currentStock || 0) - (a.currentStock || 0);
      }
      // 2. Valid barcode preferred
      const aHasBarcode = a.barcode && a.barcode.length >= 8 ? 1 : 0;
      const bHasBarcode = b.barcode && b.barcode.length >= 8 ? 1 : 0;
      if (bHasBarcode !== aHasBarcode) {
        return bHasBarcode - aHasBarcode;
      }
      // 3. Recency
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

    const primaryItem = sorted[0];

    // Determine match type
    const sameBarcode = groupItems.some((a, i) => groupItems.some((b, j) => i !== j && a.barcode && a.barcode === b.barcode));
    const sameSku = groupItems.some((a, i) => groupItems.some((b, j) => i !== j && a.sku && a.sku.toLowerCase() === b.sku.toLowerCase()));
    const sameName = groupItems.some((a, i) => groupItems.some((b, j) => i !== j && normalizeProductName(a.name) === normalizeProductName(b.name)));

    let matchType: DuplicateGroup['matchType'] = 'NAME';
    let reasonLabel = 'સરખું નામ / Identical Name';

    const reasons: string[] = [];
    if (sameBarcode) reasons.push('સરખા બારકોડ (Barcode)');
    if (sameSku) reasons.push('સરખો SKU');
    if (sameName) reasons.push('સરખું નામ (Name)');

    if (reasons.length > 1) {
      matchType = 'MULTIPLE';
      reasonLabel = reasons.join(' + ');
    } else if (sameBarcode) {
      matchType = 'BARCODE';
      reasonLabel = 'સરખા બારકોડ / Identical Barcode';
    } else if (sameSku) {
      matchType = 'SKU';
      reasonLabel = 'સરખો SKU / Identical SKU';
    }

    const totalStock = groupItems.reduce((acc, it) => acc + (it.currentStock || 0), 0);

    return {
      id: `dup-group-${index + 1}-${primaryItem.id}`,
      title: primaryItem.name,
      matchType,
      reasonLabel,
      items: sorted,
      totalStock,
      primaryItem
    };
  });
}
