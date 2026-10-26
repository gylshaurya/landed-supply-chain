import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { buildSeed } from '../server/seed/data.js';
import { inspect } from '../server/ai/qc.js';
import { readPurchaseOrder } from '../server/ai/intake.js';
const db = buildSeed();
const po = db.purchaseOrders[0];
const s = (n: string) => path.resolve('public/samples', n);
for (const set of [['qc-bad-1.jpg', 'qc-bad-2.png'], ['qc-good-1.jpg', 'qc-good-2.png']]) {
  const t = Date.now();
  const r = await inspect(po, set.map(s), s('golden-sample.jpg'));
  console.log(`\n${set.join('+')} (${Date.now() - t}ms): ${r.verdict} conf=${r.confidence} defects=${r.defects.length}`);
  console.log(' ', r.summary);
  for (const c of r.checks) console.log('   ', c.result.padEnd(7), c.name, '—', c.note);
}
const t = Date.now();
const intake = await readPurchaseOrder({ pdfBase64: fs.readFileSync(s('PO-1045.pdf')).toString('base64') });
console.log(`\nPO intake (${Date.now() - t}ms):`, intake.po.poNumber, intake.po.supplierName, intake.po.quantity, intake.po.unitCost, intake.po.depositPct + '%', intake.po.incoterm);
for (const task of intake.plan.tasks) console.log('  ', task.key.padEnd(10), String(task.durationDays).padStart(3), task.kind.padEnd(10), '<-', task.dependsOn.join(','), '|', task.name);
process.exit(0);
