const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { successResponse } = require('../../lib/response');
const { parseBody } = require('../../lib/validate');
const { loginSchema } = require('./schema');

async function login(req, res, next) {
  try {
    const credentials = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
    });

    const validPassword = user && await bcrypt.compare(credentials.password, user.passwordHash);
    if (!user || !validPassword || user.role !== credentials.role) {
      throw new AppError('UNAUTHENTICATED', 'Email, password, or account type is incorrect.', 401);
    }

    const token = jwt.sign(
      { role: user.role },
      process.env.JWT_SECRET,
      { subject: user.id, expiresIn: '8h' },
    );

    return res.json(successResponse({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }));
  } catch (error) {
    return next(error);
  }
}

async function currentUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Your account is no longer available.', 401);
    }
    return res.json(successResponse(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, currentUser };
