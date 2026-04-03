import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import initiativeRoutes from './routes/initiativeRoutes';
import transcriptRoutes from './routes/transcriptRoutes';
import pushRoutes from './routes/pushRoutes';
import { errorHandler } from './middleware/errorHandler';
import { scheduleDailyReports, checkMissedDigests } from './queue/emailQueue';
import { initWebPush } from './services/pushService';

const app = express();
const httpServer = createServer(app);

// Build allowed origins from env — supports comma-separated list
// e.g. FRONTEND_URL=http://yourdomain.com,http://app.yourdomain.com
const allowedOrigins = [
  'http://localhost',
  'http://localhost:80',
  'http://localhost:8080',
  'http://localhost:5173',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim())
    : []),
]

const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) return cb(null, true)
  if (allowedOrigins.includes(origin)) return cb(null, true)
  cb(new Error(`CORS: origin ${origin} not allowed`))
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io available to routes
app.set('io', io);

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/', initiativeRoutes);
app.use('/', transcriptRoutes);
app.use('/push', pushRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-initiative', (initiativeId: string) => {
    socket.join(`initiative:${initiativeId}`);
  });

  socket.on('leave-initiative', (initiativeId: string) => {
    socket.leave(`initiative:${initiativeId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handler
app.use(errorHandler);

// Start daily report scheduler and init push notifications
scheduleDailyReports();
checkMissedDigests();
initWebPush();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
export default app;
