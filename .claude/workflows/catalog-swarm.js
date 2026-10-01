export const meta = {
  name: 'catalog-swarm',
  description: 'Look at catalogue kinds whole, fix geometry in place, verify each fix independently, collect tag and variant proposals',
  whenToUse: 'Sweeping one or more catalogue kinds for style and artefact inconsistencies that lint does not catch',
  phases: [
    { title: 'Look', detail: 'one looker per selection: kind sheet, renders, dossier of issues' },
    { title: 'Fix', detail: 'one fixer per selection: tool actions only, before and after renders' },
    { title: 'Verify', detail: 'one verifier per selection: accept or put back each fix' },
  ],
}

const SKILL = '.claude/skills/catalog-swarm/SKILL.md'

const ISSUE_TYPES = ['detail', 'colour', 'band-artefact', 'sliver', 'jitter', 'shading', 'thickness', 'scale', 'placement', 'tag', 'variant', 'duplicate', 'other']
const ACTIONS = ['tool', 'tag', 'variant', 'kind', 'reject', 'ask', 'none']

const LOOK_SCHEMA = {
  type: 'object',
  properties: {
    selection: { type: 'string' },
    kindReads: { type: 'string', description: 'two sentences: what the kind reads as and its common style' },
    sheets: { type: 'array', items: { type: 'string' } },
    fitting: { type: 'array', items: { type: 'string' }, description: 'model ids that sit as one of the family' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'kit/name' },
          type: { type: 'string', enum: ISSUE_TYPES },
          seen: { type: 'string', description: 'what is off, in plain words, naming the part' },
          evidence: { type: 'array', items: { type: 'string' }, description: 'render paths that show it' },
          view: { type: 'string', description: 'render.mjs --views value that shows it best' },
          action: { type: 'string', enum: ACTIONS },
          command: { type: 'string', description: 'for action tool: the exact command on the workfile' },
          proposal: { type: 'string', description: 'for tag, variant, kind, reject, ask: the proposal or question with ids' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['id', 'type', 'seen', 'evidence', 'action', 'confidence'],
      },
    },
  },
  required: ['selection', 'kindReads', 'sheets', 'fitting', 'issues'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          issue: { type: 'string' },
          commands: { type: 'array', items: { type: 'string' } },
          applied: { type: 'boolean' },
          why: { type: 'string', description: 'what changed, or why it was not applied' },
          before: { type: 'string' },
          after: { type: 'string' },
        },
        required: ['id', 'file', 'issue', 'commands', 'applied', 'why'],
      },
    },
  },
  required: ['fixes'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          verdict: { type: 'string', enum: ['accept', 'reject'] },
          why: { type: 'string' },
          sheet: { type: 'string', description: 'before and after beside peers' },
          putBack: { type: 'boolean' },
        },
        required: ['id', 'file', 'verdict', 'why', 'putBack'],
      },
    },
  },
  required: ['verdicts'],
}

const entries = (args && args.entries) || []
const out = (args && args.out) || '/tmp/catalog-swarm'
if (!entries.length) throw new Error('args.entries is empty')

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60)
const selectFlag = (e) => (e.startsWith('prefix:') ? `--prefix ${e.slice(7)}` : e.includes('/') ? `--models ${e}` : `--kind ${e}`)

const lookPrompt = (e, dir) => `You are the LOOKER for one selection of the Taalei catalogue: ${e}.
Read ${SKILL} first, sections 1 to 4, and follow them. Your scratch directory is ${dir}; write nothing anywhere else and change no file in the repo.

Start with:
  node tools/renders/kind-sheet.mjs ${selectFlag(e)} --out ${dir}/kind

The yardstick for a consistent kind is env-flora-tree-conifer; its sheet is at ${out}/yardstick/pbr/sheet.png. Look at it first, and do not re-render it.

Then LOOK, with the Read tool on the sheet PNGs: the full pbr sheet, the full claywire sheet, then every chunk sheet. Say what the kind reads as before judging any single model. Render close-ups of every suspect into ${dir}/look with tools/renders/render.mjs on the copies in ${dir}/kind/src (they sit beside Textures/colormap.png). Read every render you make. Only then open ${dir}/kind/dossier.json to confirm or sharpen.

Think about the end goal, not the numbers: a catalogue that reads as one hand made it. A number in range does not clear a model you see is off; a number out of range does not condemn a model that reads right. Lint findings are already tracked elsewhere; report them only where they are part of something you saw.

Every model of the selection appears either in "fitting" or with at least one issue. For a tool action give the exact command against kits/workfiles/<kit>/<name>.glb, after a dry or --list run in your scratch copy where the tool has one. Return the dossier.`

const fixPrompt = (e, dir, look) => `You are the FIXER for selection ${e} of the Taalei catalogue.
Read ${SKILL} sections 3 and 5 first and follow them. Scratch directory: ${dir}/fix. Change only the workfiles named below, only with tools under tools/import, and nothing under catalog/, lint/ or docs/.

The looker's tool actions:
${JSON.stringify(look.issues.filter((i) => i.action === 'tool'), null, 1)}

Per action: dry or --list first, then apply, then render before and after beside two peers of the same kind:
  node tools/renders/kind-sheet.mjs --models <id>,<peer>,<peer> --out ${dir}/fix/<name>/before --ref HEAD --modes pbr,claywire --no-glb-lint
  node tools/renders/kind-sheet.mjs --models <id>,<peer>,<peer> --out ${dir}/fix/<name>/after --modes pbr,claywire --no-glb-lint
and run node lint/glb-lint.mjs on the file. Look at both sheets. If the command did more than the issue asks or harmed the model, put it back with git checkout -- <file> and record applied false with why. You may adjust a command's parameters when the looker's one plainly fails, and record what you ran. Return every action, applied or not.`

const verifyPrompt = (e, dir, look, fix) => `You are the VERIFIER for selection ${e} of the Taalei catalogue. You did not make these fixes and you judge them with fresh eyes.
Read ${SKILL} sections 3 and 6 first and follow them. Scratch directory: ${dir}/verify. The only repo change you may make is git checkout -- <file> on a fix you reject.

What the looker saw:
${JSON.stringify(look.issues.filter((i) => i.action === 'tool'), null, 1)}

What the fixer did:
${JSON.stringify(fix.fixes.filter((f) => f.applied), null, 1)}

For each applied fix render your own before (--ref HEAD) and after sheet with tools/renders/kind-sheet.mjs --models <id>,<two peers you pick yourself> in pbr and claywire, plus the looker's view with render.mjs, and read them all. Run node lint/glb-lint.mjs on the file. Accept only when the issue is gone, nothing else changed to the eye, the source colours and the baked shading are kept and glb-lint shows nothing new. Default to reject when unsure. Return a verdict per applied fix.`

const results = await pipeline(
  entries,
  (e) => {
    const dir = `${out}/${slug(e)}`
    return agent(lookPrompt(e, dir), { label: `look:${e}`, phase: 'Look', schema: LOOK_SCHEMA })
  },
  (look, e) => {
    if (!look) return null
    const dir = `${out}/${slug(e)}`
    const tools = look.issues.filter((i) => i.action === 'tool')
    if (!tools.length) return { look, fix: { fixes: [] } }
    return agent(fixPrompt(e, dir, look), { label: `fix:${e}`, phase: 'Fix', schema: FIX_SCHEMA }).then((fix) => ({ look, fix: fix || { fixes: [] } }))
  },
  (state, e) => {
    if (!state) return null
    const dir = `${out}/${slug(e)}`
    const applied = state.fix.fixes.filter((f) => f.applied)
    if (!applied.length) return { entry: e, ...state, verify: { verdicts: [] } }
    return agent(verifyPrompt(e, dir, state.look, state.fix), { label: `verify:${e}`, phase: 'Verify', schema: VERIFY_SCHEMA }).then((verify) => ({ entry: e, ...state, verify: verify || { verdicts: [] } }))
  },
)

const done = results.filter(Boolean)
const dropped = entries.filter((e) => !done.some((d) => d.entry === e))
if (dropped.length) log(`no result for: ${dropped.join(', ')}`)
for (const d of done) {
  const accepted = d.verify.verdicts.filter((v) => v.verdict === 'accept').length
  const rejected = d.verify.verdicts.filter((v) => v.verdict === 'reject').length
  log(`${d.entry}: ${d.look.issues.length} issues, ${d.fix.fixes.filter((f) => f.applied).length} fixes applied, ${accepted} accepted, ${rejected} rejected`)
}
return { results: done, dropped }
