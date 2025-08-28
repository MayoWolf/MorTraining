import { google } from 'googleapis';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { student, timestamp, tools } = JSON.parse(event.body || '{}');
    if (!student || !Array.isArray(tools)) {
      return { statusCode: 400, body: 'Invalid payload' };
    }

    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    const SHEET_ID = process.env.SHEET_ID;
    if (!credsJson || !SHEET_ID) {
      return { statusCode: 500, body: 'Missing env vars' };
    }

    const creds = JSON.parse(credsJson);
    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Build a dictionary of tool -> result (e.g., "Band Saw" -> "YES/NO YES/NO")
    const toolResults = {};
    tools.forEach((t) => {
      toolResults[t.tool] = `${t.quizDone ? 'Y' : 'N'}/${t.physicalDone ? 'Y' : 'N'}`;
    });

    // Build one row: [timestamp, student, Band Saw, Drill Press, ...]
    const row = [timestamp, student];
    const toolOrder = [
      'Band Saw',
      'Drill Press',
      'Belt Sander',
      'Disc Sander',
      'Horizontal Bandsaw',
      'Table Saw',
      'Miter Saw',
      'Hand Drill',
      'Soldering Station',
      '3D Printer',
    ];
    toolOrder.forEach((tool) => {
      row.push(toolResults[tool] || 'N/N'); // default N/N if missing
    });

    // Detect tab name
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
    const targetTitle =
      titles.find((t) => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';
    const safeTitle = targetTitle.replace(/'/g, "''");
    const rangeA1 = `'${safeTitle}'!A1:Z`;

    // Append as one row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: rangeA1,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Submit function error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
