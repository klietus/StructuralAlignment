# Structural Alignment

An empirical approach to AI safety that enforces constraints through input format rather than model training.

## The Paper

[**Structural Alignment: A Dual-Control Mechanism for Enforcing AI Safety Constraints**](paper/Structural_Alignment.pdf)

## Overview

Current AI alignment methods (RLHF, fine-tuning, prompt engineering) rely on probabilistic approaches to shape model behavior. Structural alignment demonstrates that safety constraints can be enforced through the structure of the input format itself, achieving empirical evidence rather than probabilistic ones.

### Key Finding

A dual-control mechanism consisting of:
- **Classification engine** (symbol catalog) — identifies harmful patterns
- **Constraint backstop** (invariants) — defines boundary conditions

With the full suite (70 symbols + invariants): **100% refusal rate** (0 compliant escapes across 160 baseline test cycles).

### The Dual-Control Interaction

The two components interact non-linearly: the classification engine's behavior depends on whether the constraint backstop is present. This suggests structural alignment is an emergent property of the format, not a sum of its parts.

## Repository Structure

```
paper/
  paper.tex              — LaTeX source
  Structural_Alignment.pdf — Published paper
scripts/
  classify_responses.py  — Response classification tool
data/
  prompts/               — 20 harmful request test cases
  results/               — Experimental result files
  seed/                  — Symbol catalog seed domain
src/                     — FormatEntropy test harness (React/Vite)
tests/                   — Playwright test suite
```

## Author

Brett Earley
