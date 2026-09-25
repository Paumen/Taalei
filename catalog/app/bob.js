const WATERCRAFT = ['obj-transport-watercraft-ship', 'obj-transport-watercraft-boat'];
const AGROUND = ['wreck'];

const DEG = Math.PI / 180;

const BY_TYPE = [
  { match: /speed/, period: 0.7, heave: 0.9, roll: 0.6, pitch: 2.2, heel: 0, pivot: 0.2 },
  { match: /sail/, period: 1.2, heave: 0.8, roll: 1.6, pitch: 0.7, heel: 3, pivot: 0.15 },
  { match: /house/, period: 1.4, heave: 0.5, roll: 0.4, pitch: 0.3, heel: 0, pivot: 0.25 },
  { match: /canoe|row|raft|dinghy/, period: 0.8, heave: 1.3, roll: 1.4, pitch: 1, heel: 0, pivot: 0.3 },
  { match: /ghost/, period: 1.8, heave: 2.2, roll: 0.5, pitch: 0.6, heel: 0, pivot: 0.3 },
  { match: /cargo/, period: 1.3, heave: 0.5, roll: 0.6, pitch: 0.4, heel: 0, pivot: 0.25 },
  { match: /./, period: 1, heave: 1, roll: 1, pitch: 1, heel: 0, pivot: 0.25 },
];

function motion(model) {
  const [w, d, h] = model.wdh ?? [1, 1, 1];
  const length = Math.max(w, d, 0.3);
  const t = BY_TYPE.find((row) => row.match.test(model.name));
  const small = 1 / Math.sqrt(length);
  return {
    alongZ: d >= w,
    period: 1.6 * Math.sqrt(length) * t.period,
    heave: 0.012 * length * small * t.heave,
    roll: 4.5 * small * t.roll * DEG,
    pitch: 2.2 * small * t.pitch * DEG,
    heel: t.heel * DEG,
    pivot: h * t.pivot,
    phase: Math.random() * Math.PI * 2,
  };
}

export function bobs(model) {
  return WATERCRAFT.includes(model.kind) && !AGROUND.some((word) => model.name.includes(word));
}

export function bob(viewer, model, isShown = () => true) {
  if (!bobs(model)) return;
  const m = motion(model);
  const sceneKey = Object.getOwnPropertySymbols(viewer).find((s) => s.description === 'scene');
  if (!sceneKey) return;
  let base = null;

  const step = (now) => {
    if (!viewer.isConnected || !isShown()) return;
    requestAnimationFrame(step);
    const scene = viewer[sceneKey];
    const target = scene?.model;
    if (!viewer.loaded || !target) return;
    base ??= target.position.clone();

    const a = (now / 1000 / m.period) * Math.PI * 2 + m.phase;
    const heave = m.heave * (Math.sin(a) + 0.3 * Math.sin(2.3 * a + 1.1));
    const roll = m.heel + m.roll * (Math.sin(0.83 * a + 0.6) + 0.25 * Math.sin(1.9 * a));
    const pitch = m.pitch * (Math.sin(1.17 * a + 2.1) + 0.2 * Math.sin(2.6 * a + 0.4));

    const [rx, rz] = m.alongZ ? [pitch, roll] : [roll, -pitch];
    target.rotation.set(rx, 0, rz);
    target.position.set(
      base.x + m.pivot * Math.sin(rz),
      base.y + heave + m.pivot * (1 - Math.cos(rx) * Math.cos(rz)),
      base.z - m.pivot * Math.sin(rx),
    );
    scene.queueRender();
  };
  requestAnimationFrame(step);
}
