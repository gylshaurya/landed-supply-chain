# Landed: a self-healing supply chain for online stores

**When a factory slips, Landed's agent re-plans the whole chain, protects Black Friday, tells customers before they get angry, and pays suppliers only for goods that pass inspection.**

Built for the PayPal AI Hackathon with **PayPal** (Orders v2, Payments v2 refunds, Payouts, order tracking, and the JS SDK v6 with Pay Later), **Bryntum** (Gantt, Scheduler, Grid and the Bryntum AI Copilot) and **Google Gemini** (free tier, `gemini-flash-latest`). Claude is supported as an alternative provider.

---

## The problem

Small e-commerce brands import their best-sellers. One late container ruins the plan:

- **Everything downstream breaks.** QC, the balance payment, freight, customs, the launch and the pre-order ship date all move, and nobody re-plans them.
- **Customer promises break silently.** The FTC Mail Order Rule requires a delay notice and a free cancel-for-full-refund option. Most small brands miss it, and that turns into "item not received" PayPal disputes.
- **Money goes out before quality is known.** Importers pay a 70% balance against factory photos they never really check.
- **Black Friday is lost.** IHL estimates out-of-stocks cost retailers about $1.2T a year, and small brands feel it most.

## What Landed does

| Moment | What happens |
|---|---|
| **A PO arrives** | Drop the PDF. Gemini reads the terms and drafts a dependency-linked plan. Every payment term becomes a PayPal payout milestone gated on a condition. |
| **The factory sends photos** | A vision QC agent checks them against the spec and the golden sample. **Pass:** the balance is released with PayPal Payouts. **Fail:** it's held, and the factory gets a specific defect list. |
| **The factory reports a delay** | The recovery agent reads the message (including any paid offer like "pay $1,800 overtime, save 5 days"). It re-runs the schedule and demand model for several options (wait, overtime, air-freight splits limited by available cargo space, a goodwill credit) and proposes the one with the lowest total impact. |
| **You approve (one click)** | The Gantt re-plans, keeping the old plan visible as a baseline. The overtime premium is paid via PayPal Payouts, an air-freight branch is added, the storefront ship-by date updates, and FTC-compliant notices go only to the customers who will actually be late. |
| **Customers answer** | One click to keep the order (plus a goodwill partial refund through PayPal) or cancel (full PayPal refund). |
| **Goods arrive** | Pre-orders ship, tracking numbers are pushed to PayPal (seller protection), and pay-on-delivery payouts are released. |
| **You drag a bar yourself** | Bryntum's engine cascades the change and syncs it to the server. If customer promises break, Landed flags it and the agent proposes a fix. |

## The demo story (about 3 minutes)

The data is frozen on **Oct 23, 2026**, 35 days before Black Friday. Kiln & Co has 172 pour-over pre-orders promised for Nov 26. PO-1042 is still in the kiln.

1. **Command center:** everything is on track.
2. **Supplier portal** (`/portal/PO-1042`): the factory sends "kiln broke, 12 more days, pay $1,800 overtime to save 5." The agent compares 5–6 options live.
3. **Recovery plan:** overtime plus air-freighting 160 units ships **140 of 172** pre-orders on time (Nov 17), and 32 customers get an honest notice. That saves about $3k versus waiting. You can see the Gantt preview with before/after bars and the FTC checklist.
4. **Approve:** the timeline re-plans and the overtime payout goes out. In **Outbox** you can open a customer notice, then cancel (refund) or keep it (goodwill credit).
5. **Supplier portal:** a defective batch is held. A clean batch passes, and the $15,540 balance is paid out via PayPal.
6. **Storefront** (`/store`): a real sandbox pre-order through PayPal (or Pay Later), with the live ship-by date.
7. **New PO:** drop `PO-1045.pdf` and the plan appears on the timeline.

## How it uses the sponsors' tech

**Bryntum** (Gantt, Scheduler, Grid and AI, all from the `@bryntum/gantt` trial package)
- The Gantt is wired to the server through the CrudManager load/sync protocol, so every drag or resize persists.
- Bryntum's scheduling engine cascades changes in the browser. A server-side forward-pass scheduler mirrors it exactly (verified: loading the plan produces zero sync diffs), so the agent can simulate what-ifs headlessly.
- **Baselines** show the plan before the agent's re-plan. **Critical paths**, **labels** (PayPal amounts on milestones), **time ranges** (Today, Black Friday, the customer promise) and a **custom task menu** (release a PayPal payment, mark goods received).
- **Bryntum AI Copilot** runs on Gemini through `/api/ai/bryntum` (Bryntum's GooglePlugin; AnthropicPlugin when Claude is the provider), with a **custom AI tool** `simulateSupplierDelay` that calls Landed's simulator, and a `TaskModel` subclass whose field descriptions teach the Copilot about PayPal payment milestones.
- The **Scheduler** shows a stock runway per product (in stock, pre-order window, lost-sales window, inbound shipment milestones). The **Grid** lists pre-orders with a filter bar.

**PayPal**
- **JS SDK v6** (`/web-sdk/v6/core`): `createInstance`, `findEligibleMethods`, and PayPal + **Pay Later** one-time payment sessions on the storefront.
- **Orders v2:** create and capture pre-orders. Tracking numbers are pushed on fulfilment (`/v2/checkout/orders/{id}/track`).
- **Payments v2:** a full refund on cancellation, and a partial refund as the goodwill credit.
- **Payouts v1:** supplier deposits, the QC-gated balance, overtime premiums, and pay-on-delivery.
- What PayPal gets: cross-border B2B supplier volume, pre-order and Pay Later volume, and fewer item-not-received disputes, because customers are told and refunded before they file one.

**AI: Gemini** (`@google/genai`, free tier; Claude via `@anthropic-ai/sdk` also supported, see `server/ai/llm.ts`)
- **Recovery agent:** a function-calling loop with `get_situation`, `simulate_option` (called several times in one turn) and `submit_plan` tools. The LLM reasons and chooses; deterministic code executes. A brute-force optimizer runs alongside as a sanity check.
- **Supplier-message parser, PO reader** (native PDF input) and **QC inspector** (vision against the golden sample), all with JSON-schema structured outputs validated by Zod.
- Free-tier rate limits are handled with automatic back-off, and the FTC wording is enforced by deterministic checks rather than trusted to the model.

## Run it

Requires Node 20.19+.

```bash
npm install
cp .env.example .env      # add keys (optional, see below)
npm run dev               # API on :8787, app on http://localhost:5173
```

| Without keys | With keys |
|---|---|
| **Demo AI:** agents return recorded outputs for the bundled scenario (marked "Demo AI" in the UI). | `GEMINI_API_KEY` (free from [AI Studio](https://aistudio.google.com/apikey)) turns on the live agents and the Bryntum Copilot. `ANTHROPIC_API_KEY` works too. |
| **Simulated PayPal:** `SIM-*` ids. | `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox REST app) turn on real sandbox checkout, refunds and payouts. Set `PAYPAL_SUPPLIER_EMAIL` to a *personal* sandbox account to receive payouts. |

Other commands: `npm test` (unit and flow tests), `node e2e/flow.mjs` (drives the whole story in headless Chromium with the dev server running), `npm run build && npm start` (production on `$PORT`). **Reset demo** is in the sidebar.

To pay on the storefront in sandbox, log in with a sandbox *personal* buyer account from your PayPal developer dashboard.

## Architecture

```
React + Vite ──── Bryntum Gantt / Scheduler / Grid / AI Copilot
   │  REST + Server-Sent Events (live agent trace, live re-plans)
Express (TypeScript)
   ├─ schedule.ts   forward-pass scheduler (mirrors Bryntum's engine)
   ├─ sim.ts        demand model, scenario evaluation, optimizer
   ├─ ai/           llm.ts (Gemini/Claude) · recovery agent · supplier parser · PO reader · QC vision · Copilot proxy
   ├─ paypal.ts     Orders v2, refunds, Payouts, tracking (sandbox or simulated)
   └─ data/db.json  JSON store (seeded demo merchant)
```

## Notes

- Demo data (the merchant, suppliers, 172 seeded pre-orders) is fictional. Seeded pre-orders refund in simulated mode; orders placed through the storefront refund for real in the sandbox.
- QC sample photos are generated illustrations. Upload real photos in the supplier portal to test live vision.
- The Bryntum trial shows a watermark.

MIT licensed.
