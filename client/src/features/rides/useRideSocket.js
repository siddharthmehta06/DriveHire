import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useRideSocket(token, rideIds, onSeatUpdate) {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const rideIdsKey = rideIds.join(',');

  useEffect(() => {
    if (!token) return undefined;
    const ids = rideIdsKey ? rideIdsKey.split(',') : [];
    const socket = io('/', { path: '/socket.io', auth: { token }, reconnection: true });
    socket.on('connect', () => {
      setConnected(true);
      setConnectionError('');
      ids.forEach((rideId) => {
        socket.emit('join:ride', rideId, (result) => {
          if (!result?.success) setConnectionError(result?.error || 'Live ride updates are unavailable.');
        });
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionError('Live updates could not connect. Ride information can still be refreshed.');
    });
    socket.on('ride:seats-updated', onSeatUpdate);
    return () => socket.disconnect();
  }, [onSeatUpdate, rideIdsKey, token]);

  return { connected, connectionError };
}
