import { google } from 'googleapis';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { student, timestamp, tools } = JSON.parse(event.body || "{}");
    if(!student || !Array.isArray(tools)){
      return { statusCode: 400, body: 'Invalid payload' };
    }

    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    const SHEET_ID = process.env.SHEET_ID;
    if(!credsJson || !SHEET_ID){
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

    const rows = tools.map(t => [
      timestamp, student,
      t.tool,
      t.quizDone ? 'YES' : 'NO',
      t.physicalDone ? 'YES' : 'NO'
    ]);

    await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: "'Responses'!A1:E",   // add the 1
  valueInputOption: "RAW",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: rows }
});



    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch(err){
    console.error(err);
    return { statusCode: 500, body: 'Server error' };
  }
};
