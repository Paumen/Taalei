// Schrijft een glb opnieuw weg nadat er geometrie uit is gehaald of aan toegevoegd.
//
// Wie driehoeken weghaalt of een primitief splitst laat losse eindjes achter: hoekpunten
// waar niets meer naar wijst, een mesh zonder knooppunt, accessors en bufferViews die
// nergens meer aan hangen. Dit ruimt dat in één keer op — knooppunten eerst, dan wat
// daardoor wees is geworden — en bouwt de bin opnieuw op in de volgorde van de
// primitieven.
//
//   herbouwGlb(glb, { vervangen, wegNodes })
//
// vervangen: Map van accessorindex naar { waarden, breedte, Type }. Een accessor die
// hierin staat krijgt die waarden; count en min/max volgen eruit. Een nieuwe accessor
// maak je door er zelf een aan glb.json.accessors toe te voegen (zonder bufferView) en
// hem hier op te geven. wegNodes: knooppuntindexen die weg moeten, met hun kinderen.
//
// Aanname: elke accessor heeft zijn eigen bufferView en er zijn geen animaties of skins
// — zo staan de modellen in kits/workfiles erin. Wat daarvan afwijkt wordt geweigerd in
// plaats van stilzwijgend verminkt.
export function herbouwGlb(glb, { vervangen = new Map(), wegNodes = new Set() } = {}) {
  const json = glb.json;
  if (json.animations?.length || json.skins?.length) throw new Error('animaties of skins; niet ondersteund');

  if (wegNodes.size) {
    const nodeNr = new Map();
    json.nodes.forEach((_, i) => { if (!wegNodes.has(i)) nodeNr.set(i, nodeNr.size); });
    json.nodes = [...nodeNr.keys()].map((oud) => {
      const node = { ...json.nodes[oud] };
      const kinderen = (node.children ?? []).filter((c) => nodeNr.has(c)).map((c) => nodeNr.get(c));
      if (kinderen.length) node.children = kinderen; else delete node.children;
      return node;
    });
    for (const scene of json.scenes) scene.nodes = scene.nodes.filter((n) => nodeNr.has(n)).map((n) => nodeNr.get(n));
  }

  const meshOrde = [...new Set(json.nodes.flatMap((n) => (n.mesh === undefined ? [] : [n.mesh])))].sort((a, b) => a - b);
  const meshNr = new Map(meshOrde.map((oud, nieuw) => [oud, nieuw]));
  json.meshes = meshOrde.map((oud) => json.meshes[oud]);
  for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = meshNr.get(node.mesh);

  const accessorOrde = [];
  for (const mesh of json.meshes) for (const prim of mesh.primitives) {
    for (const a of Object.values(prim.attributes)) accessorOrde.push(a);
    if (prim.indices !== undefined) accessorOrde.push(prim.indices);
  }
  const accessorNr = new Map(accessorOrde.map((oud, nieuw) => [oud, nieuw]));
  if (accessorNr.size !== accessorOrde.length) throw new Error('gedeelde accessor; niet ondersteund');
  const views = new Set();
  for (const oud of accessorOrde) {
    const view = json.accessors[oud].bufferView;
    if (view === undefined) continue;
    if (views.has(view)) throw new Error('gedeelde bufferView; niet ondersteund');
    views.add(view);
  }

  const stukken = [];
  const nieuweViews = [], nieuweAccessors = [];
  let lengte = 0;
  for (const oud of accessorOrde) {
    const accessor = { ...json.accessors[oud] };
    const nieuw = vervangen.get(oud);
    let data, opgeslagen = null;
    if (nieuw) {
      // min/max moeten precies de opgeslagen waarden zijn, dus niet de bron maar wat
      // er na het gieten naar het accessortype in staat.
      opgeslagen = new nieuw.Type(nieuw.waarden);
      data = Buffer.from(opgeslagen.buffer);
      accessor.count = nieuw.waarden.length / nieuw.breedte;
    } else {
      const view = json.bufferViews[accessor.bufferView];
      data = glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    }
    const vul = (4 - (lengte % 4)) % 4;
    if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
    const basis = accessor.bufferView === undefined ? {} : json.bufferViews[accessor.bufferView];
    nieuweViews.push({ ...basis, buffer: 0, byteOffset: lengte, byteLength: data.length });
    stukken.push(Buffer.from(data));
    lengte += data.length;
    accessor.bufferView = nieuweViews.length - 1;
    accessor.byteOffset = undefined;
    delete accessor.byteOffset;
    if (nieuw && accessor.min) {
      const breedte = nieuw.breedte;
      const kolom = (j) => opgeslagen.filter((_, i) => i % breedte === j);
      accessor.min = Array.from({ length: breedte }, (_, j) => Math.min(...kolom(j)));
      accessor.max = Array.from({ length: breedte }, (_, j) => Math.max(...kolom(j)));
    }
    nieuweAccessors.push(accessor);
  }
  json.accessors = nieuweAccessors;
  json.bufferViews = nieuweViews;
  for (const mesh of json.meshes) for (const prim of mesh.primitives) {
    for (const naam of Object.keys(prim.attributes)) prim.attributes[naam] = accessorNr.get(prim.attributes[naam]);
    if (prim.indices !== undefined) prim.indices = accessorNr.get(prim.indices);
  }

  const bin = Buffer.concat(stukken);
  json.buffers = [{ byteLength: bin.length }];
  return bin;
}
