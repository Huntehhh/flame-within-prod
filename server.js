// Load environment variables first
require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const Bottleneck = require('bottleneck');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Bottleneck limiter setup
const limiter = new Bottleneck({
  minTime: 1000, // Minimum 1s between each Google API call
  maxConcurrent: 1,
  reservoir: 60, // Max 60 requests per minute
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // Refresh every 60 seconds
});

async function authorize() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const rawKey3 = process.env.GOOGLE_PRIVATE_KEY;
  const formattedKey = rawKey?.replace(/\\n/g, '\n');

  console.log('Formatted GOOGLE_PRIVATE_KEY preview:');
  console.log(formattedKey.split('\n').slice(0, 5).join('\n'));
  console.log('Raw Key (first 100 chars):', rawKey?.substring(0, 100));

  if (!email) {
    console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_EMAIL");
    throw new Error("Missing Google service account email");
  }

  if (!rawKey) {
    console.error("❌ Missing GOOGLE_PRIVATE_KEY");
    throw new Error("Missing Google private key");
  } else if (!rawKey.includes('BEGIN PRIVATE KEY')) {
    console.error("❌ GOOGLE_PRIVATE_KEY appears to be misformatted (missing header)");
    throw new Error("Google private key is misformatted (missing header)");
  } else if (!rawKey.includes('\\n') && !rawKey.includes('\n')) {
    console.error("❌ GOOGLE_PRIVATE_KEY likely missing newline characters — it should contain \\n or actual line breaks.");
    throw new Error("Google private key is missing newline characters");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: rawKey.replace(/\\n/g, '\n')
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  return await auth.getClient();
}

app.post('/', async (req, res) => {
  try {
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
      'mailFromDropContact', 'status', 'anyMailEmail', 'icebreakerJson'
    ];

    if (Object.keys(req.body).length === 0) {
      return res.status(400).send({ 
        error: 'Bad Request', 
        details: 'Request body cannot be empty' 
      });
    }

    const authClient = await authorize();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error("Missing GOOGLE_SHEET_ID environment variable");
    }

    const linkedInUrlIndex = HEADERS.indexOf('linkedInUrl');
    if (linkedInUrlIndex === -1) {
      console.error("linkedInUrl field not found in HEADERS");
      throw new Error("Configuration error: linkedInUrl field not found in headers");
    }

    const columnLetter = String.fromCharCode(65 + linkedInUrlIndex);
    console.log(`Looking for linkedInUrl in column ${columnLetter} (index ${linkedInUrlIndex})`);

    const sheetsResponse = await limiter.schedule(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      })
    );

    console.log('Available sheets:');
    sheetsResponse.data.sheets.forEach(sheet => {
      console.log(`- ${sheet.properties.title}`);
    });

    const sheetName = 'automated leads';
    console.log(`Using sheet name: "${sheetName}"`);

    const { data } = await limiter.schedule(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!${columnLetter}2:${columnLetter}`,
      })
    );

    console.log('Raw spreadsheet data response:');
    console.log(JSON.stringify(data, null, 2));

    console.log(`Incoming linkedInUrl: "${req.body.linkedInUrl}"`);
    console.log(`Found ${data.values ? data.values.length : 0} existing entries`);

    const existingUrls = new Set();
    if (data.values && data.values.length > 0) {
      data.values.forEach(row => {
        if (row[0]) {
          const normalizedUrl = row[0].trim().toLowerCase();
          existingUrls.add(normalizedUrl);
          if (existingUrls.size < 5) {
            console.log(`Existing URL: "${normalizedUrl}" (original: "${row[0]}")`);
          }
        }
      });
    }

    const normalizedIncomingUrl = req.body.linkedInUrl ? req.body.linkedInUrl.trim().toLowerCase() : '';
    console.log(`Normalized incoming URL: "${normalizedIncomingUrl}"`);
    console.log(`URL exists in set: ${existingUrls.has(normalizedIncomingUrl)}`);

    console.log("All existing URLs in set:");
    existingUrls.forEach(url => console.log(`- "${url}"`));

    if (normalizedIncomingUrl && existingUrls.has(normalizedIncomingUrl)) {
      console.log(`Duplicate found: "${normalizedIncomingUrl}"`);
      return res.status(200).json({ 
        success: false, 
        message: 'Duplicate LinkedIn URL. Entry not added.' 
      });
    }

    console.log(`No duplicate found, proceeding to add: "${req.body.linkedInUrl}"`);

    const row = HEADERS.map(key => req.body[key] || '');

    if (!req.body.timestamp) {
      const timestampIndex = HEADERS.indexOf('timestamp');
      if (timestampIndex !== -1) {
        row[timestampIndex] = new Date().toISOString();
      }
    }

    const range = `${sheetName}!A2:Z`;

    console.log(`Appending data to range: ${range}`);

    await limiter.schedule(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row]
        },
      })
    );

    res.status(200).send({ 
      success: true,
      message: 'Data successfully added to Google Sheet'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
