import { google } from 'googleapis';

export const handler = async (event) => {
  // GET /.netlify/functions/get?student=student8
  const student = (event.queryStringParameters?.student || '').trim();
  if (!student) {
    return { statusCode: 400, body: 'Missing ?student=' };
  }

  try {
    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    const SHEET_ID = process.env.SHEET_ID;
    if (!credsJson || !SHEET_ID) {
      return { statusCode: 500, body: 'Missing env vars' };
    }

    // Auth
    const creds = JSON.parse(credsJson);
    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Find target sheet/tab
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
    const targetTitle =
      titles.find(t => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';
    const safeTitle = targetTitle.replace(/'/g, "''");

    // Read rows (skip header)
    const readRange = `'${safeTitle}'!A2:K`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: readRange
    });
    const rows = res.data.values || [];

    // Columns: A Timestamp, B Student, C..K tools
    const idx = rows.findIndex(r => (r[1] || '').trim().toLowerCase() === student.toLowerCase());
    if (idx === -1) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ found: false })
      };
    }

    const row = rows[idx];
    const timestamp = row[0] || '';
    const toolCols = row.slice(2, 11); // C..K (9 columns expected, we have 9? actually 9? We wrote 9 after B? We wrote 9 tools + 1 = 10 tools -> 10 columns)
    // Correct slice: 10 tool columns from C..K
    const fixedToolCols = row.slice(2, 12);

    const TOOL_ORDER = [
      'Band Saw','Drill Press','Belt Sander','Disc Sander','Table Saw',
      'Miter Saw','Hand Drill','Soldering Station','3D Printer','Horizontal Bandsaw'
    ];
    // IMPORTANT: match your write order (A..K): Timestamp, Student,
    // C Band Saw, D Drill Press, E Belt Sander, F Disc Sander,
    // G Table Saw, H Miter Saw, I Hand Drill, J Soldering Station, K 3D Printer
    // (Horizontal Bandsaw is NOT part of compact sheet in your latest screenshot; if you want it, include it both in index.html and here)
    const ORDER = [
      'Band Saw','Drill Press','Belt Sander','Disc Sander','Table Saw',
      'Miter Saw','Hand Drill','Soldering Station','3D Printer'
    ];

    const tools = ORDER.map((tool, i) => {
      const cell = (fixedToolCols[i] || '').toString().toUpperCase().trim(); // "Y/N"
      const [q, p] = cell.split('/');
      return {
        tool,
        quizDone: (q || '').trim().startsWith('Y'),
        physicalDone: (p || '').trim().startsWith('Y'),
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: true, student, timestamp, tools })
    };
  } catch (err) {
    console.error('get function error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
