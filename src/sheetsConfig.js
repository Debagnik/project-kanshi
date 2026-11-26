const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('./logger');

/**
 * Converts a 2D sheet array (first row = headers) into an array of objects.
 */
function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] !== undefined ? String(row[idx]).trim() : '';
    });
    return obj;
  });
}

function parseBoolean(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  return String(val).trim().toLowerCase() === 'true';
}

/**
 * Fetches Services, FeatureFlags, and BCC tabs from Google Sheets
 * and returns a clean runtime configuration object.
 */
async function fetchConfigFromSheets() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('Missing SPREADSHEET_ID in environment variables');
  }

  logger.info('SheetsConfig', 'Fetching configuration from Google Sheets...', {
    spreadsheetId,
  });

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['Services!A:Z', 'FeatureFlags!A:C', 'BCC!A:A'],
  });

  const valueRanges = response.data.valueRanges || [];
  const servicesRows = valueRanges[0]?.values || [];
  const flagsRows = valueRanges[1]?.values || [];
  const bccRows = valueRanges[2]?.values || [];

  logger.info('SheetsConfig', 'Raw sheet data fetched', {
    servicesRowCount: Math.max(0, servicesRows.length - 1),
    featureFlagsRowCount: Math.max(0, flagsRows.length - 1),
    bccRowCount: Math.max(0, bccRows.length - 1),
  });

  // 1. Parse Services
  const rawServices = rowsToObjects(servicesRows);
  const services = rawServices
    .filter((s) => s.id && s.checkUrl)
    .map((s) => {
      const rawExpected = s.expectedResponse || s.expectedJson || '';
      let expectedResponse = null;
      if (rawExpected) {
        if (rawExpected.startsWith('{') || rawExpected.startsWith('[')) {
          try {
            expectedResponse = JSON.parse(rawExpected);
          } catch (err) {
            logger.warn('SheetsConfig', `Malformed JSON in expectedResponse for "${s.id}", treating as plain text`, {
              error: err.message,
            });
            expectedResponse = rawExpected;
          }
        } else {
          expectedResponse = rawExpected;
        }
      }

      const recipients = s.recipients
        ? s.recipients
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
        : [];

      return {
        id: s.id,
        checkUrl: s.checkUrl,
        method: (s.method || 'GET').toUpperCase(),
        intervalMinutes: Number(s.intervalMinutes) > 0 ? Number(s.intervalMinutes) : 5,
        timeoutMs: Number(s.timeoutMs) > 0 ? Number(s.timeoutMs) : 5000,
        expectedStatus: Number(s.expectedStatus) > 0 ? Number(s.expectedStatus) : 200,
        expectedResponse,
        displayName: s.displayName || s.id,
        publicUrl: s.publicUrl || s.checkUrl,
        recipients,
      };
    });

  // 2. Parse FeatureFlags (key, value, comment)
  const rawFlags = rowsToObjects(flagsRows);
  const flagsMap = {};
  for (const row of rawFlags) {
    if (row.key) {
      flagsMap[row.key] = row.value;
    }
  }

  const featureFlags = {
    enableBcc: parseBoolean(flagsMap.ENABLE_BCC, false),
    isTesting: parseBoolean(flagsMap.IS_TESTING, false),
    enableWarningEmail: parseBoolean(flagsMap.ENABLE_WARNING_EMAIL, false),
    replyTo: flagsMap.REPLY_TO || '',
    alertDownTemplate: flagsMap.ALERT_DOWN_TEMPLATE || '',
    alertRestoredTemplate: flagsMap.ALERT_RESTORED_TEMPLATE || '',
    alertWarningTemplate: flagsMap.ALERT_WARNING_TEMPLATE || '',
  };

  // 3. Parse BCC list (skip header row if present)
  const bccList = bccRows
    .slice(1)
    .map((r) => (r[0] ? String(r[0]).trim() : ''))
    .filter((email) => email.includes('@'));

  logger.info('SheetsConfig', 'Configuration parsed successfully', {
    serviceCount: services.length,
    enableBcc: featureFlags.enableBcc,
    isTesting: featureFlags.isTesting,
    replyTo: featureFlags.replyTo || null,
    bccCount: bccList.length,
    hasDownTemplate: Boolean(featureFlags.alertDownTemplate),
    hasRestoredTemplate: Boolean(featureFlags.alertRestoredTemplate),
  });

  return { services, featureFlags, bccList };
}

module.exports = { fetchConfigFromSheets };
