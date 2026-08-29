// おさんぽマップの風景。
// 場所ごとに空の色・地面の色・目じるしの絵を変えています。
// 絵を差しかえたいときは、このファイルだけを直せば大丈夫です。

import type { MapSpot } from '../lib/gamification';

interface Props {
  spot: MapSpot;
  /** 高さ（px） */
  height?: number;
  children?: React.ReactNode;
}

export function Scene({ spot, height = 200, children }: Props) {
  const id = `sky-${spot.motif}-${spot.exp}`;
  return (
    <div className="scene" style={{ height }}>
      <svg viewBox="0 0 300 160" preserveAspectRatio="xMidYMax slice" aria-label={spot.name} role="img">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={spot.sky[0]} />
            <stop offset="100%" stopColor={spot.sky[1]} />
          </linearGradient>
        </defs>
        <rect width="300" height="160" fill={`url(#${id})`} />
        <Motif spot={spot} />
        {/* 地面 */}
        <path d="M0 130 q75 -8 150 0 q75 8 150 0 L300 160 L0 160 Z" fill={spot.ground} />
      </svg>
      {children}
    </div>
  );
}

function Motif({ spot }: { spot: MapSpot }) {
  const night = spot.motif === 'night' || spot.motif === 'star';
  return (
    <g>
      {/* 空のかざり */}
      {night ? (
        <>
          {[[40, 30], [80, 18], [130, 36], [190, 22], [240, 40], [270, 16], [160, 12]].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x} ${y - 4} l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z`}
              fill="#fff5cc"
              opacity={0.9}
            />
          ))}
          <circle cx="255" cy="34" r="14" fill="#fdf3d0" />
          <circle cx="249" cy="30" r="12" fill={spot.sky[0]} />
        </>
      ) : (
        <>
          <circle cx="252" cy="32" r="16" fill="#ffe9a8" opacity="0.9" />
          <ellipse cx="70" cy="36" rx="26" ry="11" fill="#fff" opacity="0.85" />
          <ellipse cx="86" cy="30" rx="18" ry="10" fill="#fff" opacity="0.85" />
          <ellipse cx="180" cy="24" rx="20" ry="9" fill="#fff" opacity="0.7" />
        </>
      )}

      {spot.motif === 'house' && (
        <g>
          <rect x="30" y="96" width="46" height="36" fill="#f0e2c8" />
          <path d="M24 98 L53 74 L82 98 Z" fill="#c9705a" />
          <rect x="46" y="112" width="15" height="20" fill="#9c7d55" />
          <rect x="60" y="100" width="12" height="10" fill="#bfe0ef" />
        </g>
      )}
      {spot.motif === 'tree' && (
        <g>
          <rect x="200" y="106" width="8" height="26" fill="#9c7d55" />
          <circle cx="204" cy="98" r="22" fill="#6fae55" />
          <circle cx="188" cy="106" r="14" fill="#7fbc63" />
          <circle cx="220" cy="106" r="14" fill="#7fbc63" />
          <rect x="70" y="114" width="6" height="18" fill="#9c7d55" />
          <circle cx="73" cy="110" r="14" fill="#7fbc63" />
        </g>
      )}
      {spot.motif === 'river' && (
        <g>
          <path d="M0 132 q60 -14 150 0 q90 12 150 -2 L300 160 L0 160Z" fill="#8fc7e8" />
          <path d="M40 138 q14 -5 28 0" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
          <path d="M120 144 q14 -5 28 0" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
          <path d="M210 138 q14 -5 28 0" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
        </g>
      )}
      {spot.motif === 'forest' && (
        <g>
          {[30, 72, 210, 252, 285].map((x, i) => (
            <g key={i}>
              <rect x={x - 3} y="104" width="6" height="28" fill="#8a6b47" />
              <path d={`M${x} 68 L${x + 20} 108 L${x - 20} 108 Z`} fill="#5f9c48" />
              <path d={`M${x} 84 L${x + 24} 124 L${x - 24} 124 Z`} fill="#6fae55" />
            </g>
          ))}
        </g>
      )}
      {spot.motif === 'hill' && (
        <g>
          <path d="M0 130 q60 -40 120 -6 q50 14 90 -10 q50 -28 90 16 L300 160 L0 160Z" fill="#8fc06e" opacity="0.55" />
          <rect x="250" y="86" width="4" height="20" fill="#9c7d55" />
          <circle cx="252" cy="82" r="12" fill="#6fae55" />
        </g>
      )}
      {spot.motif === 'beach' && (
        <g>
          <path d="M0 104 q75 -6 150 0 q75 6 150 0 L300 128 L0 128 Z" fill="#7cc0e0" />
          <path d="M20 118 q12 -5 24 0" stroke="#fff" strokeWidth="2.5" fill="none" />
          <path d="M110 122 q12 -5 24 0" stroke="#fff" strokeWidth="2.5" fill="none" />
          <path d="M210 118 q12 -5 24 0" stroke="#fff" strokeWidth="2.5" fill="none" />
        </g>
      )}
      {spot.motif === 'mountain' && (
        <g>
          <path d="M120 132 L190 52 L260 132 Z" fill="#8f9bb0" />
          <path d="M170 78 L190 52 L212 80 q-20 10 -42 -2z" fill="#fff" />
          <path d="M30 132 L86 68 L142 132 Z" fill="#a3adc0" />
        </g>
      )}
      {spot.motif === 'town' && (
        <g>
          {[[24, 88], [58, 74], [96, 92], [206, 80], [244, 96], [274, 70]].map(([x, y], i) => (
            <g key={i}>
              <rect x={x} y={y} width="26" height={132 - y} fill={i % 2 ? '#e6d9c2' : '#d6c8ae'} />
              <rect x={x + 5} y={y + 8} width="6" height="6" fill="#bfe0ef" />
              <rect x={x + 15} y={y + 8} width="6" height="6" fill="#bfe0ef" />
              <rect x={x + 5} y={y + 22} width="6" height="6" fill="#bfe0ef" />
              <rect x={x + 15} y={y + 22} width="6" height="6" fill="#bfe0ef" />
            </g>
          ))}
        </g>
      )}
      {spot.motif === 'night' && (
        <g>
          <path d="M0 132 q60 -26 120 -4 q60 12 180 -14 L300 160 L0 160Z" fill="#3f5a48" opacity="0.6" />
        </g>
      )}
      {spot.motif === 'star' && (
        <g>
          <path d="M100 100 q50 -46 100 0" stroke="#ffd9a8" strokeWidth="5" fill="none" opacity="0.8" />
          <path d="M100 108 q50 -46 100 0" stroke="#f7b7c8" strokeWidth="5" fill="none" opacity="0.8" />
          <path d="M100 116 q50 -46 100 0" stroke="#bfe0ef" strokeWidth="5" fill="none" opacity="0.8" />
        </g>
      )}
    </g>
  );
}
