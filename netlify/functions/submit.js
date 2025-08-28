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

    // Map tool -> "Y/N" format
    const toolResults = {};
    tools.forEach((t) => {
      toolResults[t.tool] = `${t.quizDone ? 'Y' : 'N'}/${t.physicalDone ? 'Y' : 'N'}`;
    });

    // Match EXACT header order in your sheet
    const headerOrder = [
      'Timestamp',
      'Student',
      'Band Saw',
      'Drill Press',
      'Belt Sander',
      'Disc Sander',
      'Table Saw',
      'Miter Saw',
      'Hand Drill',
      'Soldering Station',
      '3D Printer'
    ];

    // Build row aligned with headers
    const row = headerOrder.map((h) => {
      if (h === 'Timestamp') return timestamp;
      if (h === 'Student') return student;
      return toolResults[h] || ''; // tool columns
    });

    // Detect tab
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
    const targetTitle =
      titles.find((t) => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';
    const safeTitle = targetTitle.replace(/'/g, "''");
    const rangeA1 = `'${safeTitle}'!A:Z`;

    // Append
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
