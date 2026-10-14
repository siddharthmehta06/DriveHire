const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');

const strategies = new Map();

function registerAmountStrategy(type, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Strategy calculator must be a function.');
  }
  strategies.set(String(type).toUpperCase(), fn);
}

function getAmountStrategy(type) {
  const fn = strategies.get(String(type).toUpperCase());
  if (!fn) {
    throw new AppError('UNPROCESSABLE', `Unsupported booking amount strategy: ${type}`, 422);
  }
  return fn;
}

// RIDE strategy: seatsBooked * costPerSeat
registerAmountStrategy('RIDE', (booking) => {
  const seatsBooked = booking.rideBooking?.seatsBooked;
  const costPerSeat = booking.rideBooking?.ride?.costPerSeat;

  if (seatsBooked == null || costPerSeat == null) {
    throw new AppError('UNPROCESSABLE', 'Booking is missing ride seat or price information.', 422);
  }

  const seats = new Prisma.Decimal(seatsBooked);
  const cost = new Prisma.Decimal(costPerSeat);
  return seats.times(cost);
});

module.exports = {
  registerAmountStrategy,
  getAmountStrategy,
};
