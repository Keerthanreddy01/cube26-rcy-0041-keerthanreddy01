// =============================================================================
// RECOVER — Round 3 Interoperability API
// Exposes programmatic access to Recovery Manager decisions and claims
// for the five-agent commerce chain pod.
// =============================================================================
import { NextResponse } from 'next/server';
import { loadFeeReport, loadUpstreamData } from '@/lib/data';
import { analyzeAllCharges, generateClaim, generateReviewCase } from '@/lib/decision-engine';
import type { ChargeRecord, RecoveryDecision, MatchStrategy } from '@/lib/types';

export interface RecoveryPodOutput {
  claim_id: string | null;
  charge_id: string;
  unit_id: string;
  decision: RecoveryDecision;
  claim_amount: number;
  evidence_refs: {
    source: string;
    record_id: string;
    state: string;
    finding: string;
  }[];
  reasoning: string;
  review_state: string;
  audit_metadata: {
    analyzed_at: string;
    match_strategy: MatchStrategy;
    match_confidence: string;
    stage_coverage: {
      receiving: boolean;
      prep: boolean;
      pack: boolean;
      returns: boolean;
    };
  };
}

export async function GET() {
  try {
    const feeReport = await loadFeeReport();
    const upstream = await loadUpstreamData();
    const analyses = analyzeAllCharges(feeReport, upstream);

    const decisions: RecoveryPodOutput[] = analyses.map(a => {
      const claim = generateClaim(a);
      const reviewCase = generateReviewCase(a);
      return {
        claim_id: claim ? claim.claim_id : null,
        charge_id: a.charge.line_id,
        unit_id: a.charge.unit_id,
        decision: a.decision,
        claim_amount: a.claimAmount,
        evidence_refs: a.evidence.map(e => ({
          source: e.source,
          record_id: e.record_id,
          state: e.state,
          finding: e.finding,
        })),
        reasoning: a.reasoning,
        review_state: reviewCase ? reviewCase.status : (claim ? claim.status : 'NOT_APPLICABLE'),
        audit_metadata: {
          analyzed_at: new Date().toISOString(),
          match_strategy: a.matchStrategy,
          match_confidence: a.matchConfidence,
          stage_coverage: a.evidenceCoverage,
        },
      };
    });

    const recommended = decisions.filter(d => d.decision === 'CLAIM_RECOMMENDED');
    const review = decisions.filter(d => d.decision === 'REVIEW_REQUIRED');
    const noClaim = decisions.filter(d => d.decision === 'NO_CLAIM');

    return NextResponse.json({
      status: 'success',
      pod_step: 'Step 5 of 5 — Recovery Manager (RECOVER)',
      version: '1.0.0',
      summary: {
        total_charges: decisions.length,
        claims_recommended: recommended.length,
        review_required: review.length,
        no_claim: noClaim.length,
        total_disputed_amount_usd: recommended.reduce((sum, d) => sum + d.claim_amount, 0),
      },
      decisions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const charge: ChargeRecord = {
      line_id: body.line_id || `FEE-EXT-${Date.now()}`,
      report_type: body.report_type || 'fee_report',
      unit_id: body.unit_id || '',
      org_id: body.org_id || 'org_demo_alpha',
      sku: body.sku || '',
      fnsku: body.fnsku || '',
      fba_shipment_id: body.fba_shipment_id || '',
      order_id: body.order_id || '',
      charge_type: body.charge_type || 'inbound_defect_fee',
      quantity: Number(body.quantity) || 1,
      amount_usd: Number(body.amount_usd) || 0,
      posted_date: body.posted_date || new Date().toISOString().slice(0, 10),
    };

    const upstream = await loadUpstreamData();
    const analyses = analyzeAllCharges([charge], upstream);
    const a = analyses[0];
    const claim = generateClaim(a);
    const reviewCase = generateReviewCase(a);

    const podOutput: RecoveryPodOutput = {
      claim_id: claim ? claim.claim_id : null,
      charge_id: a.charge.line_id,
      unit_id: a.charge.unit_id,
      decision: a.decision,
      claim_amount: a.claimAmount,
      evidence_refs: a.evidence.map(e => ({
        source: e.source,
        record_id: e.record_id,
        state: e.state,
        finding: e.finding,
      })),
      reasoning: a.reasoning,
      review_state: reviewCase ? reviewCase.status : (claim ? claim.status : 'NOT_APPLICABLE'),
      audit_metadata: {
        analyzed_at: new Date().toISOString(),
        match_strategy: a.matchStrategy,
        match_confidence: a.matchConfidence,
        stage_coverage: a.evidenceCoverage,
      },
    };

    return NextResponse.json({
      status: 'success',
      pod_step: 'Step 5 of 5 — Recovery Manager (RECOVER)',
      result: podOutput,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 400 });
  }
}
