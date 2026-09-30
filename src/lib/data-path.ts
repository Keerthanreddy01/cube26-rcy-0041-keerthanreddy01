import fs from 'fs';
import path from 'path';

export function resolveDataPath(...subpaths: string[]): string {
  // Candidate 1: process.cwd()/data/...
  const p1 = path.join(process.cwd(), 'data', ...subpaths);
  if (fs.existsSync(p1)) return p1;

  // Candidate 2: process.cwd()/../data/...
  const p2 = path.join(process.cwd(), '..', 'data', ...subpaths);
  if (fs.existsSync(p2)) return p2;

  // Candidate 3: relative to this file
  const p3 = path.resolve(__dirname, '../../../data', ...subpaths);
  if (fs.existsSync(p3)) return p3;

  return p1;
}
