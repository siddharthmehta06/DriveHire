const prisma = require('../../lib/prisma');
const { on } = require('../../lib/events');
const logger = require('../../lib/logger');
const { recomputeVehicleStatus } = require('./status');

async function handleExpiredDocument(document) {
  await prisma.verificationAudit.create({
    data: {
      adminId: 'SYSTEM',
      targetType: 'DOCUMENT',
      targetId: document.id,
      action: 'AUTO_EXPIRED',
      reason: 'Document expired.',
    },
  });
  if (document.vehicleId) await recomputeVehicleStatus(document.vehicleId);
}

async function handleDocumentUploaded(document) {
  if (document.vehicleId) await recomputeVehicleStatus(document.vehicleId);
}

function observe(eventName, handler, message) {
  on(eventName, (document) => {
    handler(document).catch((error) => {
      logger.error({ err: error, documentId: document.id }, message);
    });
  });
}

observe('document.expired', handleExpiredDocument, 'Document expiry verification update failed');
observe('document.uploaded', handleDocumentUploaded, 'Vehicle status update after document upload failed');

module.exports = { handleExpiredDocument, handleDocumentUploaded };
