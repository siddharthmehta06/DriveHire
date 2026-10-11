const { createServer } = require('http');
const app = require('./app');
const logger = require('./lib/logger');
const { initializeRealtime } = require('./lib/realtime');
const cron = require('node-cron');
const { runExpiryScan } = require('./jobs/documentExpiry');

const port = Number(process.env.PORT || 4000);
const server = createServer(app);
initializeRealtime(server);

server.listen(port, () => {
  logger.info(`DriveHire server listening on http://localhost:${port}`);
});

if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await runExpiryScan();
      logger.info(result, 'Daily document expiry scan completed');
    } catch (error) {
      logger.error({ err: error }, 'Daily document expiry scan failed');
    }
  }, { timezone: 'Asia/Kolkata' });
}
