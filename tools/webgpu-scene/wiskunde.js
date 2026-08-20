/**
 * De 4×4-matrices die de scène nodig heeft, kolomsgewijs opgeslagen zoals WGSL
 * ze leest. Geen bibliotheek: het zijn er zes en ze passen op één bladzijde.
 */

export const eenheid = () =>
  new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

/** a × b, allebei kolomsgewijs. */
export function maal(a, b) {
  const uit = new Float32Array(16);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      uit[kolom * 4 + rij] = som;
    }
  }
  return uit;
}

/** Verschuiving, draaiing (quaternion) en schaal samen, zoals glTF ze levert. */
export function uitTRS(t = [0,0,0], r = [0,0,0,1], s = [1,1,1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}

/** Draaiing om de y-as, in radialen — genoeg om props een kant op te zetten. */
export const draaiY = (hoek) => uitTRS([0,0,0], [0, Math.sin(hoek / 2), 0, Math.cos(hoek / 2)]);

/** Rechtshandige perspectiefmatrix met dieptebereik [0,1], zoals WebGPU wil. */
export function perspectief(fovY, verhouding, dichtbij, veraf) {
  const f = 1 / Math.tan(fovY / 2);
  const bereik = 1 / (dichtbij - veraf);
  return new Float32Array([
    f / verhouding, 0, 0, 0,
    0, f, 0, 0,
    0, 0, veraf * bereik, -1,
    0, 0, veraf * dichtbij * bereik, 0,
  ]);
}

export function kijkNaar(oog, doel, omhoog = [0, 1, 0]) {
  const min = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const kruis = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const punt = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const eenheidsvector = (v) => { const l = Math.hypot(...v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };

  const z = eenheidsvector(min(oog, doel));
  const x = eenheidsvector(kruis(omhoog, z));
  const y = kruis(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -punt(x, oog), -punt(y, oog), -punt(z, oog), 1,
  ]);
}

/**
 * De matrix voor normalen: de inverse-getransponeerde van de bovenste 3×3. Voor
 * een gelijkmatige schaal zou de modelmatrix zelf volstaan, maar sommige nodes
 * in de kits zijn gespiegeld of ongelijk geschaald, en dan wijst de normaal de
 * verkeerde kant op. Teruggegeven als 4×4 omdat een uniform buffer toch op 16
 * floats uitkomt.
 */
export function normaalMatrix(m) {
  const [a00, a01, a02] = [m[0], m[1], m[2]];
  const [a10, a11, a12] = [m[4], m[5], m[6]];
  const [a20, a21, a22] = [m[8], m[9], m[10]];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) return eenheid();
  const d = 1 / det;

  /* de inverse, kolomsgewijs */
  const i = [
    b01 * d, (-a22 * a01 + a02 * a21) * d, (a12 * a01 - a02 * a11) * d,
    b11 * d, (a22 * a00 - a02 * a20) * d, (-a12 * a00 + a02 * a10) * d,
    b21 * d, (-a21 * a00 + a01 * a20) * d, (a11 * a00 - a01 * a10) * d,
  ];
  /* en getransponeerd terug: rij i van de inverse wordt kolom i */
  return new Float32Array([
    i[0], i[3], i[6], 0,
    i[1], i[4], i[7], 0,
    i[2], i[5], i[8], 0,
    0, 0, 0, 1,
  ]);
}
