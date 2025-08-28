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

    // Always build row in fixed column order
    const toolResults = {};
    tools.forEach((t) => {
      toolResults[t.tool] = `${t.quizDone ? 'Y' : 'N'}/${t.physicalDone ? 'Y' : 'N'}`;
    });

    // Force to start at col A
    const row = [
      timestamp,        // Column A
      student,          // Column B
      toolResults['Band Saw'] || 'N/N',
      toolResults['Drill Press'] || 'N/N',
      toolResults['Belt Sander'] || 'N/N',
      toolResults['Disc Sander'] || 'N/N',
      toolResults['Table Saw'] || 'N/N',
      toolResults['Miter Saw'] || 'N/N',
      toolResults['Hand Drill'] || 'N/N',
      toolResults['Soldering Station'] || 'N/N',
      toolResults['3D Printer'] || 'N/N'
    ];

    // Detect correct sheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
    const targetTitle =
      titles.find(t => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';
    const safeTitle = targetTitle.replace(/'/g, "''");

    // Explicit range starting at column A
    const rangeA1 = `'${safeTitle}'!A:K`; // A through K, covers 11 cols

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
