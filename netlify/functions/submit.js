import { google } from 'googleapis';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // --- Parse and validate payload ---
    const { student, timestamp, tools } = JSON.parse(event.body || '{}');
    if (!student || !Array.isArray(tools)) {
      return { statusCode: 400, body: 'Invalid payload' };
    }

    // --- Env vars ---
    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    const SHEET_ID = process.env.SHEET_ID;
    if (!credsJson || !SHEET_ID) {
      return { statusCode: 500, body: 'Missing env vars' };
    }

    // --- Auth with Service Account ---
    const creds = JSON.parse(credsJson);
    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // --- Build rows (one per tool) ---
    const rows = tools.map((t) => [
      timestamp,
      student,
      t.tool,
      t.quizDone ? 'YES' : 'NO',
      t.physicalDone ? 'YES' : 'NO',
    ]);

    // --- Detect the correct tab title (handles hidden spaces/case/quotes) ---
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || [])
      .map((s) => (s.properties && s.properties.title) || '')
      .filter(Boolean);

    // Prefer a tab whose title trims to "responses" (case-insensitive); else fall back to first tab
    const targetTitle =
      titles.find((t) => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';

    // Escape any single quotes per A1 notation
    const safeTitle = targetTitle.replace(/'/g, "''");
    const rangeA1 = `'${safeTitle}'!A1:E`;

    // Optional debug logs (visible in Netlify → Logs → Functions → submit)
    console.log('Sheet tabs:', titles);
    console.log('Using tab:', targetTitle, 'Range:', rangeA1);

    // --- Append rows ---
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: rangeA1,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    // Log full error for troubleshooting in Netlify function logs
    console.error('Submit function error:', err);
    // Surface a simple message to the browser
    return { statusCode: 500, body: 'Server error' };
  }
};
