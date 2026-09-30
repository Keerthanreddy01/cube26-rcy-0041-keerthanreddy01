# keerthanreddy01 · Recovery Manager (RECOVER)

**Cube Buildathon · Round 2 · Step 5 of 5**

---

## Submission Overview

- **Product Name**: RECOVER — Recovery Manager
- **Role in Commerce Chain**: Step 5 of 5 (Receiving → Prep → Pack → Returns → **Recovery Manager**)
- **Core Mission**: Turn fragmented operational evidence and fee reports into traceable, defensible recovery decisions.
- **Repository Location**: Full production implementation is housed directly at the root of this fork (`src/`, `data/`, `package.json`).

---

## Key Submission Links & Placeholders

| Field | Value / Link | Status |
|---|---|---|
| **GitHub Repository** | `https://github.com/Keerthanreddy01/cube26-rcy-0041-keerthanreddy01` | **Live & Verified** |
| **Demo / Deployment URL** | `https://recover-cube2026.vercel.app` | **Live & Verified** |
| **Demo Video (2-min)** | `[TODO: Insert Loom / YouTube unlisted demo video URL]` | Ready for URL |
| **Evaluation Report** | [`../../EVAL.md`](../../EVAL.md) | **Complete & Verified** |
| **Architecture Specification** | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | **Complete & Verified** |
| **LinkedIn Post URL** | `[TODO: Insert LinkedIn post URL after posting]` | Ready for URL |

---

## Deliverables Index

| Deliverable | Location | Description |
|---|---|---|
| **System README** | [`../../README.md`](../../README.md) | Problem, solution, architecture overview, setup, running instructions |
| **Architecture Specification** | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | Pipeline details, decision matrix, state machine, contract compatibility |
| **Evaluation Report** | [`../../EVAL.md`](../../EVAL.md) | Precision metrics (100.0% Claim Precision on independent fixture, 14/14 correctly supported, 0 false positives, cross-stage causal precedence) |
| **Interactive Application** | [`../../src`](../../src) | Next.js 16 (App Router) + TypeScript + Tailwind CSS full dashboard |
| **Evaluation Lab** | Running at `http://localhost:3000` (`#evaluation`) | Reproducible benchmark against independent synthetic evaluation fixture |
| **Upstream Evidence Layer** | [`../../src/lib/evidence.ts`](../../src/lib/evidence.ts) | Normalized evidence retrieval across Receiving, Prep, Pack, and Returns |
| **Decision & Claims Engine** | [`../../src/lib/decision-engine.ts`](../../src/lib/decision-engine.ts) | Conservative precision-first decision logic, causal precedence, and claim generator |
| **Round 3 Interoperability API** | [`../../src/app/api/recovery/decisions`](../../src/app/api/recovery/decisions/route.ts) | Programmatic JSON endpoint returning structured decisions for the 5-agent pod |

---

## Official Evidence Contract Preservation

Recovery Manager treats the **organizer's official evidence records as the authoritative interoperability baseline**. Recovery does NOT invent a competing cross-pod evidence schema.

Upstream evidence ingested from Receiving (`receiving_sample.csv`), Prep (`prep_sample.csv`), Pack (`pack_sample.csv`), and Returns (`returns_sample.csv`) preserves all original fields:
- `original`: Full raw upstream record retained on every evidence item.
- `state`: Follows the organizer's contract (`PASS`, `FAIL`, `UNCERTAIN`).
- `timestamp`: Preserves `captured_at` ISO timestamps for chronologically ordered timeline reconstruction.
- `record_id` & `unit_id`: Preserved exactly for end-to-end evidence traceability.

---

## Round 3 Five-Agent Pod Interoperability

Recovery's decisions are consumed programmatically via `GET /api/recovery/decisions` and `POST /api/recovery/decisions`:

- **Input**: Fee or reimbursement event record (`line_id`, `charge_type`, `unit_id`, `amount_usd`, `posted_date`).
- **Output**:
  ```json
  {
    "claim_id": "CLM-A1B2C3D4",
    "charge_id": "FEE-0014-1",
    "unit_id": "UNIT-0014",
    "decision": "CLAIM_RECOMMENDED",
    "claim_amount": 2.00,
    "evidence_refs": [
      { "source": "receiving", "record_id": "RCV-0014", "state": "PASS", "finding": "..." },
      { "source": "prep", "record_id": "PRP-0014", "state": "PASS", "finding": "..." }
    ],
    "reasoning": "Receiving evidence verifies unit arrived without damage, and prep evidence verifies full compliance...",
    "review_state": "DRAFT",
    "audit_metadata": {
      "analyzed_at": "2026-09-30T09:35:36Z",
      "match_strategy": "unit_id_exact",
      "match_confidence": "high",
      "stage_coverage": { "receiving": true, "prep": true, "pack": false, "returns": false }
    }
  }
  ```

---

## Kill Condition

> If a claim cannot point to at least one incontrovertible upstream evidence record directly contradicting the charged defect, it must NOT be recommended (`REVIEW_REQUIRED` or `NO_CLAIM`). No hallucinated claims or speculative policies under any circumstance.
