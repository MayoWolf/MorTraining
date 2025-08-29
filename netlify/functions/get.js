import { google } from 'googleapis';

export const handler = async (event) => {
  try {
    const student = event.queryStringParameters.student;
    if (!student) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing student' }),
      };
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

    // Read whole sheet
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Responses'!A:E",
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) {
      return {
        statusCode: 200,
        body: JSON.stringify({ found: false, tools: [] }),
      };
    }

    // Find the latest row for this student
    const header = rows[0];
    const studentIdx = header.indexOf('Student');
    const toolCols = header.slice(2); // everything after Student
    const matching = rows.filter(r => r[studentIdx] === student);

    if (!matching.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ found: false, tools: [] }),
      };
    }

    const latest = matching[matching.length - 1];

    const tools = toolCols.map((t, i) => {
      const val = latest[i + 2] || 'N/N'; // fallback
      return {
        tool: t,
        quizDone: val.startsWith('Y'),
        physicalDone: val.endsWith('Y'),
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: true, tools }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 200, // still return 200 so frontend doesn't freak out
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false, tools: [] }),
    };
  }
};
