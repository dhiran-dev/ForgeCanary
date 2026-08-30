import { useState } from 'react';
import type { RunwayView } from '../runway-state';
import { deriveHumanControlState } from './human-control-state';
import './human-control-section.css';

type HumanControlSectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
  illustrative: boolean;
};

type TubeProps = {
  href: string;
  tone?: 'green' | 'coral' | 'dark';
};

function Tube({ href, tone = 'green' }: TubeProps) {
  return (
    <g className={`control-story-tube control-story-tube--${tone}`}>
      <use href={href} className="control-story-tube-occlusion" />
      <use href={href} className="control-story-tube-shell" />
      <use href={href} className="control-story-tube-edge" />
      <use href={href} className="control-story-tube-glass" />
      <use href={href} className="control-story-tube-channel" />
      <use href={href} className="control-story-tube-signal" />
      <use href={href} className="control-story-tube-specular" />
    </g>
  );
}

type PacketProps = {
  route: string;
  tone?: 'green' | 'coral';
  duration: number;
  begin?: number;
};

function Packet({ route, tone = 'green', duration, begin = 0 }: PacketProps) {
  return (
    <rect
      className={`control-story-packet control-story-packet--${tone}`}
      x="-9"
      y="-1.5"
      width="18"
      height="3"
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

function ScreenCheck() {
  return <span className="control-story-screen-check" aria-hidden="true" />;
}

export default function HumanControlSection({ view, reducedMotion, illustrative }: HumanControlSectionProps) {
  const [hardwareState, setHardwareState] = useState<'loading' | 'ready' | 'error'>('loading');
  const {
    mismatchKnown,
    signalIsMoving,
    mismatchIsMoving,
    status,
    lede,
    gateLabel
  } = deriveHumanControlState(view, illustrative, reducedMotion);

  return (
    <section
      className={`runway-story-section control-story control-story--${view.phase} ${mismatchKnown ? 'control-story--mismatch' : 'control-story--clean'}${reducedMotion ? ' control-story--reduced' : ''}`}
      id="human-control"
      aria-labelledby="control-story-title"
      data-phase={view.phase}
    >
      <div className="runway-story-inner control-story-inner">
        <div className="runway-story-copy control-story-copy">
          <span className="runway-story-eyebrow">03 / HUMAN RELEASE CONTROL</span>
          <h2 className="runway-story-title" id="control-story-title">Nothing ships<br />until you decide.</h2>
          <p className="runway-story-lede">{lede}</p>
          <div className="control-story-actions" aria-label="Release decision actions">
            <a
              className="control-story-action control-story-action--primary"
              href="/"
              data-action
              aria-label="Open the operator console and keep the release blocked"
            >
              KEEP BLOCKED
            </a>
            <a
              className="control-story-action control-story-action--secondary"
              href="/"
              data-action
              aria-label="Open the operator console to review the safe fix"
            >
              REVIEW SAFE FIX
            </a>
          </div>
          <p className="control-story-production-status">
            <i aria-hidden="true" />
            <span>NO CHANGE HAS REACHED PRODUCTION</span>
          </p>
          <span className="control-story-live-state" aria-live="polite" aria-atomic="true">{status}</span>
        </div>

        <figure className={`runway-story-visual control-story-scene${hardwareState === 'ready' ? ' is-hardware-ready' : hardwareState === 'error' ? ' is-hardware-error' : ''}`} aria-label="Current and upgrade outcomes held at a closed human-controlled release gate">
          <svg className="runway-story-conduits control-story-conduits" viewBox="0 0 1672 941" aria-hidden="true">
            <defs>
              <path id="control-route-request-current" d="M 946 139 H 886 Q 860 139 860 166 V 248" />
              <path id="control-route-request-upgrade" d="M 1349 139 H 1399 Q 1422 139 1422 166 V 248" />
              <path id="control-route-current-gate" d="M 859 496 V 521 Q 859 548 889 548 H 1018 Q 1046 548 1046 590" />
              <path id="control-route-upgrade-gate" d="M 1402 496 V 521 Q 1402 548 1372 548 H 1225 Q 1198 548 1198 590" />
              <path id="control-route-production" d="M 1303 742 H 1672" />
            </defs>

            <Tube href="#control-route-request-current" />
            <Tube href="#control-route-request-upgrade" tone="coral" />
            <Tube href="#control-route-current-gate" />
            <Tube href="#control-route-upgrade-gate" tone="coral" />
            <Tube href="#control-route-production" tone="dark" />

            {signalIsMoving && (
              <g className="control-story-packets">
                <Packet route="#control-route-request-current" duration={0.92} />
                <Packet route="#control-route-request-current" duration={0.92} begin={-0.46} />
                <Packet route="#control-route-current-gate" duration={0.82} begin={-0.2} />
                <Packet route="#control-route-current-gate" duration={0.82} begin={-0.61} />
                {mismatchIsMoving && (
                  <>
                    <Packet route="#control-route-request-upgrade" tone="coral" duration={0.92} begin={-0.3} />
                    <Packet route="#control-route-upgrade-gate" tone="coral" duration={0.82} begin={-0.41} />
                  </>
                )}
              </g>
            )}

            <g className="control-story-static-signals">
              <circle className="control-story-signal control-story-signal--green" cx="1129" cy="175" r="6" />
              <circle className="control-story-signal control-story-signal--green" cx="956" cy="392" r="6" />
              <circle className="control-story-signal control-story-signal--coral" cx="1474" cy="392" r="6" />
              <circle className="control-story-signal control-story-signal--coral" cx="1122" cy="665" r="6" />
            </g>
          </svg>

          <img
            className="runway-story-hardware control-story-hardware"
            src="/images/runway-sections/control/hardware-plate.png"
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
            <span>The release remains held for an operator decision.</span>
          </div>

          <div className="control-story-screen control-story-screen--request">
            <span>AGENT REQUEST</span>
            <strong>NEED 4 UNITS</strong>
            <i className="control-story-led" aria-hidden="true" />
          </div>

          <div className="control-story-screen control-story-screen--current">
            <span>CURRENT</span>
            <strong>RESERVED 4 UNITS</strong>
            <b>EXP SEP 05</b>
            <ScreenCheck />
            <i className="control-story-led" aria-hidden="true" />
          </div>

          <div className={`control-story-screen control-story-screen--upgrade${mismatchKnown ? '' : ' control-story-screen--muted'}`}>
            <span>UPGRADE</span>
            <strong>RESERVED 4 UNITS</strong>
            <b>EXP DEC 01</b>
            <ScreenCheck />
            <i className="control-story-led control-story-led--coral" aria-hidden="true" />
          </div>

          <div className="control-story-screen control-story-screen--gate">
            <span>{gateLabel}</span>
            <i className={`control-story-led${mismatchKnown ? ' control-story-led--coral' : ''}`} aria-hidden="true" />
          </div>
        </figure>
      </div>
    </section>
  );
}
