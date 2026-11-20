import styles from "./landing.module.css";

/*
 * One pencil stroke that wanders in from the left, then traces a small house in axonometric:
 * front wall, side wall, gable, ridge and an arched door, with a short overshoot at the end.
 * Everything is a single path, so the drawing reads as one continuous line, the way an idea gets traced.
 */

type P3 = [number, number, number];

const S = 46; // pixels per unit
const O = { x: 330, y: 238 }; // screen position of the back-left ground corner
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

/** Axonometric (30°) projection: x runs right-down, y runs left-down, z runs up. */
function iso([x, y, z]: P3): [number, number] {
  return [O.x + (x - y) * COS * S, O.y + (x + y) * SIN * S - z * S];
}

/** A tiny, repeatable wobble so straight edges look drawn by hand, not by a ruler. */
function wobble(i: number, amp = 0.9) {
  return Math.sin(i * 12.9898) * amp;
}

const n = (v: number) => Math.round(v * 10) / 10;

// The house: width a (x), depth b (y), wall height h, roof rise r.
const a = 3.2, b = 2.2, h = 1.9, r = 1.15;
const apex = (x: number): P3 => [x, b / 2, h + r];

const arch: P3[] = [];
const doorL = 1.15, doorR = 1.95, doorSpring = 0.95, doorRad = (doorR - doorL) / 2;
arch.push([doorL, b, 0], [doorL, b, doorSpring]);
for (let k = 1; k < 12; k++) {
  const t = Math.PI - (k / 12) * Math.PI;
  arch.push([doorL + doorRad + Math.cos(t) * doorRad, b, doorSpring + Math.sin(t) * doorRad]);
}
arch.push([doorR, b, doorSpring], [doorR, b, 0]);

const house: P3[] = [
  [0, b, 0],
  [0, b, h],
  [a, b, h],
  [a, b, 0],
  [a, 0, 0],
  [a, 0, h],
  apex(a),
  [a, b, h],
  apex(a),
  apex(0),
  [0, b, h],
  [0, b, 0],
  ...arch,
  [a, b, 0],
  [a + 0.7, b, 0], // overshoot past the corner, as architects do
];

const housePts = house.map((p, i) => {
  const [x, y] = iso(p);
  return [x + wobble(i), y + wobble(i + 7)] as [number, number];
});

// The wander: loose loops coming in from the left before the line commits to a form.
const start = housePts[0];
const wander =
  `M 18 150 C 70 92, 128 96, 140 140 ` +
  `S 96 208, 72 178 S 118 104, 182 118 ` +
  `C 236 130, 230 214, 196 222 ` +
  `S 150 176, 196 160 ` +
  `C 240 146, ${n(start[0] - 50)} ${n(start[1] - 40)}, ${n(start[0])} ${n(start[1])}`;

// After the overshoot the line drifts off to the right and lifts.
const end = housePts[housePts.length - 1];
const tail = ` C ${n(end[0] + 30)} ${n(end[1] + 14)}, ${n(end[0] + 70)} ${n(end[1] - 6)}, ${n(end[0] + 96)} ${n(end[1] - 34)}`;

const D = wander + housePts.slice(1).map(([x, y]) => ` L ${n(x)} ${n(y)}`).join("") + tail;

// Faint construction lines that settle in once the form is traced: ground axes through the near corner.
const near = iso([a, b, 0]);
const axisX = iso([a + 2.4, b, 0]);
const axisY = iso([-1.6, b, 0]);
const axisY2 = iso([a, b + 1.6, 0]);
const axisY3 = iso([a, -1.2, 0]);
const guides = [
  `M ${n(axisY[0])} ${n(axisY[1])} L ${n(axisX[0])} ${n(axisX[1])}`,
  `M ${n(axisY2[0])} ${n(axisY2[1])} L ${n(axisY3[0])} ${n(axisY3[1])}`,
  `M ${n(near[0])} ${n(near[1] + 40)} L ${n(near[0])} ${n(iso(apex(a))[1] - 46)}`,
].join(" ");

export function TraceSketch() {
  return (
    <svg className={styles.sketch} viewBox="0 0 640 420" role="img" aria-label="A pencil line wanders, then traces a small house in three dimensions">
      <defs>
        <filter id="graphite" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.6" />
        </filter>
      </defs>
      <path className={styles.guides} d={guides} />
      <g filter="url(#graphite)">
        <path className={`${styles.stroke} ${styles.ghost}`} d={D} pathLength={1} />
        <path className={styles.stroke} d={D} pathLength={1} />
      </g>
      <circle className={styles.tip} r="2.6">
        <animateMotion dur="11s" repeatCount="indefinite" path={D} keyPoints="0;1;1" keyTimes="0;0.62;1" calcMode="linear" />
      </circle>
    </svg>
  );
}
