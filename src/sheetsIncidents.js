const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('./logger');

/**
 * Appends a new DOWN incident row to the "Incidents" sheet.
 * Returns the generated incidentId.
 */
async function recordIncidentDown({ service, downAt, reason }) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const incidentId = `${service.id}-${Date.now()}`;

  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Incidents!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            incidentId,
            service.id,
            service.displayName,
            downAt.toISOString(),
            '', // upAt (filled on recovery)
            '', // durationMinutes (filled on recovery)
            reason,
          ],
        ],
      },
    });

    logger.info('SheetsIncidents', 'Recorded DOWN incident in Google Sheets', {
      incidentId,
      serviceId: service.id,
      downAt: downAt.toISOString(),
    });
  } catch (err) {
    logger.error('SheetsIncidents', 'Failed to record DOWN incident in Google Sheets', {
      incidentId,
      serviceId: service.id,
      error: err.message,
    });
  }

  return incidentId;
}

/**
 * Finds the incident row by incidentId in "Incidents" and updates upAt & durationMinutes.
 */
async function recordIncidentUp({ incidentId, service, upAt, durationMinutes }) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Incidents!A:A',
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex((r) => r[0] === incidentId);

    if (rowIndex === -1) {
      logger.warn('SheetsIncidents', 'Incident ID not found in sheet; appending recovery row', {
        incidentId,
        serviceId: service.id,
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Incidents!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              incidentId,
              service.id,
              service.displayName,
              '',
              upAt.toISOString(),
              durationMinutes,
              'Recovered (initial DOWN row missing)',
            ],
          ],
        },
      });
      return;
    }

    const sheetRowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Incidents!E${sheetRowNumber}:F${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[upAt.toISOString(), durationMinutes]],
      },
    });

    logger.info('SheetsIncidents', 'Updated incident with recovery details in Google Sheets', {
      incidentId,
      serviceId: service.id,
      upAt: upAt.toISOString(),
      durationMinutes,
    });
  } catch (err) {
    logger.error('SheetsIncidents', 'Failed to update incident recovery in Google Sheets', {
      incidentId,
      serviceId: service.id,
      error: err.message,
    });
  }
}

module.exports = { recordIncidentDown, recordIncidentUp };
