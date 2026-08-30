import { describe, expect, it } from 'vitest';
import { releaseProofRoutePaths } from '../ui/src/runway/sections/release-proof-geometry.js';

describe('release proof conduit registration', () => {
  it('lands both lower conduits on the release lead lower socket centers', () => {
    expect(releaseProofRoutePaths.upgrade).toMatch(/Q 873 383 899 383 H 915$/);
    expect(releaseProofRoutePaths.reality).toMatch(/^M 1182 383 H 1210 Q 1237 383/);
  });
});
