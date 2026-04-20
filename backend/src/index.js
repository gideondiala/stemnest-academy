/**
 * StemNest Academy — Backend Entry Point
 * Express server with CORS, JSON parsing, and route mounting.
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRoutes     = require('./routes/auth');
const courseRoutes   = require('./routes/courses');
const sessionRoutes  = require('./routes/sessions');
const userRoutes     = require('./routes/users');
const projectRoutes  = require('./routes/projects');
const errorHandler   = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5500' }));
app.use(express.json());

// Global rate limiter (100 req / 15 min per IP)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'StemNest API is running 🚀' });
});

// ── Routes ──
app.use('/api/auth',     authRoutes);
app.use('/api/courses',  courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/projects', projectRoutes);

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global error handler ──
app.use(errorHandler);

// ── Start ──
app.listen(PORT, () => {
  console.log(`✅ StemNest API running on http://localhost:${PORT}`);
});

module.exports = app; // for testing
