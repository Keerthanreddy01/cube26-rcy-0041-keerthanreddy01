// =============================================================================
// RECOVER — Decision Engine
// Conservative, precision-first recovery decision logic
// Implements cross-stage precedence, pre-existing condition detection, and
// strict condition-relevance matching across upstream operational stages.
// =============================================================================
import { v4 as uuidv4 } from 'uuid';
import type {
  ChargeRecord, ChargeAnalysis, EvidenceItem, RecoveryDecision,
  MatchStrategy, FailureMode, Claim, ReviewCase, AuditEntry,
  TimelineEntry, EvidenceState, EvidenceFinding
} from './types';
import { getEvidenceForUnit } from './evidence';
import type { ReceivingRecord, PrepRecord, PackRecord, ReturnsRecord } from './types';

// =============================================================================
// Charge Type Recovery Rules
// IMPORTANT: These are demo/configurable rules — NOT authoritative Amazon policy.
// =============================================================================
const RECOVERABLE_CHARGE_TYPES = [
  'inbound_defect_fee',
  'lost_inbound',
  'damaged_in_warehouse',
  'refund_issued_item_not_returned',
];

// Fulfilment fee weight tier is typically a legitimate operational fee — not directly recoverable
// unless there's an audited scale calibration measurement error.
const NON_RECOVERABLE_CHARGE_TYPES = [
  'fulfilment_fee_weight_tier',
];

// =============================================================================
// Matching Engine
// =============================================================================
export function determineMatchStrategy(
  charge: ChargeRecord,
  upstreamData: {
    receiving: ReceivingRecord[];
    prep: PrepRecord[];
    pack: PackRecord[];
    returns: ReturnsRecord[];
  }
): { strategy: MatchStrategy; confidence: string; explanation: string } {
  if (!charge.unit_id) {
    return {
      strategy: 'unmatched',
      confidence: 'none',
      explanation: 'No unit_id present on the charge record.',
    };
  }

  // Check if unit_id exists in any upstream data
  const hasReceiving = upstreamData.receiving.some(r => r.unit_id === charge.unit_id);
  const hasPrep = upstreamData.prep.some(r => r.unit_id === charge.unit_id);
  const hasPack = upstreamData.pack.some(r => r.unit_id === charge.unit_id);
  const hasReturns = upstreamData.returns.some(r => r.unit_id === charge.unit_id);

  if (hasReceiving || hasPrep || hasPack || hasReturns) {
    return {
      strategy: 'unit_id_exact',
      confidence: 'high',
      explanation: `unit_id ${charge.unit_id} found in upstream evidence.`,
    };
  }

  // Try order_id matching
  if (charge.order_id) {
    const packByOrder = upstreamData.pack.filter(r => r.order_id === charge.order_id);
    const returnsByOrder = upstreamData.returns.filter(r => r.order_id === charge.order_id);
    if (packByOrder.length > 0 || returnsByOrder.length > 0) {
      return {
        strategy: 'order_id_asin',
        confidence: 'medium',
        explanation: `Matched via order_id ${charge.order_id}.`,
      };
    }
  }

  return {
    strategy: 'unmatched',
    confidence: 'none',
    explanation: 'No reliable upstream identity found for this charge.',
  };
}

// =============================================================================
// Recovery Decision Logic — Conservative / Precision-First
// =============================================================================
function makeDecision(
  charge: ChargeRecord,
  evidence: EvidenceItem[],
  findings: EvidenceFinding[],
  matchStrategy: MatchStrategy,
): {
  decision: RecoveryDecision;
  reasoning: string;
  claimAmount: number;
  failureModes: FailureMode[];
} {
  const failureModes: FailureMode[] = [];

  // 1. Unmatched — cannot make a claim
  if (matchStrategy === 'unmatched') {
    failureModes.push('missing_upstream_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'No upstream evidence found for this unit. Cannot assess recovery without evidence.',
      claimAmount: 0,
      failureModes,
    };
  }

  // 2. Non-recoverable charge type (e.g. weight tier)
  if (NON_RECOVERABLE_CHARGE_TYPES.includes(charge.charge_type)) {
    return {
      decision: 'NO_CLAIM',
      reasoning: `Charge type "${charge.charge_type}" is a standard fulfilment fee. Recovery requires evidence of a weight/tier measurement error, which upstream operational evidence does not cover. Demo/configurable rule — not authoritative.`,
      claimAmount: 0,
      failureModes,
    };
  }

  // 3. Unknown charge type
  if (!RECOVERABLE_CHARGE_TYPES.includes(charge.charge_type) &&
      !NON_RECOVERABLE_CHARGE_TYPES.includes(charge.charge_type)) {
    failureModes.push('unsupported_charge_type');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: `Unknown charge type "${charge.charge_type}". Cannot determine recovery eligibility without known rules.`,
      claimAmount: 0,
      failureModes,
    };
  }

  // 4. No evidence at all
  if (evidence.length === 0) {
    failureModes.push('missing_upstream_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Unit matched but no upstream evidence records found. Insufficient evidence to support or refute the charge.',
      claimAmount: 0,
      failureModes,
    };
  }

  // Charge-type specific decision rules using generalized evidence reasoning
  switch (charge.charge_type) {
    case 'inbound_defect_fee':
      return decideInboundDefect(charge, evidence, findings, failureModes);

    case 'lost_inbound':
      return decideLostInbound(charge, evidence, findings, failureModes);

    case 'damaged_in_warehouse':
      return decideDamagedInWarehouse(charge, evidence, findings, failureModes);

    case 'refund_issued_item_not_returned':
      return decideRefundNotReturned(charge, evidence, findings, failureModes);

    default:
      failureModes.push('unsupported_charge_type');
      return {
        decision: 'REVIEW_REQUIRED',
        reasoning: `No decision rule for charge type "${charge.charge_type}".`,
        claimAmount: 0,
        failureModes,
      };
  }
}

// =============================================================================
// Inbound Defect Fee Rule (Generalized Precedence & Pre-existing Condition Logic)
// =============================================================================
function decideInboundDefect(
  charge: ChargeRecord,
  evidence: EvidenceItem[],
  findings: EvidenceFinding[],
  failureModes: FailureMode[],
): { decision: RecoveryDecision; reasoning: string; claimAmount: number; failureModes: FailureMode[] } {
  const rcvEvidence = evidence.filter(e => e.source === 'receiving');
  const prepEvidence = evidence.filter(e => e.source === 'prep');

  // Rule A: Missing critical receiving intake evidence
  if (rcvEvidence.length === 0) {
    failureModes.push('missing_upstream_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Missing receiving intake record. Cannot establish arrival condition of unit.',
      claimAmount: 0,
      failureModes,
    };
  }

  // Rule B: Pre-existing Condition Precedence Rule
  // If receiving recorded pre-existing physical damage or obvious defect on arrival,
  // subsequent packaging compliance at prep does NOT negate the intake defect.
  const preExistingIntakeDefect = findings.find(
    f => f.source === 'receiving' && f.is_pre_existing && f.classification === 'CONTRADICTS_CLAIM' && f.impact === 'HIGH'
  );
  if (preExistingIntakeDefect) {
    return {
      decision: 'NO_CLAIM',
      reasoning: `Receiving evidence recorded pre-existing intake defect (${preExistingIntakeDefect.finding}). Later packaging compliance does not establish that the unit was free from pre-existing receiving damage. Inbound defect fee is supported by dock arrival condition.`,
      claimAmount: 0,
      failureModes: [],
    };
  }

  // Rule C: Uncertain Receiving Arrival or Identity Condition
  const uncertainReceiving = findings.find(
    f => f.source === 'receiving' && (f.classification === 'UNCERTAIN' || f.classification === 'MISSING')
  );
  if (uncertainReceiving || rcvEvidence.some(e => e.state === 'UNCERTAIN')) {
    failureModes.push('insufficient_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Receiving arrival condition or product identity was marked uncertain. Causal origin of defect cannot be determined without manual inspection.',
      claimAmount: 0,
      failureModes,
    };
  }

  // Rule D: Missing Prep Record
  if (prepEvidence.length === 0) {
    failureModes.push('incomplete_evidence_chain');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Receiving dock intake was clean, but no prep record was found. Cannot verify packaging compliance without prep evidence.',
      claimAmount: 0,
      failureModes,
    };
  }

  // Rule E: Direct Prep Operational Defect (e.g. missing polybag, missing warning, missing label)
  const directPrepDefect = findings.find(
    f => f.source === 'prep' && f.classification === 'CONTRADICTS_CLAIM' && f.impact === 'HIGH'
  );
  if (directPrepDefect || prepEvidence.some(e => e.state === 'FAIL')) {
    return {
      decision: 'NO_CLAIM',
      reasoning: `Prep evidence confirms operational non-compliance (${directPrepDefect?.finding || 'packaging defect'}). The inbound defect fee is supported by prep inspection records.`,
      claimAmount: 0,
      failureModes: [],
    };
  }

  // Rule F: Uncertain Prep Flags (e.g. uncertain barcode coverage, uncertain label placement)
  const uncertainPrepFindings = findings.filter(
    f => f.source === 'prep' && f.classification === 'UNCERTAIN'
  );
  if (uncertainPrepFindings.length > 0 || prepEvidence.some(e => e.state === 'UNCERTAIN')) {
    failureModes.push('insufficient_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: `Prep evidence contains uncertain inspection flags (${uncertainPrepFindings.map(f => f.finding).join('; ')}). Automatic claim recommendation blocked pending human review.`,
      claimAmount: 0,
      failureModes,
    };
  }

  // Rule G: Clean Receiving + Clean Prep Compliance -> Confident Claim Recommended
  const rcvClean = rcvEvidence.every(e => e.state === 'PASS');
  const prepClean = prepEvidence.every(e => e.state === 'PASS');

  if (rcvClean && prepClean) {
    return {
      decision: 'CLAIM_RECOMMENDED',
      reasoning: 'Receiving evidence verifies unit arrived without damage, and prep evidence verifies full compliance with all packaging and labeling requirements. Available upstream records contradict the defect fee.',
      claimAmount: charge.amount_usd,
      failureModes: [],
    };
  }

  failureModes.push('insufficient_evidence');
  return {
    decision: 'REVIEW_REQUIRED',
    reasoning: 'Insufficient clear evidence across receiving and prep to make an automated recovery recommendation.',
    claimAmount: 0,
    failureModes,
  };
}

// =============================================================================
// Lost Inbound Rule
// =============================================================================
function decideLostInbound(
  charge: ChargeRecord,
  evidence: EvidenceItem[],
  findings: EvidenceFinding[],
  failureModes: FailureMode[],
): { decision: RecoveryDecision; reasoning: string; claimAmount: number; failureModes: FailureMode[] } {
  const rcvEvidence = evidence.filter(e => e.source === 'receiving');

  if (rcvEvidence.length === 0) {
    failureModes.push('missing_upstream_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'No receiving record found to confirm whether unit was received before being marked lost.',
      claimAmount: 0,
      failureModes,
    };
  }

  // If receiving condition was uncertain or severely compromised on arrival
  if (rcvEvidence.some(e => e.state === 'UNCERTAIN' || e.state === 'FAIL')) {
    failureModes.push('insufficient_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Receiving arrival condition was uncertain or damaged prior to loss; requires human review to verify inventory receipt status.',
      claimAmount: 0,
      failureModes,
    };
  }

  // Clean receiving receipt confirms unit was safely accepted at warehouse
  if (rcvEvidence.every(e => e.state === 'PASS')) {
    return {
      decision: 'CLAIM_RECOMMENDED',
      reasoning: 'Receiving evidence confirms the unit was successfully received into the warehouse. Amazon inventory adjustment marks unit as lost. Reimbursement claim supported.',
      claimAmount: charge.amount_usd,
      failureModes: [],
    };
  }

  return {
    decision: 'REVIEW_REQUIRED',
    reasoning: 'Uncertain receiving status for lost inbound unit.',
    claimAmount: 0,
    failureModes,
  };
}

// =============================================================================
// Damaged in Warehouse Rule
// =============================================================================
function decideDamagedInWarehouse(
  charge: ChargeRecord,
  evidence: EvidenceItem[],
  findings: EvidenceFinding[],
  failureModes: FailureMode[],
): { decision: RecoveryDecision; reasoning: string; claimAmount: number; failureModes: FailureMode[] } {
  // Pre-existing condition rule: if unit arrived damaged at receiving dock,
  // warehouse damage charge was NOT caused by internal warehouse operations.
  const preExistingDefect = findings.find(
    f => f.source === 'receiving' && f.is_pre_existing && f.classification === 'CONTRADICTS_CLAIM' && f.impact === 'HIGH'
  );
  if (preExistingDefect) {
    return {
      decision: 'NO_CLAIM',
      reasoning: `Receiving record shows damage pre-existed warehouse custody (${preExistingDefect.finding}). Defect cannot be attributed to internal warehouse operations.`,
      claimAmount: 0,
      failureModes: [],
    };
  }

  const rcvEvidence = evidence.filter(e => e.source === 'receiving');
  if (rcvEvidence.length === 0) {
    failureModes.push('missing_upstream_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'No receiving record found to establish baseline condition prior to warehouse damage.',
      claimAmount: 0,
      failureModes,
    };
  }

  if (rcvEvidence.some(e => e.state === 'UNCERTAIN')) {
    failureModes.push('insufficient_evidence');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Receiving intake condition is uncertain. Cannot confirm whether damage occurred during inbound transit or warehouse storage.',
      claimAmount: 0,
      failureModes,
    };
  }

  if (rcvEvidence.every(e => e.state === 'PASS')) {
    return {
      decision: 'CLAIM_RECOMMENDED',
      reasoning: 'Receiving evidence confirms the unit arrived undamaged at the dock. Damage occurred subsequently while in Amazon warehouse custody. Reimbursement claim supported.',
      claimAmount: charge.amount_usd,
      failureModes: [],
    };
  }

  return {
    decision: 'REVIEW_REQUIRED',
    reasoning: 'Insufficient evidence to determine causality for warehouse damage.',
    claimAmount: 0,
    failureModes,
  };
}

// =============================================================================
// Refund Issued Item Not Returned Rule
// =============================================================================
function decideRefundNotReturned(
  charge: ChargeRecord,
  evidence: EvidenceItem[],
  findings: EvidenceFinding[],
  failureModes: FailureMode[],
): { decision: RecoveryDecision; reasoning: string; claimAmount: number; failureModes: FailureMode[] } {
  const rtnEvidence = evidence.filter(e => e.source === 'returns');

  if (rtnEvidence.length > 0 && rtnEvidence.some(e => e.state === 'PASS')) {
    return {
      decision: 'CLAIM_RECOMMENDED',
      reasoning: 'Returns intake evidence confirms the physical item was returned into warehouse inventory. Amazon charge for "refund issued, item not returned" is directly refuted. Reimbursement recommended.',
      claimAmount: charge.amount_usd,
      failureModes: [],
    };
  }

  const packEvidence = evidence.filter(e => e.source === 'pack');
  if (packEvidence.length > 0) {
    failureModes.push('incomplete_evidence_chain');
    return {
      decision: 'REVIEW_REQUIRED',
      reasoning: 'Outbound pack station confirms shipment, but no reverse logistics return record was found. Cannot determine if customer returned the product without returns evidence.',
      claimAmount: 0,
      failureModes,
    };
  }

  failureModes.push('missing_upstream_evidence');
  return {
    decision: 'REVIEW_REQUIRED',
    reasoning: 'No return or outbound pack records found for this order. Insufficient data to verify return status.',
    claimAmount: 0,
    failureModes,
  };
}

// =============================================================================
// Full Charge Analysis
// =============================================================================
export function analyzeCharge(
  charge: ChargeRecord,
  upstreamData: {
    receiving: ReceivingRecord[];
    prep: PrepRecord[];
    pack: PackRecord[];
    returns: ReturnsRecord[];
  }
): ChargeAnalysis {
  const auditTrail: AuditEntry[] = [];
  const now = new Date().toISOString();

  auditTrail.push({
    timestamp: now,
    action: 'ANALYSIS_STARTED',
    detail: `Analyzing charge ${charge.line_id} (${charge.charge_type}, $${charge.amount_usd})`,
    source: 'decision_engine',
  });

  // 1. Match strategy
  const { strategy, confidence, explanation } = determineMatchStrategy(charge, upstreamData);
  auditTrail.push({
    timestamp: now,
    action: 'MATCH_DETERMINED',
    detail: `Match: ${strategy} (${confidence}) — ${explanation}`,
    source: 'matching_engine',
  });

  // 2. Retrieve evidence
  const evidence = charge.unit_id
    ? getEvidenceForUnit(charge.unit_id, charge.charge_type, upstreamData)
    : [];

  // Extract structured findings
  const evidenceFindings = evidence.flatMap(e => e.findings_detail || []);

  auditTrail.push({
    timestamp: now,
    action: 'EVIDENCE_RETRIEVED',
    detail: `Found ${evidence.length} upstream evidence record(s) with ${evidenceFindings.length} evaluated findings`,
    source: 'evidence_engine',
  });

  // 3. Evidence coverage
  const evidenceCoverage = {
    receiving: evidence.some(e => e.source === 'receiving'),
    prep: evidence.some(e => e.source === 'prep'),
    pack: evidence.some(e => e.source === 'pack'),
    returns: evidence.some(e => e.source === 'returns'),
  };

  // 4. Aggregate contradictions/support
  const contradictions = evidence.flatMap(e => e.contradicting);
  const missingEvidence = evidence.flatMap(e => e.missing);
  const supportingEvidence = evidence.flatMap(e => e.supporting);

  // Check for missing critical evidence sources
  if (!evidenceCoverage.receiving && charge.charge_type !== 'refund_issued_item_not_returned') {
    missingEvidence.push('No receiving record found');
  }

  // 5. Make decision with generalized evidence precedence logic
  const { decision, reasoning, claimAmount, failureModes } = makeDecision(
    charge, evidence, evidenceFindings, strategy
  );

  auditTrail.push({
    timestamp: now,
    action: 'DECISION_MADE',
    detail: `Decision: ${decision} — ${reasoning}`,
    source: 'decision_engine',
  });

  if (decision === 'CLAIM_RECOMMENDED') {
    auditTrail.push({
      timestamp: now,
      action: 'CLAIM_AMOUNT_SET',
      detail: `Claim amount: $${claimAmount.toFixed(2)}`,
      source: 'decision_engine',
    });
  }

  return {
    charge,
    matchStrategy: strategy,
    matchConfidence: confidence,
    matchExplanation: explanation,
    evidence,
    evidenceFindings,
    evidenceCoverage,
    contradictions,
    missingEvidence,
    supportingEvidence,
    reasoning,
    decision,
    claimAmount,
    failureModes,
    auditTrail,
  };
}

// =============================================================================
// Claim Generation
// =============================================================================
export function generateClaim(analysis: ChargeAnalysis): Claim | null {
  if (analysis.decision !== 'CLAIM_RECOMMENDED') {
    return null;
  }

  const timeline: TimelineEntry[] = analysis.evidence.map(e => ({
    timestamp: e.timestamp,
    source: e.source,
    event: e.finding,
    state: e.state,
    detail: e.interpretation,
  }));

  // Add charge event
  timeline.push({
    timestamp: analysis.charge.posted_date,
    source: 'fee_report',
    event: `${analysis.charge.charge_type} charge posted`,
    state: 'FAIL' as EvidenceState,
    detail: `$${analysis.charge.amount_usd} — ${analysis.charge.report_type}`,
  });

  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    claim_id: `CLM-${uuidv4().slice(0, 8).toUpperCase()}`,
    charge_id: analysis.charge.line_id,
    unit_id: analysis.charge.unit_id,
    org_id: analysis.charge.org_id,
    claim_type: analysis.charge.charge_type,
    disputed_amount: analysis.claimAmount,
    reason: analysis.reasoning,
    explanation: analysis.reasoning,
    supporting_evidence: analysis.supportingEvidence,
    evidence_references: analysis.evidence,
    evidence_timeline: timeline,
    decision_state: analysis.decision,
    status: 'DRAFT',
    generated_at: new Date().toISOString(),
  };
}

// =============================================================================
// Review Case Generation
// =============================================================================
export function generateReviewCase(analysis: ChargeAnalysis): ReviewCase | null {
  if (analysis.decision !== 'REVIEW_REQUIRED') {
    return null;
  }

  const what_is_known = [
    `Charge: ${analysis.charge.charge_type} — $${analysis.charge.amount_usd}`,
    `Unit: ${analysis.charge.unit_id}`,
    `Match: ${analysis.matchStrategy} (${analysis.matchConfidence})`,
    ...analysis.supportingEvidence.map(s => `Known compliant: ${s}`),
    ...analysis.contradictions.map(c => `Known issue: ${c}`),
  ];

  const what_is_missing = analysis.missingEvidence.length > 0
    ? analysis.missingEvidence
    : ['Evidence coverage incomplete or inspection flag is uncertain'];

  const what_conflicts = analysis.contradictions.length > 0 && analysis.supportingEvidence.length > 0
    ? ['Upstream evidence presents conflicting observations across operational stages']
    : [];

  const possible_actions = [
    'Approve the automated recommendation',
    'Reject and mark as no claim',
    'Mark as insufficient evidence',
    'Add reviewer note and re-evaluate',
  ];

  return {
    id: `RVW-${uuidv4().slice(0, 8).toUpperCase()}`,
    charge: analysis.charge,
    analysis,
    reason: analysis.reasoning,
    what_is_known,
    what_is_missing,
    what_conflicts,
    possible_actions,
    status: 'PENDING',
    original_decision: analysis.decision,
  };
}

// =============================================================================
// Batch Analysis
// =============================================================================
export function analyzeAllCharges(
  charges: ChargeRecord[],
  upstreamData: {
    receiving: ReceivingRecord[];
    prep: PrepRecord[];
    pack: PackRecord[];
    returns: ReturnsRecord[];
  }
): ChargeAnalysis[] {
  return charges.map(charge => analyzeCharge(charge, upstreamData));
}
