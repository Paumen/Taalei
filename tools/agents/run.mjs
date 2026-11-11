import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const usage = `node tools/agents/run.mjs <brief.md> [--model id] [--effort level] [--budget usd] [--turns n]
Runs one fresh agent on the brief, billed to LOD_ANTHROPIC_API_KEY. Prints JSON: ok, result, cost_usd, turns.`;

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : args.splice(i, 2)[1];
};
const model = flag("model", "claude-opus-5-5");
const effort = flag("effort");
const budget = Number(flag("budget", "5"));
const turns = Number(flag("turns", "150"));
const brief = args[0];
if (!brief) {
  console.error(usage);
  process.exit(2);
}
const key = process.env.LOD_ANTHROPIC_API_KEY;
if (!key) {
  console.error(
    "LOD_ANTHROPIC_API_KEY is not set. Add it as an environment variable in the cloud environment settings.",
  );
  process.exit(2);
}

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !/^(CLAUDE|ANTHROPIC|LOD_ANTHROPIC|SESSION_INGRESS)/.test(k),
  ),
);
env.ANTHROPIC_API_KEY = key;

const root = resolve(import.meta.dirname, "../..");
let out = { ok: false, result: "", cost_usd: 0, turns: 0 };
try {
  for await (const msg of query({
    prompt: readFileSync(brief, "utf8"),
    options: {
      cwd: root,
      env,
      model,
      ...(effort && { effort }),
      maxBudgetUsd: budget,
      maxTurns: turns,
      settingSources: ["project"],
      tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      permissionMode: "dontAsk",
    },
  })) {
    if (msg.type === "result") {
      out = {
        ok: msg.subtype === "success" && !msg.is_error,
        stop: msg.subtype,
        result: msg.result ?? "",
        cost_usd: msg.total_cost_usd,
        turns: msg.num_turns,
      };
    }
  }
} catch (e) {
  out.result = e.message;
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
