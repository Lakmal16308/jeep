import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
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

const app = express();

const allowedOrigins = [
  'https://jeep-booking-frontend.vercel.app',
  'https://jeep-frontend-6jse350zd.vercel.app', // Add your frontend's Vercel URL
  'http://localhost:3000' // Keep for local development
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
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

// MongoDB Connection
mongoose.connect(env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Export the app for Vercel serverless
export default app;