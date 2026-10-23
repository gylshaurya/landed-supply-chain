import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config, today } from './config.js';
import { bus } from './bus.js';
import { getDb, resetDb } from './db.js';
import { applySync, projectPayload, runwayPayload } from './bryntum.js';
import { addDays, diffDays } from './dates.js';
import { evaluateScenario, keyDates, scheduled } from './sim.js';
import { BLACK_FRIDAY } from './seed/data.js';
import * as svc from './services.js';
import * as paypal from './paypal.js';
import { readPurchaseOrder, type Intake } from './ai/intake.js';
import { bryntumPrompt } from './ai/bryntumProxy.js';
import { AIRefusal } from './ai/client.js';

const app = express();
app.use(express.json({ limit: '25mb' }));

const uploadDir = path.resolve('data/uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 6 },
});
app.use('/uploads', express.static(uploadDir));

// Simple per-IP budget for endpoints that call Claude, so a public demo can't run up the bill.
const AI_LIMIT = Number(process.env.LANDED_AI_LIMIT_PER_HOUR || 40);
const aiHits = new Map<string, number[]>();
function aiBudget(req: Request, res: Response, next: NextFunction) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? 'local').split(',')[0].trim();
  const now = Date.now();
  const hits = (aiHits.get(ip) ?? []).filter(t => now - t < 3_600_000);
  if (hits.length >= AI_LIMIT) {
    res.status(429).json({ success: false, error: 'Demo AI budget reached for this hour — try again later.' });
    return;
  }
  hits.push(now);
  aiHits.set(ip, hits);
  next();
}

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------- overview
app.get('/api/state', h(() => {
  const db = getDb();
  const tasks = scheduled(db);
  const dates = keyDates(db);
  const hero = db.purchaseOrders[0];
  const heroProduct = db.products.find(p => p.id === hero.productId)!;
  const openPre = db.preorders.filter(p => p.status === 'active' || p.status === 'kept');
  const atRisk = openPre.filter(p => p.revisedDate && p.status === 'active');
  return {
    modes: svc.modes(),
    merchant: db.merchant,
    blackFriday: BLACK_FRIDAY,
    daysToBlackFriday: diffDays(BLACK_FRIDAY, today()),
    products: db.products,
    suppliers: db.suppliers,
    purchaseOrders: db.purchaseOrders.map(po => {
      const group = tasks.find(t => t.id === `g-${po.id.replace('PO-', '')}`);
      return { ...po, keyDates: dates[po.id], start: group?.computedStart, end: group?.computedEnd, progress: Math.round(tasks.filter(t => t.poId === po.id && t.kind !== 'group').reduce((s, t) => s + t.percentDone * Math.max(1, t.duration), 0) / Math.max(1, tasks.filter(t => t.poId === po.id && t.kind !== 'group').reduce((s, t) => s + Math.max(1, t.duration), 0))) };
    }),
    payments: db.payments,
    kpis: {
      preorders: openPre.length,
      preorderRevenue: openPre.reduce((s, p) => s + p.amount, 0),
      awaitingResponse: atRisk.length,
      refunded: db.preorders.filter(p => p.status === 'refunded').length,
      kept: db.preorders.filter(p => p.status === 'kept').length,
      committedToSuppliers: db.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      heldOrScheduled: db.payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0),
      heroLaunch: dates[hero.id]?.airLaunch ?? dates[hero.id]?.launch,
      heroAtRisk: svc.promisesAtRisk(hero.id),
      heroPromise: heroProduct.promisedShipDate,
    },
    proposals: db.proposals.map(p => ({ id: p.id, status: p.status, headline: p.headline, poId: p.poId, createdAt: p.createdAt, source: p.source })),
    activity: db.activity.slice(0, 60),
    outboxCount: db.outbox.length,
    qcReports: db.qcReports.slice(0, 10),
    supplierUpdates: db.supplierUpdates.slice(0, 10),
  };
}));

app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const send = (type: string) => (data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const handlers = { change: send('change'), activity: send('activity'), agent: send('agent') };
  for (const [k, fn] of Object.entries(handlers)) bus.on(k, fn);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    for (const [k, fn] of Object.entries(handlers)) bus.off(k, fn);
  });
});

// ---------------------------------------------------------------- Bryntum
app.get('/api/project/load', h(() => projectPayload(getDb())));
app.post('/api/project/sync', h(req => applySync(req.body)));
app.get('/api/runway', h(() => runwayPayload(getDb())));

// ---------------------------------------------------------------- simulation (used by Bryntum Copilot tools)
app.post('/api/simulate', h(req => {
  const db = getDb();
  const { poId = 'PO-1042', delayDays = 0, airUnits = 0, overtimeDays = 0, overtimeCost = 0 } = req.body ?? {};
  const base = evaluateScenario(db, { poId }, 'Current plan');
  const r = evaluateScenario(db, { poId, delayDays, airUnits, overtimeDays, overtimeCost }, 'What-if');
  const { plan: _p, shipDates: _s, ...rest } = r;
  return { ...rest, increaseVsCurrentPlan: r.totalImpact - base.totalImpact, currentFirstShip: base.firstShipDate };
}));

// ---------------------------------------------------------------- supplier portal
app.post('/api/supplier/:poId/update', aiBudget, h(async req => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) throw Object.assign(new Error('Message is required'), { status: 400 });
  const poId = String(req.params.poId);
  // Run in the background; progress streams over SSE.
  svc.handleSupplierUpdate(poId, message).catch(err => {
    bus.emit('agent', { kind: 'error', text: err instanceof AIRefusal ? err.message : `Agent error: ${(err as Error).message}` });
  });
  return { accepted: true };
}));

app.post('/api/recover/:poId', aiBudget, h(req => {
  const poId = String(req.params.poId);
  svc.recoverFromPlanChange(poId).catch(err => bus.emit('agent', { kind: 'error', text: `Agent error: ${(err as Error).message}` }));
  return { accepted: true };
}));

app.post('/api/supplier/:poId/qc', aiBudget, upload.array('photos', 6), h(async req => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const samples: string[] = Array.isArray(req.body?.samples) ? req.body.samples : req.body?.samples ? [req.body.samples] : [];
  const photoPaths: string[] = [];
  const publicPaths: string[] = [];
  for (const f of files) {
    photoPaths.push(f.path);
    publicPaths.push(`/uploads/${path.basename(f.path)}`);
  }
  for (const s of samples) {
    const name = path.basename(String(s));
    const file = path.resolve('public/samples', name);
    if (!fs.existsSync(file)) continue;
    photoPaths.push(file);
    publicPaths.push(`/samples/${name}`);
  }
  if (!photoPaths.length) throw Object.assign(new Error('Upload at least one photo'), { status: 400 });
  return svc.runQc(String(req.params.poId), photoPaths, publicPaths);
}));

// ---------------------------------------------------------------- proposals
app.get('/api/proposals/:id', h(req => {
  const p = getDb().proposals.find(x => x.id === req.params.id);
  if (!p) throw Object.assign(new Error('Not found'), { status: 404 });
  return p;
}));
app.get('/api/proposals/:id/project', h(req => {
  const db = getDb();
  const p = db.proposals.find(x => x.id === req.params.id);
  if (!p) throw Object.assign(new Error('Not found'), { status: 404 });
  if (p.status !== 'pending') return projectPayload(db);
  const plan = svc.proposalPlan(p);
  return projectPayload(db, plan.tasks, plan.deps);
}));
app.post('/api/proposals/:id/approve', h(req => svc.approveProposal(String(req.params.id))));
app.post('/api/proposals/:id/reject', h(req => svc.rejectProposal(String(req.params.id))));

// ---------------------------------------------------------------- payments
app.post('/api/payments/:id/release', h(req => svc.releasePayment(String(req.params.id), 'Released manually by the merchant.')));
app.post('/api/shipments/:taskId/receive', h(req => svc.receiveShipment(String(req.params.taskId))));

// ---------------------------------------------------------------- pre-orders & outbox
app.get('/api/preorders', h(() => getDb().preorders));
app.get('/api/outbox', h(() => getDb().outbox.slice(0, 200)));

// ---------------------------------------------------------------- storefront (PayPal JS SDK v6)
app.get('/api/paypal/config', h(() => ({ clientId: config.paypal.clientId, mode: svc.modes().paypal })));
app.get('/api/paypal/ping', h(() => paypal.ping()));
app.post('/api/store/orders', h(async req => svc.createCheckout(String(req.body.productId), Number(req.body.qty ?? 1))));
app.post('/api/store/orders/:orderId/capture', h(async req => svc.captureCheckout(String(req.params.orderId), String(req.body.productId), Number(req.body.qty ?? 1), req.body.buyer)));

// ---------------------------------------------------------------- customer delay notice
app.get('/api/notice/:token', h(req => {
  const v = svc.noticeView(String(req.params.token));
  if (!v) throw Object.assign(new Error('Notice not found'), { status: 404 });
  return v;
}));
app.post('/api/notice/:token', h(async req => svc.respondToNotice(String(req.params.token), req.body.choice === 'cancel' ? 'cancel' : 'keep')));

// ---------------------------------------------------------------- PO intake
app.post('/api/intake/read', aiBudget, upload.single('file'), h(async req => {
  const file = req.file;
  const sample = req.body?.sample ? path.resolve('public/samples', path.basename(String(req.body.sample))) : null;
  const pdfPath = file?.path ?? (sample && fs.existsSync(sample) ? sample : null);
  const text = req.body?.text ? String(req.body.text) : undefined;
  if (!pdfPath && !text) throw Object.assign(new Error('Provide a PDF or the PO text'), { status: 400 });
  const pdfBase64 = pdfPath && pdfPath.toLowerCase().endsWith('.pdf') ? fs.readFileSync(pdfPath).toString('base64') : undefined;
  const txt = text ?? (pdfPath && !pdfBase64 ? fs.readFileSync(pdfPath, 'utf8') : undefined);
  return readPurchaseOrder({ pdfBase64, text: txt });
}));
app.post('/api/intake/commit', h(req => svc.commitIntake(req.body as Intake)));

// ---------------------------------------------------------------- Bryntum AI (Copilot) → Claude
app.post('/api/ai/bryntum', aiBudget, h(req => bryntumPrompt(req.body)));
app.get('/api/ai/models', h(() => ({ success: true, data: [{ id: svc.modes().model, name: 'Landed Copilot' }] })));

// ---------------------------------------------------------------- admin
app.post('/api/admin/reset', h(() => {
  resetDb();
  return { ok: true };
}));

// ---------------------------------------------------------------- static (production)
const dist = path.resolve('dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? (err instanceof AIRefusal ? 422 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, error: err.message, message: err.message });
});

export { app };

if (!process.env.VITEST) {
  getDb();
  app.listen(config.port, () => {
    const m = svc.modes();
    console.log(`Landed API on http://localhost:${config.port} · AI: ${m.ai} (${m.provider} ${m.model}) · PayPal: ${m.paypal} · today=${m.today} · next arrival check ${addDays(m.today, 0)}`);
  });
}
