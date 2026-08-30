import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ASSET_ROOT = join(process.cwd(), 'ui/public/images/runway-sections');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function productionPngs(): string[] {
  return readdirSync(ASSET_ROOT, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
    .map(entry => join(entry.parentPath, entry.name))
    .filter(path => !/(?:blue|chroma|source)/i.test(basename(path)));
}

describe('runway story image plates', () => {
  it('ship as large RGBA PNGs instead of baked backgrounds', () => {
    const assets = productionPngs();
    expect(assets.length).toBeGreaterThan(0);

    for (const asset of assets) {
      const bytes = readFileSync(asset);
      expect(bytes.subarray(0, 8), asset).toEqual(PNG_SIGNATURE);
      expect(bytes.readUInt32BE(16), `${asset} width`).toBeGreaterThanOrEqual(1200);
      expect(bytes.readUInt32BE(20), `${asset} height`).toBeGreaterThanOrEqual(675);
      expect(bytes[25], `${asset} must use PNG color type 6 (RGBA)`).toBe(6);
    }
  });
});
