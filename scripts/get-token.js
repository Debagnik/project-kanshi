require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const PORT = Number(process.env.OAUTH_PORT || process.env.PORT) || 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
];

function updateEnvRefreshToken(refreshToken) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.log('\n.env file not found. Add this to your .env:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
    return;
  }

  let content = fs.readFileSync(envPath, 'utf-8');
  if (/^GOOGLE_REFRESH_TOKEN=.*/m.test(content)) {
    content = content.replace(/^GOOGLE_REFRESH_TOKEN=.*/m, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  } else {
    content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log('\nSaved GOOGLE_REFRESH_TOKEN to .env successfully!');
}

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error || !code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Authorization failed: ${error || 'missing code'}`);
      server.close();
      process.exit(1);
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('No refresh_token returned. Try revoking app access in Google Account and re-running.');
        console.error('No refresh_token returned. Ensure prompt=consent is used.');
      } else {
        updateEnvRefreshToken(tokens.refresh_token);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p>');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Token exchange failed: ${err.message}`);
      console.error('Token exchange failed:', err.message);
    } finally {
      server.close();
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log('\nOpen this URL in your browser to authorize kanshi:\n');
    console.log(authUrl);
    console.log(`\nWaiting for callback on ${REDIRECT_URI} ...`);
  });
}

main();
