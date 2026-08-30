import type { RunwayView } from '../runway-state';
import { deriveReplayStoryState, statusCount } from './replay-section-state';
import './replay-section.css';

type ReplaySectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
  illustrative: boolean;
};

type ConduitPathProps = {
  id: string;
  d: string;
  moving: boolean;
  reverse?: boolean;
};

const specialistPaths = [
  { id: 'replay-old-route', d: 'M 619 214 H 690 C 734 214 723 279 785 279' },
  { id: 'replay-upgrade-route', d: 'M 619 493 H 694 C 751 493 724 389 785 389' },
  { id: 'replay-safety-route', d: 'M 1197 279 C 1255 279 1228 208 1305 208', reverse: true },
  { id: 'replay-reality-route', d: 'M 1197 389 C 1256 389 1230 493 1307 493', reverse: true }
] as const;

const cartridgeCenters = [44.8, 49.5, 54.3, 59.1, 63.9, 68.7];

function ConduitPath({ id, d, moving, reverse = false }: ConduitPathProps) {
  return (
    <g className="replay-story__conduit">
      <path className="replay-story__conduit-shell" d={d} />
      <path className="replay-story__conduit-glass" d={d} />
      <path className="replay-story__conduit-void" d={d} />
      <path className="replay-story__conduit-signal" d={d} />
      <path id={id} className="replay-story__motion-guide" d={d} />
      {moving && [0, 1, 2].map(packet => (
        <rect
          className="replay-story__packet"
          key={packet}
          x="-9"
          y="-2"
          width="18"
          height="4"
          rx="1"
        >
          <animateMotion
            begin={`${-packet * 0.47}s`}
            dur="1.42s"
            path={d}
            repeatCount="indefinite"
            rotate={reverse ? 'auto-reverse' : 'auto'}
          />
        </rect>
      ))}
    </g>
  );
}

export default function ReplaySection({ view, reducedMotion, illustrative }: ReplaySectionProps) {
  const {
    completed,
    hasMismatch,
    replayMoving,
    mismatchMoving,
    narrative,
    baselineCompleted,
    upgradeCompleted,
    baselineActive,
    upgradeActive,
    activeStage,
    heldChanges
  } = deriveReplayStoryState(view, illustrative, reducedMotion);

  return (
    <section
      className={`replay-story ${reducedMotion ? 'is-reduced-motion' : ''}`}
      id="replay"
      aria-labelledby="replay-story-title"
    >
      <div className="replay-story__frame">
        <div className="replay-story__copy">
          <span className="replay-story__eyebrow">01 / HOW REPLAY WORKS</span>
          <h2 id="replay-story-title">Your safety team is<br />checking the upgrade.</h2>
          <p>
            ForgeCanary asks TrueForge to launch four specialists. Watch who is working,
            what each is checking, and what they return before anything ships.
          </p>

          <aside
            className="replay-story__live"
            aria-label={illustrative ? 'Illustrative replay activity' : 'Current replay activity'}
            aria-live={illustrative ? undefined : 'polite'}
          >
            <span>{narrative.label}</span>
            <p>{narrative.copy}</p>
          </aside>
        </div>

        <figure className="replay-story__machine" aria-label="Four TrueForge specialists orchestrating a six-job release replay">
          <svg
            className="replay-story__routes replay-story__routes--behind"
            viewBox="0 0 1672 941"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <filter id="replay-story-green-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {specialistPaths.map(path => (
              <ConduitPath
                key={path.id}
                id={path.id}
                d={path.d}
                reverse={'reverse' in path ? path.reverse : false}
                moving={replayMoving}
              />
            ))}
            {[877, 951, 1025, 1097].map((x, index) => (
              <g className="replay-story__drop-line" key={x}>
                <path className="replay-story__conduit-shell" d={`M ${x} 508 V 551`} />
                <path className="replay-story__conduit-glass" d={`M ${x} 508 V 551`} />
                <path className="replay-story__conduit-void" d={`M ${x} 508 V 551`} />
                <path className="replay-story__conduit-signal" d={`M ${x} 508 V 551`} />
                {replayMoving && (
                  <rect className="replay-story__packet" x={x - 7} y="510" width="14" height="4" rx="1">
                    <animate attributeName="y" begin={`${-index * 0.19}s`} dur="0.78s" values="510;545" repeatCount="indefinite" />
                  </rect>
                )}
              </g>
            ))}
          </svg>

          <img
            className="replay-story__hardware"
            src="/images/runway-sections/replay/replay-hardware.png"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />

          <svg
            className="replay-story__routes replay-story__routes--front"
            viewBox="0 0 1672 941"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <mask id="replay-story-cartridge-mask">
                <rect width="1672" height="941" fill="white" />
                {[0, 1, 2, 3, 4, 5].map(index => (
                  <rect key={index} x={716 + index * 80} y="608" width="58" height="160" rx="8" fill="black" />
                ))}
              </mask>
              <filter id="replay-story-coral-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g className="replay-story__rail" mask="url(#replay-story-cartridge-mask)">
              <path className="replay-story__conduit-shell" d="M 593 684 H 1348" />
              <path className="replay-story__conduit-glass" d="M 593 684 H 1348" />
              <path className="replay-story__conduit-void" d="M 593 684 H 1348" />
              <path className="replay-story__conduit-signal" d="M 593 684 H 1348" />
              {replayMoving && [0, 1, 2, 3].map(packet => (
                <rect className="replay-story__packet" key={packet} x="-10" y="-2" width="20" height="4" rx="1">
                  <animateMotion
                    begin={`${-packet * 0.31}s`}
                    dur="1.18s"
                    path="M 593 684 H 1348"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </rect>
              ))}
            </g>
            <g className={`replay-story__mismatch ${hasMismatch ? 'is-detected' : ''}`}>
              <path className="replay-story__mismatch-shell" d="M 1342 684 H 1372 Q 1395 684 1395 712 V 813 H 1415" />
              <path className="replay-story__mismatch-signal" d="M 1342 684 H 1372 Q 1395 684 1395 712 V 813 H 1415" />
              {mismatchMoving && (
                <rect className="replay-story__packet replay-story__packet--coral" x="-9" y="-2" width="18" height="4" rx="1">
                  <animateMotion
                    dur="1.05s"
                    path="M 1342 684 H 1372 Q 1395 684 1395 712 V 813 H 1415"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </rect>
              )}
            </g>
          </svg>

          <div className="replay-story__lead-label" aria-hidden="true">
            <i><b /><b /></i>
            <span>RELEASE LEAD</span>
            <em />
          </div>

          <div className="replay-story__agent-label replay-story__agent-label--old">
            <strong>OLD VERSION REPLAY</strong>
            <span>{statusCount(baselineCompleted, baselineActive)} <i /></span>
          </div>
          <div className="replay-story__agent-label replay-story__agent-label--upgrade">
            <strong>UPGRADE REPLAY</strong>
            <span>{statusCount(upgradeCompleted, upgradeActive)} <i /></span>
          </div>
          <div className="replay-story__agent-label replay-story__agent-label--safety">
            <strong>SAFETY REVIEWER</strong>
            <span>WAITING FOR EVIDENCE <i /></span>
          </div>
          <div className="replay-story__agent-label replay-story__agent-label--reality">
            <strong>REALITY CHECKER</strong>
            <span>INSPECTING INVENTORY <i /></span>
          </div>

          <div className="replay-story__cartridges" aria-label={`${completed} of 6 replay jobs complete`}>
            {cartridgeCenters.map((left, index) => {
              const isComplete = index < completed;
              const isActive = replayMoving && index === Math.min(5, completed);
              return (
                <span
                  className={`${isComplete ? 'is-complete' : ''} ${isActive && completed < 6 ? 'is-active' : ''}`}
                  key={left}
                  style={{ left: `${left}%` }}
                >
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <i />
                </span>
              );
            })}
          </div>

          <div className={`replay-story__held-label ${hasMismatch ? 'is-detected' : ''}`}>
            <i />
            <span>{String(heldChanges).padStart(2, '0')} CHANGE{heldChanges === 1 ? '' : 'S'} HELD</span>
          </div>
        </figure>

        <ol className="replay-story__steps" aria-label="Release check stages">
          {['CURRENT', 'REPLAY', 'COMPARE', 'DECIDE'].map((label, index) => (
            <li key={label} className={index === activeStage ? 'is-active' : ''}>
              <i aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
