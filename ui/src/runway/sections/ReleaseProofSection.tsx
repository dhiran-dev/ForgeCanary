import type { RunwayView } from '../runway-state';
import './release-proof-section.css';

type ReleaseProofSectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
  receiptUrl?: string;
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
      x={small ? '-9' : '-13'}
      y={small ? '-2' : '-2.5'}
      width={small ? '18' : '26'}
      height={small ? '4' : '5'}
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

function ProofCheck({ className = '' }: { className?: string }) {
  return <span className={`proof-story-check ${className}`} aria-hidden="true" />;
}

type ProofActionProps = {
  href?: string;
  label: string;
  variant: 'primary' | 'secondary';
  download?: boolean;
  external?: boolean;
};

function ProofAction({ href, label, variant, download = false, external = false }: ProofActionProps) {
  const className = `proof-story-action proof-story-action--${variant}`;

  if (!href) {
    return <button className={className} type="button" disabled>{label}</button>;
  }

  return (
    <a
      className={className}
      href={href}
      data-action
      download={download || undefined}
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
  receiptUrl,
  trueforgeUrl
}: ReleaseProofSectionProps) {
  const liveJobs = Math.min(6, Math.max(view.jobsReplayed, view.repairedJobs));
  const displayJobs = liveJobs > 0 ? liveJobs : 6;
  const isComplete = view.phase === 'complete';
  const sceneState = isComplete ? 'verified' : view.phase === 'repair' ? 'verifying' : 'canonical';
  const verifiedCells = isComplete ? 6 : view.phase === 'repair' ? view.repairedJobs : 6;
  const signalIsMoving = !reducedMotion && ['ready', 'repair', 'complete'].includes(view.phase);

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
          <p className="runway-story-lede">
            The reviewed repair preserved every expected outcome and changed nothing outside scope.
          </p>

          <div className="runway-story-panel proof-story-receipt" aria-label="Release proof receipt">
            <header>
              <span>PROOF RECEIPT READY</span>
              <i aria-hidden="true" />
            </header>
            <ul>
              <li><ProofCheck /><span>{displayJobs} / 6 ORDERS CORRECT</span></li>
              <li><ProofCheck /><span>SAME AGENT ANSWERS</span></li>
              <li><ProofCheck /><span>INVENTORY VERIFIED</span></li>
              <li><ProofCheck /><span>NO OUT-OF-SCOPE CHANGE</span></li>
            </ul>
          </div>

          <div className="proof-story-actions">
            <ProofAction href={receiptUrl} label="DOWNLOAD RECEIPT" variant="primary" download />
            <ProofAction href={trueforgeUrl} label="VIEW TRUEFORGE RUN" variant="secondary" external />
          </div>
        </div>

        <figure className="proof-story-scene" aria-label="TrueForge execution graph with four approved specialists, six verified outcomes, and a safe-to-ship gate">
          <svg className="runway-story-conduits proof-story-conduits" viewBox="0 0 1672 941" aria-hidden="true">
            <defs>
              <path id="proof-route-current" d="M 796 195 H 842 Q 868 195 868 224 V 284 Q 868 309 895 309 H 915" />
              <path id="proof-route-upgrade" d="M 796 438 H 849 Q 873 438 873 414 V 384 Q 873 361 899 361 H 915" />
              <path id="proof-route-safety" d="M 1182 309 H 1211 Q 1237 309 1237 283 V 224 Q 1237 195 1264 195 H 1293" />
              <path id="proof-route-reality" d="M 1182 361 H 1210 Q 1237 361 1237 387 V 411 Q 1237 438 1264 438 H 1293" />
              <path id="proof-route-trunk-left" d="M 1049 506 V 603 H 611" />
              <path id="proof-route-trunk-right" d="M 1049 506 V 603 H 1418" />
              <path id="proof-route-drop-1" d="M 611 603 H 541 V 652" />
              <path id="proof-route-drop-2" d="M 720 603 V 652" />
              <path id="proof-route-drop-3" d="M 899 603 V 652" />
              <path id="proof-route-drop-4" d="M 1079 603 V 652" />
              <path id="proof-route-drop-5" d="M 1259 603 V 652" />
              <path id="proof-route-drop-6" d="M 1439 603 H 1419 V 652" />
              <path id="proof-route-outcome" d="M 454 720 H 1642" />
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
                <ProofPacket route="#proof-route-current" duration={1.28} />
                <ProofPacket route="#proof-route-upgrade" duration={1.23} begin={-0.46} />
                <ProofPacket route="#proof-route-safety" duration={1.25} begin={-0.2} />
                <ProofPacket route="#proof-route-reality" duration={1.18} begin={-0.72} />
                <ProofPacket route="#proof-route-trunk-left" duration={1.58} begin={-0.36} />
                <ProofPacket route="#proof-route-trunk-right" duration={1.58} begin={-1.15} />
                <ProofPacket route="#proof-route-drop-1" duration={0.62} begin={-0.08} small />
                <ProofPacket route="#proof-route-drop-2" duration={0.62} begin={-0.18} small />
                <ProofPacket route="#proof-route-drop-3" duration={0.62} begin={-0.28} small />
                <ProofPacket route="#proof-route-drop-4" duration={0.62} begin={-0.38} small />
                <ProofPacket route="#proof-route-drop-5" duration={0.62} begin={-0.48} small />
                <ProofPacket route="#proof-route-drop-6" duration={0.62} begin={-0.58} small />
                <ProofPacket route="#proof-route-outcome" duration={1.9} begin={-0.4} />
                <ProofPacket route="#proof-route-outcome" duration={1.9} begin={-1.04} />
                <ProofPacket route="#proof-route-outcome" duration={1.9} begin={-1.67} />
              </g>
            )}
          </svg>

          <img
            className="runway-story-hardware proof-story-hardware"
            src="/images/runway-sections/proof/hardware-plate.png"
            width="1672"
            height="941"
            loading="lazy"
            decoding="async"
            alt=""
          />

          <div className="proof-story-node proof-story-node--current">
            <span className="proof-story-icon proof-story-icon--down" aria-hidden="true">↓</span>
            <div><span>CURRENT REPLAY</span><strong>{displayJobs} ORDERS CHECKED</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--upgrade">
            <span className="proof-story-icon proof-story-icon--up" aria-hidden="true">↑</span>
            <div><span>UPGRADE REPLAY</span><strong>{displayJobs} OF 6 CORRECT</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--lead">
            <span className="proof-story-lead-mark" aria-hidden="true"><i /><i /><i /></span>
            <div><span>RELEASE LEAD</span><strong><i aria-hidden="true" /></strong></div>
          </div>

          <div className="proof-story-node proof-story-node--safety">
            <span className="proof-story-icon proof-story-icon--shield" aria-hidden="true"><i /></span>
            <div><span>SAFETY REVIEWER</span><strong>APPROVED</strong></div>
          </div>

          <div className="proof-story-node proof-story-node--reality">
            <span className="proof-story-icon proof-story-icon--lock" aria-hidden="true"><i /></span>
            <div><span>REALITY CHECKER</span><strong>INVENTORY VERIFIED</strong></div>
          </div>

          <div className="proof-story-cells" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span className={index < verifiedCells ? 'is-verified' : 'is-pending'} key={index}><ProofCheck /><i /></span>
            ))}
          </div>

          <div className="proof-story-safe-gate">
            <span>SAFE TO<br />SHIP</span>
            <i aria-hidden="true" />
          </div>
        </figure>
      </div>
    </section>
  );
}

export default ReleaseProofSection;
