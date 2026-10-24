import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
for (const model of ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-lite-latest']) {
  const t = Date.now();
  try {
    const r = await ai.models.generateContent({ model, contents: 'Reply with the single word OK.' });
    console.log(model.padEnd(26), 'OK', Date.now() - t, 'ms', JSON.stringify(r.text).slice(0, 20));
  } catch (e: any) {
    console.log(model.padEnd(26), 'ERR', e.status, String(e.message).slice(0, 140));
  }
}
