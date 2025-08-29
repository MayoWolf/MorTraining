// netlify/functions/get.js
import { google } from 'googleapis';

export const handler = async (event) => {
  try {
    const studentQuery = (event.queryStringParameters?.student || "").trim();
    if (!studentQuery) return ok({ found: false, tools: [] });

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const SHEET_ID = process.env.SHEET_ID;

    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // 1) List all tabs
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets(properties(title))'
    });
    const titles = (meta.data.sheets || [])
      .map(s => s.properties?.title)
      .filter(Boolean);

    // 2) Find the first tab whose header row has a "Student…" column
    let chosenTitle = null;
    let header = null;
    let studentIdx = -1;

    for (const title of titles) {
      const hdrResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${title}'!1:1`,  // first row only
      });
      const row = hdrResp.data.values?.[0] || [];
      const idx = row.findIndex(h =>
        String(h || '').trim().toLowerCase().startsWith('student')
      );
      if (idx !== -1 && row.length > idx + 1) {
        chosenTitle = title;
        header = row;
        studentIdx = idx;
        break; // take the first qualifying tab
      }
    }

    if (!chosenTitle) {
      // No tab looks like the compact sheet; fail gracefully
      return ok({ found: false, tools: [] });
    }

    // 3) Read the chosen tab (wide)
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${chosenTitle}'!A:Z`,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return ok({ found: false, tools: [] });

    // tools are all headers to the right of the "Student…" column
    const toolHeaders = header.slice(studentIdx + 1);

    // helper: does a row have any tool cell filled?
    const hasAnyToolData = (row) => {
      for (let i = 0; i < toolHeaders.length; i++) {
        const cell = (row[studentIdx + 1 + i] || '').toString().trim();
        if (cell) return true;
      }
      return false;
    };

    const target = studentQuery.toLowerCase();

    // 4) Scan from bottom to top for the latest row with data for that student
    let latest = null;
    for (let r = rows.length - 1; r >= 1; r--) {
      const row = rows[r] || [];
      const name = (row[studentIdx] || '').toString().trim().toLowerCase();
      if (name === target && hasAnyToolData(row)) {
        latest = row;
        break;
      }
    }

    if (!latest) return ok({ found: false, tools: [] });

    // 5) Map tool cells into flags (supports Y/N, YES/NO, etc.)
    const tools = toolHeaders.map((toolName, i) => {
      const raw = (latest[studentIdx + 1 + i] || 'N/N').toString().trim().toUpperCase();
      const v = raw.replace(/\s+/g, '');
      return {
        tool: toolName,
        quizDone: v.startsWith('Y'),
        physicalDone: v.endsWith('Y'),
      };
    });

    return ok({ found: true, tools });
  } catch (err) {
    console.error('get.js error:', err);
    return ok({ found: false, tools: [] });
  }
};

// Always return JSON 200 so the UI stays calm
function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
