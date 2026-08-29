import { query } from '@anthropic-ai/claude-agent-sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Voert het experiment uit: elk (asset × sport) drie keer, identieke prompt,
// beeldblok vóór tekst, willekeurige volgorde uit een vaste seed. De resolutie
// wordt nergens genoemd. Elke aanroep gaat als JSON-regel naar het logboek;
// een herstart slaat over wat al gelogd is.
//
// Gebruik: node tools/resolutie-stijl/run.mjs [--model=claude-opus-5]
//          [--repeats=3] [--seed=20260829] [--workers=4] [--log=pad.jsonl]
//          [--limit=N] [--sporten=2576,1568,...]
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const arg = (naam, val) => {
  const t = process.argv.slice(2).find((a) => a.startsWith(`--${naam}=`));
  return t ? t.slice(naam.length + 3) : val;
};

const MODEL = arg('model', 'claude-opus-5');
const REPEATS = Number(arg('repeats', 3));
const SEED = Number(arg('seed', 20260829));
const WORKERS = Number(arg('workers', 4));
const LIMIT = Number(arg('limit', 0));
const SPORTEN = arg('sporten', '2576,1568,1092,768,512,384,256,192').split(',').map(Number);
const STIM = JSON.parse(readFileSync(path.join(HIER, 'stimuli.json'), 'utf8'));
const PROMPT = readFileSync(path.join(HIER, 'prompt.txt'), 'utf8').trim();
const BEELDEN = path.join(ROOT, 'docs', 'resolutie-stijl', 'stimuli');
const LOG = path.resolve(arg('log', path.join(ROOT, 'docs', 'resolutie-stijl', 'runs', `${MODEL}.jsonl`)));
mkdirSync(path.dirname(LOG), { recursive: true });

// Deterministische shuffle (mulberry32) zodat de volgorde reproduceerbaar is.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const gedaan = new Set();
if (existsSync(LOG)) {
  for (const regel of readFileSync(LOG, 'utf8').split('\n')) {
    if (!regel.trim()) continue;
    try { const r = JSON.parse(regel); if (r.ok) gedaan.add(`${r.asset}|${r.sport}|${r.repeat}`); } catch { /* halve regel */ }
  }
}

const taken = [];
for (const s of STIM.stimuli) for (const sport of SPORTEN) for (let k = 1; k <= REPEATS; k++) {
  taken.push({ asset: s.id, sport, repeat: k });
}
let werk = shuffle(taken, rng(SEED)).filter((t) => !gedaan.has(`${t.asset}|${t.sport}|${t.repeat}`));
if (LIMIT) werk = werk.slice(0, LIMIT);
console.log(`${taken.length} aanroepen, ${gedaan.size} al gelogd, ${werk.length} te doen -> ${LOG}`);

async function vraag(base64) {
  const t0 = Date.now();
  const q = query({
    prompt: (async function* () {
      yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
        { type: 'text', text: PROMPT },
      ] } };
    })(),
    options: { model: MODEL, maxTurns: 1, allowedTools: [], settingSources: [], maxThinkingTokens: 0,
      systemPrompt: 'You are a 3D art director. You answer with JSON only.' },
  });
  let tekst = '', usage = {}, subtype = '';
  for await (const m of q) {
    if (m.type === 'assistant') for (const c of m.message.content) if (c.type === 'text') tekst += c.text;
    if (m.type === 'result') { usage = m.usage || {}; subtype = m.subtype; if (!tekst && m.result) tekst = m.result; }
  }
  return { tekst, usage, subtype, latency_ms: Date.now() - t0 };
}

function parse(tekst) {
  const m = tekst.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// IJkaanroep: dezelfde prompt met een 1x1 beeld, zodat de vaste overhead van de
// SDK-systeemprompt bekend is en de beeldtokens per sport af te leiden zijn.
const IJK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');
if (werk.length) {
  const ijk = await vraag(IJK);
  appendFileSync(LOG, JSON.stringify({ soort: 'ijk', model: MODEL, tijd: new Date().toISOString(),
    usage: ijk.usage, latency_ms: ijk.latency_ms, ruw: ijk.tekst }) + '\n');
  console.log('ijk-overhead gelogd');
}

let klaar = 0, fout = 0;
async function worker() {
  for (;;) {
    const t = werk.shift();
    if (!t) break;
    const pad = path.join(BEELDEN, String(t.sport), `${t.asset}.png`);
    let regel;
    try {
      const b64 = readFileSync(pad).toString('base64');
      // Netwerk- en proxyfouten komen sporadisch voor; drie pogingen met
      // oplopende pauze, daarna pas als mislukt loggen.
      let a, laatste;
      for (let poging = 1; poging <= 3; poging++) {
        try { a = await vraag(b64); laatste = null; break; }
        catch (e) { laatste = e; await new Promise((r) => setTimeout(r, 2000 * poging)); }
      }
      if (!a) throw laatste;
      const p = parse(a.tekst);
      regel = { soort: 'aanroep', ok: !!p && a.subtype === 'success', model: MODEL, tijd: new Date().toISOString(),
        asset: t.asset, sport: t.sport, repeat: t.repeat, bestand: path.relative(ROOT, pad),
        latency_ms: a.latency_ms, subtype: a.subtype, usage: a.usage, ruw: a.tekst, antwoord: p };
    } catch (e) {
      regel = { soort: 'aanroep', ok: false, model: MODEL, tijd: new Date().toISOString(),
        asset: t.asset, sport: t.sport, repeat: t.repeat, fout: String(e).slice(0, 300) };
    }
    appendFileSync(LOG, JSON.stringify(regel) + '\n');
    klaar++;
    if (!regel.ok) fout++;
    if (klaar % 10 === 0) console.log(`${klaar} gedaan, ${fout} mislukt`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`klaar: ${klaar} aanroepen, ${fout} mislukt`);
if (fout) process.exitCode = 1;
