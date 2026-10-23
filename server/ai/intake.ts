import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { aiMode, today } from '../config.js';
import { structured } from './client.js';

// Reads a purchase order (PDF or pasted text) and drafts the supply-chain plan.

export const IntakeSchema = z.object({
  po: z.object({
    poNumber: z.string(),
    supplierName: z.string(),
    supplierCountry: z.string(),
    supplierContact: z.string(),
    productName: z.string(),
    sku: z.string(),
    quantity: z.number().int(),
    unitCost: z.number(),
    currency: z.string(),
    depositPct: z.number().describe('0-100'),
    balanceTerms: z.string(),
    incoterm: z.string(),
    originPort: z.string(),
    destinationPort: z.string(),
    shipMode: z.enum(['sea', 'air', 'ground']),
    orderDate: z.string().describe('YYYY-MM-DD'),
    spec: z.array(z.object({ key: z.string(), value: z.string() })),
    qcRequirements: z.array(z.string()),
  }),
  plan: z.object({
    tasks: z.array(
      z.object({
        key: z.string().describe('short slug, unique, e.g. "prod"'),
        name: z.string(),
        kind: z.enum(['payment', 'production', 'qc', 'freight', 'air', 'customs', 'warehouse', 'launch']),
        durationDays: z.number().int().min(0),
        dependsOn: z.array(z.string()).describe('keys of predecessor tasks (finish-to-start)'),
        paymentType: z.enum(['deposit', 'balance', 'on_delivery', 'none']),
        why: z.string().describe('one short reason for the duration estimate'),
      }),
    ),
    assumptions: z.array(z.string()),
  }),
});
export type Intake = z.infer<typeof IntakeSchema>;

const SYSTEM = `You are a sourcing and logistics planner for small e-commerce brands that import products.
Given a purchase order, extract its terms exactly as written, then draft a realistic task plan from deposit to "restock goes live".
Rules for the plan:
- Payment milestones are 0-day tasks of kind "payment" with paymentType set. A balance due "before shipment" must depend on the QC inspection so money is only released after goods pass.
- Always include a QC inspection task, freight, customs (for imports), warehouse receiving and a final 0-day "launch" task.
- Use realistic durations for the stated route and incoterm (port handling, transit, customs, drayage). Explain each estimate briefly in "why".
- Dependencies must form a single chain or DAG with no cycles, using task keys.`;

export async function readPurchaseOrder(input: { pdfBase64?: string; text?: string }): Promise<Intake & { source: 'live' | 'demo' }> {
  if (aiMode() === 'demo') {
    const { demoIntake } = await import('./intakeFixture.js');
    return { ...demoIntake(), source: 'demo' };
  }
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.pdfBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } });
  content.push({ type: 'text', text: `${input.text ? `Purchase order text:\n"""${input.text}"""\n\n` : ''}Today is ${today()}. Extract the PO and draft the plan.` });
  const out = await structured({ schema: IntakeSchema, system: SYSTEM, content, effort: 'medium' });
  return { ...out, source: 'live' };
}
