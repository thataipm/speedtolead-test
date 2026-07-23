const BASE = 'https://api.cal.com/v2';

// Cal.com decommissioned API v1 (returns 410 now). v2 uses Bearer auth and a
// different body shape (attendee is its own object with a required timeZone).
//
// IMPORTANT: Cal.com v2's `start` field must be a true UTC instant. `attendee.timeZone`
// is only used for display/notification formatting, it does NOT tell Cal.com how to
// interpret `start`. If we hand it a naive local wall-clock string like
// "2026-07-27T12:00:00" (no offset), Cal.com reads that as 12:00 UTC — which, for
// America/Detroit in July (UTC-4, EDT), silently books 8:00am local instead of the
// intended noon. Root-caused 2026-07-23 after a test call requested "12pm Monday
// Detroit time" and landed on the calendar at 8:00am. Fix: convert the agent's local
// wall-clock time + IANA zone into a real UTC ISO string before ever calling Cal.com.
function localToUTCISOString(localISO, timeZone) {
    // Expect a naive local datetime like "2026-07-27T12:00:00" (no Z / offset).
  // Strip any stray Z just in case the agent ever sends one — we always treat the
  // numbers as wall-clock time in `timeZone`, not as already-UTC.
  const [datePart, timePart = '00:00:00'] = localISO.replace('Z', '').split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second = 0] = timePart.split(':').map(Number);

  // Standard dependency-free trick: guess the instant is UTC, see what wall-clock time
  // that instant actually shows in the target zone, then correct by the difference.
  // Works for one pass because IANA offsets are whole/half/quarter hours and stable
  // within a single day (except right at a DST transition, which isn't a concern for
  // appointment booking granularity here).
  const guessUTC = Date.UTC(year, month - 1, day, hour, minute, second);
    const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone,
          hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date(guessUTC)).map(p => [p.type, p.value]));
    const shownAsUTC = Date.UTC(
          Number(parts.year), Number(parts.month) - 1, Number(parts.day),
          Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
        );
    const offset = guessUTC - shownAsUTC;
    return new Date(guessUTC + offset).toISOString();
}

export async function createBooking({ name, email, phone, startTimeISO, timeZone }) {
    const zone = timeZone || 'America/Detroit';
    const utcStart = localToUTCISOString(startTimeISO, zone);

  const res = await fetch(`${BASE}/bookings`, {
        method: 'POST',
        headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
                'cal-api-version': '2026-02-25',
        },
        body: JSON.stringify({
                start: utcStart,
                eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID, 10),
                attendee: {
                          name,
                          email: email || 'no-reply@regain.media',
                          timeZone: zone,
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
