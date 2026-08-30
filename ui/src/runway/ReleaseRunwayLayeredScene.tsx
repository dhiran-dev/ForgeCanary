import { useCallback, useRef } from 'react';

const LAYERS = [
  ['pipeline', '/images/runway-layers/forgecanary-runway-pipeline.webp'],
  ['current', '/images/runway-layers/forgecanary-runway-current.webp'],
  ['replay', '/images/runway-layers/forgecanary-runway-replay.webp'],
  ['upgrade', '/images/runway-layers/forgecanary-runway-upgrade.webp'],
  ['decide', '/images/runway-layers/forgecanary-runway-decide.webp']
] as const;

const ENTRY_PATHS = [
  'M 475 388 L 780 388',
  'M 475 400 L 780 400',
  'M 475 412 L 780 412',
  'M 475 424 L 780 424'
];

const EXIT_PATHS = [
  'M 1660 388 L 1810 388',
  'M 1660 400 L 1810 400',
  'M 1660 412 L 1810 412',
  'M 1660 424 L 1810 424'
];

const SAFE_PATHS = [
  'M 2045 388 L 2190 388',
  'M 2045 400 L 2190 400',
  'M 2045 412 L 2190 412',
  'M 2045 424 L 2190 424'
];

const CORAL_PATH = 'M 1418 438 C 1482 438 1510 457 1560 470 L 1680 470';

type StreamProps = {
  path: string;
  duration: number;
  count: number;
  coral?: boolean;
  dot?: boolean;
  reducedMotion: boolean;
};

function ParticleStream({ path, duration, count, coral = false, dot = false, reducedMotion }: StreamProps) {
  if (reducedMotion) return null;
  return (
    <g className={coral ? 'runway-particles coral' : 'runway-particles'}>
      {Array.from({ length: count }, (_, index) => {
        const motion = (
          <animateMotion
            begin={`${-(duration / count) * index}s`}
            dur={`${duration}s`}
            path={path}
            repeatCount="indefinite"
            rotate="auto"
          />
        );
        return dot
          ? <circle key={index} r="1.6">{motion}</circle>
          : <rect key={index} x="-3" y="-1" width="6" height="2" rx="1">{motion}</rect>;
      })}
    </g>
  );
}

type Props = {
  reducedMotion: boolean;
  changesFound: number;
  onReady: () => void;
};

export default function ReleaseRunwayLayeredScene({ reducedMotion, changesFound, onReady }: Props) {
  const loaded = useRef(new Set<string>());
  const readySent = useRef(false);
  const markLoaded = useCallback((source: string) => {
    loaded.current.add(source);
    if (!readySent.current && loaded.current.size === LAYERS.length) {
      readySent.current = true;
      onReady();
    }
  }, [onReady]);

  return (
    <div className="runway-layered-scene" aria-hidden="true">
      <div className="runway-layered-canvas">
        <img
          className="runway-layer runway-layer-pipeline"
          src={LAYERS[0][1]}
          alt=""
          draggable={false}
          onLoad={() => markLoaded(LAYERS[0][1])}
        />

        <svg className="runway-signal-plane runway-signal-exterior" viewBox="0 0 2560 800" preserveAspectRatio="none">
          <defs>
            <filter id="runway-green-glow" x="-80%" y="-250%" width="260%" height="600%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="runway-coral-glow" x="-80%" y="-250%" width="260%" height="600%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {ENTRY_PATHS.map((path, index) => <ParticleStream key={`entry-${index}`} path={path} duration={0.7 + index * 0.025} count={7} reducedMotion={reducedMotion} />)}
          {EXIT_PATHS.map((path, index) => <ParticleStream key={`exit-${index}`} path={path} duration={0.48 + index * 0.02} count={6} reducedMotion={reducedMotion} />)}
          {SAFE_PATHS.map((path, index) => <ParticleStream key={`safe-${index}`} path={path} duration={0.44 + index * 0.018} count={6} reducedMotion={reducedMotion} />)}
        </svg>

        {LAYERS.slice(1).map(([name, source]) => (
          <img
            key={name}
            className={`runway-layer runway-layer-${name}`}
            src={source}
            alt=""
            draggable={false}
            onLoad={() => markLoaded(source)}
          />
        ))}

        {changesFound > 0 && (
          <svg className="runway-signal-plane runway-signal-replay" viewBox="0 0 2560 800" preserveAspectRatio="none">
            <ParticleStream path={CORAL_PATH} duration={0.58} count={6} coral dot reducedMotion={reducedMotion} />
          </svg>
        )}
      </div>
    </div>
  );
}
