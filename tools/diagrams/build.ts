/** Right-of-way diagram questions. The correct answer of every scene is encoded from the rule, never generated.
 *  Each scene renders in three orientations (0, 90, 270 deg) and the 90-degree variant swaps the car letters,
 *  so the correct letter moves. Output: assets/qbank/diagrams/<id>.png, questions.json, contact.png (review sheet).
 *  usage: npx tsx tools/diagrams/build.ts */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as D from "./draw";
import { CX, CY, R, LANE, C, rot, type Pt, type Leg } from "./draw";
const require = createRequire(import.meta.url);

const OUT = path.resolve("assets/qbank/diagrams");
fs.mkdirSync(OUT, { recursive: true });

type Upright = { p: Pt; svg: (p: Pt) => string };
type Drawn = { stat: string; up: Upright[] };
type Variant = { deg: 0 | 90 | 180 | 270; swap: boolean };
type QA = { q_en: string; q_es: string; correct_en: string; correct_es: string; wrong_en: string[]; wrong_es: string[]; ex_en: string; ex_es: string };
type Scene = { id: string; topic: string; draw: (L: (role: 1 | 2) => string) => Drawn; qa: (L: (role: 1 | 2) => string) => QA };

const carPair = (L: (r: 1 | 2) => string) => ({ en: (r: 1 | 2) => `Car ${L(r)}`, es: (r: 1 | 2) => `El auto ${L(r)}` });
const stopAll = (): Upright[] => (["S", "W", "N", "E"] as Leg[]).map((leg) => ({ p: D.signPos(leg), svg: (p) => D.sign("R1-1", p) }));
const carAt = (leg: Leg, role: 1 | 2, L: (r: 1 | 2) => string, color: string, move: "straight" | "left" | "right", id: string, back = 0) => {
  const w = D.waiting(leg, back);
  return { stat: D.pathArrow(D.movePath(leg, move), color, id) + D.car(w.p, w.heading, color), up: [{ p: D.badgePos(leg, back), svg: (p: Pt) => D.badge(p, L(role)) }] };
};

const SCENES: Scene[] = [
  { id: "rw-fourway-right", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("S", 1, L, C.A, "straight", "a"), b = carAt("W", 2, L, C.B, "straight", "b");
      return { stat: D.crossRoads({ stopLines: ["S", "W", "N", "E"] }) + a.stat + b.stat, up: [...stopAll(), ...a.up, ...b.up] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: "Both cars arrive at this four-way stop at the same time. Which car goes first?",
      q_es: "Ambos autos llegan a este alto de cuatro vías al mismo tiempo. ¿Qué auto pasa primero?",
      correct_en: c.en(1), correct_es: c.es(1), wrong_en: [c.en(2), "The larger vehicle", "The driver who honks first"], wrong_es: [c.es(2), "El vehículo más grande", "El conductor que toque la bocina primero"],
      ex_en: `When two cars reach a four-way stop at the same time, the driver on the left yields to the driver on the right. Car ${L(1)} is on Car ${L(2)}'s right, so Car ${L(1)} goes first.`,
      ex_es: `Cuando dos autos llegan a un alto de cuatro vías al mismo tiempo, el conductor de la izquierda cede el paso al de la derecha. El auto ${L(1)} está a la derecha del auto ${L(2)}, así que el auto ${L(1)} pasa primero.` }; } },

  { id: "rw-uncontrolled-right", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("S", 1, L, C.A, "straight", "a"), b = carAt("W", 2, L, C.B, "straight", "b");
      return { stat: D.crossRoads() + a.stat + b.stat, up: [...a.up, ...b.up] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: "There are no signs or signals at this intersection, and both cars arrive at the same time. Which car must yield?",
      q_es: "No hay señales ni semáforos en esta intersección y ambos autos llegan al mismo tiempo. ¿Qué auto debe ceder el paso?",
      correct_en: c.en(2), correct_es: c.es(2), wrong_en: [c.en(1), "Neither, both may go", "The car going faster"], wrong_es: [c.es(1), "Ninguno, ambos pueden pasar", "El auto que va más rápido"],
      ex_en: `At an intersection without signs or signals, yield to the vehicle on your right when you arrive at the same time. Car ${L(1)} is on Car ${L(2)}'s right, so Car ${L(2)} yields.`,
      ex_es: `En una intersección sin señales ni semáforos, cede el paso al vehículo de tu derecha si llegan al mismo tiempo. El auto ${L(1)} está a la derecha del auto ${L(2)}, así que el auto ${L(2)} cede el paso.` }; } },

  { id: "rw-fourway-left-vs-straight", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("S", 1, L, C.A, "straight", "a"), b = carAt("N", 2, L, C.B, "left", "b");
      return { stat: D.crossRoads({ stopLines: ["S", "W", "N", "E"] }) + a.stat + b.stat, up: [...stopAll(), ...a.up, ...b.up] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: `Both cars stop at this four-way stop at the same time. Car ${L(1)} is going straight and Car ${L(2)} is turning left. Which car goes first?`,
      q_es: `Ambos autos se detienen en este alto de cuatro vías al mismo tiempo. El auto ${L(1)} sigue derecho y el auto ${L(2)} gira a la izquierda. ¿Qué auto pasa primero?`,
      correct_en: c.en(1), correct_es: c.es(1), wrong_en: [c.en(2), "Both may go at once", "The car that stopped closer to the line"], wrong_es: [c.es(2), "Ambos pueden pasar a la vez", "El auto que se detuvo más cerca de la línea"],
      ex_en: `When two drivers facing each other arrive together, the driver turning left yields to the driver going straight. Car ${L(1)} goes first.`,
      ex_es: `Cuando dos conductores de frente llegan juntos, el que gira a la izquierda cede el paso al que sigue derecho. El auto ${L(1)} pasa primero.` }; } },

  { id: "rw-green-left-turn", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("N", 1, L, C.A, "straight", "a"), b = carAt("S", 2, L, C.B, "left", "b");
      return { stat: D.crossRoads({ stopLines: ["S", "N", "E", "W"] }) + a.stat + b.stat,
        up: [...a.up, ...b.up, { p: D.signalPos("S"), svg: (p) => D.signal(p, "green") }, { p: D.signalPos("N"), svg: (p) => D.signal(p, "green") }] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: `Both cars have a green light. Car ${L(2)} wants to turn left and Car ${L(1)} is going straight. Who has the right-of-way?`,
      q_es: `Ambos autos tienen luz verde. El auto ${L(2)} quiere girar a la izquierda y el auto ${L(1)} sigue derecho. ¿Quién tiene el derecho de paso?`,
      correct_en: c.en(1), correct_es: c.es(1), wrong_en: [c.en(2), "Neither, both must stop", "The car that entered the intersection first"], wrong_es: [c.es(2), "Ninguno, ambos deben detenerse", "El auto que entró primero a la intersección"],
      ex_en: `On a green light without a green arrow, a driver turning left must yield to oncoming traffic going straight. Car ${L(1)} has the right-of-way.`,
      ex_es: `Con luz verde sin flecha verde, quien gira a la izquierda debe ceder el paso al tráfico de frente que sigue derecho. El auto ${L(1)} tiene el derecho de paso.` }; } },

  { id: "rw-t-intersection", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("W", 1, L, C.A, "straight", "a"), b = carAt("S", 2, L, C.B, "left", "b");
      return { stat: D.tRoads() + a.stat + b.stat, up: [...a.up, ...b.up] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: "There are no signs at this T-intersection. Which car must yield?",
      q_es: "No hay señales en esta intersección en T. ¿Qué auto debe ceder el paso?",
      correct_en: c.en(2), correct_es: c.es(2), wrong_en: [c.en(1), "Neither, the first to move goes", "The car on the left"], wrong_es: [c.es(1), "Ninguno, pasa el primero que avance", "El auto de la izquierda"],
      ex_en: `At a T-intersection without signs or signals, the driver on the road that ends must yield to traffic on the through road. Car ${L(2)} is on the road that ends.`,
      ex_es: `En una intersección en T sin señales ni semáforos, quien está en la calle que termina debe ceder el paso al tráfico de la calle que continúa. El auto ${L(2)} está en la calle que termina.` }; } },

  { id: "rw-two-way-stop", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("E", 1, L, C.A, "straight", "a"), b = carAt("S", 2, L, C.B, "straight", "b");
      return { stat: D.crossRoads({ stopLines: ["S", "N"] }) + a.stat + b.stat,
        up: [...a.up, ...b.up, { p: D.signPos("S"), svg: (p) => D.sign("R1-1", p) }, { p: D.signPos("N"), svg: (p) => D.sign("R1-1", p) }] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: "Only one street at this intersection has stop signs. Which car must yield?",
      q_es: "Solo una de las calles de esta intersección tiene señales de alto. ¿Qué auto debe ceder el paso?",
      correct_en: c.en(2), correct_es: c.es(2), wrong_en: [c.en(1), "The car on the left", "Neither, they arrived together"], wrong_es: [c.es(1), "El auto de la izquierda", "Ninguno, llegaron juntos"],
      ex_en: `Car ${L(2)} faces a stop sign and the cross street has none. It must stop and wait until Car ${L(1)} has passed.`,
      ex_es: `El auto ${L(2)} tiene una señal de alto y la calle transversal no. Debe detenerse y esperar a que pase el auto ${L(1)}.` }; } },

  { id: "rw-roundabout-entry", topic: "Right-of-Way Rules",
    draw: (L) => {
      const ring = 176, a225 = (225 * Math.PI) / 180;
      const pc: Pt = [CX + ring * Math.cos(a225), CY - ring * Math.sin(a225)];
      const pe: Pt = [CX + LANE, CY + 340];
      const circ = `M ${pc[0] + 40} ${pc[1] + 40} A ${ring} ${ring} 0 0 0 ${CX + ring * Math.cos(-Math.PI / 4)} ${CY - ring * Math.sin(-Math.PI / 4)}`;
      const enter = `M ${CX + LANE} ${CY + 272} Q ${CX + 72} ${CY + 196} ${CX + 168} ${CY + 70}`;
      return { stat: D.roundabout() + D.pathArrow(circ, C.A, "a") + D.pathArrow(enter, C.B, "b") + D.car(pc, 135, C.A) + D.car(pe, 0, C.B),
        up: [{ p: [pc[0] - 70, pc[1] + 40], svg: (p) => D.badge(p, L(1)) }, { p: [pe[0] + 82, pe[1] + 50], svg: (p) => D.badge(p, L(2)) },
          ...(["S", "W", "N", "E"] as Leg[]).map((leg) => ({ p: rot([CX + R + 62, CY + 300], D.APPROACH_DEG[leg]), svg: (p: Pt) => D.sign("R1-2", p, 90) }))] };
    },
    qa: (L) => { const c = carPair(L); return {
      q_en: `Car ${L(2)} is entering the roundabout and Car ${L(1)} is already in it. Who has the right-of-way?`,
      q_es: `El auto ${L(2)} está entrando a la glorieta y el auto ${L(1)} ya está dentro. ¿Quién tiene el derecho de paso?`,
      correct_en: c.en(1), correct_es: c.es(1), wrong_en: [c.en(2), "The car on the right", "Whichever car is going faster"], wrong_es: [c.es(2), "El auto de la derecha", "El auto que vaya más rápido"],
      ex_en: `Drivers entering a roundabout must yield to traffic already circulating. Car ${L(1)} is already in the roundabout.`,
      ex_es: `Quien entra a una glorieta debe ceder el paso al tráfico que ya circula en ella. El auto ${L(1)} ya está dentro.` }; } },

  { id: "rw-pedestrian-right-turn", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("S", 1, L, C.A, "right", "a", 34);
      return { stat: D.crossRoads({ stopLines: ["S"], crosswalks: ["E", "S"] }) + a.stat,
        up: [...a.up, { p: D.signalPos("S"), svg: (p) => D.signal(p, "green") }, { p: [CX + R + 13, CY + 30], svg: (p) => D.pedestrian(p) }] }; },
    qa: (L) => ({
      q_en: `Car ${L(1)} is turning right on a green light while a person is crossing the street. Who goes first?`,
      q_es: `El auto ${L(1)} gira a la derecha con luz verde mientras una persona cruza la calle. ¿Quién pasa primero?`,
      correct_en: "The pedestrian", correct_es: "El peatón", wrong_en: [`Car ${L(1)}, because it has a green light`, `Car ${L(1)}, if it honks`, "Whoever started moving first"],
      wrong_es: [`El auto ${L(1)}, porque tiene luz verde`, `El auto ${L(1)}, si toca la bocina`, "Quien empezó a moverse primero"],
      ex_en: "A green light does not give you the right-of-way over people in the crosswalk. When turning, yield to pedestrians crossing the street you are turning into.",
      ex_es: "La luz verde no te da el derecho de paso sobre las personas en el cruce peatonal. Al girar, cede el paso a los peatones que cruzan la calle hacia la que giras." }) },

  { id: "rw-emergency-vehicle", topic: "Sharing the Road",
    draw: (L) => { const pa: Pt = [CX + LANE, CY + 20], pe: Pt = [CX + LANE, CY + 290];
      const pull = `M ${CX + LANE} ${CY - 50} Q ${CX + LANE} ${CY - 170} ${CX + R - 34} ${CY - 260}`;
      return { stat: D.straightRoad() + D.pathArrow(pull, C.A, "a") + D.car(pa, 0, C.A) + D.car(pe, 0, C.B, "ambulance"),
        up: [{ p: [pa[0] - 150, pa[1]], svg: (p) => D.badge(p, L(1)) }] }; },
    qa: (L) => ({
      q_en: `An ambulance with its lights and siren on is coming up behind Car ${L(1)}. What should Car ${L(1)} do?`,
      q_es: `Una ambulancia con luces y sirena encendidas se acerca por detrás del auto ${L(1)}. ¿Qué debe hacer el auto ${L(1)}?`,
      correct_en: "Pull over to the right edge of the road and stop", correct_es: "Orillarse al lado derecho del camino y detenerse",
      wrong_en: ["Speed up to stay ahead of it", "Stop immediately in its lane", "Move into the oncoming lane"], wrong_es: ["Acelerar para mantenerse delante", "Detenerse de inmediato en su carril", "Pasarse al carril contrario"],
      ex_en: "When an emergency vehicle approaches with lights and siren, pull over to the right edge of the road, stop, and stay there until it has passed.",
      ex_es: "Cuando se acerca un vehículo de emergencia con luces y sirena, oríllate al lado derecho del camino, detente y espera a que pase." }) },

  { id: "rw-school-bus-two-lane", topic: "Sharing the Road",
    draw: (L) => { const pb: Pt = [CX + LANE, CY - 20], pa: Pt = [CX + LANE, CY + 320], pc: Pt = [CX - LANE, CY - 360];
      return { stat: D.straightRoad() + D.bus(pb, 0) + D.car(pa, 0, C.A) + D.car(pc, 180, C.B),
        up: [{ p: [pb[0] - 82, pb[1] - 60], svg: (p) => D.sign("R1-1", p, 56) },
          { p: [pa[0] + 120, pa[1]], svg: (p) => D.badge(p, L(1)) }, { p: [pc[0] - 120, pc[1]], svg: (p) => D.badge(p, L(2)) }] }; },
    qa: (L) => ({
      q_en: "The school bus has stopped with red lights flashing and its stop arm out on this two-lane road. Which cars must stop?",
      q_es: "El autobús escolar se detuvo con luces rojas intermitentes y el brazo de alto extendido en este camino de dos carriles. ¿Qué autos deben detenerse?",
      correct_en: `Both Car ${L(1)} and Car ${L(2)}`, correct_es: `Tanto el auto ${L(1)} como el auto ${L(2)}`,
      wrong_en: [`Only Car ${L(1)}`, `Only Car ${L(2)}`, "Neither, if no children are visible"], wrong_es: [`Solo el auto ${L(1)}`, `Solo el auto ${L(2)}`, "Ninguno, si no se ven niños"],
      ex_en: "On a two-lane road, traffic in both directions must stop for a school bus with flashing red lights and an extended stop arm, and stay stopped until the lights turn off.",
      ex_es: "En un camino de dos carriles, el tráfico en ambas direcciones debe detenerse ante un autobús escolar con luces rojas intermitentes y el brazo de alto extendido, hasta que las luces se apaguen." }) },

  { id: "rw-highway-merge", topic: "Lane Usage & Highway Driving",
    draw: (L) => {
      const [x0, y0] = D.RAMP.from, [x1, y1] = D.RAMP.to, f = 0.72;
      const pr: Pt = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], hd = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
      const ph: Pt = [CX + LANE, CY + 40];
      const mergeP = `M ${x1} ${y1 + 40} L ${x1} ${CY - 60} Q ${x1} ${CY - 170} ${CX + LANE + 20} ${CY - 300}`;
      return { stat: D.merge() + D.pathArrow(mergeP, C.B, "b") + D.car(ph, 0, C.A) + D.car(pr, hd, C.B),
        up: [{ p: [ph[0] - 150, ph[1]], svg: (p) => D.badge(p, L(1)) }, { p: [pr[0] - 115, pr[1] - 15], svg: (p) => D.badge(p, L(2)) }] }; },
    qa: (L) => { const c = carPair(L); return {
      q_en: `Car ${L(2)} is on the on-ramp and Car ${L(1)} is in the right lane of the highway. Who must yield?`,
      q_es: `El auto ${L(2)} está en la rampa de entrada y el auto ${L(1)} va en el carril derecho de la autopista. ¿Quién debe ceder el paso?`,
      correct_en: c.en(2), correct_es: c.es(2), wrong_en: [c.en(1), "Neither, they take turns", "The slower car"], wrong_es: [c.es(1), "Ninguno, se turnan", "El auto más lento"],
      ex_en: `Drivers entering a highway must yield to traffic already on it and adjust speed to merge into a safe gap. Car ${L(2)} yields.`,
      ex_es: `Quien entra a una autopista debe ceder el paso al tráfico que ya circula y ajustar su velocidad para incorporarse en un espacio seguro. El auto ${L(2)} cede el paso.` }; } },

  { id: "rw-right-on-red", topic: "Right-of-Way Rules",
    draw: (L) => { const a = carAt("S", 2, L, C.B, "right", "b"), b = carAt("W", 1, L, C.A, "straight", "a");
      return { stat: D.crossRoads({ stopLines: ["S", "W"] }) + a.stat + b.stat,
        up: [...a.up, ...b.up, { p: D.signalPos("S"), svg: (p) => D.signal(p, "red") }, { p: D.signalPos("W"), svg: (p) => D.signal(p, "green") }] }; },
    qa: (L) => ({
      q_en: `Car ${L(2)} has a red light and wants to turn right. Car ${L(1)} has a green light. What must Car ${L(2)} do?`,
      q_es: `El auto ${L(2)} tiene luz roja y quiere girar a la derecha. El auto ${L(1)} tiene luz verde. ¿Qué debe hacer el auto ${L(2)}?`,
      correct_en: `Stop completely and let Car ${L(1)} pass before turning`, correct_es: `Detenerse por completo y dejar pasar al auto ${L(1)} antes de girar`,
      wrong_en: ["Turn right without stopping", `Turn first, because it is closer to the corner`, "Flash its lights and go"], wrong_es: ["Girar a la derecha sin detenerse", "Girar primero, porque está más cerca de la esquina", "Hacer cambio de luces y avanzar"],
      ex_en: `Unless a sign prohibits it, you may turn right on red only after a complete stop and after yielding to cross traffic and pedestrians. Car ${L(1)} has the green light, so Car ${L(2)} waits.`,
      ex_es: `Salvo que una señal lo prohíba, puedes girar a la derecha con luz roja solo después de detenerte por completo y ceder el paso al tráfico transversal y a los peatones. El auto ${L(1)} tiene luz verde, así que el auto ${L(2)} espera.` }) },

  { id: "rw-driveway-exit", topic: "Right-of-Way Rules",
    draw: (L) => { const pa: Pt = [CX, CY + R + 150], pb: Pt = [CX - 380, CY + LANE];
      const out = `M ${CX} ${CY + R + 80} Q ${CX} ${CY + LANE} ${CX + 220} ${CY + LANE}`;
      return { stat: D.driveway() + D.pathArrow(out, C.A, "a") + D.pathArrow(`M ${pb[0] + 70} ${pb[1]} L ${CX - 90} ${pb[1]}`, C.B, "b") + D.car(pa, 0, C.A) + D.car(pb, 90, C.B),
        up: [{ p: [pa[0] + 120, pa[1] + 20], svg: (p) => D.badge(p, L(1)) }, { p: [pb[0], pb[1] + 105], svg: (p) => D.badge(p, L(2)) }, { p: [CX - 150, CY + R + 26], svg: (p) => D.pedestrian(p) }] }; },
    qa: (L) => ({
      q_en: `Car ${L(1)} is pulling out of a driveway. Who must Car ${L(1)} yield to?`,
      q_es: `El auto ${L(1)} está saliendo de una entrada de cochera. ¿A quién debe ceder el paso el auto ${L(1)}?`,
      correct_en: `Both the pedestrian on the sidewalk and Car ${L(2)}`, correct_es: `Tanto al peatón en la acera como al auto ${L(2)}`,
      wrong_en: [`Only Car ${L(2)}`, "Only the pedestrian", "No one, if it signals first"], wrong_es: [`Solo al auto ${L(2)}`, "Solo al peatón", "A nadie, si pone la direccional primero"],
      ex_en: "When entering a road from a driveway or alley, stop before the sidewalk and yield to pedestrians, then yield to all vehicles on the road.",
      ex_es: "Al entrar a una calle desde una cochera o un callejón, detente antes de la acera y cede el paso a los peatones, y luego a todos los vehículos de la calle." }) },
];

/** Orientation candidates in order of preference; a variant is rejected when any badge, sign, signal or pedestrian
 *  lands outside the frame margin, and the next candidate is tried until three variants pass. */
const CANDIDATES = [{ deg: 0, swap: false }, { deg: 90, swap: true }, { deg: 270, swap: false }, { deg: 180, swap: true }] as const;
const MARGIN = 60;
const inFrame = ([x, y]: Pt) => x >= MARGIN && x <= D.W - MARGIN && y >= MARGIN && y <= D.H - MARGIN;

function seeded(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296); }

const rows: any[] = [];
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png")) fs.unlinkSync(path.join(OUT, f));
const svgs: { id: string; svg: string }[] = [];
for (const sc of SCENES) { let kept = 0; for (const v of CANDIDATES) {
  if (kept === 3) break;
  const L = (role: 1 | 2) => (v.swap ? (role === 1 ? "B" : "A") : role === 1 ? "A" : "B");
  const d = sc.draw(L);
  const outside = d.up.map((u) => rot(u.p, v.deg)).filter((p) => !inFrame(p));
  if (outside.length) { console.log(`skip ${sc.id} @${v.deg}: ${outside.length} label(s) outside the frame`); continue; }
  kept++;
  const up = d.up.map((u) => u.svg(rot(u.p, v.deg))).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${D.W}" height="${D.H}" viewBox="0 0 ${D.W} ${D.H}"><rect width="${D.W}" height="${D.H}" fill="${C.ground}"/><g transform="rotate(${v.deg} ${CX} ${CY})">${d.stat}</g>${up}</svg>`;
  const id = `${sc.id}-${v.deg}${v.swap ? "s" : ""}`;
  svgs.push({ id, svg });
  const qa = sc.qa(L), rnd = seeded(id);
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const en = [qa.correct_en, ...qa.wrong_en], es = [qa.correct_es, ...qa.wrong_es];
  const letters = ["A", "B", "C", "D"];
  const answers: Record<string, string> = {}, answers_es: Record<string, string> = {};
  order.forEach((src, i) => { answers[letters[i]] = en[src]; answers_es[letters[i]] = es[src]; });
  rows.push({ id, scene: sc.id, variant: v, category: sc.topic, question_text: qa.q_en, answers, correct_answer: letters[order.indexOf(0)], explanation: qa.ex_en,
    question_text_es: qa.q_es, answers_es, explanation_es: qa.ex_es, image_file: `diagrams/${id}.png`, source: "generated diagram (tools/diagrams)", approved: false });
} }

const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: D.W, height: D.H } });
for (const { id, svg } of svgs) {
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: path.join(OUT, `${id}.png`), clip: { x: 0, y: 0, width: D.W, height: D.H } });
}
fs.writeFileSync(path.join(OUT, "questions.json"), JSON.stringify(rows, null, 1));
// contact sheet for review: 3 columns (one scene per row), caption with the encoded answer
const cells = rows.map((r) => `<div class="c"><img src="file://${path.join(OUT, path.basename(r.image_file))}"/><p><b>${r.id}</b><br/>${r.question_text}<br/><i>Correct ${r.correct_answer}: ${r.answers[r.correct_answer]}</i></p></div>`).join("");
const sheet = await browser.newPage({ viewport: { width: 1500, height: 800 } });
await sheet.setContent(`<html><head><style>body{margin:0;font:13px Inter,Arial;background:#fff}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px}.c img{width:100%;border:1px solid #ccc}.c p{margin:2px 0 6px}</style></head><body><div class="g">${cells}</div></body></html>`, { waitUntil: "load" });
await sheet.screenshot({ path: path.join(OUT, "contact.png"), fullPage: true });
await browser.close();
console.log(`rendered ${svgs.length} diagrams, ${rows.length} questions -> ${OUT}`);
