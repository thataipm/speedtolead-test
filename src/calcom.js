const BASE = 'https://api.cal.com/v1';

// Creates a booking on the configured event type. Called from our /tools/book-appointment
// endpoint, which the ElevenLabs agent hits mid-conversation once a time is agreed on.
export async function createBooking({ name, email, phone, startTimeISO, timeZone }) {
  const url = `${BASE}/bookings?apiKey=${process.env.CALCOM_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID, 10),
      start: startTimeISO,
      responses: {
        name,
        email: email || 'no-reply@regain.media',
        smsReminderNumber: phone,
      },
      timeZone: timeZone || 'America/Detroit',
      language: 'en',
      metadata: {},
    }),
  });

  if (!res.ok) {
    throw new Error(`Cal.com booking failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
