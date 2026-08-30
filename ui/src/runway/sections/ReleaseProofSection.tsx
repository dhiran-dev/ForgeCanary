import { useState } from 'react';
import type { RunwayView } from '../runway-state';
import { releaseProofRoutePaths } from './release-proof-geometry';
import { deriveReleaseProofState } from './release-proof-state';
import './release-proof-section.css';

type ReleaseProofSectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
  illustrative: boolean;
  trueforgeUrl?: string;
};

type ProofTubeProps = {
  href: string;
  dim?: boolean;
};

function ProofTube({ href, dim = false }: ProofTubeProps) {
  return (
    <g className={`proof-story-tube${dim ? ' proof-story-tube--dim' : ''}`}>
      <use href={href} className="proof-story-tube-occlusion" />
      <use href={href} className="proof-story-tube-shell" />
      <use href={href} className="proof-story-tube-edge" />
      <use href={href} className="proof-story-tube-glass" />
      <use href={href} className="proof-story-tube-channel" />
      <use href={href} className="proof-story-tube-signal" />
      <use href={href} className="proof-story-tube-specular" />
    </g>
  );
}

type ProofPacketProps = {
  route: string;
  duration: number;
  begin?: number;
  small?: boolean;
};

function ProofPacket({ route, duration, begin = 0, small = false }: ProofPacketProps) {
  return (
    <rect
      className={`proof-story-packet${small ? ' proof-story-packet--small' : ''}`}
      x={small ? '-6' : '-8'}
      y={small ? '-1.25' : '-1.5'}
      width={small ? '12' : '16'}
      height={small ? '2.5' : '3'}
    >
      <animateMotion
        dur={`${duration}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        rotate="auto"
        calcMode="linear"
      >
        <mpath href={route} />
      </animateMotion>
    </rect>
  );
}

function ProofCheck({ className = '', verified = true }: { className?: string; verified?: boolean }) {
  return (
    <span
      className={`proof-story-check ${verified ? '' : 'proof-story-check--pending'} ${className}`}
      aria-hidden="true"
    />
  );
}

type ProofActionProps = {
  href?: string;
  label: string;
  variant: 'primary' | 'secondary';
  external?: boolean;
};

function ProofAction({ href, label, variant, external = false }: ProofActionProps) {
  const className = `proof-story-action proof-story-action--${variant}`;

  if (!href) {
    return <button className={className} type="button" disabled>{label}</button>;
  }

  return (
    <a
      className={className}
      href={href}
      data-action
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {label}
    </a>
  );
}

export function ReleaseProofSection({
  view,
  reducedMotion,
  illustrative,
  trueforgeUrl
}: ReleaseProofSectionProps) {
  const [hardwareState, setHardwareState] = useState<'loading' | 'ready' | 'error'>('loading');
  const {
    displayJobs,
    verifiedCells,
    sceneState,
    receiptReady,
    signalIsMoving,
    receiptHeader,
    lede,
    upgradeStatus,
    safetyStatus,
    realityStatus,
    gateLabel,
    figureLabel
  } = deriveReleaseProofState(view, illustrative, reducedMotion);

  return (
    <section
      className={`runway-story-section proof-story proof-story--${sceneState}`}
      id="release-proof"
      aria-labelledby="proof-story-title"
      data-phase={view.phase}
    >
      <span className="proof-story-graph-label">TRUEFORGE / EXECUTION GRAPH</span>
      <div className="runway-story-inner proof-story-inner">
        <div className="runway-story-copy proof-story-copy">
          <span className="runway-story-eyebrow">04 / RELEASE PROOF</span>
          <h2 className="runway-story-title" id="proof-story-title">Every release<br />leaves a receipt.</h2>
          <p className="runway-story-lede">{lede}</p>

          <div className="runway-story-panel proof-story-receipt" aria-label="Release proof receipt">
            <header>
              <span>{receiptHeader}</span>
              <i className={receiptReady ? 'is-ready' : ''} aria-hidden="true" />
            </header>
            <ul>
              <li><ProofCheck verified={receiptReady} /><span>{displayJobs} / 6 ORDERS {receiptReady ? 'CORRECT' : 'OBSERVED'}</span></li>
              <li><ProofCheck verified={receiptReady} /><span>SAME AGENT ANSWERS</span></li>
              <li><ProofCheck verified={receiptReady} /><span>INVENTORY VERIFIED</span></li>
              <li><ProofCheck verified={receiptReady} /><span>NO OUT-OF-SCOPE CHANGE</span></li>
            </ul>
          </div>

          <div className="proof-story-actions">
            <ProofAction href="/studio" label="OPEN FORGECANARY STUDIO" variant="primary" />
            <ProofAction href={trueforgeUrl} label="VIEW TRUEFORGE RUN" variant="secondary" external />
          </div>
        </div>

        <figure className={`runway-story-visual proof-story-scene${hardwareState === 'ready' ? ' is-hardware-ready' : hardwareState === 'error' ? ' is-hardware-error' : ''}`} aria-label={figureLabel}>
          <svg className="runway-story-conduits proof-story-conduits" viewBox="0 0 1672 941" aria-hidden="true">
            <defs>
              <path id="proof-route-current" d={releaseProofRoutePaths.current} />
              <path id="proof-route-upgrade" d={releaseProofRoutePaths.upgrade} />
              <path id="proof-route-safety" d={releaseProofRoutePaths.safety} />
              <path id="proof-route-reality" d={releaseProofRoutePaths.reality} />
              <path id="proof-route-trunk-left" d={releaseProofRoutePaths.trunkLeft} />
              <path id="proof-route-trunk-right" d={releaseProofRoutePaths.trunkRight} />
              <path id="proof-route-drop-1" d={releaseProofRoutePaths.drop1} />
              <path id="proof-route-drop-2" d={releaseProofRoutePaths.drop2} />
              <path id="proof-route-drop-3" d={releaseProofRoutePaths.drop3} />
              <path id="proof-route-drop-4" d={releaseProofRoutePaths.drop4} />
              <path id="proof-route-drop-5" d={releaseProofRoutePaths.drop5} />
              <path id="proof-route-drop-6" d={releaseProofRoutePaths.drop6} />
              <path id="proof-route-outcome" d={releaseProofRoutePaths.outcome} />
            </defs>

            <ProofTube href="#proof-route-current" />
            <ProofTube href="#proof-route-upgrade" />
            <ProofTube href="#proof-route-safety" />
            <ProofTube href="#proof-route-reality" />
            <ProofTube href="#proof-route-trunk-left" />
            <ProofTube href="#proof-route-trunk-right" />
            <ProofTube href="#proof-route-drop-1" />
            <ProofTube href="#proof-route-drop-2" />
            <ProofTube href="#proof-route-drop-3" />
            <ProofTube href="#proof-route-drop-4" />
            <ProofTube href="#proof-route-drop-5" />
            <ProofTube href="#proof-route-drop-6" />
            <ProofTube href="#proof-route-outcome" />

            {signalIsMoving && (
              <g className="proof-story-packets">
                <ProofPacket route="#proof-route-current" duration={0.92} />
                <ProofPacket route="#proof-route-upgrade" duration={0.92} begin={-0.46} />
                <ProofPacket route="#proof-route-safety" duration={0.9} begin={-0.2} />
                <ProofPacket route="#proof-route-reality" duration={0.9} begin={-0.64} />
                <ProofPacket route="#proof-route-trunk-left" duration={1.2} begin={-0.36} />
                <ProofPacket route="#proof-route-trunk-right" duration={1.2} begin={-0.96} />
                <ProofPacket route="#proof-route-drop-1" duration={0.52} begin={-0.08} small />
                <ProofPacket route="#proof-route-drop-2" duration={0.52} begin={-0.16} small />
                <ProofPacket route="#proof-route-drop-3" duration={0.52} begin={-0.24} small />
                <ProofPacket route="#proof-route-drop-4" duration={0.52} begin={-0.32} small />
                <ProofPacket route="#proof-route-drop-5" duration={0.52} begin={-0.4} small />
                <ProofPacket route="#proof-route-drop-6" duration={0.52} begin={-0.48} small />
                <ProofPacket route="#proof-route-outcome" duration={1.45} begin={-0.35} />
                <ProofPacket route="#proof-route-outcome" duration={1.45} begin={-0.83} />
                <ProofPacket route="#proof-route-outcome" duration={1.45} begin={-1.31} />
              </g>
            )}
          </svg>

          <img
            className="runway-story-hardware proof-story-hardware"
            src="/images/runway-sections/proof/hardware-plate.png"
            width="1672"
            height="941"
            loading="eager"
            decoding="async"
            onLoad={() => setHardwareState('ready')}
            onError={() => setHardwareState('error')}
            alt=""
          />

          <div className="runway-story-asset-fallback" role="status">
            <strong>HARDWARE DIAGRAM UNAVAILABLE</strong>
            <span>The proof state remains available in the release summary.</span>
          </div>

          <div className="proof-story-node proof-story-node--current">
            <span className="proof-story-icon proof-story-icon--down" aria-hidden="true">↓</span>
            <div><span>CURRENT REPLAY</span><strong>{displayJobs} ORDERS CHECKED</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--upgrade">
            <span className="proof-story-icon proof-story-icon--up" aria-hidden="true">↑</span>
            <div><span>UPGRADE REPLAY</span><strong>{upgradeStatus}</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--lead">
            <span className="proof-story-lead-mark" aria-hidden="true"><i /><i /><i /></span>
            <div><span>RELEASE LEAD</span><strong><i aria-hidden="true" /></strong></div>
          </div>

          <div className="proof-story-node proof-story-node--safety">
            <span className="proof-story-icon proof-story-icon--shield" aria-hidden="true"><i /></span>
            <div><span>SAFETY REVIEWER</span><strong>{safetyStatus}</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--reality">
            <span className="proof-story-icon proof-story-icon--lock" aria-hidden="true"><i /></span>
            <div><span>REALITY CHECKER</span><strong>{realityStatus}</strong></div>
          </div>

          <div className="proof-story-cells" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span className={index < verifiedCells ? 'is-verified' : 'is-pending'} key={index}>
                <ProofCheck verified={index < verifiedCells} />
                <i />
              </span>
            ))}
          </div>

          <div className={`proof-story-safe-gate${receiptReady ? ' is-ready' : ''}`}>
            <span>{gateLabel.split('\n').map((line, index) => (
              <span key={line}>{index > 0 && <br />}{line}</span>
            ))}</span>
            <i aria-hidden="true" />
          </div>
        </figure>
      </div>
    </section>
  );
}

export default ReleaseProofSection;
