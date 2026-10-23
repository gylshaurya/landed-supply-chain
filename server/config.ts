import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 8787),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  model: env.LANDED_MODEL || 'claude-opus-5-5',
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID || '',
    clientSecret: env.PAYPAL_CLIENT_SECRET || '',
    supplierEmail: env.PAYPAL_SUPPLIER_EMAIL || '',
    base: 'https://api-m.sandbox.paypal.com',
  },
  today: env.LANDED_TODAY || '',
  dbPath: env.LANDED_DB || 'data/db.json',
  publicUrl: env.PUBLIC_URL || '',
};

export const aiMode = (): 'live' | 'demo' => (config.anthropicKey ? 'live' : 'demo');
export const paypalMode = (): 'sandbox' | 'simulated' =>
  config.paypal.clientId && config.paypal.clientSecret ? 'sandbox' : 'simulated';

/** The demo clock. Frozen via LANDED_TODAY so the story is reproducible. */
export function today(): string {
  return config.today || new Date().toISOString().slice(0, 10);
}
