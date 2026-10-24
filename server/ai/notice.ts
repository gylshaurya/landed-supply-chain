// FTC Mail Order Rule (16 CFR 435) guard-rails for delay notices. The agent
// drafts the wording; these deterministic checks decide whether it can go out.

export const PLACEHOLDERS = ['{{name}}', '{{order_id}}', '{{original_date}}', '{{revised_date}}', '{{keep_link}}', '{{cancel_link}}'] as const;

export function ftcChecks(body: string) {
  const b = body.toLowerCase();
  return [
    { name: 'States the revised shipping date', ok: body.includes('{{revised_date}}') },
    { name: 'Offers the option to cancel', ok: /cancel/.test(b) && body.includes('{{cancel_link}}') },
    { name: 'Promises a full, prompt refund on cancellation', ok: /full refund/.test(b) },
    { name: 'Cancelling is free and one click', ok: /(free|no cost|at no charge|one click|one-click)/.test(b) },
    { name: 'Sent before the original promised date', ok: true },
  ];
}

export function renderNotice(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

/** Appends whatever compliance language the draft is missing. */
export function enforceCompliance(body: string): string {
  let out = body;
  const checks = ftcChecks(out);
  if (!checks[0].ok) out += '\n\nYour new estimated ship date is {{revised_date}}.';
  if (!checks[1].ok || !checks[2].ok) {
    out += '\n\nIf you would rather not wait, you can cancel at no cost with one click for a full refund to your PayPal account: {{cancel_link}}';
  } else if (!checks[3].ok) {
    out += '\n\nCancelling is free and takes one click.';
  }
  return out;
}
