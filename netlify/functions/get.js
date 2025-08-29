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

    // Read wide so future columns don't break us
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Responses'!A:Z",   // make sure your tab is named exactly "Responses"
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return ok({ found: false, tools: [] });

    const header = rows[0];

    // Find the Student column (handles "Student", "Student (First Last)", etc.)
    const studentIdx = header.findIndex(h =>
      String(h || "").trim().toLowerCase().startsWith("student")
    );
    if (studentIdx === -1) return ok({ found: false, tools: [] });

    // Tools = everything to the right of the Student column
    const toolHeaders = header.slice(studentIdx + 1);

    // Helper to check if a row has ANY tool value filled in
    const hasAnyToolData = (row) => {
      for (let i = 0; i < toolHeaders.length; i++) {
        const cell = (row[studentIdx + 1 + i] || "").toString().trim();
        if (cell) return true;
      }
      return false;
    };

    // Normalize the student name for comparison
    const target = studentQuery.toLowerCase();

    // Scan from bottom to top to find most recent row that:
    // - matches the student (case-insensitive, trimmed)
    // - has at least one tool cell filled
    let latest = null;
    for (let r = rows.length - 1; r >= 1; r--) {
      const row = rows[r] || [];
      const name = (row[studentIdx] || "").toString().trim().toLowerCase();
      if (name === target && hasAnyToolData(row)) {
        latest = row;
        break;
      }
    }

    if (!latest) {
      // No saved tool data yet for this student (roster only)
      return ok({ found: false, tools: [] });
    }

    // Map tool cells to {quizDone, physicalDone}
    const tools = toolHeaders.map((toolName, i) => {
      const raw = (latest[studentIdx + 1 + i] || "N/N").toString().trim().toUpperCase();
      // Accept "Y/N", "N/Y", "YES/NO", "NO/YES" etc.
      const cleaned = raw.replace(/\s+/g, "");
      const quizDone     = cleaned.startsWith("Y");
      const physicalDone = cleaned.endsWith("Y");
      return { tool: toolName, quizDone, physicalDone };
    });

    return ok({ found: true, tools });
  } catch (err) {
    console.error("get.js error:", err);
    return ok({ found: false, tools: [] });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
