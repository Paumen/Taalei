# WebGPU-scène

`tools/webgpu-scene/index.html` tekent een scène uit de kits met WebGPU, volgens
de belichting in `tools/webgpu-scene/licht.json`. Open de pagina in een browser
met WebGPU; slepen draait de camera, scrollen zoomt.

Er zit geen bibliotheek onder: `glb.js` leest de .glb's, `wiskunde.js` doet de
matrices, `scene.js` zet de pijplijn op en draagt de WGSL-shader.

## Van licht.json naar de shader

`licht.json` is de opdracht en wordt letterlijk gevolgd.

| veld | wat de scène ermee doet |
| --- | --- |
| `sun.elevationDeg`, `sun.azimuthDeg` | richting náár de zon: azimut 0° kijkt naar +z en loopt met de klok mee naar +x, elevatie 0° ligt in het grondvlak. 56° / 320° komt uit op `(-0.36, 0.83, 0.43)`. |
| `sun.colorSRGB`, `sun.intensity` | kleur naar lineair, × intensiteit; één richtingslicht, lambert (`max(dot(n, l), 0)`). |
| `sky.colorSRGB` | de achtergrond, en de kleur waar het omgevingslicht naartoe wordt getrokken. |
| `ambient.colorSRGB`, `skyTint`, `intensity` | `mix(omgeving, lucht, skyTint) × intensity`, gemengd in lineair. Het werkt gelijkmatig uit alle richtingen — `skyTint` is één getal, geen hemisfeer-verdeling. |
| `fog.colorSRGB`, `startUnits`, `density` | `1 - exp(-density × max(0, afstand - startUnits))`. Met `density: 0` komt daar 0 uit: de mist doet niets, maar de knop zit erin. |
| `output.exposure` | schaalt de lineaire kleur vlak voor het klemmen. |
| `output.tonemap: "clamp"` | klemmen op [0,1], geen curve. Een andere waarde meldt de pagina en klemt alsnog. |
| `note` | albedo in sRGB, licht in lineair, gamma 2.2 eruit — zie hieronder. |

## Waar de gamma wordt toegepast

Precies één keer, en met de hand:

- de colormap laadt als `rgba8unorm`, niet als de `-srgb`-variant, dus de GPU
  laat de bytes met rust; de shader doet `pow(albedo, 2.2)`;
- het canvas krijgt `getPreferredCanvasFormat()`, dat nooit een `-srgb`-formaat
  teruggeeft, en de shader schrijft `pow(kleur, 1/2.2)` weg;
- de achtergrond is de luchtkleur zoals hij op het scherm hoort, want die gaat
  buiten de shader om.

Zou de textuur als `rgba8unorm-srgb` laden, dan decodeerde de hardware hem al
met de sRGB-knik en zou `pow(2.2)` er nog eens overheen gaan.

De textuur krijgt geen mipmaps. De cellen van de atlas zijn 32 pixels breed; op
een kleine mip lopen buurcellen in elkaar over en verkleurt een model.

## Wat er niet in zit

Wat de opdracht niet noemt, tekent de scène ook niet: geen schaduwen, geen
spiegeling, geen tonemapping-curve. De props zijn plat geschaduwd door de
lambert-term en het omgevingslicht, meer niet.

## De opstelling

`tools/webgpu-scene/opstelling.json` zegt wat waar staat: een vloer van
`hilly-terrain-grass-floor`-tegels van 0,5 unit, en dertig props uit acht kits —
waterput, kar, ton, krat, hek, lantaarn, bomen, rotsen, gras en bloemen. `x` en
`z` liggen in het vlak, `y` is omhoog, `draai` is in graden om de y-as. De
camera staat in hetzelfde bestand.

## Een plaat schieten

```
NODE_PATH=$(npm root -g) node tools/webgpu-scene/render.mjs
```

Dat schrijft `docs/webgpu_scene/scene.png`. Het vraagt wel een omgeving waar
WebGPU beschikbaar is: de Chromium die bij Playwright zit heeft in deze container
geen `navigator.gpu`, ook niet met `--enable-unsafe-swiftshader`. Op een machine
met een GPU — of in een browser die je zelf opent — werkt de pagina wel.
