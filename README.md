# Regain Media — Speed-to-Lead Service

Receives a lead from a landing page form, triggers a live outbound AI call (ElevenLabs Conversational AI
agent, over a Twilio number), the agent qualifies the lead and books an appointment via Cal.com, and every
lead + outcome gets logged to Google Sheets.

Live deployment: `speedtolead-test-production.up.railway.app`, deployed from `thataipm/speedtolead-test`,
auto-deploys on push to main.

## Endpoints
- `POST /webhook/lead` — call this from the landing page form. Body: `{ name, company, phone, email,
  property_address, is_homeowner, job_type, roof_age, damage_type, insurance_status, timeline,
  best_time_to_call }`, matching the real roofing lead intake fields in
  `03_WebAdmin_Agent/01_Client_Landing_Pages/_master_template/field_mapping.md`.
- `POST /tools/book-appointment` — not called directly by us; this is what the ElevenLabs agent calls
  mid-conversation once it's agreed on a time with the lead. Body parameters (not path/query):
  `name`, `email`, `phone`, `start_time_iso`, `time_zone`.

## Environment variables
See `.env.example`. All of these get set in Railway's dashboard (Project → Variables), never committed.
Note: `GOOGLE_PRIVATE_KEY` needs its literal `\n` sequences intact as a single-line value, not real line
breaks, when pasting into Railway's raw editor.

## Local dev
```
npm install
npm run dev
```

## Deploy
1. Push this repo to GitHub.
2. In Railway: New Project → Deploy from GitHub repo → pick this repo.
3. Settings → Networking → Generate Domain (port doesn't matter, Railway injects its own `PORT`).
4. Add all env vars from `.env.example` under Variables (paste real values).
5. Railway auto-deploys on every push to main from here on.

## Google Sheet setup (easy to get wrong)
The code hardcodes the tab name as `Leads` (see `SHEET_TAB` in `src/sheets.js`). A brand new Google Sheet
defaults its first tab to `Sheet1`, rename it to exactly `Leads` or every append call fails with
`Unable to parse range: Leads!A:P`. Also make sure the sheet is shared with the service account email
(from the downloaded JSON's `client_email`) with Editor access, not just created.

## ElevenLabs dashboard setup (also easy to get wrong)
1. Confirm the Twilio number is imported under the agent's own **Phone Numbers** section (Account SID +
   Auth Token + the number).
2. Add the `book_appointment` Custom Tool **inside that specific agent's own Tools section**, not a
   general/global tools library. If it's only defined globally and never attached to the agent, the agent
   will claim a booking succeeded without actually calling anything, this exact failure mode happened on
   the first real test (great conversation, no booking ever created in Cal.com).
   - Type: Webhook, Method: POST, parameters as **Body** parameters (not Path or Query).
   - URL: `https://speedtolead-test-production.up.railway.app/tools/book-appointment`
3. Paste in the system prompt / first message from `agent_prompt.md` in
   `02_Sales_Agent/01_Speed_to_Lead_Agent/`.

## Known-good test recipe
Fill out `demo.html` with a real phone/email (to verify the full loop) and any values for the roofing
fields. On the call, don't invent details, the agent already has everything submitted. Answer naturally,
agree to a specific day/time when it offers to book, then verify: the booking shows up in Cal.com's
Bookings tab, a calendar invite email arrives, and the Google Sheet row updates with a status a few minutes
after the call ends.
