import 'dotenv/config';
const key = process.env.GEMINI_API_KEY!;
const body = (tc?: object) => JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }], generationConfig: tc ? { thinkingConfig: tc } : {} });
for (const model of ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash']) {
  for (const tc of [undefined, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, { thinkingBudget: 0 }]) {
    const t = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body(tc) });
    const j: any = await r.json();
    console.log(model.padEnd(24), JSON.stringify(tc ?? {}).padEnd(26), r.status, `${Date.now() - t}ms`, r.ok ? '' : String(j.error?.message).slice(0, 80));
  }
}
