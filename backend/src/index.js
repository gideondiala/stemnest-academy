/**
 * StemNest Academy — Backend Entry Point
 * Production-grade Express server with security middleware,
 * structured logging, and all API routes mounted.
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const userRoutes         = require('./routes/users');
const courseRoutes       = require('./routes/courses');
const sessionRoutes      = require('./routes/sessions');
const bookingRoutes      = require('./routes/bookings');
const projectRoutes      = require('./routes/projects');
const paymentRoutes      = require('./routes/payments');
const applicationRoutes  = require('./routes/applications');
const syncRoutes         = require('./routes/sync');
const familyRoutes       = require('./routes/families');
const rescheduleToolRoutes = require('./routes/rescheduleTool');
const learningRoutes     = require('./routes/learning');
const chatRoutes         = require('./routes/chat');
const promoterRoutes     = require('./routes/promoters');
const curriculumImportRoutes = require('./routes/curriculumImport');
const classOpsRoutes         = require('./routes/classOps');
const blogRoutes         = require('./routes/blogs');
const enrollmentRoutes   = require('./routes/enrollments');
const greyRoutes         = require('./routes/grey');
const pathwayRoutes      = require('./routes/pathways');
const quizRoutes         = require('./routes/quizzes');
const certificateRoutes  = require('./routes/certificates');
const batchRoutes        = require('./routes/batches');
const errorHandler       = require('./middleware/errorHandler');
const logger             = require('./utils/logger');
const { startReminderJob }          = require('./jobs/reminders');
const { startRetentionJob }         = require('./jobs/retention');
const { startBookingExtensionJob }  = require('./jobs/bookingExtension');
const { ensureSchema }              = require('./db/ensureSchema');

const app  = express();
const PORT = process.env.PORT || 3000;

/* Trust Nginx reverse proxy */
app.set('trust proxy', 1);

/* ══════════════════════════════════════════════
   SECURITY MIDDLEWARE
══════════════════════════════════════════════ */

/* Helmet sets secure HTTP headers */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

/* CORS — only allow the frontend origin */
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5500')
  .split(',').map(o => o.trim());

/* Always allow both www and non-www */
const extraOrigins = allowedOrigins.flatMap(o => [
  o,
  o.replace('https://www.', 'https://'),
  o.replace('https://', 'https://www.'),
]);
const allAllowedOrigins = [...new Set(extraOrigins)];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allAllowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

/* Global rate limiter — 200 req / 15 min per IP */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests — please slow down' },
}));

/* ══════════════════════════════════════════════
   BODY PARSING
   Note: /api/payments/webhook needs raw body for
   Stripe signature verification — mount BEFORE json()
══════════════════════════════════════════════ */
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
/* Fincra signs the exact bytes it sent */
app.use('/api/payments/fincra/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ══════════════════════════════════════════════
   LOGGING
══════════════════════════════════════════════ */
app.use(morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream: { write: msg => logger.info(msg.trim()) } }
));

/* ══════════════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════════════ */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'StemNest API is running 🚀',
    env:     process.env.NODE_ENV,
    time:    new Date().toISOString(),
  });
});

/* ══════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════ */
app.use('/api/auth',         authRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/courses',      courseRoutes);
app.use('/api/sessions',     sessionRoutes);
app.use('/api/bookings',     bookingRoutes);
app.use('/api/projects',     projectRoutes);
app.use('/api/payments',     paymentRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/sync',         syncRoutes);
app.use('/api/families',     familyRoutes);
app.use('/api/reschedule-tool', rescheduleToolRoutes);
app.use('/api/learning',     learningRoutes);
app.use('/api/chat',         chatRoutes);
app.use('/api/promoters',    promoterRoutes);
app.use('/api/curriculum-import', curriculumImportRoutes);
app.use('/api/class-ops',    classOpsRoutes);
app.use('/api/blogs',        blogRoutes);
app.use('/api/enrollments',  enrollmentRoutes);
app.use('/api/grey',         greyRoutes);
app.use('/api/pathways',      pathwayRoutes);
app.use('/api/quizzes',       quizRoutes);
app.use('/api/certificates',  certificateRoutes);
app.use('/api/batches',       batchRoutes);

/* ══════════════════════════════════════════════
   404 + GLOBAL ERROR HANDLER
══════════════════════════════════════════════ */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use(errorHandler);

/* ══════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════ */
const server = app.listen(PORT, () => {
  logger.info(`✅ StemNest API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  /* Apply idempotent schema additions, then start background jobs */
  ensureSchema()
    .catch(e => logger.warn('[SCHEMA] ensureSchema failed: ' + e.message))
    .then(() => {
      startReminderJob();
      startRetentionJob();
      startBookingExtensionJob();
      require('./services/classOpsService').startUnendedClassJob();
      require("./services/learningService").startDueReminderJob();
      chatRoutes.startChatReminderJob();
    });
});

/* Graceful shutdown */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
