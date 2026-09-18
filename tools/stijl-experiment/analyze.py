#!/usr/bin/env python3
"""Analyse style-pick results: accuracy per condition with Wilson CIs,
paired McNemar tests against the baseline condition, position-bias check,
and a per-item correctness matrix. Writes results/report.md.

Usage: python3 analyze.py [--results results/results.jsonl] [--baseline base]
"""
import argparse
import json
import math
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def wilson_ci(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def mcnemar_exact(b, c):
    """Two-sided exact binomial p-value on the discordant pairs.
    b = baseline right & condition wrong, c = baseline wrong & condition right."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(math.comb(n, i) for i in range(0, k + 1)) / 2 ** n
    return min(1.0, 2 * p)


def load(path):
    latest = {}
    with open(path) as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            latest[(r["condition"], r["item"])] = r
    return list(latest.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=os.path.join(HERE, "results", "results.jsonl"))
    ap.add_argument("--baseline", default="base")
    args = ap.parse_args()

    records = load(args.results)
    if not records:
        raise SystemExit("no results yet")
    by_cond = defaultdict(dict)
    for r in records:
        by_cond[r["condition"]][r["item"]] = r

    def natkey(s):
        return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]

    conds = sorted(by_cond, key=lambda c: (c != args.baseline, natkey(c)))
    base = by_cond.get(args.baseline, {})
    # a condition may name another condition as its `control`: paired
    # comparison against it is reported alongside the baseline one
    controls = {}
    for cid in conds:
        for r in by_cond[cid].values():
            if r.get("control"):
                controls[cid] = r["control"]
                break
    lines = ["# Style-pick experiment - results", ""]

    lines += ["## Accuracy per condition", "",
              "| condition | n | acc | 95% CI | McNemar p vs base | "
              "vs control | acc good=A | acc good=B | conf right | "
              "conf wrong | $/trial |",
              "|---|---|---|---|---|---|---|---|---|---|---|"]
    for cid in conds:
        recs = [r for r in by_cond[cid].values() if "correct" in r]
        errs = [r for r in by_cond[cid].values() if "error" in r]
        n = len(recs)
        if n == 0:  # only errors/primes recorded (e.g. an aborted condition)
            continue
        k = sum(r["correct"] for r in recs)
        lo, hi = wilson_ci(k, n)
        # paired McNemar on items present in both this condition and another
        def discordants(other):
            b = c = 0
            for item, r in by_cond[cid].items():
                ro = other.get(item)
                if not ro or "correct" not in r or "correct" not in ro:
                    continue
                if ro["correct"] and not r["correct"]:
                    b += 1
                elif not ro["correct"] and r["correct"]:
                    c += 1
            return b, c

        b, c = discordants(base)
        p = mcnemar_exact(b, c) if cid != args.baseline and base else None
        ctrl_cell = "-"
        if cid in controls and controls[cid] in by_cond:
            cb, cc = discordants(by_cond[controls[cid]])
            ctrl_cell = (f"{controls[cid]}: p={mcnemar_exact(cb, cc):.3f} "
                         f"(b={cb},c={cc})")
        pos = {True: [0, 0], False: [0, 0]}
        for r in recs:
            pos[r["good_is_a"]][0] += r["correct"]
            pos[r["good_is_a"]][1] += 1
        conf_r = [r["confidence"] for r in recs if r["correct"] and r.get("confidence")]
        conf_w = [r["confidence"] for r in recs if not r["correct"] and r.get("confidence")]
        cost = [r["cost_usd"] for r in recs if r.get("cost_usd")]
        fmt = lambda vals: f"{sum(vals)/len(vals):.2f}" if vals else "-"
        pa = (f"{pos[True][0]}/{pos[True][1]}") if pos[True][1] else "-"
        pb = (f"{pos[False][0]}/{pos[False][1]}") if pos[False][1] else "-"
        row = (f"| {cid} | {n}{'+' + str(len(errs)) + 'err' if errs else ''} "
               f"| **{k}/{n}** ({k/n:.0%}) | {lo:.0%}-{hi:.0%} "
               f"| {'-' if p is None else f'{p:.3f} (b={b},c={c})'} "
               f"| {ctrl_cell} "
               f"| {pa} | {pb} | {fmt(conf_r)} | {fmt(conf_w)} "
               f"| {fmt(cost).replace('-', '-') if cost else '-'} |")
        lines.append(row)
    lines.append("")

    all_items = sorted({i for c in by_cond.values() for i in c
                        if i != "__prime__"})
    lines += ["## Per-item matrix (x = wrong, . = right, ! = error)", "",
              "| item | " + " | ".join(conds) + " |",
              "|" + "---|" * (len(conds) + 1)]
    hard = []
    for item in all_items:
        cells, wrong = [], 0
        for cid in conds:
            r = by_cond[cid].get(item)
            if r is None:
                cells.append(" ")
            elif "error" in r:
                cells.append("!")
            elif "correct" not in r:
                cells.append(" ")
            elif r["correct"]:
                cells.append(".")
            else:
                cells.append("x")
                wrong += 1
        lines.append(f"| {item} | " + " | ".join(cells) + " |")
        if wrong >= max(2, len(conds) - 1):
            hard.append(item)
    lines.append("")
    if hard:
        lines += [f"Items wrong in (almost) every condition they appear in - "
                  f"consistently hard pairs: **{', '.join(hard)}**", ""]

    total_cost = sum(r.get("cost_usd") or 0 for r in records)
    lines += [f"Total recorded spend: ${total_cost:.2f} over {len(records)} trials.", ""]

    report = os.path.join(HERE, "results", "report.md")
    with open(report, "w") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))
    print(f"\nwritten to {report}", file=sys.stderr)


if __name__ == "__main__":
    main()
