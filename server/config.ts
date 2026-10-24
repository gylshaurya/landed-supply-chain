import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 8787),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  /** Needed only when the API key is not scoped to a workspace */
  anthropicWorkspace: env.ANTHROPIC_WORKSPACE_ID || '',
  model: env.LANDED_MODEL || 'claude-opus-5-5',
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-flash-latest',
  /** Tried in order when the primary model is overloaded (503) or out of free quota (429) */
  geminiFallbacks: (env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3-flash-preview,gemini-2.5-flash').split(',').map(s => s.trim()).filter(Boolean),
  provider: (env.LANDED_AI_PROVIDER || '').toLowerCase(),
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

/** Gemini (free tier) is preferred when its key is set; Claude is also supported. */
export const aiProvider = (): 'gemini' | 'anthropic' | 'none' => {
  if (config.provider === 'anthropic' && config.anthropicKey) return 'anthropic';
  if (config.provider === 'gemini' && config.geminiKey) return 'gemini';
  if (config.geminiKey) return 'gemini';
  if (config.anthropicKey) return 'anthropic';
  return 'none';
};
export const aiMode = (): 'live' | 'demo' => (aiProvider() === 'none' ? 'demo' : 'live');
export const paypalMode = (): 'sandbox' | 'simulated' =>
  config.paypal.clientId && config.paypal.clientSecret ? 'sandbox' : 'simulated';

/** The demo clock. Frozen via LANDED_TODAY so the story is reproducible. */
export function today(): string {
  return config.today || new Date().toISOString().slice(0, 10);
}
