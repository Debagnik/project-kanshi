require('dotenv').config();
const { fetchConfigFromSheets } = require('./sheetsConfig');
const { MonitorScheduler } = require('./scheduler');
const logger = require('./logger');

async function main() {
  logger.info('App', 'Starting kanshi health-check monitor...');

  const scheduler = new MonitorScheduler();

  async function refreshConfig() {
    try {
      const config = await fetchConfigFromSheets();
      scheduler.updateConfig(config);
    } catch (err) {
      logger.error('App', 'Failed to refresh configuration from Google Sheets', {
        error: err.message,
      });
    }
  }

  // Initial load
  await refreshConfig();

  // Periodic config refresh from Google Sheets
  const refreshMinutes = Number(process.env.CONFIG_REFRESH_MINUTES) || 5;
  const refreshTimer = setInterval(refreshConfig, refreshMinutes * 60 * 1000);

  function shutdown(signal) {
    logger.info('App', `Received ${signal}, shutting down gracefully...`);
    clearInterval(refreshTimer);
    scheduler.stopAll();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('App', 'Fatal startup error', { error: err.message });
  process.exit(1);
});
