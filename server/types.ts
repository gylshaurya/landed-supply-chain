// Shared domain types for Landed. Dates are calendar days as 'YYYY-MM-DD'.

export type TaskKind =
  | 'group'
  | 'payment'
  | 'production'
  | 'qc'
  | 'freight'
  | 'air'
  | 'customs'
  | 'warehouse'
  | 'launch';

export interface Task {
  id: string;
  poId: string;
  parentId?: string;
  name: string;
  kind: TaskKind;
  /** Fixed start for manually scheduled tasks (actuals) */
  start?: string;
  /** Start-no-earlier-than constraint */
  snet?: string;
  manual?: boolean;
  duration: number; // days, 0 = milestone
  percentDone: number;
  resourceId?: string;
  paymentId?: string;
  note?: string;
  /** Present once computed by the schedule engine */
  computedStart?: string;
  computedEnd?: string;
  /** Snapshot of the plan before the latest approved recovery */
  baselineStart?: string;
  baselineEnd?: string;
  /** Set when the task was added by an agent */
  addedBy?: 'agent' | 'merchant';
}

export interface Dependency {
  id: string;
  from: string;
  to: string;
  lag: number;
}

export interface Resource {
  id: string;
  name: string;
  role: string;
  country?: string;
}

export type PaymentStatus = 'scheduled' | 'held' | 'processing' | 'paid' | 'failed';

export interface SupplierPayment {
  id: string;
  poId: string;
  label: string;
  type: 'deposit' | 'balance' | 'on_delivery';
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** Condition that has to be met before release */
  gate?: 'qc_pass' | 'goods_received' | 'none';
  payoutBatchId?: string;
  payoutItemId?: string;
  paidAt?: string;
  holdReason?: string;
  simulated?: boolean;
}

export interface QcCheck {
  name: string;
  result: 'pass' | 'fail' | 'unclear';
  note: string;
}

export interface QcDefect {
  type: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  photoIndex: number;
}

export interface QcReport {
  id: string;
  poId: string;
  createdAt: string;
  photos: string[];
  verdict: 'pass' | 'fail' | 'needs_review';
  confidence: number;
  summary: string;
  checks: QcCheck[];
  defects: QcDefect[];
  estimatedDefectRatePct: number;
  supplierMessage: string;
  decision: 'released' | 'held' | 'review';
  source: 'live' | 'demo';
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  currency: string;
  incoterm: string;
  originPort: string;
  destinationPort: string;
  shipMode: 'sea' | 'air' | 'ground';
  status: 'in_production' | 'qc' | 'in_transit' | 'received' | 'planned';
  spec: Record<string, string>;
  qcRequirements: string[];
  /** Air split created by a recovery plan */
  splitAirUnits?: number;
}

export interface Supplier {
  id: string;
  name: string;
  country: string;
  contact: string;
  paypalEmail: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  image: string;
  stockOnHand: number;
  dailyVelocity: number;
  promisedShipDate: string;
  preorderOpen: boolean;
  blurb: string;
}

export type PreorderStatus = 'active' | 'kept' | 'cancelled' | 'refunded' | 'shipped';

export interface Preorder {
  id: string;
  productId: string;
  customerName: string;
  email: string;
  qty: number;
  amount: number;
  createdAt: string;
  promisedDate: string;
  status: PreorderStatus;
  source: 'checkout' | 'seed';
  paypalOrderId?: string;
  captureId?: string;
  refundId?: string;
  goodwillRefundId?: string;
  noticeToken?: string;
  noticeSentAt?: string;
  revisedDate?: string;
  originalPromisedDate?: string;
  responseAt?: string;
  trackingNumber?: string;
}

export interface Activity {
  id: string;
  ts: string;
  actor: 'agent' | 'supplier' | 'merchant' | 'paypal' | 'customer' | 'system';
  type: string;
  title: string;
  detail?: string;
  link?: string;
}

export interface OptionResult {
  key: string;
  label: string;
  description: string;
  overtimeDays: number;
  overtimeCost: number;
  airUnits: number;
  airCost: number;
  goodwillCredit: number;
  firstShipDate: string;
  fullRestockDate: string;
  preordersLate: number;
  lostRevenue: number;
  expectedCancellations: number;
  expectedRefunds: number;
  goodwillCost: number;
  /** Support load + expected PayPal 'item not received' disputes for late orders */
  brokenPromiseCost: number;
  totalImpact: number;
  hitsBlackFriday: boolean;
}

export interface Proposal {
  id: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  poId: string;
  trigger: {
    message: string;
    taskId: string;
    delayDays: number;
    reason: string;
    supplierOffer?: { overtimeDays: number; overtimeCost: number };
  };
  baselineLaunch: string;
  options: OptionResult[];
  recommendedKey: string;
  headline: string;
  rationale: string;
  customerNotice: { subject: string; body: string };
  supplierMessage: string;
  goodwillCredit: number;
  ftcChecks: { name: string; ok: boolean }[];
  agentTrace: { tool: string; input: unknown; summary: string }[];
  source: 'live' | 'demo';
  approvedAt?: string;
  executionLog?: string[];
}

export interface OutboxEmail {
  id: string;
  ts: string;
  to: string;
  subject: string;
  body: string;
  link?: string;
  kind: 'customer_notice' | 'supplier' | 'receipt';
}

export interface DB {
  version: number;
  merchant: { name: string; email: string };
  products: Product[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  payments: SupplierPayment[];
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  preorders: Preorder[];
  qcReports: QcReport[];
  proposals: Proposal[];
  activity: Activity[];
  outbox: OutboxEmail[];
  supplierUpdates: { id: string; poId: string; ts: string; message: string; proposalId?: string }[];
}
