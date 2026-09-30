import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function readCSV(filename) {
  const content = fs.readFileSync(path.join(root, filename), 'utf-8').trim();
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// Read fixture
const fixtureContent = fs.readFileSync(path.join(root, 'src', 'lib', 'eval-fixture.ts'), 'utf-8');
const jsonMatch = fixtureContent.match(/export const INDEPENDENT_GROUND_TRUTH: GroundTruthCase\[\] = (\[[\s\S]*?\]);/);
const fixture = JSON.parse(jsonMatch[1]);
const fixtureMap = new Map(fixture.map(c => [c.charge_id, c]));

const feeRows = readCSV('data/fee_report_sample.csv');
const rcvRows = readCSV('data/upstream/receiving_sample.csv');
const prepRows = readCSV('data/upstream/prep_sample.csv');
const packRows = readCSV('data/upstream/pack_sample.csv');
const retRows = readCSV('data/upstream/returns_sample.csv');

const rcvByUnit = new Map(rcvRows.map(r => [r.unit_id, r]));
const prepByUnit = new Map(prepRows.map(r => [r.unit_id, r]));
const packByUnit = new Map(packRows.map(r => [r.unit_id, r]));
const retByUnit = new Map(retRows.map(r => [r.unit_id, r]));

console.log(`Loaded ${feeRows.length} fee rows, ${fixture.length} ground truth cases.`);

// Generalized decision logic simulation
function evaluateCharge(charge) {
  const { line_id, charge_type, unit_id } = charge;
  const rcv = rcvByUnit.get(unit_id);
  const prep = prepByUnit.get(unit_id);
  const pack = packByUnit.get(unit_id);
  const ret = retByUnit.get(unit_id);

  if (charge_type === 'fulfilment_fee_weight_tier') {
    return { decision: 'NO_CLAIM', reason: 'Standard operational fee' };
  }

  if (charge_type === 'inbound_defect_fee') {
    if (!rcv) return { decision: 'REVIEW_REQUIRED', reason: 'Missing receiving' };
    
    // Check for pre-existing physical damage at receiving dock
    const hasPreExistingDamage = rcv.unit_damage && rcv.unit_damage !== 'none' && rcv.unit_damage !== 'uncertain';
    if (hasPreExistingDamage) {
      return {
        decision: 'NO_CLAIM',
        reason: `Pre-existing receiving damage (${rcv.unit_damage}). Downstream prep compliance does not establish unit was undamaged.`
      };
    }

    // Check for uncertain receiving condition or identity
    if (rcv.identity_match === 'uncertain' || rcv.unit_damage === 'uncertain' || rcv.carton_damage === 'crushing') {
      // If carton is crushing and unit is uncertain
      return { decision: 'REVIEW_REQUIRED', reason: 'Uncertain receiving arrival condition' };
    }

    if (!prep) return { decision: 'REVIEW_REQUIRED', reason: 'Missing prep record' };

    // Check prep uncertain flags
    if (prep.original_barcode_covered === 'uncertain' || prep.fnsku_label_placement === 'uncertain' || prep.suffocation_warning === 'obscured_by_fold') {
      return { decision: 'REVIEW_REQUIRED', reason: 'Uncertain prep inspection flag' };
    }

    // Check prep defects
    if (prep.wo_polybag === 'True' && (prep.polybag_present_sealed === 'missing' || prep.polybag_present_sealed === 'not_sealed')) {
      return { decision: 'NO_CLAIM', reason: 'Prep polybag defect' };
    }
    if (prep.wo_suffocation_warning === 'True' && prep.suffocation_warning === 'missing') {
      return { decision: 'NO_CLAIM', reason: 'Prep suffocation warning missing' };
    }
    if (prep.fnsku_label_placement === 'missing' || prep.original_barcode_covered === 'no') {
      return { decision: 'NO_CLAIM', reason: 'Prep barcode/label defect' };
    }

    // Clean receiving + clean prep
    if (rcv.unit_damage === 'none' && rcv.carton_damage === 'none' && rcv.identity_match === 'yes') {
      return { decision: 'CLAIM_RECOMMENDED', reason: 'Receiving clean and prep compliant' };
    }

    return { decision: 'REVIEW_REQUIRED', reason: 'Ambiguous evidence' };
  }

  if (charge_type === 'lost_inbound') {
    if (!rcv) return { decision: 'REVIEW_REQUIRED', reason: 'Missing receiving' };
    if (rcv.identity_match === 'uncertain' || rcv.unit_damage === 'uncertain' || rcv.carton_damage === 'crushing') {
      return { decision: 'REVIEW_REQUIRED', reason: 'Uncertain receipt condition' };
    }
    return { decision: 'CLAIM_RECOMMENDED', reason: 'Unit received by warehouse then lost' };
  }

  if (charge_type === 'damaged_in_warehouse') {
    if (!rcv) return { decision: 'REVIEW_REQUIRED', reason: 'Missing receiving' };
    if (rcv.unit_damage && rcv.unit_damage !== 'none' && rcv.unit_damage !== 'uncertain') {
      return { decision: 'NO_CLAIM', reason: 'Damage pre-existed intake' };
    }
    if (rcv.unit_damage === 'none' && rcv.carton_damage === 'none') {
      return { decision: 'CLAIM_RECOMMENDED', reason: 'Arrived clean, damaged in warehouse custody' };
    }
    return { decision: 'REVIEW_REQUIRED', reason: 'Uncertain damage origin' };
  }

  if (charge_type === 'refund_issued_item_not_returned') {
    if (ret && ret.identity_match === 'yes') {
      return { decision: 'CLAIM_RECOMMENDED', reason: 'Item confirmed returned' };
    }
    return { decision: 'REVIEW_REQUIRED', reason: 'Return not confirmed' };
  }

  return { decision: 'REVIEW_REQUIRED', reason: 'Unknown charge type' };
}

let correct = 0;
let falsePositives = 0;
let falseNegatives = 0;
let totalRecommended = 0;
let correctlySupported = 0;

for (const charge of feeRows) {
  const gt = fixtureMap.get(charge.line_id);
  const actual = evaluateCharge(charge);
  const isCorrect = actual.decision === gt.expected_outcome;
  if (isCorrect) correct++;
  if (actual.decision === 'CLAIM_RECOMMENDED') {
    totalRecommended++;
    if (isCorrect) correctlySupported++;
    else falsePositives++;
  } else if (gt.expected_outcome === 'CLAIM_RECOMMENDED') {
    falseNegatives++;
  }

  if (!isCorrect) {
    console.log(`MISMATCH: ${charge.line_id} (${charge.charge_type}) Expected: ${gt.expected_outcome}, Actual: ${actual.decision}`);
  }
}

console.log('\n--- SIMULATION RESULTS ---');
console.log(`Total Cases: ${feeRows.length}`);
console.log(`Overall Correct: ${correct} / ${feeRows.length} (${((correct / feeRows.length) * 100).toFixed(1)}%)`);
console.log(`Claims Recommended: ${totalRecommended}`);
console.log(`Correctly Supported Claims: ${correctlySupported}`);
console.log(`False Positives: ${falsePositives}`);
console.log(`Missed Recoverable: ${falseNegatives}`);
console.log(`Claim Precision: ${((correctlySupported / totalRecommended) * 100).toFixed(1)}%`);

