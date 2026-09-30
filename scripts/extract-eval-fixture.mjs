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

const feeRows = readCSV('data/fee_report_sample.csv');
const rcvRows = readCSV('data/upstream/receiving_sample.csv');
const prepRows = readCSV('data/upstream/prep_sample.csv');
const packRows = readCSV('data/upstream/pack_sample.csv');
const retRows = readCSV('data/upstream/returns_sample.csv');

const rcvByUnit = new Map(rcvRows.map(r => [r.unit_id, r]));
const prepByUnit = new Map(prepRows.map(r => [r.unit_id, r]));
const packByUnit = new Map(packRows.map(r => [r.unit_id, r]));
const retByUnit = new Map(retRows.map(r => [r.unit_id, r]));

console.log('--- Non-weight-tier charges audit ---');
for (const f of feeRows) {
  if (f.charge_type === 'fulfilment_fee_weight_tier') continue;
  const rcv = rcvByUnit.get(f.unit_id);
  const prep = prepByUnit.get(f.unit_id);
  const pack = packByUnit.get(f.unit_id);
  const ret = retByUnit.get(f.unit_id);
  console.log(`Line: ${f.line_id} | Unit: ${f.unit_id} | Type: ${f.charge_type} | Amt: ${f.amount_usd}`);
  console.log(`   Rcv: ${rcv ? `id_match=${rcv.identity_match}, carton_dmg=${rcv.carton_damage}, unit_dmg=${rcv.unit_damage}` : 'MISSING'}`);
  console.log(`   Prep: ${prep ? `wo_poly=${prep.wo_polybag}, poly_pres=${prep.polybag_present_sealed}, wo_suff=${prep.wo_suffocation_warning}, suff=${prep.suffocation_warning}, fnsku_lbl=${prep.fnsku_label_placement}, orig_bc=${prep.original_barcode_covered}` : 'MISSING'}`);
  console.log(`   Pack: ${pack ? `observed=${pack.observed_in_box}, verdict=${pack.operator_verdict}` : 'MISSING'}`);
  console.log(`   Ret: ${ret ? `id_match=${ret.identity_match}, condition=${ret.amazon_condition}, disp=${ret.operator_disposition}` : 'MISSING'}`);
}
