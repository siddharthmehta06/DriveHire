const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const prisma = require('./prisma');
const logger = require('./logger');

let io;

function initializeRealtime(httpServer) {
  if (io) throw new Error('Realtime server has already been initialized.');
  io = new Server(httpServer, { serveClient: false });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Authentication required.'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
        return next(new Error('Invalid session.'));
      }
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch (error) {
      return next(new Error('Invalid session.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    socket.on('join:ride', async (rideId, acknowledge = () => {}) => {
      if (typeof rideId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rideId)) {
        acknowledge({ success: false, error: 'Invalid ride.' });
        return;
      }
      try {
        const ride = await prisma.carpoolRide.findFirst({
          where: { id: rideId, status: { in: ['OPEN', 'FULL', 'IN_PROGRESS'] } },
          select: { id: true },
        });
        if (!ride) {
          acknowledge({ success: false, error: 'Ride not found.' });
          return;
        }
        await socket.join(`ride:${ride.id}`);
        acknowledge({ success: true, data: { rideId: ride.id } });
      } catch (error) {
        logger.error({ err: error, userId: socket.data.user.id }, 'Socket ride room authorization failed');
        acknowledge({ success: false, error: 'Unable to join ride updates.' });
      }
    });
  });

  return io;
}

function emitToRide(rideId, event, payload) {
  if (!io) return false;
  io.to(`ride:${rideId}`).emit(event, payload);
  return true;
}

function emitToUser(userId, event, payload) {
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, payload);
  return true;
}

async function closeRealtime() {
  if (!io) return;
  const current = io;
  io = undefined;
  await new Promise((resolve) => current.close(resolve));
}

module.exports = { initializeRealtime, emitToRide, emitToUser, closeRealtime };
