// A football pitch drawn to real proportions (105 x 68 m) in SVG.
//
// Player positions come from the server in "team view" percentages:
//   x: 0 = left touchline, 100 = right touchline (as the team attacks)
//   y: 0 = own goal line,  100 = opponent's goal line
// This component maps them onto the drawing.

import { Link } from 'react-router-dom';
import styles from './Pitch.module.css';

const LENGTH = 105;
const WIDTH = 68;

export interface PitchMarker {
  key: string;
  x: number;
  y: number;
  /** Text inside the dot: shirt number or role */
  label: string;
  /** Text under the dot */
  caption?: string;
  side?: 'home' | 'away';
  /** Dot radius multiplier (e.g. by number of starts) */
  size?: number;
  href?: string;
  title?: string;
  /** Dashed outline when the position is a guess from the formation */
  approximate?: boolean;
  /** Draw in the accent colour, on top of everything else */
  highlight?: boolean;
}

interface Props {
  orientation: 'vertical' | 'horizontal';
  markers: PitchMarker[];
  /** Read out by screen readers */
  label: string;
}

export function Pitch({ orientation, markers, label }: Props) {
  const vertical = orientation === 'vertical';
  // (L along the pitch, W across it) in metres -> SVG coordinates.
  // The vertical version is a 90° rotation, so arcs keep their direction.
  const map = (l: number, w: number): [number, number] => (vertical ? [w, LENGTH - l] : [l, w]);

  const rect = (l0: number, w0: number, l1: number, w1: number) => {
    const [x0, y0] = map(l0, w0);
    const [x1, y1] = map(l1, w1);
    return <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} />;
  };
  const arc = (l: number, sweep: 0 | 1) => {
    const dy = Math.sqrt(9.15 ** 2 - 5.5 ** 2);
    const [x0, y0] = map(l, WIDTH / 2 - dy);
    const [x1, y1] = map(l, WIDTH / 2 + dy);
    return <path d={`M${x0} ${y0} A9.15 9.15 0 0 ${sweep} ${x1} ${y1}`} />;
  };
  const dot = (l: number, w: number, r = 0.35) => {
    const [cx, cy] = map(l, w);
    return <circle className={styles.spot} cx={cx} cy={cy} r={r} />;
  };

  // Team view -> pitch metres. Vertical pitches show one team attacking up.
  // Horizontal pitches show home attacking right in the left half, away
  // attacking left in the right half.
  const place = (m: PitchMarker): [number, number] => {
    if (vertical) return map(3 + (m.y / 100) * 99, (m.x / 100) * WIDTH);
    const along = 3 + (m.y / 100) * 46;
    return m.side === 'away'
      ? map(LENGTH - along, WIDTH - (m.x / 100) * WIDTH)
      : map(along, (m.x / 100) * WIDTH);
  };

  const [vbW, vbH] = vertical ? [WIDTH, LENGTH] : [LENGTH, WIDTH];
  const stripes = Array.from({ length: 10 }, (_, i) => i).filter((i) => i % 2 === 0);

  return (
    <svg className={styles.pitch} viewBox={`-2 -2 ${vbW + 4} ${vbH + 4}`} role="img" aria-label={label}>
      <rect className={styles.grass} x={-2} y={-2} width={vbW + 4} height={vbH + 4} rx={1.5} />
      <g className={styles.stripe}>{stripes.map((i) => <g key={i}>{rect(i * 10.5, 0, (i + 1) * 10.5, WIDTH)}</g>)}</g>
      <g className={styles.lines}>
        {rect(0, 0, LENGTH, WIDTH)}
        {rect(LENGTH / 2, 0, LENGTH / 2, WIDTH)}
        <circle cx={map(LENGTH / 2, WIDTH / 2)[0]} cy={map(LENGTH / 2, WIDTH / 2)[1]} r={9.15} />
        {rect(0, 13.84, 16.5, 54.16)}
        {rect(LENGTH - 16.5, 13.84, LENGTH, 54.16)}
        {rect(0, 24.84, 5.5, 43.16)}
        {rect(LENGTH - 5.5, 24.84, LENGTH, 43.16)}
        {arc(16.5, 1)}
        {arc(LENGTH - 16.5, 0)}
      </g>
      {dot(LENGTH / 2, WIDTH / 2)}
      {dot(11, WIDTH / 2)}
      {dot(LENGTH - 11, WIDTH / 2)}

      {markers.map((m) => {
        const [cx, cy] = place(m);
        const r = 2.7 * (m.size ?? 1);
        const body = (
          <g
            className={[
              styles.marker,
              m.highlight ? styles.highlight : m.side === 'away' ? styles.away : styles.home,
              m.approximate ? styles.approx : '',
            ].join(' ')}
            transform={`translate(${cx} ${cy})`}
          >
            {m.title && <title>{m.title}</title>}
            <circle r={r} />
            <text className={styles.label} dy="0.36em" style={{ fontSize: Math.min(2.6, r * 0.95) }}>
              {m.label}
            </text>
            {m.caption && (
              <text className={styles.caption} y={r + 2.6}>
                {m.caption}
              </text>
            )}
          </g>
        );
        return m.href ? (
          <Link key={m.key} to={m.href} aria-label={m.title ?? m.caption ?? m.label}>
            {body}
          </Link>
        ) : (
          <g key={m.key}>{body}</g>
        );
      })}
    </svg>
  );
}
