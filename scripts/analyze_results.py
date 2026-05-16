#!/usr/bin/env python3
"""Analyze FormatEntropy result files — prompt-level slicing."""

import json
import glob
import sys
from pathlib import Path
from collections import defaultdict

RESULTS_DIR = Path(__file__).parent.parent / "data" / "results"

def load_results():
    files = sorted(glob.glob(str(RESULTS_DIR / "formatentropy-*.json")))
    if not files:
        print("No result files found in data/results/")
        sys.exit(1)
    print(f"Loaded {len(files)} result file(s)")
    runs = []
    for f in files:
        with open(f) as fh:
            data = json.load(fh)
        runs.extend(data.get("runHistory", []))
    return runs

def analyze(runs):
    by_prompt = defaultdict(list)
    for r in runs:
        by_prompt[r["promptId"]].append(r)
    
    # Global stats
    total_runs = len(runs)
    total_prompts = len(by_prompt)
    control_runs = [r for r in runs if r["format"] == "control"]
    symbolic_runs = [r for r in runs if r["format"] == "symbolic"]
    
    print(f"\n{'='*80}")
    print(f"TOTALS: {total_runs} runs across {total_prompts} prompts")
    print(f"  Control runs: {len(control_runs)} | Symbolic runs: {len(symbolic_runs)}")
    
    # Per-prompt analysis
    print(f"\n{'='*80}")
    print(f"{'Prompt':<6} {'Runs':>4} {'Ctrl Ent':>9} {'Sym Ent':>9} {'Δ Ent':>7} {'Δ%':>6} "
          f"{'Ctrl Resp':>10} {'Sym Resp':>10} {'Δ Resp':>7} {'Direction':<20}")
    print(f"{'-'*6} {'-'*4} {'-'*9} {'-'*9} {'-'*7} {'-'*6} "
          f"{'-'*10} {'-'*10} {'-'*7} {'-'*20}")
    
    prompt_stats = []
    for pid in sorted(by_prompt.keys()):
        pruns = by_prompt[pid]
        ctrl = [r for r in pruns if r["format"] == "control"]
        sym = [r for r in pruns if r["format"] == "symbolic"]
        
        ctrl_ent = sum(r["result"]["avgEntropyPerToken"] for r in ctrl) / len(ctrl) if ctrl else 0
        sym_ent = sum(r["result"]["avgEntropyPerToken"] for r in sym) / len(sym) if sym else 0
        ent_diff = sym_ent - ctrl_ent
        ent_pct = (ent_diff / ctrl_ent * 100) if ctrl_ent > 0 else 0
        
        ctrl_resp = sum(r["result"]["responseLength"] for r in ctrl) / len(ctrl) if ctrl else 0
        sym_resp = sum(r["result"]["responseLength"] for r in sym) / len(sym) if sym else 0
        resp_diff = sym_resp - ctrl_resp
        
        ctrl_prompt = sum(r["result"]["promptLength"] for r in ctrl) / len(ctrl) if ctrl else 0
        sym_prompt = sum(r["result"]["promptLength"] for r in sym) / len(sym) if sym else 0
        prompt_diff = sym_prompt - ctrl_prompt
        
        direction = "↓ symbolic lower" if ent_diff < -0.001 else "↑ symbolic higher" if ent_diff > 0.001 else "→ no change"
        
        prompt_stats.append({
            "pid": pid, "ctrl_ent": ctrl_ent, "sym_ent": sym_ent,
            "ent_diff": ent_diff, "ent_pct": ent_pct,
            "ctrl_resp": ctrl_resp, "sym_resp": sym_resp, "resp_diff": resp_diff,
            "ctrl_prompt": ctrl_prompt, "sym_prompt": sym_prompt, "prompt_diff": prompt_diff,
            "direction": direction
        })
        
        print(f"#{pid:<5} {len(pruns):>4} {ctrl_ent:>9.4f} {sym_ent:>9.4f} {ent_diff:>+7.4f} {ent_pct:>+5.1f}% "
              f"{ctrl_resp:>10.1f} {sym_resp:>10.1f} {resp_diff:>+7.1f} {direction:<20}")
    
    # Sort by entropy diff
    prompt_stats.sort(key=lambda x: x["ent_pct"])
    
    # Summary stats
    print(f"\n{'='*80}")
    print("AGGREGATE BY PROMPT (sorted by entropy % change):")
    
    all_ent_diffs = [s["ent_pct"] for s in prompt_stats]
    all_resp_diffs = [s["resp_diff"] for s in prompt_stats]
    all_prompt_diffs = [s["prompt_diff"] for s in prompt_stats]
    
    avg_ent_change = sum(all_ent_diffs) / len(all_ent_diffs) if all_ent_diffs else 0
    avg_resp_change = sum(all_resp_diffs) / len(all_resp_diffs) if all_resp_diffs else 0
    avg_prompt_change = sum(all_prompt_diffs) / len(all_prompt_diffs) if all_prompt_diffs else 0
    
    flipped_up = sum(1 for d in all_ent_diffs if d > 0.001)
    flipped_down = sum(1 for d in all_ent_diffs if d < -0.001)
    no_change = sum(1 for d in all_ent_diffs if -0.001 <= d <= 0.001)
    
    print(f"\n  Entropy % change:  avg={avg_ent_change:>+6.1f}%  min={min(all_ent_diffs):>+6.1f}%  max={max(all_ent_diffs):>+6.1f}%")
    print(f"  Response Δ tokens: avg={avg_resp_change:>+7.1f}  min={min(all_resp_diffs):>+7.1f}  max={max(all_resp_diffs):>+7.1f}")
    print(f"  Prompt Δ chars:    avg={avg_prompt_change:>+7.1f}  min={min(all_prompt_diffs):>+7.1f}  max={max(all_prompt_diffs):>+7.1f}")
    print(f"\n  Direction flips:")
    print(f"    ↓ symbolic lower: {flipped_down} prompts")
    print(f"    ↑ symbolic higher: {flipped_up} prompts")
    print(f"    → no change: {no_change} prompts")
    
    # Per-prompt median entropy
    print(f"\n{'='*80}")
    print("PER-PROMPT MEDIAN ENTROPY:")
    for s in prompt_stats:
        pid = s["pid"]
        pruns = by_prompt[pid]
        ctrl_med = sorted([r["result"]["medianEntropy"] for r in pruns if r["format"] == "control"])
        sym_med = sorted([r["result"]["medianEntropy"] for r in pruns if r["format"] == "symbolic"])
        ctrl_median = ctrl_med[len(ctrl_med)//2] if ctrl_med else 0
        sym_median = sym_med[len(sym_med)//2] if sym_med else 0
        print(f"  #{pid}: control median={ctrl_median:.4f}  symbolic median={sym_median:.4f}  diff={sym_median-ctrl_median:>+6.4f}")
    
    # Per-prompt max/min entropy
    print(f"\n{'='*80}")
    print("PER-PROMPT MAX/MIN ENTROPY:")
    for s in prompt_stats:
        pid = s["pid"]
        pruns = by_prompt[pid]
        ctrl_max = max([r["result"]["maxEntropy"] for r in pruns if r["format"] == "control"]) if any(r["format"] == "control" for r in pruns) else 0
        sym_max = max([r["result"]["maxEntropy"] for r in pruns if r["format"] == "symbolic"]) if any(r["format"] == "symbolic" for r in pruns) else 0
        ctrl_min = min([r["result"]["minEntropy"] for r in pruns if r["format"] == "control"]) if any(r["format"] == "control" for r in pruns) else 0
        sym_min = min([r["result"]["minEntropy"] for r in pruns if r["format"] == "symbolic"]) if any(r["format"] == "symbolic" for r in pruns) else 0
        print(f"  #{pid}: ctrl max={ctrl_max:.4f} min={ctrl_min:.4f}  sym max={sym_max:.4f} min={sym_min:.4f}")

if __name__ == "__main__":
    runs = load_results()
    analyze(runs)
