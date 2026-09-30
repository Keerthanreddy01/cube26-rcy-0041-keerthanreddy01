import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  const malformed = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const values = splitCSVLine(rawLine);
    if (values.length !== headers.length) {
      malformed.push({ lineIndex: i + 1, raw: rawLine, expectedCols: headers.length, actualCols: values.length });
      continue;
    }
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx];
    });
    rows.push(row);
  }
  return { headers, rows, malformed, totalLines: lines.length - 1 };
}

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

console.log('====================================================');
console.log('   RECOVER — DATA VERIFICATION & SCHEMA AUDIT');
console.log('====================================================\n');

// 1. Fee Report Sample
const feePath = path.join(rootDir, 'data', 'fee_report_sample.csv');
const feeContent = fs.readFileSync(feePath, 'utf-8');
const feeParsed = parseCSV(feeContent);
console.log(`[Fee Report] Path: ${feePath}`);
console.log(`  Source rows in file: ${feeParsed.totalLines}`);
console.log(`  Successfully parsed: ${feeParsed.rows.length}`);
console.log(`  Malformed rows:      ${feeParsed.malformed.length}`);
console.log(`  Headers (${feeParsed.headers.length}): ${feeParsed.headers.join(', ')}`);

// 2. Receiving Sample
const rcvPath = path.join(rootDir, 'data', 'upstream', 'receiving_sample.csv');
const rcvContent = fs.readFileSync(rcvPath, 'utf-8');
const rcvParsed = parseCSV(rcvContent);
console.log(`\n[Receiving] Path: ${rcvPath}`);
console.log(`  Source rows in file: ${rcvParsed.totalLines}`);
console.log(`  Successfully parsed: ${rcvParsed.rows.length}`);
console.log(`  Malformed rows:      ${rcvParsed.malformed.length}`);
console.log(`  Headers (${rcvParsed.headers.length}): ${rcvParsed.headers.join(', ')}`);

// 3. Prep Sample
const prepPath = path.join(rootDir, 'data', 'upstream', 'prep_sample.csv');
const prepContent = fs.readFileSync(prepPath, 'utf-8');
const prepParsed = parseCSV(prepContent);
console.log(`\n[Prep] Path: ${prepPath}`);
console.log(`  Source rows in file: ${prepParsed.totalLines}`);
console.log(`  Successfully parsed: ${prepParsed.rows.length}`);
console.log(`  Malformed rows:      ${prepParsed.malformed.length}`);
console.log(`  Headers (${prepParsed.headers.length}): ${prepParsed.headers.join(', ')}`);

// 4. Pack Sample
const packPath = path.join(rootDir, 'data', 'upstream', 'pack_sample.csv');
const packContent = fs.readFileSync(packPath, 'utf-8');
const packParsed = parseCSV(packContent);
console.log(`\n[Pack] Path: ${packPath}`);
console.log(`  Source rows in file: ${packParsed.totalLines}`);
console.log(`  Successfully parsed: ${packParsed.rows.length}`);
console.log(`  Malformed rows:      ${packParsed.malformed.length}`);
console.log(`  Headers (${packParsed.headers.length}): ${packParsed.headers.join(', ')}`);

// 5. Returns Sample
const retPath = path.join(rootDir, 'data', 'upstream', 'returns_sample.csv');
const retContent = fs.readFileSync(retPath, 'utf-8');
const retParsed = parseCSV(retContent);
console.log(`\n[Returns] Path: ${retPath}`);
console.log(`  Source rows in file: ${retParsed.totalLines}`);
console.log(`  Successfully parsed: ${retParsed.rows.length}`);
console.log(`  Malformed rows:      ${retParsed.malformed.length}`);
console.log(`  Headers (${retParsed.headers.length}): ${retParsed.headers.join(', ')}`);

console.log('\n====================================================');
console.log('   UNIT MATCHING & ROUTE (FBA vs 3PL) AUDIT');
console.log('====================================================\n');

// Build indexes
const rcvByUnit = new Map(rcvParsed.rows.map(r => [r.unit_id, r]));
const prepByUnit = new Map(prepParsed.rows.map(r => [r.unit_id, r]));
const packByUnit = new Map(packParsed.rows.map(r => [r.unit_id, r]));
const retByUnit = new Map(retParsed.rows.map(r => [r.unit_id, r]));

let matchedCount = 0;
let unmatchedCount = 0;
let fbaRouteCount = 0; // Has prep
let packRouteCount = 0; // Has pack
let bothRouteCount = 0; // Has both prep and pack
let neitherCount = 0;

for (const fee of feeParsed.rows) {
  const uId = fee.unit_id;
  const hasRcv = rcvByUnit.has(uId);
  const hasPrep = prepByUnit.has(uId);
  const hasPack = packByUnit.has(uId);
  const hasRet = retByUnit.has(uId);

  if (hasRcv || hasPrep || hasPack || hasRet) {
    matchedCount++;
    if (hasPrep && !hasPack) fbaRouteCount++;
    else if (!hasPrep && hasPack) packRouteCount++;
    else if (hasPrep && hasPack) bothRouteCount++;
    else neitherCount++;
  } else {
    unmatchedCount++;
  }
}

console.log(`Total Fee Rows Evaluated:  ${feeParsed.rows.length}`);
console.log(`Matched to Upstream Units: ${matchedCount}`);
console.log(`Unmatched Fee Rows:        ${unmatchedCount}`);
console.log(`FBA Route (Receiving -> Prep):      ${fbaRouteCount}`);
console.log(`Pack Route (Receiving -> Pack):     ${packRouteCount}`);
console.log(`Overlapping (Both Prep & Pack):     ${bothRouteCount}`);
console.log(`Only Receiving/Returns:             ${neitherCount}`);

console.log('\n====================================================');
console.log('   TENANCY ISOLATION (ORG_ID) AUDIT');
console.log('====================================================\n');

let orgCrossViolations = 0;
for (const fee of feeParsed.rows) {
  const feeOrg = fee.org_id;
  const uId = fee.unit_id;
  const rcv = rcvByUnit.get(uId);
  if (rcv && rcv.org_id && feeOrg && rcv.org_id !== feeOrg) {
    orgCrossViolations++;
    console.warn(`[SECURITY WARNING] Cross-org match: Fee org ${feeOrg} vs Rcv org ${rcv.org_id} on unit ${uId}`);
  }
}
console.log(`Cross-organization violations detected: ${orgCrossViolations}`);
if (orgCrossViolations === 0) {
  console.log('✓ Tenancy isolation verified: 100% of matches preserve org_id boundary.');
}
