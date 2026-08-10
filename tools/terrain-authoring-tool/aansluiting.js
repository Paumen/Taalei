
export const ZIJDEN = ['n', 'o', 'z', 'w'];

export const STAP = { n: [0, -1], o: [1, 0], z: [0, 1], w: [-1, 0] };

export const TEGENOVER = { n: 'z', o: 'w', z: 'n', w: 'o' };

export function draaiVak([u, v], slagen) {
  let [a, b] = [u, v];
  for (let i = 0; i < ((slagen % 4) + 4) % 4; i++) [a, b] = [b, -a];
  return [a, b];
}

export function ontdraaiVak([u, v], slagen) {
  let [a, b] = [u, v];
  for (let i = 0; i < ((slagen % 4) + 4) % 4; i++) [a, b] = [-b, a];
  return [a, b];
}

export class Kit {
  constructor(data) {
    this.data = data;
    this.vak = data.raster.vak;
    this.laagHoogte = data.raster.laag;
    this.modellen = new Map(data.modellen.map((m) => [m.naam, m]));
    this.randen = data.randen;
    this.vlakken = data.vlakken;
  }

  model(naam) {
    const m = this.modellen.get(naam);
    if (!m) throw new Error(`onbekend model: ${naam}`);
    return m;
  }

  vakkenVan(naam, x, z, slagen) {
    const m = this.model(naam);
    const [u0, v0] = m.oorsprong;
    const uit = [];
    for (let u = u0; u < u0 + m.vakken[0]; u++) {
      for (let v = v0; v < v0 + m.vakken[1]; v++) {
        const [du, dv] = draaiVak([u, v], slagen);
        uit.push({ wereld: [x + du, z + dv], lokaal: `${u},${v}` });
      }
    }
    return uit;
  }

  randVan(naam, lokaal, zijde, slagen) {
    const index = (ZIJDEN.indexOf(zijde) + ((slagen % 4) + 4) % 4) % 4;
    return this.model(naam).zijden[ZIJDEN[index]][lokaal] ?? null;
  }

  isOpen(rand) {
    return rand === null || (this.randen[rand] ?? []).length === 0;
  }
}

export class Bouwsel {
  constructor(kit) {
    this.kit = kit;
    this.stukken = new Map();
    this.bezet = new Map();
    this._teller = 0;

    this.noemer = '';
  }

  static sleutel(x, z, laag) {
    return `${x},${z},${laag}`;
  }

  zet({ naam, x, z, laag, slagen = 0, id = null }) {
    if (id === null) id = `s${++this._teller}`;
    const stuk = { id, naam, x, z, laag, slagen: ((slagen % 4) + 4) % 4 };
    this.stukken.set(id, stuk);
    for (const vak of this.kit.vakkenVan(naam, x, z, stuk.slagen)) {
      const sleutel = Bouwsel.sleutel(vak.wereld[0], vak.wereld[1], laag);
      if (!this.bezet.has(sleutel)) this.bezet.set(sleutel, []);
      this.bezet.get(sleutel).push({ id, lokaal: vak.lokaal });
    }
    return stuk;
  }

  haalWeg(id) {
    const stuk = this.stukken.get(id);
    if (!stuk) return false;
    this.stukken.delete(id);
    for (const [sleutel, lijst] of this.bezet) {
      const over = lijst.filter((b) => b.id !== id);
      if (over.length) this.bezet.set(sleutel, over);
      else this.bezet.delete(sleutel);
    }
    return true;
  }

  op(x, z, laag) {
    return this.bezet.get(Bouwsel.sleutel(x, z, laag)) ?? [];
  }

  naarJson() {
    return {
      kit: 'modulair-terrein',
      stukken: [...this.stukken.values()].map(({ naam, x, z, laag, slagen }) => ({ naam, x, z, laag, slagen })),
    };
  }

  static uitJson(kit, json) {
    const bouwsel = new Bouwsel(kit);
    for (const stuk of json.stukken ?? []) bouwsel.zet(stuk);
    return bouwsel;
  }
}


export function naden(bouwsel) {
  const { kit } = bouwsel;
  const uit = [];
  const gezien = new Set();

  const voegToe = (naad) => {
    const merk = naad.delen
      .map((d) => `${d.id}:${d.x},${d.z},${d.laag},${d.zijde ?? 'v'}`)
      .sort().join('|');
    if (gezien.has(merk)) return;
    gezien.add(merk);
    naad.noemer = bouwsel.noemer;
    naad.randen = naad.delen.map((d) => d.rand ?? null);
    naad.slagen = naad.delen.map((d) => d.slagen);
    naad.namen = naad.delen.map((d) => d.naam);
    naad.stukken = naad.delen.map((d) => d.id);
    naad.sleutel = naadSleutel(naad);
    naad.vorm = vormSleutel(naad);
    uit.push(naad);
  };

  const kant = (bewoner, x, z, laag, zijde) => {
    const stuk = bouwsel.stukken.get(bewoner.id);
    return {
      id: bewoner.id,
      naam: stuk.naam,
      slagen: stuk.slagen,
      x, z, laag, zijde,
      rand: kit.randVan(stuk.naam, bewoner.lokaal, zijde, stuk.slagen),
    };
  };

  for (const [sleutel, bewoners] of bouwsel.bezet) {
    const [x, z, laag] = sleutel.split(',').map(Number);

    for (const bewoner of bewoners) {
      const stuk = bouwsel.stukken.get(bewoner.id);

      for (const zijde of ZIJDEN) {
        const [dx, dz] = STAP[zijde];

        for (const buur of bouwsel.op(x + dx, z + dz, laag)) {
          if (buur.id === bewoner.id) continue;
          const hier = kant(bewoner, x, z, laag, zijde);
          const daar = kant(buur, x + dx, z + dz, laag, TEGENOVER[zijde]);
          if (kit.isOpen(hier.rand) && kit.isOpen(daar.rand)) continue;

          voegToe({
            soort: 'zij',
            delen: [hier, daar],
            plek: { x, z, laag, zijde },
          });
        }

        for (const buur of bouwsel.op(x + dx, z + dz, laag + 1)) {
          if (buur.id === bewoner.id) continue;
          const hier = kant(bewoner, x, z, laag, zijde);
          const daar = kant(buur, x + dx, z + dz, laag + 1, TEGENOVER[zijde]);
          if (kit.isOpen(hier.rand) && kit.isOpen(daar.rand)) continue;

          voegToe({
            soort: 'rand',
            delen: [hier, daar],
            plek: { x, z, laag, zijde },
          });
        }
      }

      const bovenId = kit.model(stuk.naam).boven[bewoner.lokaal];
      for (const buur of bouwsel.op(x, z, laag + 1)) {
        if (buur.id === bewoner.id) continue;
        const buurStuk = bouwsel.stukken.get(buur.id);
        const onderId = kit.model(buurStuk.naam).onder[buur.lokaal];
        const leeg = (id) => (kit.vlakken[id] ?? []).length === 0;
        if (leeg(bovenId) && leeg(onderId)) continue;

        voegToe({
          soort: 'stapel',
          delen: [
            { id: bewoner.id, naam: stuk.naam, slagen: stuk.slagen, x, z, laag, vlak: bovenId },
            {
              id: buur.id,
              naam: buurStuk.naam,
              slagen: buurStuk.slagen,
              x,
              z,
              laag: laag + 1,
              vlak: onderId,
            },
          ],
          plek: { x, z, laag, zijde: 'b' },
        });
      }
    }
  }

  return uit;
}

export function naadSleutel(naad) {
  let { x, z, zijde } = naad.plek;
  const { laag } = naad.plek;
  let [eerst, dan] = [0, 1];

  if (zijde === 'n' || zijde === 'w') {
    const [dx, dz] = STAP[zijde];
    x += dx;
    z += dz;
    zijde = TEGENOVER[zijde];
    [eerst, dan] = [1, 0];
  }

  const wie = (i) => `${naad.namen[i]}@${naad.slagen[i] * 90}`;
  return `${naad.noemer ?? ''}|${naad.soort}|${x},${z},${laag},${zijde} ${wie(eerst)}>${wie(dan)}`;
}

export function vormSleutel(naad) {
  return [
    `${naad.namen[0]}@${naad.slagen[0] * 90}`,
    `${naad.namen[1]}@${naad.slagen[1] * 90}`,
  ].sort().join(' + ');
}
