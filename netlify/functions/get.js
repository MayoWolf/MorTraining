// netlify/functions/get.js
import { google } from 'googleapis';

export const handler = async (event) => {
  try {
    const student = event.queryStringParameters?.student || "";
    if (!student) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing student" }) };
    }

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const SHEET_ID = process.env.SHEET_ID;

    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Read a wide range so we cover all current/future columns
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Responses'!A:Z",           // ← was A:E; now read everything we need
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) {
      return ok({ found: false, tools: [] });
    }

    const header = rows[0];

    // Find the Student column by name (tolerant of "Student (First Last)")
    const studentIdx = header.findIndex(h =>
      String(h).trim().toLowerCase().startsWith('student')
    );
    if (studentIdx === -1) {
      // If we can't find a student column, return empty but don't hard error
      return ok({ found: false, tools: [] });
    }

    // Tools are everything after the Student column
    const toolHeaders = header.slice(studentIdx + 1);

    // Find all rows matching this student
    const dataRows = rows.slice(1);
    const matches = dataRows.filter(r => (r[studentIdx] || '').trim() === student);

    if (matches.length === 0) {
      return ok({ found: false, tools: [] });
    }

    // Use the last matching row (latest)
    const latest = matches[matches.length - 1];

    // Map tool values: each cell is expected like "Y/N", "N/Y", etc.
    const tools = toolHeaders.map((toolName, i) => {
      const cell = latest[studentIdx + 1 + i] || 'N/N';  // safe fallback
      // Normalize value and read positions; supports "Y/N" or "YES/NO"
      const v = String(cell).trim().toUpperCase();
      const yesNo = v.replace(/\s+/g,'');                // remove spaces
      const quizDone     = yesNo.startsWith('Y');        // first flag
      const physicalDone = yesNo.endsWith('Y');          // second flag
      return { tool: toolName, quizDone, physicalDone };
    });

    return ok({ found: true, tools });
  } catch (err) {
    console.error('get.js error:', err);
    // Return a 200 with empty shape so the UI doesn't show "network issue"
    return ok({ found: false, tools: [] });
  }
};

// Helper to always send JSON 200
function ok(obj) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
