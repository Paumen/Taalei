#!/usr/bin/env python3
"""Run style-pick trials through the claude CLI.

Each trial is one fresh `claude -p` call (stream-json in/out, no tools) with
the reference sheets and the two unlabelled candidate panels injected as
base64 image blocks, so exactly what the model sees is under our control.

Results are appended to a JSONL file; already-completed (condition, item)
pairs are skipped, so an interrupted run just resumes.

Usage:
  python3 run_experiment.py conditions/phase1.json            # run everything
  python3 run_experiment.py conditions/phase1.json --only base refs2
  python3 run_experiment.py conditions/phase1.json --dry-run  # cost preview
  python3 run_experiment.py conditions/phase1.json --limit 3  # smoke test
"""
import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stijllib as lib

DEFAULTS = {"model": "claude-sonnet-5", "effort": "medium", "n_refs": 6,
            "angles": [0, 2, 4, 6], "scale": 1.0, "style_guide": False,
            "n_test": 20, "seed": 5}

write_lock = threading.Lock()


def load_conditions(path, only):
    with open(path) as f:
        spec = json.load(f)
    conds = []
    for c in spec["conditions"]:
        cfg = {**DEFAULTS, **spec.get("defaults", {}), **c}
        if only and cfg["id"] not in only:
            continue
        conds.append(cfg)
    if only:
        missing = set(only) - {c["id"] for c in conds}
        if missing:
            raise SystemExit(f"unknown condition ids: {sorted(missing)}")
    return conds


def load_done(out_path):
    done = set()
    if os.path.exists(out_path):
        with open(out_path) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("choice"):
                    done.add((r["condition"], r["condition_key"], r["item"]))
    return done


# The remote harness pins child sessions to the parent's session id, which
# would make every --resume append to one shared transcript; strip the pins
# so each call gets its own session (required for cached-mode forking).
CHILD_ENV = {k: v for k, v in os.environ.items()
             if k not in ("CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_REMOTE_SESSION_ID")}


def call_claude(content, cfg, workdir, extra_args=(), timeout=600):
    msg = json.dumps({"type": "user",
                      "message": {"role": "user", "content": content}})
    cmd = ["claude", "-p", "--verbose",
           "--input-format", "stream-json", "--output-format", "stream-json",
           "--model", cfg["model"], "--effort", cfg["effort"],
           "--max-turns", "1", "--tools", "",
           "--system-prompt", lib.SYSTEM_PROMPT, *extra_args]
    proc = subprocess.run(cmd, input=msg, capture_output=True, text=True,
                          timeout=timeout, cwd=workdir, env=CHILD_ENV)
    result = None
    for line in proc.stdout.splitlines():
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("type") == "result":
            result = d
    if result is None:
        raise RuntimeError(f"no result event (exit {proc.returncode}): "
                           f"{proc.stderr.strip()[:500]}")
    return result


def prime_condition(cfg, refs, workdir, retries=2):
    """Cached mode: send the references once, return (session_id, record)."""
    content = lib.build_prime_message(refs, cfg)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "condition": cfg["id"], "condition_key": lib.condition_key(cfg),
              "model": cfg["model"], "effort": cfg["effort"],
              "item": "__prime__", "ref_ids": [r["id"] for r in refs]}
    last_err = None
    for attempt in range(retries + 1):
        try:
            res = call_claude(content, cfg, workdir)
            usage = res.get("usage", {})
            record.update({
                "cost_usd": res.get("total_cost_usd"),
                "cache_write": usage.get("cache_creation_input_tokens"),
                "cache_read": usage.get("cache_read_input_tokens"),
                "session_id": res.get("session_id"),
            })
            if res.get("session_id") and not res.get("is_error"):
                return res["session_id"], record
            last_err = f"prime failed: {str(res.get('result'))[:200]}"
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            last_err = str(e)
        time.sleep(2 * (attempt + 1))
    record["error"] = last_err
    return None, record


def run_trial(cfg, item, refs, good_is_a, workdir, sid=None, retries=2):
    if sid:
        content, _ = lib.build_case_message(item, cfg, good_is_a)
        extra = ("--resume", sid, "--fork-session")
    else:
        content, _ = lib.build_trial_message(item, refs, cfg, good_is_a)
        extra = ()
    meta = lib._meta(refs, cfg)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "condition": cfg["id"], "condition_key": lib.condition_key(cfg),
              "model": cfg["model"], "effort": cfg["effort"],
              "item": item["id"], "category": item["category"],
              "good_is_a": good_is_a, **meta,
              "style_guide": bool(cfg.get("style_guide"))}
    if sid:
        record["cached"] = True
        record["prime_session"] = sid
    for key in ("test_category", "ref_category", "control"):
        if cfg.get(key):
            record[key] = cfg[key]
    last_err = None
    for attempt in range(retries + 1):
        try:
            res = call_claude(content, cfg, workdir, extra)
            text = res.get("result") or ""
            ans = lib.parse_answer(text)
            usage = res.get("usage", {})
            record.update({
                "attempt": attempt,
                "raw": text[:400],
                "cost_usd": res.get("total_cost_usd"),
                "duration_ms": res.get("duration_ms"),
                "input_tokens": (usage.get("input_tokens", 0)
                                 + usage.get("cache_creation_input_tokens", 0)
                                 + usage.get("cache_read_input_tokens", 0)),
                "cache_write": usage.get("cache_creation_input_tokens"),
                "cache_read": usage.get("cache_read_input_tokens"),
                "output_tokens": usage.get("output_tokens"),
                "is_error": res.get("is_error", False),
            })
            if ans:
                record["choice"] = ans["choice"]
                record["confidence"] = ans["confidence"]
                record["correct"] = (ans["choice"] == "A") == good_is_a
                return record
            last_err = f"unparseable answer: {text[:200]}"
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            last_err = str(e)
        time.sleep(2 * (attempt + 1))
    record["error"] = last_err
    return record


def estimate_tokens(content):
    tok = 0
    for block in content:
        if block["type"] == "text":
            tok += len(block["text"]) // 4
        else:
            import base64
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(base64.b64decode(block["source"]["data"])))
            tok += im.width * im.height // 750
    return tok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("conditions")
    ap.add_argument("--only", nargs="*", help="condition ids to run")
    ap.add_argument("--limit", type=int, help="max trials per condition")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true",
                    help="build stimuli and print token/cost estimate, no calls")
    ap.add_argument("--out", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results", "results.jsonl"))
    args = ap.parse_args()

    if not os.path.exists(lib.MANIFEST):
        raise SystemExit("tiles missing - run prepare_tiles.py first")

    conds = load_conditions(args.conditions, args.only)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    done = load_done(args.out)
    workdir = tempfile.mkdtemp(prefix="stijl-exp-")  # neutral cwd: no repo CLAUDE.md

    cond_tasks = []
    n_total = 0
    for cfg in conds:
        test, refs = lib.build_test_and_ref_sets(
            cfg["n_test"], cfg["n_refs"], cfg["seed"],
            cfg.get("test_category"), cfg.get("ref_category"),
            cfg.get("exclude_items"),
            cfg.get("test_items"), cfg.get("ref_items"))
        gmap = lib.good_is_a_map(test)
        items = test[:args.limit] if args.limit else test
        pending = [(item, gmap[item["id"]]) for item in items
                   if (cfg["id"], lib.condition_key(cfg), item["id"]) not in done]
        if pending:
            cond_tasks.append((cfg, refs, pending))
            n_total += len(pending)

    if args.dry_run:
        total_usd = 0.0
        for cfg, refs, pending in cond_tasks:
            toks = [estimate_tokens(lib.build_trial_message(item, refs, cfg, gia)[0])
                    for item, gia in pending]
            usd = sum(toks) / 1e6 * 2.0 + len(toks) * 1500 / 1e6 * 10.0
            total_usd += usd
            note = " (cached mode: actual cost far lower)" if cfg.get("cached") else ""
            print(f"{cfg['id']:16s} {len(toks):3d} trials  ~{sum(toks)//len(toks):6d} "
                  f"input tok/trial  est ${usd:.2f}{note}")
        print(f"{'TOTAL':16s} {n_total:3d} trials  est ${total_usd:.2f} "
              f"(input at sonnet rates + ~1.5k output/trial)")
        return

    print(f"{n_total} trials to run ({len(done)} already done) -> {args.out}")
    t0 = time.time()
    n_done = 0

    def write(record):
        with write_lock:
            with open(args.out, "a") as f:
                f.write(json.dumps(record) + "\n")

    with concurrent.futures.ThreadPoolExecutor(args.concurrency) as ex:
        for cfg, refs, pending in cond_tasks:
            sid = None
            if cfg.get("cached"):
                sid, prec = prime_condition(cfg, refs, workdir)
                write(prec)
                print(f"[prime]   {cfg['id']:16s} "
                      f"{'session ' + sid[:8] if sid else 'FAILED'}  "
                      f"${prec.get('cost_usd') or 0:.3f}  "
                      f"cache_write={prec.get('cache_write')}", flush=True)
                if sid is None:
                    continue

            def worker(task, cfg=cfg, refs=refs, sid=sid):
                return run_trial(cfg, task[0], refs, task[1], workdir, sid)

            for record in ex.map(worker, pending):
                write(record)
                n_done += 1
                mark = ("OK " if record.get("correct") else
                        "err" if "error" in record else "WRONG")
                print(f"[{n_done}/{n_total}] {record['condition']:16s} "
                      f"{record['item']:4s} {mark}  "
                      f"${record.get('cost_usd') or 0:.3f}  "
                      f"cr={record.get('cache_read') or 0}  "
                      f"{(time.time() - t0):.0f}s", flush=True)
    print("done")


if __name__ == "__main__":
    main()
