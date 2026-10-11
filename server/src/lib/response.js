function successResponse(data, meta = undefined) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return payload;
}

function errorResponse(error) {
  const payload = {
    success: false,
    error: {
      code: error.code || 'INTERNAL',
      message: error.message || 'Something went wrong.',
    },
  };

  if (error.details) payload.error.details = error.details;
  return payload;
}

module.exports = { successResponse, errorResponse };
