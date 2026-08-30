type MachinePortSide = 'left' | 'right';

function Fastener({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return <span className={`machine-fastener is-${corner}`} aria-hidden="true"><i/></span>;
}

function MachinePort({ side }: { side: MachinePortSide }) {
  const gradientId = `port-metal-${side}`;
  const glassId = `port-glass-${side}`;
  return <svg className={`machine-port is-${side}`} viewBox="0 0 52 30" aria-hidden="true">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d2d6d7"/>
        <stop offset=".16" stopColor="#4c5357"/>
        <stop offset=".42" stopColor="#101417"/>
        <stop offset=".68" stopColor="#767d80"/>
        <stop offset="1" stopColor="#171b1e"/>
      </linearGradient>
      <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8cfff0" stopOpacity=".42"/>
        <stop offset=".25" stopColor="#163c36" stopOpacity=".9"/>
        <stop offset=".74" stopColor="#071512"/>
        <stop offset="1" stopColor="#47d8b3" stopOpacity=".34"/>
      </linearGradient>
    </defs>
    <path className="port-shadow" d="M3 8h39l7 7-7 7H3z"/>
    <path className="port-metal" d="M4 6h37l9 9-9 9H4z" fill={`url(#${gradientId})`}/>
    <rect className="port-collar" x="4" y="5" width="8" height="20" rx="2"/>
    <rect className="port-glass" x="12" y="9" width="31" height="12" rx="6" fill={`url(#${glassId})`}/>
    <path className="port-reflection" d="M15 11.5h25"/>
    <path className="port-signal" d="M15 15h27"/>
  </svg>;
}

export function MachineChassis({ ports }: { ports: MachinePortSide[] }) {
  return <div className="machine-chassis" aria-hidden="true">
    <span className="machine-brush"/>
    <span className="machine-recess"/>
    <Fastener corner="tl"/><Fastener corner="tr"/><Fastener corner="bl"/><Fastener corner="br"/>
    {ports.map(side => <MachinePort side={side} key={side}/>)}
  </div>;
}

