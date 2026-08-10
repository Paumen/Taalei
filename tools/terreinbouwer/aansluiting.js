/**
 * De regels van het bouwpakket: welk stuk past waar tegenaan, en wat is er mis
 * met een bouwsel.
 *
 * Bewust zonder DOM en zonder three.js, zodat tools/toets-terreinbouwer.mjs
 * dezelfde code in Node kan draaien als de bouwer in de browser. Alles wat
 * hier gebeurt komt uit kits/modulair-terrein/aansluitingen.json; er staat geen
 * enkele aanname over de vorm van een stuk in dit bestand.
 */

/** De vier windrichtingen, met de klok mee vanaf noord. */
export const ZIJDEN = ['n', 'o', 'z', 'w'];

/** Wat een zijde aan vakken opschuift: noord is -z, oost is +x. */
export const STAP = { n: [0, -1], o: [1, 0], z: [0, 1], w: [-1, 0] };

/** Welke zijde van de buurman naar deze zijde toe wijst. */
export const TEGENOVER = { n: 'z', o: 'w', z: 'n', w: 'o' };

/**
 * Een kwartslag draaien, tegen de klok in gezien van boven — dezelfde draai die
 * three.js maakt bij `rotation.y += Math.PI / 2`, want die stuurt (x,z) naar
 * (z,-x).
 *
 * Draaien kost hier verder niets, en dat is geen toeval: aansluitingen.mjs
 * schrijft elk zijprofiel op in het assenkruis van die zijde zelf (§ ZIJDEN
 * daar). Draai je het stuk, dan draait dat assenkruis mee en blijft het profiel
 * letterlijk hetzelfde — alleen het naambordje verspringt. Vandaar dat hier
 * alleen vakken en labels verschuiven en nergens een profiel wordt herrekend.
 */
export function draaiVak([u, v], slagen) {
  let [a, b] = [u, v];
  for (let i = 0; i < ((slagen % 4) + 4) % 4; i++) [a, b] = [b, -a];
  return [a, b];
}

/** De omgekeerde weg: van een gedraaid vak terug naar het vak in het model. */
export function ontdraaiVak([u, v], slagen) {
  let [a, b] = [u, v];
  for (let i = 0; i < ((slagen % 4) + 4) % 4; i++) [a, b] = [-b, a];
  return [a, b];
}

/**
 * De kit, klaar voor gebruik.
 *
 * Neemt het ingelezen aansluitingen.json en hangt er de opzoektabellen aan die
 * de bouwer nodig heeft.
 */
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

  /**
   * De vakken die een stuk beslaat, met daarbij het vak zoals het model het
   * zelf noemt — dat laatste is nodig om het juiste profiel op te zoeken.
   *
   * @returns {{wereld: number[], lokaal: string}[]}
   */
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

  /**
   * Het zijprofiel dat een geplaatst stuk aan de wereldzijde `zijde` laat zien,
   * of null wanneer dat vak daar niet aan de buitenkant van het stuk ligt.
   */
  randVan(naam, lokaal, zijde, slagen) {
    const index = (ZIJDEN.indexOf(zijde) + ((slagen % 4) + 4) % 4) % 4;
    return this.model(naam).zijden[ZIJDEN[index]][lokaal] ?? null;
  }

  /**
   * De sleutel van een horizontaal vlak nadat het is meegedraaid.
   *
   * Een zijprofiel overleeft het draaien ongeschonden, een boven- of ondervlak
   * niet: dat ligt in het x/z-vlak en draait dus echt mee. Daarom worden de
   * lijnstukken hier omgerekend en opnieuw op een vaste volgorde gezet, zodat
   * twee vlakken die na het draaien gelijk zijn ook dezelfde sleutel krijgen.
   */
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
      // Vaste kant eerst, anders zijn twee gelijke lijnstukken niet gelijk.
      return (p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])) ? [...p, ...q] : [...q, ...p];
    });
    stukken.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);

    const sleutel = JSON.stringify(stukken);
    this._gedraaid.set(cache, sleutel);
    return sleutel;
  }

  /** Of een zijprofiel niets bevat: open lucht. */
  isOpen(rand) {
    return rand === null || (this.randen[rand]?.vorm ?? []).length === 0;
  }

  /**
   * Of twee zijprofielen op elkaar passen.
   *
   * De hele regel: het profiel van de buur is dit profiel achterstevoren. Welk
   * profiel dat is heeft aansluitingen.mjs al uitgerekend en als `spiegel`
   * opgeschreven, dus het is één vergelijking.
   */
  sluitAan(rand, buurRand) {
    if (rand === null || buurRand === null) return false;
    return this.randen[rand]?.spiegel === buurRand;
  }
}

/* -- bouwsel ---------------------------------------------------------------
 * De verzameling geplaatste stukken, met een index van bezette vakken erbij.
 * Elke wijziging gaat via zet()/haalWeg() zodat de index nooit achterloopt —
 * de controle leest hem bij elke toetsaanslag opnieuw uit.
 */

export class Bouwsel {
  constructor(kit) {
    this.kit = kit;
    this.stukken = new Map();
    this.bezet = new Map(); // "x,z,laag" → [stukId, …]
    this._teller = 0;
  }

  static sleutel(x, z, laag) {
    return `${x},${z},${laag}`;
  }

  /**
   * Zet een stuk neer. Botsingen worden niet geweigerd maar gemeld: tijdens het
   * bouwen wil je iets fout kunnen neerzetten en het daarna zien oplichten,
   * niet tegengehouden worden door een dialoogvenster.
   */
  /**
   * @param {object} gegevens  naam, x, z, laag, slagen — en eventueel een `id`.
   *
   * Dat laatste is er voor het terugdraaien. Wie een stuk weghaalt en het
   * daarna terugzet, wil hetzelfde stuk terug en niet een nieuw exemplaar met
   * een nieuw nummer: de geschiedenis verwijst naar nummers, en een stap die
   * naar een verdwenen nummer wijst doet stilletjes niets. Precies dat ging er
   * mis — twee keer ongedaan maken haalde het tweede stuk niet weg omdat het
   * ondertussen een ander nummer had gekregen.
   */
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

/* -- controle --------------------------------------------------------------
 * Vijf dingen kunnen er mis zijn, en ze zijn niet even erg. Twee stukken die
 * in hetzelfde vak staan is een fout: dat kan in het echt niet. Een naad die
 * niet sluit is een waarschuwing, want een trap of een afgrond is soms precies
 * de bedoeling — de bouwer moet hem laten zien, niet verbieden.
 *
 * ── Wat hier niet gecontroleerd wordt ──────────────────────────────────────
 *
 * Twee dingen, allebei bewust, allebei het weten waard voordat je op groen
 * vertrouwt.
 *
 * Een naad wordt vergeleken tussen buren op dezélfde laag. Deze kit kent ook
 * naden die een laag verspringen: `cliff-terrain-side-top` eindigt aan zijn
 * achterkant op 0,6 en `hilly-terrain-grass-floor` ligt op 0,1, dus een kliftop
 * op laag L sluit aan op een grasvlakte op laag L+1 — allebei op hoogte
 * L · 0,5 + 0,6. Zet je het gras op de verkeerde laag naast de kliftop, dan
 * meldt de controle dat (de randen liggen dan een halve unit uit elkaar). Zet
 * je het góéd, dan grenzen de twee op geen enkele laag aan elkaar en zwijgt de
 * controle. Groen betekent daar dus "niets tegengekomen", niet "nagerekend".
 *
 * En een naad is een vóég, geen oppervlak: twee stukken kunnen op de naad
 * naadloos aansluiten en er tussenin heel verschillend uitzien. Zie de kop van
 * tools/aansluitingen.mjs voor het geval dat dat aantoont.
 */

export const ERNST = { fout: 'fout', waarschuwing: 'waarschuwing' };

/**
 * Loopt het hele bouwsel na.
 *
 * Wordt bij elke wijziging opnieuw aangeroepen. Dat kan, want het werk is
 * lineair in het aantal bezette vakken: per vak vier buren en één laag eronder,
 * en elke vergelijking is het naast elkaar leggen van twee nummers.
 *
 * @returns {{soort: string, ernst: string, tekst: string, stukken: string[],
 *            plek: object}[]}
 */
export function controleer(bouwsel) {
  const { kit } = bouwsel;
  const meldingen = [];
  const gezien = new Set();

  const naamVan = (id) => bouwsel.stukken.get(id).naam;

  for (const [sleutel, bewoners] of bouwsel.bezet) {
    const [x, z, laag] = sleutel.split(',').map(Number);

    /* Twee stukken in hetzelfde vak is géén melding.
     *
     * Dat was het wel, en dat was fout. Een kei hoort op de tegel waar hij op
     * ligt — eenentwintig stukken in deze kit zijn zulke props. En dertien
     * stukken claimen meer vakken dan ze vullen: `cliff-terrain-corner-inner-
     * 3x3-mid` claimt er negen en vult er vijf, dus de lege vakken binnen zo'n
     * hoek horen juist door iets anders gevuld te worden. Wie dat een botsing
     * noemt, verbiedt de helft van wat je met deze kit doet.
     *
     * Of twee stukken samen kunnen is een oordeel, en dat oordeel is niet aan
     * de bouwer. Wat hier overblijft is meten en melden. */

    for (const bewoner of bewoners) {
      const stuk = bouwsel.stukken.get(bewoner.id);

      /* 2. de vier naden op deze laag */
      for (const zijde of ZIJDEN) {
        const [dx, dz] = STAP[zijde];
        const buren = bouwsel.op(x + dx, z + dz, laag);
        if (buren.length !== 1) continue;
        const buur = buren[0];
        if (buur.id === bewoner.id) continue; // eigen binnennaad

        // Elke naad hoort één keer gemeld te worden, niet vanaf beide kanten.
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
        if (kit.isOpen(hier) && kit.isOpen(daar)) continue; // twee keer lucht

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

      /* 3. en 4. de laag eronder: draagt hij, en sluit hij aan?
       *
       * Alleen voor stukken die in het vloervlak van hun laag zijn afgesneden —
       * een wand, een blok, een rand. Die houden onderaan niet vanzelf op en
       * moeten dus verder naar beneden.
       *
       * Een stuk zonder onderkant valt er buiten, en dat is geen mildheid maar
       * hoe de kit werkt: `hilly-terrain-grass-floor` is één plat vlak op y =
       * 0,1 en heeft niets in het vloervlak staan. Zo'n dekvlak hoort juist
       * over onbebouwde vakken heen te liggen — de binnenkant van een plateau
       * wordt in deze pack niet volgebouwd, want niemand kijkt eronder. Wie dat
       * toch zou eisen, meldt elk plateau van dertig tegels dertig keer.
       */
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

  /* Twee keer exact hetzelfde stuk op exact dezelfde plek.
   *
   * Het enige geval waarin samenvallende stukken wél het melden waard zijn:
   * identieke stukken dekken elkaar precies af, dus je ziet het niet en je
   * merkt het pas als je er één weghaalt en er nog een blijkt te staan. Elke
   * andere combinatie is een keuze van wie bouwt. */
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

  /* 5. de trap van een stapel: base onderop, top bovenop.
   *
   * Dit is de enige controle die op de naam afgaat in plaats van op de vorm, en
   * dat is met opzet beperkt gehouden. Twee stukken kunnen vormvast op elkaar
   * passen en toch verkeerd bedoeld zijn: een `-base` boven een `-mid` sluit
   * naadloos aan, want beide interfaces zijn gelijk, maar levert een klif op
   * met twee voeten en geen kop. Alleen de naam weet dat. */
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
    /* Op laag 0 is de grond de voet; een -mid die daar ligt mist niets. Pas
     * hogerop is "er hoort een -base of -mid onder" een echte eis. */
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

/* -- verkenner -------------------------------------------------------------
 * De andere kant van dezelfde vraag. controleer() zegt of wat er staat klopt;
 * dit zegt wat er zou kunnen staan.
 */

/**
 * Alle stukken die met een kwartslag tegen een gegeven zijde passen.
 *
 * Loopt de kit één keer af en vraagt per stuk per draaistand welk profiel er
 * naar de naad toe wijst. Bij 116 stukken × 4 standen zijn dat 464
 * vergelijkingen — snel genoeg om bij elke klik opnieuw te doen, dus er wordt
 * niets bewaard wat kan verouderen.
 *
 * @param {Kit} kit
 * @param {string} rand   het profiel waar tegenaan gepast moet worden
 * @param {string} zijde  de zijde van de buur die naar die rand toe wijst
 * @returns {{naam: string, slagen: number, lokaal: string}[]}
 */
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
