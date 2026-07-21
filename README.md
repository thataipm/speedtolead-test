# Regain Media — Speed-to-Lead Service

Receives a lead from a landing page form, triggers a live outbound AI call (ElevenLabs Conversational AI
agent, over a Twilio number), the agent qualifies the lead and books an appointment via Cal.com, and every
lead + outcome gets logged to Google Sheets.

## Endpoints
- `POST /webhook/lead` — call this from the landing page form. Body: `{ name, company, phone, email, message }`.
- `POST /tools/book-appointment` — not called directly by us; this is what the ElevenLabs agent calls
  mid-conversation once it's agreed on a time with the lead. Configure it as a Custom Tool in the agent's
  settings pointing at `https://<your-railway-url>/tools/book-appointment`.

## Environment variables
See `.env.example`. All of these get set in Railway's dashboard (Project → Variables), never committed.
Note: `GOOGLE_PRIVATE_KEY` needs its literal newlines, when pasting into Railway, paste it exactly as it
appears in the downloaded service account JSON (with `\n` sequences intact).

## Local dev
```
npm install
npm run dev
```

## Deploy
1. Push this repo to GitHub.
2. In Railway: New Project → Deploy from GitHub repo → pick this repo.
3. Add all env vars from `.env.example` under Variables (paste real values).
4. Railway auto-deploys on every push to main from here on.

## One-time setup still needed in the ElevenLabs dashboard
1. Confirm the Twilio number is imported under the agent's Phone Numbers section (Account SID + Auth Token
   + the number).
2. Add a Custom Tool named `book_appointment` (or similar) with a webhook pointing at
   `https://<your-railway-url>/tools/book-appointment`, so the agent can call it mid-conversation. Expected
   fields: `name`, `email`, `phone`, `start_time_iso`, `time_zone`.
3. Paste in the real system prompt / first message (see `agent_prompt.md` in
   `02_Sales_Agent/01_Speed_to_Lead_Agent/` once written).
