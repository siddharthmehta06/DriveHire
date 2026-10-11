const app = require('./app');
const logger = require('./lib/logger');

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  logger.info(`DriveHire server listening on http://localhost:${port}`);
});
