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
const LAST_COL = 'P';

const HEADERS = [
  'timestamp', 'name', 'company', 'phone', 'email',
  'property_address', 'is_homeowner', 'job_type', 'roof_age', 'damage_type',
  'insurance_status', 'timeline', 'best_time_to_call', 'source', 'status', 'notes',
];

// Looks up the numeric sheetId (gid) for our tab by title — needed for
// batchUpdate row-insert requests, which only accept a numeric id, not a name.
async function getSheetGid(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = meta.data.sheets.find((s) => s.properties.title === SHEET_TAB);
  if (!sheet) throw new Error(`Sheet tab "${SHEET_TAB}" not found in spreadsheet`);
  return sheet.properties.sheetId;
}

async function writeHeader(sheets, rowNumber) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!A${rowNumber}:${LAST_COL}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
}

// Determines the exact row the next lead should be written to, deterministically,
// instead of relying on the Sheets API's `append` auto-detection. `append` infers
// where "the table" ends by scanning the whole range for any stray content, so if
// the sheet ever had a stray value anywhere in A:P (a manual note, a test edit,
// leftover formatting), it could start inserting new leads far from where you'd
// expect — this is almost certainly what "data getting added anywhere" was.
// Also ensures a header row exists, without ever overwriting real lead data:
// - Empty sheet: write header at row 1, next lead goes to row 2.
// - Header already correct at row 1: next lead goes right after the last row.
// - Data exists but row 1 isn't a header: insert a fresh blank row at the very
//   top (shifting existing rows down, nothing is lost) and write the header
//   into it.
async function ensureHeaderAndGetNextRow(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!A:A`,
  });
  const rows = res.data.values || [];

  if (rows.length === 0) {
    await writeHeader(sheets, 1);
    return 2;
  }

  if ((rows[0][0] || '').trim().toLowerCase() === 'timestamp') {
    return rows.length + 1;
  }

  const sheetGid = await getSheetGid(sheets);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          inheritFromBefore: false,
        },
      }],
    },
  });
  await writeHeader(sheets, 1);
  return rows.length + 2;
}

// Writes a new row for a freshly captured lead at a deterministic row number.
// Returns the row number so we can update it later once we know the call outcome.
export async function logNewLead({
  name, company, phone, email,
  propertyAddress, isHomeowner, jobType, roofAge, damageType, insuranceStatus, timeline, bestTimeToCall,
  source,
}) {
  const sheets = await getClient();
  const timestamp = new Date().toISOString();
  const rowNumber = await ensureHeaderAndGetNextRow(sheets);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!A${rowNumber}:${LAST_COL}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        timestamp, name, company, phone, email || '',
        propertyAddress || '', isHomeowner || '', jobType || '', roofAge || '', damageType || '',
        insuranceStatus || '', timeline || '', bestTimeToCall || '',
        source || 'demo', 'call_initiated', '',
      ]],
    },
  });

  return rowNumber;
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
