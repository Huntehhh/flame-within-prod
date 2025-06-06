const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// 🧪 POST /
app.post('/', async (req, res) => {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = 'automated leads'; // 🔧 Update if yours differs

  const incomingData = req.body;

  try {
    // Step 1: Get all current rows
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:Z`, // Skip header
    });

    const existingRows = readRes.data.values || [];
    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:1`,
    });
    const headers = headersRes.data.values[0];

    const incomingLinkedInUrl = incomingData['linkedInUrl'];

    const alreadyExists = existingRows.some(row => {
      const index = headers.indexOf('linkedInUrl');
      return row[index] === incomingLinkedInUrl;
    });

    if (alreadyExists) {
      return res.status(200).json({ status: 'duplicate', message: 'User already exists' });
    }

    // Step 2: Map incomingData to headers
    const rowToAdd = headers.map(header => incomingData[header] || '');

    // Step 3: Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [rowToAdd],
      },
    });

    res.status(200).json({ status: 'added', message: 'Row added successfully' });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
