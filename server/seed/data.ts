import { config } from '../config.js';
import { addDays } from '../dates.js';
import type { DB, Preorder, Task } from '../types.js';

// Demo merchant: Kiln & Co, a small coffee-gear brand that imports its
// best-seller (a ceramic pour-over set) from a factory in Jingdezhen.
// The story is anchored on LANDED_TODAY = 2026-10-23, five weeks before
// Black Friday (2026-11-27).

export const BLACK_FRIDAY = '2026-11-27';
export const CYBER_MONDAY = '2026-11-30';
export const PROJECT_START = '2026-08-24';

const FIRST = ['Maya', 'Liam', 'Priya', 'Noah', 'Sofia', 'Ethan', 'Aisha', 'Lucas', 'Chloe', 'Mateo', 'Hana', 'Owen', 'Zara', 'Leo', 'Ivy', 'Kai', 'Nora', 'Arjun', 'Elena', 'Theo', 'Mila', 'Jonas', 'Ruby', 'Omar', 'Grace', 'Felix', 'Leah', 'Ravi', 'Isla', 'Diego'];
const LAST = ['Patel', 'Nguyen', 'Garcia', 'Kim', 'Okafor', 'Rossi', 'Schmidt', 'Silva', 'Cohen', 'Tanaka', 'Murphy', 'Haddad', 'Larsen', 'Moreau', 'Reyes', 'Walsh', 'Ahmed', 'Novak', 'Brooks', 'Lindqvist'];

function seededPreorders(): Preorder[] {
  const list: Preorder[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 172; i++) {
    const f = FIRST[Math.floor(rnd() * FIRST.length)];
    const l = LAST[Math.floor(rnd() * LAST.length)];
    const qty = rnd() < 0.12 ? 2 : 1;
    const dayOffset = Math.floor((i / 172) * 14);
    list.push({
      id: `po-cust-${String(i + 1).padStart(3, '0')}`,
      productId: 'pour-over',
      customerName: `${f} ${l}`,
      email: `${f}.${l}${i}@example.com`.toLowerCase(),
      qty,
      amount: 68 * qty,
      createdAt: `${addDays('2026-10-09', dayOffset)}T${String(8 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
      promisedDate: '2026-11-26',
      status: 'active',
      source: 'seed',
    });
  }
  return list;
}

function t(task: Partial<Task> & Pick<Task, 'id' | 'poId' | 'name' | 'kind' | 'duration'>): Task {
  return { percentDone: 0, ...task };
}

export function buildSeed(): DB {
  const supplierEmail = config.paypal.supplierEmail || 'supplier-sandbox@example.com';
  const tasks: Task[] = [
    // PO-1042 — the hero shipment
    t({ id: 'g-1042', poId: 'PO-1042', name: 'PO-1042 · Pour-over set × 1,200 · Jingdezhen → Long Beach', kind: 'group', duration: 0 }),
    t({ id: '1042-deposit', poId: 'PO-1042', parentId: 'g-1042', name: '30% deposit to Hongye Glassworks', kind: 'payment', duration: 0, manual: true, start: '2026-09-21', percentDone: 100, paymentId: 'pay-1042-dep', resourceId: 'r-merchant' }),
    t({ id: '1042-prod', poId: 'PO-1042', parentId: 'g-1042', name: 'Production run · glass blowing & annealing', kind: 'production', duration: 42, manual: true, start: '2026-09-22', percentDone: 70, resourceId: 'r-factory' }),
    t({ id: '1042-qc', poId: 'PO-1042', parentId: 'g-1042', name: 'Pre-shipment QC inspection (AI-verified)', kind: 'qc', duration: 2, resourceId: 'r-qc' }),
    t({ id: '1042-balance', poId: 'PO-1042', parentId: 'g-1042', name: '70% balance · released only on QC pass', kind: 'payment', duration: 0, paymentId: 'pay-1042-bal', resourceId: 'r-merchant' }),
    t({ id: '1042-load', poId: 'PO-1042', parentId: 'g-1042', name: 'Truck to Shanghai port & load container', kind: 'freight', duration: 2, resourceId: 'r-forwarder' }),
    t({ id: '1042-sea', poId: 'PO-1042', parentId: 'g-1042', name: 'Ocean freight · Shanghai → Long Beach', kind: 'freight', duration: 14, resourceId: 'r-forwarder' }),
    t({ id: '1042-customs', poId: 'PO-1042', parentId: 'g-1042', name: 'US customs clearance', kind: 'customs', duration: 2, resourceId: 'r-customs' }),
    t({ id: '1042-wh', poId: 'PO-1042', parentId: 'g-1042', name: 'Drayage & warehouse receiving', kind: 'warehouse', duration: 2, resourceId: 'r-wh' }),
    t({ id: '1042-launch', poId: 'PO-1042', parentId: 'g-1042', name: 'Ship pre-orders · restock goes live', kind: 'launch', duration: 0, resourceId: 'r-wh' }),

    // PO-1043 — linen aprons, on the water and on time
    t({ id: 'g-1043', poId: 'PO-1043', name: 'PO-1043 · Linen apron × 600 · Porto → Newark', kind: 'group', duration: 0 }),
    t({ id: '1043-deposit', poId: 'PO-1043', parentId: 'g-1043', name: '50% deposit to Tecelagem Ribeira', kind: 'payment', duration: 0, manual: true, start: '2026-08-28', percentDone: 100, paymentId: 'pay-1043-dep', resourceId: 'r-merchant' }),
    t({ id: '1043-prod', poId: 'PO-1043', parentId: 'g-1043', name: 'Weaving & sewing', kind: 'production', duration: 34, manual: true, start: '2026-08-29', percentDone: 100, resourceId: 'r-porto' }),
    t({ id: '1043-qc', poId: 'PO-1043', parentId: 'g-1043', name: 'QC inspection (AI-verified)', kind: 'qc', duration: 1, manual: true, start: '2026-10-02', percentDone: 100, resourceId: 'r-qc' }),
    t({ id: '1043-balance', poId: 'PO-1043', parentId: 'g-1043', name: '50% balance · released on QC pass', kind: 'payment', duration: 0, manual: true, start: '2026-10-03', percentDone: 100, paymentId: 'pay-1043-bal', resourceId: 'r-merchant' }),
    t({ id: '1043-sea', poId: 'PO-1043', parentId: 'g-1043', name: 'Ocean freight · Leixões → Newark', kind: 'freight', duration: 20, manual: true, start: '2026-10-06', percentDone: 85, resourceId: 'r-forwarder' }),
    t({ id: '1043-customs', poId: 'PO-1043', parentId: 'g-1043', name: 'US customs clearance', kind: 'customs', duration: 2, resourceId: 'r-customs' }),
    t({ id: '1043-wh', poId: 'PO-1043', parentId: 'g-1043', name: 'Warehouse receiving', kind: 'warehouse', duration: 2, resourceId: 'r-wh' }),
    t({ id: '1043-launch', poId: 'PO-1043', parentId: 'g-1043', name: 'Restock goes live', kind: 'launch', duration: 0, resourceId: 'r-wh' }),

    // PO-1044 — domestic walnut scoops, pay on delivery
    t({ id: 'g-1044', poId: 'PO-1044', name: 'PO-1044 · Walnut scoop × 400 · Eugene, OR → Ontario, CA', kind: 'group', duration: 0 }),
    t({ id: '1044-prod', poId: 'PO-1044', parentId: 'g-1044', name: 'Turning & oil finish', kind: 'production', duration: 25, manual: true, start: '2026-10-12', percentDone: 45, resourceId: 'r-oregon' }),
    t({ id: '1044-qc', poId: 'PO-1044', parentId: 'g-1044', name: 'Photo QC (AI-verified)', kind: 'qc', duration: 1, resourceId: 'r-qc' }),
    t({ id: '1044-ground', poId: 'PO-1044', parentId: 'g-1044', name: 'Ground freight · I-5 south', kind: 'freight', duration: 4, resourceId: 'r-forwarder' }),
    t({ id: '1044-wh', poId: 'PO-1044', parentId: 'g-1044', name: 'Warehouse receiving', kind: 'warehouse', duration: 1, resourceId: 'r-wh' }),
    t({ id: '1044-pay', poId: 'PO-1044', parentId: 'g-1044', name: 'Pay on delivery to Cascade Woodworks', kind: 'payment', duration: 0, paymentId: 'pay-1044-pod', resourceId: 'r-merchant' }),
    t({ id: '1044-launch', poId: 'PO-1044', parentId: 'g-1044', name: 'Restock goes live', kind: 'launch', duration: 0, resourceId: 'r-wh' }),
  ];

  const chain = (ids: string[]) => ids.slice(1).map((id, i) => ({ id: `d-${ids[i]}-${id}`, from: ids[i], to: id, lag: 0 }));
  const dependencies = [
    ...chain(['1042-deposit', '1042-prod', '1042-qc', '1042-balance', '1042-load', '1042-sea', '1042-customs', '1042-wh', '1042-launch']),
    ...chain(['1043-deposit', '1043-prod', '1043-qc', '1043-balance', '1043-sea', '1043-customs', '1043-wh', '1043-launch']),
    ...chain(['1044-prod', '1044-qc', '1044-ground', '1044-wh', '1044-pay']),
    { id: 'd-1044-wh-1044-launch', from: '1044-wh', to: '1044-launch', lag: 0 },
  ];

  return {
    version: 1,
    merchant: { name: 'Kiln & Co', email: 'ops@kilnandco.example' },
    products: [
      { id: 'pour-over', name: 'Glass Pour-Over Set', sku: 'KC-POS-01', price: 68, image: '/samples/product-pour-over.jpg', stockOnHand: 0, dailyVelocity: 7, promisedShipDate: '2026-11-26', preorderOpen: true, blurb: 'Hand-blown borosilicate glass dripper with a 600 ml glass server. Our best-seller — sold out until the next batch lands.' },
      { id: 'apron', name: 'Canvas Barista Apron', sku: 'KC-APR-02', price: 42, image: '/samples/product-apron.jpg', stockOnHand: 22, dailyVelocity: 3, promisedShipDate: '2026-10-31', preorderOpen: false, blurb: 'Heavy black cotton canvas with a leather patch and tool pockets.' },
      { id: 'scoop', name: 'Walnut Coffee Scoop', sku: 'KC-SCP-03', price: 18, image: '/samples/product-scoop.jpg', stockOnHand: 64, dailyVelocity: 4, promisedShipDate: '2026-11-12', preorderOpen: false, blurb: 'Hand-turned Oregon black walnut, one level scoop = 12 g.' },
    ],
    suppliers: [
      { id: 'hongye', name: 'Hongye Glassworks', country: 'China', contact: 'Wei Lin', paypalEmail: supplierEmail },
      { id: 'ribeira', name: 'Tecelagem Ribeira', country: 'Portugal', contact: 'Inês Costa', paypalEmail: supplierEmail },
      { id: 'cascade', name: 'Cascade Woodworks', country: 'USA', contact: 'Sam Whitaker', paypalEmail: supplierEmail },
    ],
    purchaseOrders: [
      {
        id: 'PO-1042', supplierId: 'hongye', productId: 'pour-over', quantity: 1200, unitCost: 18.5, currency: 'USD', incoterm: 'FOB Shanghai', originPort: 'Shanghai (CNSHA)', destinationPort: 'Long Beach (USLGB)', shipMode: 'sea', status: 'in_production',
        spec: {
          Dripper: 'Clear borosilicate glass cone dripper with spiral ribs and a side handle',
          Server: '600 ml clear borosilicate glass server with handle',
          Glass: 'Crystal clear, no bubbles, cracks or chips; smooth fire-polished rims',
          Match: 'Shape and handle must match the approved golden sample',
          Packaging: 'Kraft carton, label reads KILN & CO · POUR-OVER SET · SKU KC-POS-01',
        },
        qcRequirements: ['Dripper and server match the approved sample', 'No cracks, chips or broken rims', 'Glass is clear with no bubbles or cloudiness', 'Carton label shows SKU KC-POS-01'],
      },
      {
        id: 'PO-1043', supplierId: 'ribeira', productId: 'apron', quantity: 600, unitCost: 9.8, currency: 'USD', incoterm: 'FOB Leixões', originPort: 'Leixões (PTLEI)', destinationPort: 'Newark (USEWR)', shipMode: 'sea', status: 'in_transit',
        spec: { Fabric: 'Heavy black cotton canvas', Details: 'Leather patch, two front pockets, adjustable neck strap' }, qcRequirements: ['Stitching straight, no loose threads', 'Correct black colour, no fading'],
      },
      {
        id: 'PO-1044', supplierId: 'cascade', productId: 'scoop', quantity: 400, unitCost: 4.2, currency: 'USD', incoterm: 'Delivered', originPort: 'Eugene, OR', destinationPort: 'Ontario, CA', shipMode: 'ground', status: 'in_production',
        spec: { Wood: 'Black walnut, oil finish', Size: '12 g level scoop' }, qcRequirements: ['No cracks along the grain', 'Smooth oil finish'],
      },
    ],
    payments: [
      { id: 'pay-1042-dep', poId: 'PO-1042', label: '30% deposit', type: 'deposit', amount: 6660, currency: 'USD', status: 'paid', gate: 'none', paidAt: '2026-09-21', simulated: true },
      { id: 'pay-1042-bal', poId: 'PO-1042', label: '70% balance', type: 'balance', amount: 15540, currency: 'USD', status: 'scheduled', gate: 'qc_pass' },
      { id: 'pay-1043-dep', poId: 'PO-1043', label: '50% deposit', type: 'deposit', amount: 2940, currency: 'USD', status: 'paid', gate: 'none', paidAt: '2026-08-28', simulated: true },
      { id: 'pay-1043-bal', poId: 'PO-1043', label: '50% balance', type: 'balance', amount: 2940, currency: 'USD', status: 'paid', gate: 'qc_pass', paidAt: '2026-10-03', simulated: true },
      { id: 'pay-1044-pod', poId: 'PO-1044', label: 'Pay on delivery', type: 'on_delivery', amount: 1680, currency: 'USD', status: 'scheduled', gate: 'goods_received' },
    ],
    tasks,
    dependencies,
    resources: [
      { id: 'r-merchant', name: 'Kiln & Co (you)', role: 'Merchant', country: 'USA' },
      { id: 'r-factory', name: 'Hongye Glassworks', role: 'Factory', country: 'China' },
      { id: 'r-porto', name: 'Tecelagem Ribeira', role: 'Factory', country: 'Portugal' },
      { id: 'r-oregon', name: 'Cascade Woodworks', role: 'Workshop', country: 'USA' },
      { id: 'r-qc', name: 'Landed QC agent', role: 'Inspection', country: '—' },
      { id: 'r-forwarder', name: 'BlueLine Forwarding', role: 'Freight forwarder', country: '—' },
      { id: 'r-customs', name: 'Customs broker', role: 'Customs', country: 'USA' },
      { id: 'r-wh', name: 'Ontario, CA warehouse', role: 'Warehouse', country: 'USA' },
    ],
    preorders: seededPreorders(),
    qcReports: [],
    proposals: [],
    activity: [
      { id: 'seed-a3', ts: '2026-10-22T16:10:00Z', actor: 'system', type: 'forecast', title: 'Pour-over pre-orders passed 170', detail: 'All captured through PayPal and promised to ship by Nov 26.' },
      { id: 'seed-a2', ts: '2026-10-15T09:00:00Z', actor: 'supplier', type: 'update', title: 'Hongye Glassworks: production 70% complete', detail: 'Second batch is in the annealing kiln. On track for Nov 3.' },
      { id: 'seed-a1', ts: '2026-10-03T12:00:00Z', actor: 'paypal', type: 'payout', title: 'Balance paid to Tecelagem Ribeira · $2,940', detail: 'Released automatically after the QC agent passed the batch.' },
    ],
    outbox: [],
    supplierUpdates: [],
  };
}
