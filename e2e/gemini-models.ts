import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pager = await ai.models.list();
const names: string[] = [];
for await (const m of pager) if ((m.supportedActions ?? []).includes('generateContent')) names.push(`${m.name}  ${m.displayName ?? ''}`);
console.log(names.filter(n => /flash|pro/i.test(n)).join('\n'));
