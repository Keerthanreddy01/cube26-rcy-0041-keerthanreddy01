import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Read fixture
const fixtureContent = fs.readFileSync(path.join(root, 'src', 'lib', 'eval-fixture.ts'), 'utf-8');
const jsonMatch = fixtureContent.match(/export const INDEPENDENT_GROUND_TRUTH: GroundTruthCase\[\] = (\[[\s\S]*?\]);/);
const fixture = JSON.parse(jsonMatch[1]);
const fixtureMap = new Map(fixture.map(c => [c.charge_id, c]));

console.log('--- INDEPENDENT GROUND TRUTH SUMMARY ---');
console.log(`Total Cases: ${fixture.length}`);
const outcomes = {};
for (const c of fixture) {
  outcomes[c.expected_outcome] = (outcomes[c.expected_outcome] || 0) + 1;
}
console.log('Expected distribution:', outcomes);

// Case FEE-0095-1 check
const fee95 = fixtureMap.get('FEE-0095-1');
console.log('\nCase FEE-0095-1 in Ground Truth:');
console.log(`  Expected: ${fee95.expected_outcome}`);
console.log(`  Reason:   ${fee95.ground_truth_reason}`);
