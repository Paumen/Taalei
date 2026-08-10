
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
    this._gedraaid = new Map();
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

  vlakSleutel(id, slagen) {
    const r = ((slagen % 4) + 4) % 4;
    const cache = `${id}@${r}`;
    if (this._gedraaid.has(cache)) return this._gedraaid.get(cache);

    const draai = ([a, b]) => {
      let [p, q] = [a, b];
      for (let i = 0; i < r; i++) [p, q] = [q, -p];
      return [Number(p.toFixed(3)), Number(q.toFixed(3))];
    };

    const stukken = (this.vlakken[id] ?? []).map(([a1, b1, a2, b2]) => {
      const p = draai([a1, b1]);
      const q = draai([a2, b2]);
      return (p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])) ? [...p, ...q] : [...q, ...p];
    });
    stukken.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);

    const sleutel = JSON.stringify(stukken);
    this._gedraaid.set(cache, sleutel);
    return sleutel;
  }

  isOpen(rand) {
    return rand === null || (this.randen[rand]?.vorm ?? []).length === 0;
  }

  sluitAan(rand, buurRand) {
    if (rand === null || buurRand === null) return false;
    return this.randen[rand]?.spiegel === buurRand;
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

export const ERNST = { fout: 'fout', waarschuwing: 'waarschuwing' };

export function controleer(bouwsel) {
  const { kit } = bouwsel;
  const meldingen = [];
  const gezien = new Set();

  const naamVan = (id) => bouwsel.stukken.get(id).naam;

  for (const [sleutel, bewoners] of bouwsel.bezet) {
    const [x, z, laag] = sleutel.split(',').map(Number);

    for (const bewoner of bewoners) {
      const stuk = bouwsel.stukken.get(bewoner.id);

      for (const zijde of ZIJDEN) {
        const [dx, dz] = STAP[zijde];
        const buren = bouwsel.op(x + dx, z + dz, laag);
        if (buren.length !== 1) continue;
        const buur = buren[0];
        if (buur.id === bewoner.id) continue;

        const naadSleutel = [
          `${x},${z},${laag},${zijde}`,
          `${x + dx},${z + dz},${laag},${TEGENOVER[zijde]}`,
        ].sort().join('|');
        if (gezien.has(naadSleutel)) continue;
        gezien.add(naadSleutel);

        const hier = kit.randVan(stuk.naam, bewoner.lokaal, zijde, stuk.slagen);
        const buurStuk = bouwsel.stukken.get(buur.id);
        const daar = kit.randVan(buurStuk.naam, buur.lokaal, TEGENOVER[zijde], buurStuk.slagen);

        if (kit.sluitAan(hier, daar)) continue;
        if (kit.isOpen(hier) && kit.isOpen(daar)) continue;

        meldingen.push({
          soort: 'naad',
          ernst: ERNST.waarschuwing,
          tekst: kit.isOpen(hier) || kit.isOpen(daar)
            ? `${naamVan(bewoner.id)} en ${naamVan(buur.id)}: de één heeft hier niets, de ander wel`
            : `${naamVan(bewoner.id)} en ${naamVan(buur.id)}: randen ${hier} en ${daar} passen niet op elkaar`,
          stukken: [bewoner.id, buur.id],
          plek: { x, z, laag, zijde, randen: [hier, daar] },
        });
      }

      const onderId = kit.model(stuk.naam).onder[bewoner.lokaal];
      const heeftOnderkant = (kit.vlakken[onderId] ?? []).length > 0;
      const onderSleutel = heeftOnderkant ? kit.vlakSleutel(onderId, stuk.slagen) : null;

      if (laag > 0 && heeftOnderkant) {
        const onder = bouwsel.op(x, z, laag - 1);
        if (onder.length === 0) {
          meldingen.push({
            soort: 'zwevend',
            ernst: ERNST.fout,
            tekst: `${naamVan(bewoner.id)} zweeft: niets eronder op laag ${laag - 1}`,
            stukken: [bewoner.id],
            plek: { x, z, laag },
          });
        } else {
          for (const drager of onder) {
            const dragerStuk = bouwsel.stukken.get(drager.id);
            const bovenId = kit.model(dragerStuk.naam).boven[drager.lokaal];
            if (kit.vlakSleutel(bovenId, dragerStuk.slagen) === onderSleutel) continue;
            meldingen.push({
              soort: 'stapel',
              ernst: ERNST.waarschuwing,
              tekst: `${naamVan(bewoner.id)} staat niet vlak op ${naamVan(drager.id)}`,
              stukken: [bewoner.id, drager.id],
              plek: { x, z, laag },
            });
          }
        }
      }
    }
  }

  const perPlek = new Map();
  for (const stuk of bouwsel.stukken.values()) {
    const sleutel = `${stuk.naam}@${stuk.x},${stuk.z},${stuk.laag},${stuk.slagen}`;
    if (!perPlek.has(sleutel)) perPlek.set(sleutel, []);
    perPlek.get(sleutel).push(stuk.id);
  }
  for (const ids of perPlek.values()) {
    if (ids.length < 2) continue;
    const stuk = bouwsel.stukken.get(ids[0]);
    meldingen.push({
      soort: 'dubbel',
      ernst: ERNST.waarschuwing,
      tekst: `${stuk.naam} staat hier ${ids.length}× bovenop zichzelf`,
      stukken: ids,
      plek: { x: stuk.x, z: stuk.z, laag: stuk.laag },
    });
  }

  for (const stuk of bouwsel.stukken.values()) {
    const model = kit.model(stuk.naam);
    if (!model.trap) continue;
    const vakken = kit.vakkenVan(stuk.naam, stuk.x, stuk.z, stuk.slagen);
    const trapOnder = new Set();
    const trapBoven = new Set();
    for (const vak of vakken) {
      for (const b of bouwsel.op(vak.wereld[0], vak.wereld[1], stuk.laag - 1)) {
        trapOnder.add(kit.model(naamVan(b.id)).trap);
      }
      for (const b of bouwsel.op(vak.wereld[0], vak.wereld[1], stuk.laag + 1)) {
        trapBoven.add(kit.model(naamVan(b.id)).trap);
      }
    }

    const meld = (tekst) => meldingen.push({
      soort: 'trap',
      ernst: ERNST.waarschuwing,
      tekst: `${stuk.naam}: ${tekst}`,
      stukken: [stuk.id],
      plek: { x: stuk.x, z: stuk.z, laag: stuk.laag },
    });

    if (model.trap === 'base' && trapOnder.size > 0) meld('een -base hoort onderop');
    if (model.trap === 'mid' && stuk.laag > 0 && !trapOnder.has('base') && !trapOnder.has('mid')) {
      meld('een -mid hoort op een -base of een -mid te staan');
    }
    if (model.trap === 'top' && trapBoven.size > 0) meld('een -top hoort bovenop');
    if (model.trap === 'top' && trapOnder.size === 0 && stuk.laag > 0) {
      meld('een -top zonder -base of -mid eronder');
    }
  }

  return meldingen;
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
            sluit: kit.sluitAan(hier.rand, daar.rand),
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
            sluit: null,
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
          sluit: kit.vlakSleutel(bovenId, stuk.slagen) === kit.vlakSleutel(onderId, buurStuk.slagen),
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

export function watPast(kit, rand, zijde) {
  const uit = [];
  if (rand === null) return uit;

  for (const model of kit.modellen.values()) {
    for (let slagen = 0; slagen < 4; slagen++) {
      for (const lokaal of Object.keys(model.zijden[ZIJDEN[(ZIJDEN.indexOf(zijde) + slagen) % 4]])) {
        const kandidaat = kit.randVan(model.naam, lokaal, zijde, slagen);
        if (kit.sluitAan(rand, kandidaat)) uit.push({ naam: model.naam, slagen, lokaal });
      }
    }
  }
  return uit;
}
