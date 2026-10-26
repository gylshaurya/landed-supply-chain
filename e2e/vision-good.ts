import 'dotenv/config';
import path from 'node:path';
import { buildSeed } from '../server/seed/data.js';
import { inspect } from '../server/ai/qc.js';
const po = buildSeed().purchaseOrders[0];
const s = (n: string) => path.resolve('public/samples', n);
for (const set of [['qc-good-1.jpg', 'qc-good-2.png'], ['qc-bad-1.jpg', 'qc-bad-2.png']]) {
  const t = Date.now();
  const r = await inspect(po, set.map(s), s('golden-sample.jpg'));
  console.log(`\n${set[0]} → ${r.verdict} (${Math.round(r.confidence * 100)}%, ${Date.now() - t}ms) ${r.summary}`);
  for (const c of r.checks) console.log('   ', c.result.padEnd(7), c.name, '—', c.note);
  for (const d of r.defects) console.log('    defect:', d.type, d.severity, `photo ${d.photoIndex}`);
}
process.exit(0);
