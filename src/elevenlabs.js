const BASE = 'https://api.elevenlabs.io/v1';

function headers() {
  return {
    'xi-api-key': process.env.ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
  };
}

// ElevenLabs needs its own internal ID for a Twilio number you've imported
// (not just the raw phone number string). We look it up once and cache it,
// matching against the raw number we already have in env, so we don't need
// a second manual ID pasted in.
let cachedPhoneNumberId = null;

export async function getAgentPhoneNumberId() {
  if (cachedPhoneNumberId) return cachedPhoneNumberId;

  const res = await fetch(`${BASE}/convai/phone-numbers`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`ElevenLabs phone-numbers lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const target = (process.env.TWILIO_PHONE_NUMBER || '').replace(/\s/g, '');
  const match = (Array.isArray(data) ? data : data.phone_numbers || []).find(
    (p) => (p.phone_number || '').replace(/\s/g, '') === target
  );

  if (!match) {
    throw new Error(
      `No ElevenLabs phone number matched ${target}. Make sure the Twilio number was imported into the agent's Phone Numbers section first.`
    );
  }
  cachedPhoneNumberId = match.phone_number_id;
  return cachedPhoneNumberId;
}

// Triggers a live outbound call. dynamicVariables get passed into the agent
// so the first message can reference the lead's name/company by name.
export async function triggerOutboundCall({ toNumber, dynamicVariables }) {
  const agentPhoneNumberId = await getAgentPhoneNumberId();

  const res = await fetch(`${BASE}/convai/twilio/outbound-call`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: agentPhoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: dynamicVariables,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs outbound call failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // includes conversation_id
}

// Polls a conversation's status/transcript after the call has had time to finish.
export async function getConversation(conversationId) {
  const res = await fetch(`${BASE}/convai/conversations/${conversationId}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`ElevenLabs get conversation failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
