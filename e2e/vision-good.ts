import 'dotenv/config';
import path from 'node:path';
import { buildSeed } from '../server/seed/data.js';
import { inspect } from '../server/ai/qc.js';
const po = buildSeed().purchaseOrders[0];
const s = (n: string) => path.resolve('public/samples', n);
for (const set of [['qc-good-1.png', 'qc-good-2.png'], ['qc-bad-1.png', 'qc-bad-2.png']]) {
  const r = await inspect(po, set.map(s), s('golden-sample.png'));
  console.log(set[0], r.verdict, r.confidence, r.defects.map(d => `${d.type}/${d.severity}`).join(', '), '|', r.summary.slice(0, 200));
}
process.exit(0);
