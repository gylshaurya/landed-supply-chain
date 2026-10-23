import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { aiMode } from '../config.js';
import type { PurchaseOrder, QcReport } from '../types.js';
import { structured, type InputPart } from './llm.js';
import { demoQc } from './fixtures.js';

const QcSchema = z.object({
  verdict: z.enum(['pass', 'fail', 'needs_review']),
  confidence: z.number().describe('0-1, how sure you are of the verdict from these photos alone'),
  summary: z.string().describe('two sentences max'),
  checks: z.array(z.object({ name: z.string(), result: z.enum(['pass', 'fail', 'unclear']), note: z.string() })),
  defects: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
      description: z.string(),
      photoIndex: z.number().int().describe('0-based index of the inspection photo showing it'),
    }),
  ),
  estimatedDefectRatePct: z.number(),
  supplierMessage: z.string().describe('short, specific, polite message to the factory'),
});

const MEDIA: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function imageBlock(file: string): InputPart {
  const ext = path.extname(file).toLowerCase();
  return { type: 'image', mimeType: MEDIA[ext] ?? 'image/png', data: fs.readFileSync(file).toString('base64') };
}

/** Vision inspection of factory photos against the PO spec and a golden sample. */
export async function inspect(po: PurchaseOrder, photoFiles: string[], referenceFile?: string) {
  if (aiMode() === 'demo') return { ...demoQc(photoFiles.map(f => path.basename(f))), source: 'demo' as const };
  const content: InputPart[] = [];
  if (referenceFile && fs.existsSync(referenceFile)) {
    content.push({ type: 'text', text: 'APPROVED GOLDEN SAMPLE (reference):' }, imageBlock(referenceFile));
  }
  photoFiles.forEach((f, i) => content.push({ type: 'text', text: `INSPECTION PHOTO ${i}:` }, imageBlock(f)));
  content.push({
    type: 'text',
    text: `Purchase order ${po.id}: ${po.quantity} units.\nSpecification:\n${Object.entries(po.spec)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n')}\nAcceptance checks (report each one by name):\n${po.qcRequirements.map(r => `- ${r}`).join('\n')}\n\nInspect the photos. Any critical defect or a clear spec mismatch is a fail. Use needs_review only if the photos do not show enough to decide.`,
  });
  const out = await structured({
    schema: QcSchema,
    effort: 'medium',
    system:
      'You are a meticulous pre-shipment quality inspector for consumer goods (AQL 2.5, general inspection level II). You compare factory photos to the approved golden sample and the written spec. Money is released to the factory based on your verdict, so never pass a batch on a guess.',
    content,
  });
  return { ...out, source: 'live' as const };
}

export type InspectionResult = Awaited<ReturnType<typeof inspect>>;
export type { QcReport };
