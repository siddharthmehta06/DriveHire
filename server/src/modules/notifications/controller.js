const { successResponse } = require('../../lib/response');
const { parseBody } = require('../../lib/validate');
const service = require('./service');
const { idSchema, listSchema } = require('./schema');

async function list(req, res, next) {
  try {
    const query = parseBody(listSchema, req.query);
    const result = await service.list(req.user.id, query);
    return res.json(successResponse(result.items, {
      page: query.page,
      limit: query.limit,
      total: result.total,
      unreadCount: result.unreadCount,
    }));
  } catch (error) {
    return next(error);
  }
}

async function markRead(req, res, next) {
  try {
    const { id } = parseBody(idSchema, req.params);
    return res.json(successResponse(await service.markRead(req.user.id, id)));
  } catch (error) {
    return next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    const result = await service.markAllRead(req.user.id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, markRead, markAllRead };
