// Load environment variables first
require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

  async function authorize() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const rawKey3 = process.env.GOOGLE_PRIVATE_KEY;
  const formattedKey = rawKey?.replace(/\\n/g, '\n');

  console.log('GOOGLE_PRIVATE_KEY is undefined or empty!');
  console.log('Formatted GOOGLE_PRIVATE_KEY preview:');
  console.log(formattedKey.split('\n').slice(0, 5).join('\n')); // show first 5 lines
  console.log('...'); // don't log the whole key
  console.log('Raw Key (first 100 chars):', rawKey?.substring(0, 100));
console.log('Escaped newlines:', (rawKey.match(/\\n/g) || []).length);
console.log('Double-escaped newlines:', (rawKey.match(/\\\\n/g) || []).length);


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
      private_key: rawKey.replace(/\\n/g, '\n') // Correct newline formatting
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      ],
  });

  return await auth.getClient();
}


/**
 * Endpoint to add a new lead to Google Sheets
 * Accepts LinkedIn profile data and appends it to the Google Sheet
 */
app.post('/', async (req, res) => {
  try {
    // Define the expected columns in the Google Sheet
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
    
    // Validate that we have at least some data to work with
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
    
    // Build row using the same order as spreadsheet columns
    const row = HEADERS.map(key => req.body[key] || '');
    
    // Add timestamp if not provided
    if (!req.body.timestamp) {
      const timestampIndex = HEADERS.indexOf('timestamp');
      if (timestampIndex !== -1) {
        row[timestampIndex] = new Date().toISOString();
      }
    }
    
    const range = 'automated leads!A2:Z';
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      },
    });

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
  console.log(`Server running on port ${PORT}`);
});
