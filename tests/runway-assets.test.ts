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

  it('reveals conduit scenes only after the matching hardware plate loads', () => {
    const prototype = readFileSync(join(process.cwd(), 'ui/src/runway/ReleaseRunwayPrototype.tsx'), 'utf8');
    const runwayStyles = readFileSync(join(process.cwd(), 'ui/src/runway/release-runway.css'), 'utf8');
    const sections = [
      join(process.cwd(), 'ui/src/runway/sections/HumanControlSection.tsx'),
      join(process.cwd(), 'ui/src/runway/sections/ReleaseProofSection.tsx')
    ].map(path => readFileSync(path, 'utf8'));

    expect(prototype).toContain('href="#replay"');
    expect(runwayStyles).toContain('body:has(.runway-page)');
    expect(runwayStyles).toContain('overflow-y: auto');

    for (const source of sections) {
      expect(source).toContain('runway-story-visual');
      expect(source).toContain("hardwareState === 'ready' ? ' is-hardware-ready'");
      expect(source).toContain("hardwareState === 'error' ? ' is-hardware-error'");
      expect(source).toContain('loading="eager"');
      expect(source).toContain("onLoad={() => setHardwareState('ready')}");
      expect(source).toContain("onError={() => setHardwareState('error')}");
    }
  });

  it('keeps the product story at root and the operator workspace at /studio', () => {
    const entry = readFileSync(join(process.cwd(), 'ui/src/main.tsx'), 'utf8');
    const app = readFileSync(join(process.cwd(), 'ui/src/App.tsx'), 'utf8');
    const prototype = readFileSync(join(process.cwd(), 'ui/src/runway/ReleaseRunwayPrototype.tsx'), 'utf8');
    const humanControl = readFileSync(join(process.cwd(), 'ui/src/runway/sections/HumanControlSection.tsx'), 'utf8');
    const releaseProof = readFileSync(join(process.cwd(), 'ui/src/runway/sections/ReleaseProofSection.tsx'), 'utf8');

    expect(entry).toContain("window.location.pathname === '/studio'");
    expect(entry).toContain('!isStudio');
    expect(app).toContain('href="/" ariaLabel="ForgeCanary landing page"');
    expect(prototype).toContain('href="/" ariaLabel="ForgeCanary home"');
    expect(prototype).toContain('className="runway-studio-link" href="/studio"');
    expect(humanControl.match(/href="\/studio"/g)).toHaveLength(2);
    expect(releaseProof).toContain('href="/studio" label="OPEN FORGECANARY STUDIO"');
  });

  it('opens parent-run inspection in a modal without the retention strip', () => {
    const app = readFileSync(join(process.cwd(), 'ui/src/App.tsx'), 'utf8');

    expect(app).toContain('dialog.showModal()');
    expect(app).toContain('className="parent-run-modal"');
    expect(app).toContain('onClick={() => setInspectorOpen(true)}');
    expect(app).not.toContain('className="retention-bar"');
    expect(app).not.toContain('Keep release summary');
  });

  it('renders inspector cards only from spawned jobs and their canonical identities', () => {
    const app = readFileSync(join(process.cwd(), 'ui/src/App.tsx'), 'utf8');

    expect(app).toContain('jobs.map(job =>');
    expect(app).toContain('<strong>{job.orderId}</strong>');
    expect(app).toContain('<dd>{job.replayJobId}</dd>');
    expect(app).not.toContain('const ORDER_IDS');
    expect(app).not.toContain('jobs[index]');
  });

  it('has a safe persistent empty state and compact Studio controls', () => {
    const app = readFileSync(join(process.cwd(), 'ui/src/App.tsx'), 'utf8');
    const server = readFileSync(join(process.cwd(), 'src/evidence-server.ts'), 'utf8');

    expect(app).toContain('className="studio-topbar"');
    expect(app).toContain('<span>Return to empty</span>');
    expect(app).toContain('!currentCase ? <EmptyWorkbench');
    expect(app).toContain('refreshGeneration.current');
    expect(app).toContain("config?.reasoningEffort ?? 'low'");
    expect(server).toContain("url.pathname === '/api/demo/empty'");
    expect(server).toContain('service.store.getVisible()');
  });
});
