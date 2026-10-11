require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const path = require('path');
const vehicleRoutes = require('./modules/vehicles/routes');
const authRoutes = require('./modules/auth/routes');
const { attachUser } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { successResponse } = require('./lib/response');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(attachUser);

app.get('/api/health', (req, res) => {
  res.json(successResponse({ status: 'ok' }));
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

app.use(errorHandler);

module.exports = app;
