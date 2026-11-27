const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('./logger');

/**
 * Fetches all rows from the "STATUS" tab.
 * Returns a Map<serviceId, { status, lastCheckedEpoch }>.
 */
async function fetchAllStatuses() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const statusMap = new Map();

  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'STATUS!A:C',
    });

    const rows = res.data.values || [];
    for (const row of rows.slice(1)) {
      const id = row[0] ? String(row[0]).trim() : '';
      if (!id) continue;
      statusMap.set(id, {
        status: row[1] ? String(row[1]).trim().toUpperCase() : 'UP',
        lastCheckedEpoch: row[2] ? Number(row[2]) : 0,
      });
    }

    logger.info('SheetsStatus', 'Fetched existing statuses from STATUS tab', {
      count: statusMap.size,
    });
  } catch (err) {
    logger.warn('SheetsStatus', 'Failed to fetch STATUS tab (starting fresh)', {
      error: err.message,
    });
  }

  return statusMap;
}

/**
 * Upserts a service's status row in the "STATUS" tab (id, status, lastCheckedEpoch).
 */
async function updateServiceStatus({ serviceId, status, lastCheckedEpoch }) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'STATUS!A:A',
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[0] === serviceId);

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'STATUS!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[serviceId, status, lastCheckedEpoch]],
        },
      });
    } else {
      const sheetRowNumber = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `STATUS!A${sheetRowNumber}:C${sheetRowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[serviceId, status, lastCheckedEpoch]],
        },
      });
    }

    logger.debug('SheetsStatus', `Updated STATUS for "${serviceId}"`, {
      status,
      lastCheckedEpoch,
    });
  } catch (err) {
    logger.error('SheetsStatus', `Failed to update STATUS for "${serviceId}"`, {
      status,
      error: err.message,
    });
  }
}

module.exports = { fetchAllStatuses, updateServiceStatus };
