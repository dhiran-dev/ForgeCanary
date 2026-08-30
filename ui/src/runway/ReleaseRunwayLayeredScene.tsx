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

const REPLAY_PATHS = [
  'M 770 386 C 990 386 1260 386 1450 388 C 1510 389 1532 405 1590 419 L 1700 419',
  'M 770 398 C 996 398 1268 398 1446 399 C 1506 400 1534 414 1590 422 L 1700 422',
  'M 770 410 C 1002 410 1276 410 1444 411 C 1502 412 1532 421 1590 425 L 1700 425',
  'M 770 422 C 1008 422 1282 422 1442 423 C 1498 424 1530 428 1590 428 L 1700 428'
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
          {ENTRY_PATHS.map((path, index) => <ParticleStream key={`entry-${index}`} path={path} duration={0.7 + index * 0.025} count={9} reducedMotion={reducedMotion} />)}
          {EXIT_PATHS.map((path, index) => <ParticleStream key={`exit-${index}`} path={path} duration={0.48 + index * 0.02} count={7} reducedMotion={reducedMotion} />)}
          {SAFE_PATHS.map((path, index) => <ParticleStream key={`safe-${index}`} path={path} duration={0.44 + index * 0.018} count={7} reducedMotion={reducedMotion} />)}
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

        <svg className="runway-signal-plane runway-signal-replay" viewBox="0 0 2560 800" preserveAspectRatio="none">
          <defs>
            <mask id="runway-replay-signal-mask">
              <rect x="750" y="245" width="970" height="285" fill="white" />
              {[0, 1, 2, 3, 4, 5].map(index => (
                <rect key={index} x={864 + index * 98} y="282" width="82" height="235" rx="10" fill="black" />
              ))}
            </mask>
          </defs>
          <g mask="url(#runway-replay-signal-mask)">
            {REPLAY_PATHS.map((path, index) => <ParticleStream key={`replay-${index}`} path={path} duration={0.92 + index * 0.025} count={14} dot reducedMotion={reducedMotion} />)}
          </g>
          {changesFound > 0 && <ParticleStream path={CORAL_PATH} duration={0.58} count={8} coral dot reducedMotion={reducedMotion} />}
        </svg>
      </div>
    </div>
  );
}
