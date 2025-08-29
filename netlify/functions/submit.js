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

    // Auth
    const creds = JSON.parse(credsJson);
    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Build tool results Y/N per tool
    const toolMap = {};
    tools.forEach(t => {
      toolMap[t.tool] = `${t.quizDone ? 'Y' : 'N'}/${t.physicalDone ? 'Y' : 'N'}`;
    });

    // Row shape (11 columns): A..K
    const row = [
      timestamp,                              // A  Latest Time Stamp
      student,                                // B  Student
      toolMap['Band Saw']            || 'N/N',// C
      toolMap['Drill Press']         || 'N/N',// D
      toolMap['Hand Drill']          || 'N/N',// E
      toolMap['Sander']              || 'N/N',// F
      toolMap['Mighter Saw']         || 'N/N',// G
      toolMap['Lazer Cutter']        || 'N/N',// H
      toolMap['CAD']                 || 'N/N',// I
    ];

    // Find the sheet tab safely
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
    const targetTitle =
      titles.find(t => t.trim().toLowerCase() === 'responses') || titles[0] || 'Sheet1';
    const safeTitle = targetTitle.replace(/'/g, "''");

    // Read existing rows (skip header row 1)
    const readRange = `'${safeTitle}'!A2:K`;
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: readRange
    });
    const values = getRes.data.values || [];

    // Look for existing row where column B (index 1) === student
    let foundRowNumber = null; // 1-based sheet row number
    for (let i = 0; i < values.length; i++) {
      const existingStudent = (values[i][1] || '').trim();
      if (existingStudent.toLowerCase() === student.trim().toLowerCase()) {
        foundRowNumber = i + 2; // +2 because A2 is values[0]
        break;
      }
    }

    if (foundRowNumber) {
      // UPDATE existing row
      const updateRange = `'${safeTitle}'!A${foundRowNumber}:K${foundRowNumber}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
    } else {
      // APPEND new row (first time this student submits)
      const appendRange = `'${safeTitle}'!A:K`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: appendRange,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Submit function error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
