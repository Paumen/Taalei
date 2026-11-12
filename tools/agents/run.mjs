import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const usage = `node tools/agents/run.mjs <brief.md> [--model id] [--effort level] [--budget usd] [--turns n]
Runs one fresh agent on the brief, billed to LOD_ANTHROPIC_API_KEY. Prints JSON: ok, result, cost_usd, turns, tools (calls per tool).
Every message is saved to <brief>.jsonl (or --log <file>).`;

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : args.splice(i, 2)[1];
};
const model = flag("model", "claude-opus-5-5");
const effort = flag("effort");
const budget = Number(flag("budget", "5"));
const turns = Number(flag("turns", "150"));
const log = flag("log");
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
const logFile = log ?? brief.replace(/\.md$/, "") + ".jsonl";
writeFileSync(logFile, "");
const tools = {};
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
    appendFileSync(logFile, JSON.stringify(msg) + "\n");
    for (const c of msg.message?.content ?? []) if (c.type === "tool_use") tools[c.name] = (tools[c.name] ?? 0) + 1;
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
out.tools = tools;
out.log = logFile;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
