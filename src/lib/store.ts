// =============================================================================
// RECOVER — Data Store (Client-side state management)
// =============================================================================
import type {
  ChargeRecord, ChargeAnalysis, Claim, ReviewCase,
  ImportBatch, DashboardMetrics, AuditEntry, RecoveryDecision,
  ReceivingRecord, PrepRecord, PackRecord, ReturnsRecord,
  EvaluationResult, EvaluationCase, FailureModeReport, FailureMode
} from './types';
import { ingestFeeReport } from './ingestion';
import { analyzeAllCharges, generateClaim, generateReviewCase } from './decision-engine';
import { INDEPENDENT_GROUND_TRUTH } from './eval-fixture';

// =============================================================================
// Global Store
// =============================================================================
export interface RecoveryStore {
  charges: ChargeRecord[];
  analyses: ChargeAnalysis[];
  claims: Claim[];
  reviewCases: ReviewCase[];
  importHistory: ImportBatch[];
  auditLog: AuditEntry[];
  upstream: {
    receiving: ReceivingRecord[];
    prep: PrepRecord[];
    pack: PackRecord[];
    returns: ReturnsRecord[];
  };
  isDemo: boolean;
  initialized: boolean;
}

let store: RecoveryStore = {
  charges: [],
  analyses: [],
  claims: [],
  reviewCases: [],
  importHistory: [],
  auditLog: [],
  upstream: { receiving: [], prep: [], pack: [], returns: [] },
  isDemo: false,
  initialized: false,
};

const listeners: Set<() => void> = new Set();

export function getStore(): RecoveryStore {
  return store;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach(l => l());
}

function addAudit(action: string, detail: string, source: string = 'system') {
  store.auditLog.push({
    timestamp: new Date().toISOString(),
    action,
    detail,
    source,
  });
}

// =============================================================================
// Upstream Data Loading
// =============================================================================
export async function loadUpstreamData(): Promise<void> {
  try {
    const [rcvRes, prpRes, pckRes, rtnRes] = await Promise.all([
      fetch('/api/upstream/receiving'),
      fetch('/api/upstream/prep'),
      fetch('/api/upstream/pack'),
      fetch('/api/upstream/returns'),
    ]);

    store.upstream = {
      receiving: await rcvRes.json(),
      prep: await prpRes.json(),
      pack: await pckRes.json(),
      returns: await rtnRes.json(),
    };

    addAudit('UPSTREAM_LOADED', `Loaded ${store.upstream.receiving.length} receiving, ${store.upstream.prep.length} prep, ${store.upstream.pack.length} pack, ${store.upstream.returns.length} returns records`);
    notify();
  } catch (e) {
    addAudit('UPSTREAM_LOAD_FAILED', `Error: ${e instanceof Error ? e.message : String(e)}`);
    notify();
  }
}

// =============================================================================
// Import Charges
// =============================================================================
export function importCharges(csvText: string, filename: string): ImportBatch {
  const batch = ingestFeeReport(csvText, filename, store.charges);

  store.importHistory.push(batch);
  store.charges = [...store.charges, ...batch.charges];

  addAudit('REPORT_IMPORTED', `Imported ${filename}: ${batch.parsed_rows} charges, ${batch.failed_rows} errors, ${batch.duplicate_rows} duplicates`);

  // Run analysis
  runAnalysis();

  notify();
  return batch;
}

// =============================================================================
// Run Analysis Pipeline
// =============================================================================
export function runAnalysis(): void {
  addAudit('ANALYSIS_STARTED', `Analyzing ${store.charges.length} charges against ${store.upstream.receiving.length + store.upstream.prep.length + store.upstream.pack.length + store.upstream.returns.length} upstream records`);

  store.analyses = analyzeAllCharges(store.charges, store.upstream);

  // Generate claims and review cases
  store.claims = [];
  store.reviewCases = [];

  for (const analysis of store.analyses) {
    if (analysis.decision === 'CLAIM_RECOMMENDED') {
      const claim = generateClaim(analysis);
      if (claim) store.claims.push(claim);
    } else if (analysis.decision === 'REVIEW_REQUIRED') {
      const review = generateReviewCase(analysis);
      if (review) store.reviewCases.push(review);
    }
  }

  addAudit('ANALYSIS_COMPLETE', `Results: ${store.claims.length} claims recommended, ${store.reviewCases.length} review cases, ${store.analyses.filter(a => a.decision === 'NO_CLAIM').length} no-claim`);

  notify();
}

// =============================================================================
// Review Actions
// =============================================================================
export function approveReview(reviewId: string, note?: string): void {
  const review = store.reviewCases.find(r => r.id === reviewId);
  if (!review) return;

  review.status = 'APPROVED';
  review.reviewer_note = note;
  review.reviewed_at = new Date().toISOString();

  // Generate a claim from the approved review
  const claim = generateClaim(review.analysis);
  if (claim) {
    claim.status = 'READY_FOR_SUBMISSION';
    claim.reviewed_at = review.reviewed_at;
    claim.reviewer_note = note;
    claim.original_decision = review.original_decision;
    store.claims.push(claim);
  }

  addAudit('REVIEW_APPROVED', `Review ${reviewId} approved. ${note ? 'Note: ' + note : ''}`, 'reviewer');
  notify();
}

export function rejectReview(reviewId: string, note?: string): void {
  const review = store.reviewCases.find(r => r.id === reviewId);
  if (!review) return;

  review.status = 'REJECTED';
  review.reviewer_note = note;
  review.reviewed_at = new Date().toISOString();

  addAudit('REVIEW_REJECTED', `Review ${reviewId} rejected. ${note ? 'Note: ' + note : ''}`, 'reviewer');
  notify();
}

export function markInsufficient(reviewId: string, note?: string): void {
  const review = store.reviewCases.find(r => r.id === reviewId);
  if (!review) return;

  review.status = 'INSUFFICIENT_EVIDENCE';
  review.reviewer_note = note;
  review.reviewed_at = new Date().toISOString();

  addAudit('REVIEW_INSUFFICIENT', `Review ${reviewId} marked as insufficient evidence. ${note ? 'Note: ' + note : ''}`, 'reviewer');
  notify();
}

// =============================================================================
// Dashboard Metrics
// =============================================================================
export function getMetrics(): DashboardMetrics {
  const totalCharges = store.charges.length;
  const totalAmount = store.charges.reduce((s, c) => s + c.amount_usd, 0);

  const claimAnalyses = store.analyses.filter(a => a.decision === 'CLAIM_RECOMMENDED');
  const claimsRecommended = claimAnalyses.length;
  const claimsRecommendedAmount = claimAnalyses.reduce((s, a) => s + a.claimAmount, 0);

  const reviewRequired = store.analyses.filter(a => a.decision === 'REVIEW_REQUIRED').length;
  const noClaim = store.analyses.filter(a => a.decision === 'NO_CLAIM').length;

  // Potential recovery = claims + review cases that might become claims
  const potentialRecovery = claimsRecommendedAmount;

  // Evidence coverage
  const withEvidence = store.analyses.filter(a => a.evidence.length > 0).length;
  const evidenceCoverage = totalCharges > 0 ? (withEvidence / totalCharges) * 100 : 0;

  const unmatchedCharges = store.analyses.filter(a => a.matchStrategy === 'unmatched').length;
  const uncertainCases = store.analyses.filter(a =>
    a.evidence.some(e => e.state === 'UNCERTAIN')
  ).length;

  // Recovery Guard: non-claim charges prevented from becoming unsupported claims
  const nonClaimAnalyses = store.analyses.filter(a => a.decision !== 'CLAIM_RECOMMENDED');
  const totalPrevented = nonClaimAnalyses.length;
  const preventedAmount = nonClaimAnalyses.reduce((s, a) => s + a.charge.amount_usd, 0);

  const missingEvidenceCount = nonClaimAnalyses.filter(a =>
    a.failureModes.includes('missing_upstream_evidence') ||
    a.failureModes.includes('insufficient_evidence') ||
    a.missingEvidence.length > 0
  ).length;

  const conflictingEvidenceCount = nonClaimAnalyses.filter(a =>
    a.failureModes.includes('contradictory_upstream_evidence') ||
    a.contradictions.length > 0
  ).length;

  const ambiguousIdentityCount = nonClaimAnalyses.filter(a =>
    a.failureModes.includes('ambiguous_unit_match') ||
    a.matchStrategy === 'unmatched' ||
    a.matchStrategy === 'partial_match'
  ).length;

  const unsupportedChargeCount = nonClaimAnalyses.filter(a =>
    a.failureModes.includes('unsupported_charge_type') ||
    a.decision === 'NO_CLAIM'
  ).length;

  // Charges by type
  const chargesByType: Record<string, number> = {};
  for (const c of store.charges) {
    chargesByType[c.charge_type] = (chargesByType[c.charge_type] || 0) + 1;
  }

  // Evidence coverage breakdown
  let completeCoverage = 0;
  let partialCoverage = 0;
  let conflictingCoverage = 0;
  let unmatchedCoverage = 0;

  for (const a of store.analyses) {
    if (a.matchStrategy === 'unmatched' || a.evidence.length === 0) {
      unmatchedCoverage++;
    } else if (a.contradictions.length > 0) {
      conflictingCoverage++;
    } else if (a.evidenceCoverage.receiving && (a.evidenceCoverage.prep || a.evidenceCoverage.pack)) {
      completeCoverage++;
    } else {
      partialCoverage++;
    }
  }

  return {
    totalCharges,
    totalAmount,
    potentialRecovery,
    claimsRecommended,
    claimsRecommendedAmount,
    reviewRequired,
    noClaim,
    claimPrecision: 0, // Calculated in evaluation
    evidenceCoverage,
    unmatchedCharges,
    uncertainCases,
    chargesByType,
    decisionDistribution: {
      claim_recommended: claimsRecommended,
      review_required: reviewRequired,
      no_claim: noClaim,
    },
    recoveryGuard: {
      totalPrevented,
      preventedAmount,
      missingEvidenceCount,
      conflictingEvidenceCount,
      ambiguousIdentityCount,
      unsupportedChargeCount,
    },
    coverageBreakdown: {
      complete: completeCoverage,
      partial: partialCoverage,
      conflicting: conflictingCoverage,
      unmatched: unmatchedCoverage,
    },
  };
}

// =============================================================================
// Evaluation
// =============================================================================
export function runEvaluation(): EvaluationResult {
  const analyses = store.analyses;
  const reviewAnalyses = analyses.filter(a => a.decision === 'REVIEW_REQUIRED');

  // Match each charge to the independent evaluation fixture
  const evaluationCases: EvaluationCase[] = analyses.map((a, idx) => {
    const gt = INDEPENDENT_GROUND_TRUTH.find(g => g.charge_id === a.charge.line_id);
    const caseId = gt ? gt.case_id : `EVAL-${String(idx + 1).padStart(3, '0')}`;
    const expectedOutcome = gt ? gt.expected_outcome : 'REVIEW_REQUIRED';
    const expectedAmount = gt ? gt.expected_claim_amount : 0;
    const gtReason = gt ? gt.ground_truth_reason : 'No ground truth record defined in fixture';
    const isCorrect = a.decision === expectedOutcome;

    return {
      case_id: caseId,
      charge_id: a.charge.line_id,
      unit_id: a.charge.unit_id,
      charge_type: a.charge.charge_type,
      expected_outcome: expectedOutcome,
      expected_claim_amount: expectedAmount,
      actual_outcome: a.decision,
      actual_claim_amount: a.claimAmount,
      correct: isCorrect,
      ground_truth_reason: gtReason,
      reasoning: a.reasoning,
      // Backwards compatibility aliases
      expected_decision: expectedOutcome,
      actual_decision: a.decision,
      ground_truth_note: gtReason,
    };
  });

  // Count claim correctness based on independently defined ground truth
  const recommended = evaluationCases.filter(c => c.actual_outcome === 'CLAIM_RECOMMENDED');
  const correctlySupported = recommended.filter(c => c.correct).length;
  const incorrectlyRecommended = recommended.filter(c => !c.correct).length;

  // Missed recoverable: expected CLAIM but got something else
  const missedRecoverable = evaluationCases.filter(
    c => c.expected_outcome === 'CLAIM_RECOMMENDED' && c.actual_outcome !== 'CLAIM_RECOMMENDED'
  ).length;

  const reviewRate = analyses.length > 0
    ? (reviewAnalyses.length / analyses.length) * 100
    : 0;

  const claimPrecision = recommended.length > 0
    ? (correctlySupported / recommended.length) * 100
    : 0;

  // Failure modes
  const failureModeMap = new Map<FailureMode, string[]>();
  for (const a of analyses) {
    for (const fm of a.failureModes) {
      if (!failureModeMap.has(fm)) failureModeMap.set(fm, []);
      failureModeMap.get(fm)!.push(a.charge.line_id);
    }
  }

  const failureModes: FailureModeReport[] = Array.from(failureModeMap.entries()).map(([mode, cases]) => ({
    mode,
    count: cases.length,
    percentage: analyses.length > 0 ? (cases.length / analyses.length) * 100 : 0,
    example_cases: cases.slice(0, 3),
    impact: getFailureModeImpact(mode),
  }));

  return {
    total_charges: analyses.length,
    claims_recommended: recommended.length,
    correctly_supported: correctlySupported,
    incorrectly_recommended: incorrectlyRecommended,
    missed_recoverable: missedRecoverable,
    review_rate: reviewRate,
    claim_precision: claimPrecision,
    failure_modes: failureModes,
    cases: evaluationCases,
  };
}

function getFailureModeImpact(mode: FailureMode): string {
  const impacts: Record<FailureMode, string> = {
    missing_unit_identifier: 'Cannot match charge to upstream evidence without unit ID',
    ambiguous_unit_match: 'Multiple possible matches — risk of wrong evidence association',
    missing_upstream_evidence: 'Cannot assess charge without upstream evidence records',
    contradictory_upstream_evidence: 'Conflicting evidence prevents automated decision',
    unsupported_charge_type: 'No decision rules for this charge type',
    malformed_charge_record: 'Charge record cannot be properly parsed',
    incomplete_evidence_chain: 'Partial evidence — missing key evidence sources',
    insufficient_evidence: 'Evidence exists but is insufficient for confident decision',
    model_dependency_failure: 'External dependency failure — charge preserved in review',
    duplicate_charge: 'Duplicate charge detected — prevents double recovery',
  };
  return impacts[mode] || 'Unknown impact';
}

// =============================================================================
// Reset / Demo
// =============================================================================
export function resetStore(): void {
  store = {
    charges: [],
    analyses: [],
    claims: [],
    reviewCases: [],
    importHistory: [],
    auditLog: [],
    upstream: { receiving: [], prep: [], pack: [], returns: [] },
    isDemo: false,
    initialized: false,
  };
  notify();
}

export async function loadDemoData(): Promise<void> {
  store.isDemo = true;
  addAudit('DEMO_STARTED', 'Loading demo scenario with synthetic data');

  // Load upstream data
  await loadUpstreamData();

  // Load fee report
  try {
    const res = await fetch('/api/demo/fee-report');
    const csvText = await res.text();
    importCharges(csvText, 'fee_report_sample.csv');
    store.initialized = true;
    addAudit('DEMO_COMPLETE', 'Demo scenario loaded successfully');
  } catch (e) {
    addAudit('DEMO_FAILED', `Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  notify();
}
