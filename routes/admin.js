import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Provider from '../models/Provider.js';
import Booking from '../models/Booking.js';
import Tourist from '../models/Tourist.js';
import Contact from '../models/Contact.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const router = express.Router();

// Ensure Uploads directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = process.env.NODE_ENV === 'production' ? '/tmp/Uploads' : path.join(__dirname, '..', 'Uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`[${new Date().toISOString()}] Created Uploads directory: ${uploadsDir}`);
  }
} catch (err) {
  console.error(`[${new Date().toISOString()}] Failed to create Uploads directory: ${err.message}`);
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG/PNG images are allowed'));
  }
});

const PRICING_STRUCTURE = {
  'Jeep Safari': [
    { min: 1, max: 3, price: 38 },
    { min: 4, max: 5, price: 30 },
    { min: 6, max: 10, price: 20 },
    { min: 11, max: 20, price: 15 }
  ],
  'Catamaran Boat Ride': [
    { min: 1, max: 1, price: 9.8 },
    { min: 2, max: Infinity, price: 7 }
  ],
  'Village Cooking Experience': [
    { min: 1, max: 5, price: 15 },
    { min: 6, max: 10, price: 13 },
    { min: 11, max: 20, price: 11 },
    { min: 21, max: 50, price: 10 }
  ],
  'Bullock Cart Ride': [
    { min: 1, max: 5, price: 9.9 },
    { min: 6, max: 20, price: 5 },
    { min: 21, max: 50, price: 4 }
  ],
  'Village Tour': [
    { min: 1, max: 5, price: 19.9 },
    { min: 6, max: 10, price: 18.2 },
    { min: 11, max: 20, price: 17.3 },
    { min: 21, max: 30, price: 16.3 },
    { min: 31, max: 50, price: 15 }
  ],
  'Traditional Village Lunch': [
    { min: 1, max: Infinity, price: 15 }
  ],
  'Sundowners Cocktail': null,
  'High Tea': null,
  'Tuk Tuk Adventures': null
};

// Middleware to verify admin
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(`[${new Date().toISOString()}] Verifying admin token for ${req.method} ${req.path}, Authorization: ${authHeader || 'none'}`);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error(`[${new Date().toISOString()}] No valid Bearer token provided`);
    return res.status(401).json({ error: 'No valid Bearer token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    if (decoded.role !== 'admin') {
      console.error(`[${new Date().toISOString()}] Not authorized: Role is ${decoded.role}`);
      return res.status(403).json({ error: 'Not authorized: Admin only' });
    }
    req.user = decoded;
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Token verification failed: ${err.message}`);
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' });
  }
};

// Get pending providers
router.get('/pending-providers', verifyAdmin, async (req, res) => {
  try {
    const providers = await Provider.find({ approved: false }).lean();
    console.log(`[${new Date().toISOString()}] Fetched ${providers.length} pending providers`);
    return res.json(providers);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching pending providers:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Get all providers
router.get('/providers', verifyAdmin, async (req, res) => {
  try {
    const providers = await Provider.find().lean();
    console.log(`[${new Date().toISOString()}] Fetched ${providers.length} providers`);
    return res.json(providers);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching providers:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Add tourist
router.post('/tourists', verifyAdmin, async (req, res) => {
  const { fullName, email, password, country } = req.body;
  try {
    console.log(`[${new Date().toISOString()}] Adding tourist:`, { fullName, email, country });
    if (!fullName || !email || !password || !country) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      console.error(`[${new Date().toISOString()}] Password too short: ${password.length} characters`);
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existingTourist = await Tourist.findOne({ email });
    if (existingTourist) {
      console.error(`[${new Date().toISOString()}] Email already exists: ${email}`);
      return res.status(400).json({ error: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const tourist = await Tourist.create({ fullName, email, password: hashedPassword, country });
    console.log(`[${new Date().toISOString()}] Tourist added: ${tourist._id}`);
    return res.status(201).json({ message: 'Tourist added', tourist: tourist.toObject() });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tourist add error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Update tourist
router.put('/tourists/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid tourist ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Tourist ID' });
    }
    if (updateData.password) {
      if (updateData.password.length < 6) {
        console.error(`[${new Date().toISOString()}] Password too short: ${updateData.password.length} characters`);
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const tourist = await Tourist.findByIdAndUpdate(id, updateData, { new: true }).lean();
    if (!tourist) {
      console.error(`[${new Date().toISOString()}] Tourist not found: ${id}`);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    console.log(`[${new Date().toISOString()}] Tourist updated: ${id}`);
    return res.json({ message: 'Tourist updated', tourist });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tourist update error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete tourist
router.delete('/tourists/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid tourist ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Tourist ID' });
    }
    const tourist = await Tourist.findByIdAndDelete(id);
    if (!tourist) {
      console.error(`[${new Date().toISOString()}] Tourist not found: ${id}`);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    console.log(`[${new Date().toISOString()}] Tourist deleted: ${id}`);
    return res.json({ message: 'Tourist deleted' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tourist delete error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Get all contact messages
router.get('/contact-messages', verifyAdmin, async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 }).lean();
    console.log(`[${new Date().toISOString()}] Fetched ${messages.length} contact messages`);
    return res.json(messages);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching contact messages:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete contact message
router.delete('/contact-messages/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid contact message ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Contact Message ID' });
    }
    const message = await Contact.findByIdAndDelete(id);
    if (!message) {
      console.error(`[${new Date().toISOString()}] Contact message not found: ${id}`);
      return res.status(404).json({ error: 'Contact message not found' });
    }
    console.log(`[${new Date().toISOString()}] Contact message deleted: ${id}`);
    return res.json({ message: 'Contact message deleted' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Contact message delete error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;