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

dotenv.config();

const app = express();

// CORS configuration
const allowedOrigins = [
  'https://jeep-frontend.vercel.app', // Frontend Vercel URL
  'https://jeep-ten.vercel.app',     // Backend Vercel URL (if needed)
  'http://localhost:3000'            // Local development
];

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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));
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

// Route for fetching contact messages
app.get('/api/admin/contact-messages', authenticateToken, adminMiddleware, async (req, res) => {
  try {
    const messages = await Contact.find().lean();
    res.json(messages);
  } catch (err) {
    console.error('Error fetching contact messages:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Route for submitting contact messages
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const contact = new Contact({ name, email, message });
    await contact.save();
    res.status(201).json({ message: 'Contact message submitted' });
  } catch (err) {
    console.error('Error saving contact message:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// MongoDB Connection
mongoose.connect(env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;