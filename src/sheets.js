import { google } from 'googleapis';

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Railway env vars store literal \n as the two characters "\" and "n" —
      // convert back to real newlines for the PEM key to parse correctly.
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const SHEET_TAB = 'Leads'; // change if your sheet tab is named differently

// Columns: A timestamp, B name, C company, D phone, E email, F property_address,
// G is_homeowner, H job_type, I roof_age, J damage_type, K insurance_status,
// L timeline, M best_time_to_call, N source, O status, P notes
const LAST_COL = 'P';

// Appends a new row for a freshly captured lead. Returns the row number so we
// can update it later once we know the call outcome.
export async function logNewLead({
  name, company, phone, email,
  propertyAddress, isHomeowner, jobType, roofAge, damageType, insuranceStatus, timeline, bestTimeToCall,
  source,
}) {
  const sheets = await getClient();
  const timestamp = new Date().toISOString();

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!A:${LAST_COL}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        timestamp, name, company, phone, email || '',
        propertyAddress || '', isHomeowner || '', jobType || '', roofAge || '', damageType || '',
        insuranceStatus || '', timeline || '', bestTimeToCall || '',
        source || 'demo', 'call_initiated', '',
      ]],
    },
  });

  // Extract the row number Sheets just wrote to, from the returned range e.g. "Leads!A5:P5"
  const updatedRange = res.data.updates.updatedRange;
  const match = updatedRange.match(/(\d+):/);
  return match ? parseInt(match[1], 10) : null;
}

// Updates the status (O) and notes (P) columns for a given row.
export async function updateLeadStatus(rowNumber, status, notes) {
  if (!rowNumber) return;
  const sheets = await getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!O${rowNumber}:P${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status, notes || '']] },
  });
}
