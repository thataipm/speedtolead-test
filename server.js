import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { logNewLead, updateLeadStatus } from './src/sheets.js';
import { triggerOutboundCall, getConversation } from './src/elevenlabs.js';
import { createBooking } from './src/calcom.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- health check ----------
app.get('/', (req, res) => res.json({ ok: true, service: 'regain-media-speed-to-lead' }));

// ---------- 1. lead comes in from the landing page form ----------
app.post('/webhook/lead', async (req, res) => {
  try {
    const { name, company, phone, email, message } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ ok: false, error: 'name and phone are required' });
    }

    // Log immediately so we never lose a lead even if the call step fails.
    const rowNumber = await logNewLead({ name, company, phone, email, source: 'demo_landing_page' });

    const call = await triggerOutboundCall({
      toNumber: phone,
      dynamicVariables: {
        lead_name: name,
        company_name: company || '',
        lead_message: message || '',
      },
    });

    // Check back on the outcome after the call has had time to run its course.
    // (ElevenLabs webhooks weren't part of the API key scope we set up, so we poll instead.)
    setTimeout(() => checkAndLogOutcome(call.conversation_id, rowNumber), 5 * 60 * 1000);

    res.json({ ok: true, conversation_id: call.conversation_id });
  } catch (err) {
    console.error('lead webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function checkAndLogOutcome(conversationId, rowNumber, attempt = 1) {
  try {
    const convo = await getConversation(conversationId);
    const status = convo.status || 'unknown';

    // Still in progress or not finalized yet — check again shortly, up to a few tries.
    if (status !== 'done' && attempt < 4) {
      setTimeout(() => checkAndLogOutcome(conversationId, rowNumber, attempt + 1), 2 * 60 * 1000);
      return;
    }

    const summary = convo.analysis?.transcript_summary || convo.analysis?.call_summary_title || '';
    await updateLeadStatus(rowNumber, status, summary);
  } catch (err) {
    console.error('outcome check failed:', err);
    await updateLeadStatus(rowNumber, 'check_failed', String(err.message));
  }
}

// ---------- 2. tool the agent calls mid-conversation to actually book the slot ----------
app.post('/tools/book-appointment', async (req, res) => {
  try {
    const { name, email, phone, start_time_iso, time_zone } = req.body;

    if (!name || !start_time_iso) {
      return res.status(400).json({ ok: false, error: 'name and start_time_iso are required' });
    }

    const booking = await createBooking({
      name,
      email,
      phone,
      startTimeISO: start_time_iso,
      timeZone: time_zone,
    });

    res.json({ ok: true, booking_id: booking.id, message: 'Booked successfully.' });
  } catch (err) {
    console.error('booking tool error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Speed-to-Lead service listening on :${PORT}`));
