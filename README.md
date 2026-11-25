# kanshi

Lightweight Raspberry Pi health-check monitor powered by Node.js, Google Sheets, and Gmail API (`googleapis`).

Alternative to betterstack.com

## Features
- **Google Sheets Configuration**: Reads `Services`, `FeatureFlags`, `BCC`, and HTML email templates from one Google Spreadsheet.
- **Per-Service Schedules**: Each service runs on its own `intervalMinutes` loop.
- **Contract Validation**: Checks HTTP status codes and partial-match JSON contracts using `axios`.
- **Smart Email Alerts (`googleapis`)**:
  - Sends **Service Down** emails on `UP -> DOWN` transitions.
  - Sends **Service Restored** emails on `DOWN -> UP` transitions with Time of Death, Time of Revival, and Downtime Duration.
  - Supports `ENABLE_BCC` and `IS_TESTING` flags, with automatic `To`/`Bcc` deduplication.
- **Incident Analytics**: Records `UP -> DOWN` and `DOWN -> UP` incidents in an `Incidents` sheet.

## Setup

### 1. Google Cloud & `googleapis` Credentials (Sheets + Gmail)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one).
2. **Enable APIs**:
   - Navigate to **APIs & Services > Library**.
   - Search for and enable **Google Sheets API**.
   - Search for and enable **Gmail API**.
3. **Configure OAuth Consent Screen**:
   - Go to **APIs & Services > OAuth consent screen**.
   - Choose **External** (or **Internal** if using Google Workspace) and fill in the app name, support email, and developer contact email.
   - Under **Scopes**, add:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/gmail.send`
   - Under **Test users** (if External & in Testing mode), add the Gmail account you will send emails from.
4. **Create OAuth2 Client ID**:
   - Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Select **Web application**.
   - Add `http://localhost:<OAUTH_PORT>/oauth2callback` (default `http://localhost:3000/oauth2callback`) to **Authorized redirect URIs**.
   - Copy the **Client ID** and **Client Secret** into your `.env` file (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. **Generate a Refresh Token (Automated)**:
   - Run:
     ```bash
     npm run auth
     ```
   - Open the printed URL in your browser, sign in with your `GMAIL_SENDER` account, and approve access.
   - The script will automatically catch the callback and save `GOOGLE_REFRESH_TOKEN` to `.env`.

### 2. Google Spreadsheet Setup
Create a Google Spreadsheet with 4 tabs:
1. **`Services`**: Headers: `id`, `checkUrl`, `method`, `intervalMinutes`, `timeoutMs`, `expectedStatus`, `expectedJson`, `displayName`, `publicUrl`, `recipients`
2. **`FeatureFlags`**: Headers: `key`, `value`, `comment` (keys: `ENABLE_BCC`, `IS_TESTING`, `ALERT_DOWN_TEMPLATE`, `ALERT_RESTORED_TEMPLATE`)
3. **`BCC`**: Header: `email`
4. **`Incidents`**: Headers: `incidentId`, `serviceId`, `displayName`, `downAt`, `upAt`, `durationMinutes`, `reason`

Copy the Spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`).

### 3. Environment & Run
1. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_SENDER`, and `SPREADSHEET_ID`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run:
   ```bash
   npm start
   ```

## Raspberry Pi `systemd` Service
Create `/etc/systemd/system/kanshi.service`:
```ini
[Unit]
Description=Kanshi Health-Check Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/kanshi
ExecStart=/usr/bin/node /home/pi/kanshi/src/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl enable kanshi
sudo systemctl start kanshi
```
