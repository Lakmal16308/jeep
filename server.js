import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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
import { authenticateToken, isAdmin as adminMiddleware } from './middleware/auth.js';

// Load .env only in non-production (local development)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();

// Define allowed origins for CORS
const allowedOrigins = [
  'https://jeep-booking-frontend.vercel.app',
  'http://localhost:3000'
];

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Middleware for parsing requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// Serve static files from Uploads directory
app.use('/Uploads', express.static(path.join(process.cwd(), 'Uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/tourists', touristsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);

// Route for fetching contact messages (admin only)
app.get('/api/admin/contact-messages', authenticateToken, adminMiddleware, async (req, res) => {
  try {
    const messages = await Contact.find().lean();
    console.log(`Fetched ${messages.length} contact messages for admin`);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching contact messages:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch contact messages' });
  }
});

// Route for submitting contact messages (public)
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message, phone } = req.body;
    if (!name || !email || !message || !phone) {
      console.error('Missing required fields for contact message:', req.body);
      return res.status(400).json({ error: 'Name, email, message, and phone are required' });
    }
    const contact = new Contact({ name, email, message, phone });
    await contact.save();
    console.log('Contact message saved:', { name, email });
    res.status(201).json({ message: 'Contact message submitted' });
  } catch (err) {
    console.error('Error saving contact message:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to save contact message' });
  }
});

// Health check endpoint for debugging
app.get('/health', (req, res) => {
  const envStatus = {
    MONGODB_URI: !!process.env.MONGODB_URI,
    JWT_SECRET: !!process.env.JWT_SECRET,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    PAYHERE_MERCHANT_ID: !!process.env.PAYHERE_MERCHANT_ID,
    PAYHERE_MERCHANT_SECRET: !!process.env.PAYHERE_MERCHANT_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'not set'
  };
  console.log('Health check:', envStatus);
  res.json({ status: 'ok', environment: envStatus });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message, err.stack);
    process.exit(1); // Exit on MongoDB connection failure
  });

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI ? 'set' : 'missing',
    JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'missing'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});