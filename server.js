import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import env from './config/env.js';
import authRoutes from './routes/auth.js';
import providersRoutes from './routes/providers.js';
import bookingsRoutes from './routes/bookings.js';
import touristsRoutes from './routes/tourists.js';
import reviewsRoutes from './routes/reviews.js';
import paymentsRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import productsRoutes from './routes/products.js';
import Contact from './models/Contact.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

// Validate critical environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`[${new Date().toISOString()}] Missing environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// CORS configuration
const allowedOrigins = [
  process.env.NODE_ENV === 'production' 
    ? 'https://jeep-booking-frontend.vercel.app' 
    : 'http://localhost:3000'
];
app.use(cors({
  origin: (origin, callback) => {
    try {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] CORS error: ${err.message}`);
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// Handle favicon requests to prevent crashes
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());

// Set up Uploads directory
const uploadsDir = process.env.NODE_ENV === 'production' ? '/tmp/Uploads' : path.join(process.cwd(), 'Uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`[${new Date().toISOString()}] Created Uploads directory: ${uploadsDir}`);
  }
} catch (err) {
  console.error(`[${new Date().toISOString()}] Failed to create Uploads directory: ${err.message}`);
}
app.use('/Uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/tourists', touristsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);

// Route for submitting contact messages
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      console.error(`[${new Date().toISOString()}] Missing required fields in /api/contact:`, req.body);
      return res.status(400).json({ error: 'All fields are required' });
    }
    const contact = new Contact({ name, email, message });
    await contact.save();
    res.status(201).json({ message: 'Contact message submitted' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error saving contact message: ${err.message}`, err.stack);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// MongoDB Connection with retry logic
const connectWithRetry = async (retries = 5, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });
      console.log(`[${new Date().toISOString()}] Connected to MongoDB`);
      return;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] MongoDB connection attempt ${i + 1} failed: ${err.message}`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[${new Date().toISOString()}] Failed to connect to MongoDB after ${retries} attempts`);
  process.exit(1);
};

// Initialize MongoDB connection
connectWithRetry();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Server error on ${req.method} ${req.path}: ${err.message}`, err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Export for Vercel serverless
export default app;