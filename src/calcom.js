const BASE = 'https://api.cal.com/v2';

// Cal.com decommissioned API v1 (returns 410 now). v2 uses Bearer auth and a
// different body shape (attendee is its own object with a required timeZone).
export async function createBooking({ name, email, phone, startTimeISO, timeZone }) {
  const res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
      'cal-api-version': '2026-02-25',
    },
    body: JSON.stringify({
      start: startTimeISO,
      eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID, 10),
      attendee: {
        name,
        email: email || 'no-reply@regain.media',
        timeZone: timeZone || 'America/Detroit',
        phoneNumber: phone,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Cal.com booking failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data; // { id, uid, status, start, end, ... }
}
