import type { ReactNode } from 'react';
import type { RunwayView } from '../runway-state';
import './evidence-section.css';

type EvidenceSectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
};

type ConduitProps = {
  className?: string;
  d: string;
  id: string;
  signal: 'green' | 'coral';
};

type PacketRailProps = {
  count: number;
  duration: number;
  pathId: string;
  signal: 'green' | 'coral';
};

type CouplerProps = {
  rotate?: number;
  x: number;
  y: number;
};

function Conduit({ className = '', d, id, signal }: ConduitProps) {
  return (
    <g className={`evidence-story__conduit evidence-story__conduit--${signal} ${className}`}>
      <path className="evidence-story__conduit-shadow" d={d} />
      <path className="evidence-story__conduit-metal" d={d} />
      <path className="evidence-story__conduit-cavity" d={d} />
      <path className="evidence-story__conduit-glass" d={d} />
      <path className="evidence-story__conduit-specular" d={d} />
      <path id={id} className="evidence-story__conduit-signal" d={d} />
    </g>
  );
}

function PacketRail({ count, duration, pathId, signal }: PacketRailProps) {
  return (
    <g className={`evidence-story__packets evidence-story__packets--${signal}`}>
      {Array.from({ length: count }, (_, index) => (
        <rect key={`${pathId}-${index}`} width="12" height="2.5" x="-6" y="-1.25">
          <animateMotion
            begin={`${-(duration / count) * index}s`}
            dur={`${duration}s`}
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </rect>
      ))}
    </g>
  );
}

function Coupler({ rotate = 0, x, y }: CouplerProps) {
  return (
    <g className="evidence-story__coupler" transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-21" y="-16" width="42" height="32" rx="3" />
      <path d="M -13 -16 V 16 M -6 -16 V 16 M 6 -16 V 16 M 13 -16 V 16" />
      <path className="evidence-story__coupler-glint" d="M -18 -12 H 18" />
    </g>
  );
}

function ForgeMark() {
  return (
    <span className="evidence-story__forge-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function MedicineLabel({ side }: { side: 'current' | 'upgrade' }) {
  const isCurrent = side === 'current';
  return (
    <div className={`evidence-story__medicine evidence-story__medicine--${side}`} aria-hidden="true">
      <span className="evidence-story__medicine-copy">
        <b>MEDICINE</b>
        <small>100 mg</small>
        <small>30 Tablets</small>
      </span>
      <span className="evidence-story__medicine-cross" />
      <span className="evidence-story__barcode" />
      <strong>EXP: {isCurrent ? 'SEP 05' : 'DEC 01'}</strong>
    </div>
  );
}

function HardwareLabel({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`evidence-story__hardware-label ${className}`} aria-hidden="true">{children}</div>;
}

export default function EvidenceSection({ view, reducedMotion }: EvidenceSectionProps) {
  return (
    <section
      id="evidence"
      className={`evidence-story${reducedMotion ? ' evidence-story--reduced' : ''}`}
      data-runway-phase={view.phase}
      aria-labelledby="evidence-story-title"
      aria-describedby="evidence-story-description"
    >
      <div className="evidence-story__canvas">
        <span className="evidence-story__rule" aria-hidden="true" />

        <div className="evidence-story__copy">
          <span className="evidence-story__eyebrow">02 / EVIDENCE DIFF</span>
          <h2 id="evidence-story-title">Both returned success.<br />Only one did the<br />right thing.</h2>
          <p id="evidence-story-description">
            The upgrade produced the same answer,<br />
            but selected different medicine.<br />
            ForgeCanary compares what actually<br />
            happened—not just what the agent said.
          </p>
          <div className="evidence-story__readout" aria-label="Result: reserved four units. Evidence: lot selection changed.">
            <div><span>RESULT</span><i>/</i><strong>RESERVED 4 UNITS</strong></div>
            <div><span>EVIDENCE</span><i>/</i><strong>LOT SELECTION CHANGED</strong></div>
          </div>
        </div>

        <p className="evidence-story__a11y-description" id="evidence-machine-description">
          Current and Upgrade both reserved 4 units. Current selected the medicine lot expiring 05 Sep,
          so older safe stock ships first. Upgrade selected the lot expiring 01 Dec, so older stock may
          expire unused. The reported outcome matched, but the evidence diverged because lot selection changed.
        </p>

        <div
          className="evidence-story__machine"
          role="img"
          aria-label={`A release request is replayed against current and upgrade versions. Both reserve four units, while evidence reveals a changed medicine lot. Live runway phase: ${view.phase}.`}
          aria-describedby="evidence-machine-description"
        >
          <svg
            className="evidence-story__conduits"
            viewBox="0 0 1672 941"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="evidence-metal" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#88918e" />
                <stop offset="0.18" stopColor="#242b28" />
                <stop offset="0.52" stopColor="#090c0b" />
                <stop offset="0.78" stopColor="#303835" />
                <stop offset="1" stopColor="#69716e" />
              </linearGradient>
              <filter id="evidence-green-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="evidence-coral-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <Conduit id="evidence-top-left" signal="green" d="M 990 176 H 895 C 864 176 844 196 844 225 V 304" />
            <Conduit id="evidence-top-right" signal="green" d="M 1288 176 H 1386 C 1418 176 1436 197 1436 226 V 304" />
            <Conduit id="evidence-bottom-left" signal="green" d="M 844 585 V 615 C 844 636 856 646 878 646 H 1123" />
            <Conduit id="evidence-bottom-right" signal="green" d="M 1435 585 V 615 C 1435 636 1423 646 1401 646 H 1151" />
            <Conduit id="evidence-coral-branch" signal="coral" d="M 1137 646 C 1137 669 1144 683 1144 708 V 752" />

            <g className="evidence-story__couplers">
              <Coupler x={987} y={176} />
              <Coupler x={1291} y={176} />
              <Coupler x={844} y={286} rotate={90} />
              <Coupler x={1436} y={286} rotate={90} />
              <Coupler x={844} y={606} rotate={90} />
              <Coupler x={1435} y={606} rotate={90} />
              <Coupler x={1140} y={730} rotate={90} />
            </g>

            {!reducedMotion && (
              <>
                <PacketRail count={7} duration={0.72} pathId="evidence-top-left" signal="green" />
                <PacketRail count={7} duration={0.72} pathId="evidence-top-right" signal="green" />
                <PacketRail count={10} duration={0.82} pathId="evidence-bottom-left" signal="green" />
                <PacketRail count={10} duration={0.82} pathId="evidence-bottom-right" signal="green" />
                <PacketRail count={4} duration={0.55} pathId="evidence-coral-branch" signal="coral" />
              </>
            )}

            <g className="evidence-story__splitter" transform="translate(1137 646)">
              <circle r="27" />
              <circle r="17" />
              <circle r="5" />
              <path d="M -18 -18 L 18 18 M 18 -18 L -18 18" />
            </g>
          </svg>

          <img
            className="evidence-story__hardware"
            src="/images/runway-sections/evidence/evidence-hardware-plate.png"
            alt=""
            width="1672"
            height="941"
            loading="lazy"
            decoding="async"
          />

          <HardwareLabel className="evidence-story__request-label">
            <ForgeMark />
            <span>AGENT REQUEST</span>
            <strong>RESERVE 4 UNITS</strong>
          </HardwareLabel>
          <HardwareLabel className="evidence-story__version-label evidence-story__version-label--current">
            <span><i />CURRENT</span>
            <strong>RESERVED 4 UNITS</strong>
          </HardwareLabel>
          <HardwareLabel className="evidence-story__version-label evidence-story__version-label--upgrade">
            <span><i />UPGRADE</span>
            <strong>RESERVED 4 UNITS</strong>
          </HardwareLabel>

          <MedicineLabel side="current" />
          <MedicineLabel side="upgrade" />

          <HardwareLabel className="evidence-story__lot-label evidence-story__lot-label--current">
            <span>LOT EXPIRY</span>
            <strong>05 SEP</strong>
            <small>OLDER SAFE STOCK<br />SHIPS FIRST</small>
          </HardwareLabel>
          <HardwareLabel className="evidence-story__lot-label evidence-story__lot-label--upgrade">
            <span>LOT EXPIRY</span>
            <strong>01 DEC</strong>
            <small>OLDER STOCK MAY<br />EXPIRE UNUSED</small>
          </HardwareLabel>
          <HardwareLabel className="evidence-story__diff-label">
            <span>SEMANTIC DIFF</span>
            <strong>SELECTION CHANGED</strong>
          </HardwareLabel>

          <div className="evidence-story__outcome" aria-hidden="true">
            <span>OUTCOME MATCHED</span><i>/</i><strong>EVIDENCE DIVERGED</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
