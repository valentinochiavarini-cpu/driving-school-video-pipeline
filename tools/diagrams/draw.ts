/** SVG primitives for top-down traffic diagrams. 1200x900 canvas, US right-hand traffic, north = up before rotation.
 *  Static geometry (roads, markings, cars, paths) is drawn inside a rotated group; anything with text or a sign
 *  (badges, real MUTCD sign images, signal heads, pedestrians) is placed at the rotated position but kept upright. */
import fs from "node:fs";
import path from "node:path";

export const W = 1200, H = 900, CX = 600, CY = 450;
/** roads extend this far past the canvas so rotated variants still fill the frame */
export const EXT = 500, X0 = -EXT, X1 = W + EXT, Y0 = -EXT, Y1 = H + EXT;
export const R = 130;        // half road width: one 130 px lane each way
export const LANE = 65;      // lane centre offset from the road centre line
export const C = { ground: "#eef2f6", curb: "#cbd5e1", road: "#4b5563", edge: "#f8fafc", yellow: "#facc15", white: "#f8fafc",
  ink: "#0b1a33", A: "#2563eb", B: "#dc2626", C: "#16a34a", D: "#d97706" };

export type Pt = [number, number];
export const rot = ([x, y]: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, dx = x - CX, dy = y - CY;
  return [CX + dx * Math.cos(a) - dy * Math.sin(a), CY + dx * Math.sin(a) + dy * Math.cos(a)];
};

const signCache: Record<string, string> = {};
export function signHref(code: string): string | null {
  if (signCache[code]) return signCache[code];
  // the Commons SVG original when present (sharpest), else the rasterised PNG
  const svg = path.resolve("assets/qbank/signs", `${code}.svg`), png = path.resolve("assets/qbank/signs", `${code}.png`);
  if (fs.existsSync(svg)) return (signCache[code] = `data:image/svg+xml;base64,${fs.readFileSync(svg).toString("base64")}`);
  if (fs.existsSync(png)) return (signCache[code] = `data:image/png;base64,${fs.readFileSync(png).toString("base64")}`);
  return null;
}

/** Real sign image (from Commons) centred at p, upright. Throws if the sign was not fetched: never invent one. */
export function sign(code: string, p: Pt, size = 78): string {
  const href = signHref(code);
  if (!href) throw new Error(`sign ${code} not fetched (assets/qbank/signs). Run tools/signs/fetch.ts ${code}`);
  return `<image href="${href}" x="${p[0] - size / 2}" y="${p[1] - size / 2}" width="${size}" height="${size}"/>`;
}

/** Signal head, upright. lit: "red" | "yellow" | "green" */
export function signal(p: Pt, lit: "red" | "yellow" | "green", scale = 1): string {
  const w = 40 * scale, h = 108 * scale, r = 13 * scale;
  const lamp = (i: number, col: string, on: boolean) =>
    `<circle cx="${p[0]}" cy="${p[1] - h / 2 + 18 * scale + i * 36 * scale}" r="${r}" fill="${on ? col : "#374151"}" ${on ? `stroke="#fff" stroke-width="${2 * scale}"` : ""}/>`;
  return `<g><rect x="${p[0] - w / 2}" y="${p[1] - h / 2}" width="${w}" height="${h}" rx="${8 * scale}" fill="#111827"/>
    ${lamp(0, "#ef4444", lit === "red")}${lamp(1, "#facc15", lit === "yellow")}${lamp(2, "#22c55e", lit === "green")}</g>`;
}

/** Top-down car, front pointing up in local coordinates, centred at origin. */
export function car(p: Pt, heading: number, color: string, kind: "car" | "ambulance" = "car"): string {
  const body = kind === "ambulance" ? "#f8fafc" : color;
  const extra = kind === "ambulance"
    ? `<rect x="-32" y="-8" width="64" height="12" fill="#dc2626"/><rect x="-24" y="-30" width="22" height="9" rx="2" fill="#dc2626"/><rect x="2" y="-30" width="22" height="9" rx="2" fill="#2563eb"/>`
    : "";
  return `<g transform="translate(${p[0]} ${p[1]}) rotate(${heading})">
    <rect x="-36" y="-50" width="8" height="20" rx="3" fill="#111827"/><rect x="28" y="-50" width="8" height="20" rx="3" fill="#111827"/>
    <rect x="-36" y="28" width="8" height="20" rx="3" fill="#111827"/><rect x="28" y="28" width="8" height="20" rx="3" fill="#111827"/>
    <rect x="-32" y="-62" width="64" height="124" rx="18" fill="${body}" stroke="#0f172a" stroke-width="3"/>
    <path d="M -24 -34 L 24 -34 L 19 -14 L -19 -14 Z" fill="#1f2937" opacity=".85"/>
    <path d="M -21 30 L 21 30 L 24 44 L -24 44 Z" fill="#1f2937" opacity=".7"/>
    <rect x="-18" y="-10" width="36" height="36" rx="6" fill="#ffffff" opacity=".18"/>${extra}
    <rect x="-26" y="-60" width="10" height="5" rx="2" fill="#fde68a"/><rect x="16" y="-60" width="10" height="5" rx="2" fill="#fde68a"/>
  </g>`;
}

export function bus(p: Pt, heading: number): string {
  return `<g transform="translate(${p[0]} ${p[1]}) rotate(${heading})">
    <rect x="-40" y="-150" width="80" height="300" rx="14" fill="#facc15" stroke="#0f172a" stroke-width="3"/>
    <rect x="-40" y="-60" width="80" height="6" fill="#111827"/><rect x="-40" y="40" width="80" height="6" fill="#111827"/>
    <path d="M -30 -132 L 30 -132 L 26 -110 L -26 -110 Z" fill="#1f2937" opacity=".85"/>
    <circle cx="-30" cy="-142" r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/><circle cx="30" cy="-142" r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/>
    <circle cx="-30" cy="142" r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/><circle cx="30" cy="142" r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/>
  </g>`;
}

/** Badge with the car's letter, upright */
export function badge(p: Pt, letter: string, fill = C.ink): string {
  return `<g><circle cx="${p[0]}" cy="${p[1]}" r="31" fill="${fill}" stroke="#fff" stroke-width="5"/>
    <text x="${p[0]}" y="${p[1] + 12}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="36" fill="#fff">${letter}</text></g>`;
}

/** Simple standing pedestrian icon, upright */
export function pedestrian(p: Pt): string {
  const [x, y] = p;
  return `<g fill="${C.ink}" stroke="#fff" stroke-width="3" stroke-linejoin="round">
    <circle cx="${x}" cy="${y - 34}" r="11"/>
    <path d="M ${x - 10} ${y - 20} L ${x + 10} ${y - 20} L ${x + 12} ${y + 6} L ${x + 6} ${y + 6} L ${x + 9} ${y + 36} L ${x + 1} ${y + 36} L ${x} ${y + 12} L ${x - 1} ${y + 36} L ${x - 9} ${y + 36} L ${x - 6} ${y + 6} L ${x - 12} ${y + 6} Z"/></g>`;
}

/** Dashed path with arrowhead in the car's colour (drawn in the rotated frame) */
export function pathArrow(d: string, color: string, id: string): string {
  return `<defs><marker id="m${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" stroke="#fff" stroke-width="1"/></marker></defs>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-dasharray="20 14" opacity=".9"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="20 14" marker-end="url(#m${id})"/>`;
}

/* ---------- road layouts (north-up frame) ---------- */

export function crossRoads(opts: { stopLines?: ("S" | "N" | "E" | "W")[]; crosswalks?: ("S" | "N" | "E" | "W")[] } = {}): string {
  const s: string[] = [];
  s.push(`<rect x="${X0}" y="${CY - R}" width="${X1 - X0}" height="${2 * R}" fill="${C.road}"/>`);
  s.push(`<rect x="${CX - R}" y="${Y0}" width="${2 * R}" height="${Y1 - Y0}" fill="${C.road}"/>`);
  // centre lines (double yellow) outside the box
  const dy = (x1: number, y1: number, x2: number, y2: number, vertical: boolean) => vertical
    ? `<line x1="${x1 - 5}" y1="${y1}" x2="${x2 - 5}" y2="${y2}" stroke="${C.yellow}" stroke-width="5"/><line x1="${x1 + 5}" y1="${y1}" x2="${x2 + 5}" y2="${y2}" stroke="${C.yellow}" stroke-width="5"/>`
    : `<line x1="${x1}" y1="${y1 - 5}" x2="${x2}" y2="${y2 - 5}" stroke="${C.yellow}" stroke-width="5"/><line x1="${x1}" y1="${y1 + 5}" x2="${x2}" y2="${y2 + 5}" stroke="${C.yellow}" stroke-width="5"/>`;
  s.push(dy(CX, Y0, CX, CY - R - 20, true), dy(CX, CY + R + 20, CX, Y1, true), dy(X0, CY, CX - R - 20, CY, false), dy(CX + R + 20, CY, X1, CY, false));
  // edge lines
  for (const [x1, y1, x2, y2] of [[X0, CY - R + 6, CX - R, CY - R + 6], [CX + R, CY - R + 6, X1, CY - R + 6], [X0, CY + R - 6, CX - R, CY + R - 6], [CX + R, CY + R - 6, X1, CY + R - 6],
    [CX - R + 6, Y0, CX - R + 6, CY - R], [CX + R - 6, Y0, CX + R - 6, CY - R], [CX - R + 6, CY + R, CX - R + 6, Y1], [CX + R - 6, CY + R, CX + R - 6, Y1]])
    s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.edge}" stroke-width="4"/>`);
  for (const d of opts.stopLines ?? []) s.push(stopLine(d));
  for (const d of opts.crosswalks ?? []) s.push(crosswalk(d));
  return s.join("");
}

/** Stop line across the approach lane of a leg (traffic entering from that side) */
export function stopLine(leg: "S" | "N" | "E" | "W"): string {
  const t = 10, off = R + 26;
  if (leg === "S") return `<rect x="${CX}" y="${CY + off}" width="${R}" height="${t}" fill="${C.white}"/>`;
  if (leg === "N") return `<rect x="${CX - R}" y="${CY - off - t}" width="${R}" height="${t}" fill="${C.white}"/>`;
  if (leg === "W") return `<rect x="${CX - off - t}" y="${CY}" width="${t}" height="${R}" fill="${C.white}"/>`;
  return `<rect x="${CX + off}" y="${CY - R}" width="${t}" height="${R}" fill="${C.white}"/>`;
}

export function crosswalk(leg: "S" | "N" | "E" | "W"): string {
  const s: string[] = []; const n = 7, bw = 2 * R / (2 * n - 1), d0 = R + 4, depth = 18;
  for (let i = 0; i < n; i++) {
    const a = -R + i * 2 * bw;
    if (leg === "E") s.push(`<rect x="${CX + d0}" y="${CY + a}" width="${depth}" height="${bw}" fill="${C.white}"/>`);
    if (leg === "W") s.push(`<rect x="${CX - d0 - depth}" y="${CY + a}" width="${depth}" height="${bw}" fill="${C.white}"/>`);
    if (leg === "N") s.push(`<rect x="${CX + a}" y="${CY - d0 - depth}" width="${bw}" height="${depth}" fill="${C.white}"/>`);
    if (leg === "S") s.push(`<rect x="${CX + a}" y="${CY + d0}" width="${bw}" height="${depth}" fill="${C.white}"/>`);
  }
  return s.join("");
}

/** T-junction: through road west-east, stem from the south */
export function tRoads(): string {
  const s: string[] = [];
  s.push(`<rect x="${X0}" y="${CY - R}" width="${X1 - X0}" height="${2 * R}" fill="${C.road}"/>`);
  s.push(`<rect x="${CX - R}" y="${CY}" width="${2 * R}" height="${Y1 - CY}" fill="${C.road}"/>`);
  s.push(`<line x1="${X0}" y1="${CY - 5}" x2="${X1}" y2="${CY - 5}" stroke="${C.yellow}" stroke-width="5"/><line x1="${X0}" y1="${CY + 5}" x2="${CX - R - 20}" y2="${CY + 5}" stroke="${C.yellow}" stroke-width="5"/><line x1="${CX + R + 20}" y1="${CY + 5}" x2="${X1}" y2="${CY + 5}" stroke="${C.yellow}" stroke-width="5"/>`);
  s.push(`<line x1="${CX - 5}" y1="${CY + R + 20}" x2="${CX - 5}" y2="${Y1}" stroke="${C.yellow}" stroke-width="5"/><line x1="${CX + 5}" y1="${CY + R + 20}" x2="${CX + 5}" y2="${Y1}" stroke="${C.yellow}" stroke-width="5"/>`);
  s.push(`<line x1="${X0}" y1="${CY - R + 6}" x2="${X1}" y2="${CY - R + 6}" stroke="${C.edge}" stroke-width="4"/>`);
  for (const [x1, y1, x2, y2] of [[X0, CY + R - 6, CX - R, CY + R - 6], [CX + R, CY + R - 6, X1, CY + R - 6], [CX - R + 6, CY + R, CX - R + 6, Y1], [CX + R - 6, CY + R, CX + R - 6, Y1]])
    s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.edge}" stroke-width="4"/>`);
  return s.join("");
}

/** Roundabout: island radius 110, ring outer radius 250, four legs */
export function roundabout(): string {
  const s: string[] = [];
  s.push(`<rect x="${X0}" y="${CY - R}" width="${X1 - X0}" height="${2 * R}" fill="${C.road}"/><rect x="${CX - R}" y="${Y0}" width="${2 * R}" height="${Y1 - Y0}" fill="${C.road}"/>`);
  s.push(`<circle cx="${CX}" cy="${CY}" r="250" fill="${C.road}"/>`);
  s.push(`<circle cx="${CX}" cy="${CY}" r="244" fill="none" stroke="${C.edge}" stroke-width="4" stroke-dasharray="1 0"/>`);
  s.push(`<circle cx="${CX}" cy="${CY}" r="110" fill="#bbf7d0" stroke="#e5e7eb" stroke-width="10"/>`);
  // splitter islands on each leg
  for (const a of [0, 90, 180, 270]) s.push(`<g transform="rotate(${a} ${CX} ${CY})"><path d="M ${CX - 14} ${CY + 260} L ${CX + 14} ${CY + 260} L ${CX + 8} ${CY + 440} L ${CX - 8} ${CY + 440} Z" fill="#e5e7eb"/></g>`);
  return s.join("");
}

/** Two-lane one-way highway going north (x CX-R..CX+R), on-ramp from the south-east joining an acceleration lane
 *  (x CX+R..CX+R+130) that tapers back into the right lane. */
export const RAMP = { from: [CX + R + 520, H + 300] as Pt, to: [CX + R + LANE, CY + 150] as Pt };
export function merge(): string {
  const [x0, y0] = RAMP.from, [x1, y1] = RAMP.to;
  return `<rect x="${CX - R}" y="${Y0}" width="${2 * R}" height="${Y1 - Y0}" fill="${C.road}"/>
    <path d="M ${x0} ${y0} L ${x1} ${y1} L ${x1} ${CY - 120}" fill="none" stroke="${C.road}" stroke-width="${2 * LANE}" stroke-linejoin="round"/>
    <path d="M ${CX + R} ${CY - 120} L ${CX + R + 2 * LANE} ${CY - 120} L ${CX + R} ${CY - 300} Z" fill="${C.road}"/>
    <line x1="${CX}" y1="${Y0}" x2="${CX}" y2="${Y1}" stroke="${C.white}" stroke-width="6" stroke-dasharray="40 30"/>
    <line x1="${CX - R + 6}" y1="${Y0}" x2="${CX - R + 6}" y2="${Y1}" stroke="${C.yellow}" stroke-width="5"/>
    <line x1="${CX + R - 6}" y1="${Y0}" x2="${CX + R - 6}" y2="${CY - 300}" stroke="${C.edge}" stroke-width="4"/>
    <line x1="${CX + R}" y1="${CY + 190}" x2="${CX + R}" y2="${CY - 300}" stroke="${C.white}" stroke-width="5" stroke-dasharray="14 12"/>
    <line x1="${CX + R - 6}" y1="${CY + 190}" x2="${CX + R - 6}" y2="${Y1}" stroke="${C.edge}" stroke-width="4"/>
    <line x1="${CX + R + 2 * LANE - 6}" y1="${CY - 120}" x2="${CX + R - 2}" y2="${CY - 300}" stroke="${C.edge}" stroke-width="4"/>`;
}

/** Two-lane road west-east with a driveway and sidewalk on the south side */
export function driveway(): string {
  return `<rect x="${X0}" y="${CY - R}" width="${X1 - X0}" height="${2 * R}" fill="${C.road}"/>
    <rect x="${X0}" y="${CY + R}" width="${X1 - X0}" height="60" fill="#d1d5db"/>
    <rect x="${CX - 70}" y="${CY + R}" width="140" height="${Y1 - CY - R}" fill="#9ca3af"/>
    <line x1="${X0}" y1="${CY - 5}" x2="${X1}" y2="${CY - 5}" stroke="${C.yellow}" stroke-width="5"/><line x1="${X0}" y1="${CY + 5}" x2="${X1}" y2="${CY + 5}" stroke="${C.yellow}" stroke-width="5"/>
    <line x1="${X0}" y1="${CY - R + 6}" x2="${X1}" y2="${CY - R + 6}" stroke="${C.edge}" stroke-width="4"/>`;
}

/** Straight two-lane two-way road north-south */
export function straightRoad(): string {
  return `<rect x="${CX - R}" y="${Y0}" width="${2 * R}" height="${Y1 - Y0}" fill="${C.road}"/>
    <line x1="${CX - 5}" y1="${Y0}" x2="${CX - 5}" y2="${Y1}" stroke="${C.yellow}" stroke-width="5"/><line x1="${CX + 5}" y1="${Y0}" x2="${CX + 5}" y2="${Y1}" stroke="${C.yellow}" stroke-width="5"/>
    <line x1="${CX - R + 6}" y1="${Y0}" x2="${CX - R + 6}" y2="${Y1}" stroke="${C.edge}" stroke-width="4"/><line x1="${CX + R - 6}" y1="${Y0}" x2="${CX + R - 6}" y2="${Y1}" stroke="${C.edge}" stroke-width="4"/>`;
}

/* ---------- approach helpers (north-up frame, car coming from the south heading north, right lane) ---------- */

export const APPROACH_DEG = { S: 0, W: 90, N: 180, E: 270 } as const;
export type Leg = keyof typeof APPROACH_DEG;

/** Car position and heading for a car waiting at the stop line of leg `leg` (in the north-up frame) */
export function waiting(leg: Leg, back = 0): { p: Pt; heading: number } {
  const base: Pt = [CX + LANE, CY + R + 26 + 14 + 62 + back];
  return { p: rot(base, APPROACH_DEG[leg]), heading: APPROACH_DEG[leg] };
}

/** Path from the stop line of `leg`: straight, left or right */
export function movePath(leg: Leg, move: "straight" | "left" | "right"): string {
  const s: Pt = [CX + LANE, CY + R + 30];
  let pts: Pt[];
  if (move === "straight") pts = [s, [CX + LANE, CY - R - 170]];
  else if (move === "right") pts = [s, [CX + LANE, CY + LANE + 10], [CX + R + 40, CY + LANE]];
  else pts = [s, [CX + LANE, CY - LANE + 20], [CX - R - 110, CY - LANE]];
  const p = pts.map((q) => rot(q, APPROACH_DEG[leg]));
  return p.length === 2 ? `M ${p[0][0]} ${p[0][1]} L ${p[1][0]} ${p[1][1]}` : `M ${p[0][0]} ${p[0][1]} Q ${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]}`;
}

/** Upright item positions for a leg: sign on the right-hand corner, badge beside the car */
export const signPos = (leg: Leg): Pt => rot([CX + R + 70, CY + R + 40], APPROACH_DEG[leg]);
export const badgePos = (leg: Leg, back = 0): Pt => rot([CX + LANE + 82, CY + R + 140 + back], APPROACH_DEG[leg]);
export const signalPos = (leg: Leg): Pt => rot([CX + R + 46, CY - R - 120], APPROACH_DEG[leg]);
