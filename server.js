const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
require('dotenv').config(); // 🔧 Loads your .env config file
const app = express();

app.use(bodyParser.json());

// 🔐 Google API Setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, // 🔧 Add this to your .env file
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') // 🔧 Escaped correctly
  },
  scopes: SCOPES
});


// 🔧 Your Google Sheet Info
const SHEET_ID = process.env.GOOGLE_SHEET_ID; // 🔧 Add this to .env
const SHEET_NAME = 'automated leads';         // 🔧 Update if your sheet name is different

// Column order in your Google Sheet (should match exactly)
const HEADERS = [
  '', 'vmid', 'phone', 'query', 'banner', 'domain', 'country', 'founded',
  'tagLine', 'fullName', 'headline', 'industry', 'jobTitle', 'lastName',
  'location', 'firstName', 'timestamp', 'companyUrl', 'linkedinID',
  'pageNumber', 'profileUrl', 'schoolName', 'sluggedUrl', 'companyName',
  'companySize', 'linkedInUrl', 'specialties', 'headquarters',
  'industryCode', 'mainCompanyID', 'companyAddress', 'companyWebsite',
  'followersCount', 'companyLocation', 'connectionDegree', 'connectionsCount',
  'profilePictureUrl', 'companyDescription', 'salesNavigatorLink',
  'employeesOnLinkedIn', 'linkedinSalesNavigatorUrl', 'websiteFound',
  'mailFromDropContact'
];

// Main POST Endpoint
app.post('/append-if-unique', async (req, res) => {
  try {
    const sheetData = req.body;

    // Authorize with Google Sheets
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // 🔎 Get all current LinkedIn URLs in column Z
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAME}'!Z2:Z`, // Z = linkedInUrl column, skip header
    });

    const existingUrls = new Set((data.values || []).map(row => row[0]));

    // Check if incoming linkedInUrl already exists
    if (existingUrls.has(sheetData.linkedInUrl)) {
      return res.status(200).json({ message: 'Duplicate LinkedIn URL. Not added.' });
    }

    // 🧩 Build row using the same order as spreadsheet columns
    const row = HEADERS.map(key => sheetData[key] || '');

    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      }
    });

    res.status(200).json({ message: 'Row added successfully.' });

  } catch (err) {
    console.error('Error appending row:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 🔧 Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});