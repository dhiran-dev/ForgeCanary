import { useEffect, useId, useState } from 'react';
import './glass-conduit.css';

export type GlassConduitTone = 'green' | 'coral';
export type GlassConduitDirection = 'forward' | 'reverse';

export type GlassConduitProps = {
  /** SVG path data in the coordinate system of the containing SVG. */
  d: string;
  /** Adds a hook for layout-specific positioning without changing conduit internals. */
  className?: string;
  /** Active routes show the narrow signal core and moving data bars. */
  active?: boolean;
  /** Draw the physical tube shell. Disable for a signal travelling through shared conduit structure. */
  structure?: boolean;
  /** Moving packets are reserved for a worker that is actively spawning or running. */
  flowing?: boolean;
  /** Coral is reserved for a held or divergent route. */
  tone?: GlassConduitTone;
  direction?: GlassConduitDirection;
  packetCount?: number;
  duration?: number;
  /** Pass the app-level motion preference when it is already available. */
  reducedMotion?: boolean;
  /** Optional accessible name. Omit it when the conduit is only explanatory decoration. */
  ariaLabel?: string;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

/**
 * A composable SVG group for live worker connections.
 *
 * Render inside an SVG whose viewBox matches `d`. Hardware images should sit
 * above this group so route endpoints disappear cleanly beneath their ports.
 */
export function GlassConduit({
  d,
  className = '',
  active = false,
  structure = true,
  flowing = active,
  tone = 'green',
  direction = 'forward',
  packetCount = 4,
  duration = 1.05,
  reducedMotion,
  ariaLabel
}: GlassConduitProps) {
  const generatedId = useId().replaceAll(':', '');
  const mediaReduced = usePrefersReducedMotion();
  const shouldReduceMotion = mediaReduced || reducedMotion === true;
  const routeId = `fc-glass-conduit-${generatedId}`;
  const metalId = `fc-glass-conduit-metal-${generatedId}`;
  const glassId = `fc-glass-conduit-glass-${generatedId}`;
  const safePacketCount = Math.max(1, Math.min(8, Math.round(packetCount)));
  const safeDuration = Math.max(0.4, duration);
  const classes = [
    'fc-glass-conduit',
    `fc-glass-conduit--${tone}`,
    active ? 'is-active' : 'is-idle',
    flowing ? 'is-flowing' : '',
    shouldReduceMotion ? 'is-reduced-motion' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <g
      className={classes}
      data-state={active ? 'active' : 'idle'}
      data-flowing={flowing ? 'true' : 'false'}
      data-tone={tone}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <defs>
        <linearGradient id={metalId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07090b" />
          <stop offset=".22" stopColor="#5d6468" />
          <stop offset=".38" stopColor="#242a2e" />
          <stop offset=".72" stopColor="#0a0d0f" />
          <stop offset="1" stopColor="#343a3e" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35413e" stopOpacity=".76" />
          <stop offset=".34" stopColor="#0a1111" stopOpacity=".98" />
          <stop offset=".72" stopColor="#101a18" stopOpacity=".98" />
          <stop offset="1" stopColor="#26322f" stopOpacity=".62" />
        </linearGradient>
      </defs>

      {structure && <>
        <path className="fc-glass-conduit__occlusion" d={d} />
        <path className="fc-glass-conduit__housing" d={d} style={{ stroke: `url(#${metalId})` }} />
        <path className="fc-glass-conduit__edge" d={d} />
        <path className="fc-glass-conduit__glass" d={d} style={{ stroke: `url(#${glassId})` }} />
        <path className="fc-glass-conduit__glass-depth" d={d} />
        <path className="fc-glass-conduit__reflection" d={d} transform="translate(0 -1)" />
        <path className="fc-glass-conduit__channel" d={d} />
      </>}
      <path className="fc-glass-conduit__signal-aura" d={d} />
      <path id={routeId} className="fc-glass-conduit__signal" d={d} />

      {active && flowing && !shouldReduceMotion && (
        <g className="fc-glass-conduit__packets" aria-hidden="true">
          {Array.from({ length: safePacketCount }, (_, index) => (
            <rect
              className="fc-glass-conduit__packet"
              key={index}
              x="-4"
              y="-1"
              width="8"
              height="2"
              rx="1"
            >
              <animateMotion
                begin={`${-(safeDuration / safePacketCount) * index}s`}
                dur={`${safeDuration}s`}
                repeatCount="indefinite"
                rotate="auto"
                calcMode="linear"
                keyPoints={direction === 'reverse' ? '1;0' : undefined}
                keyTimes={direction === 'reverse' ? '0;1' : undefined}
              >
                <mpath href={`#${routeId}`} />
              </animateMotion>
            </rect>
          ))}
        </g>
      )}
    </g>
  );
}

export default GlassConduit;
