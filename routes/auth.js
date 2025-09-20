import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Tourist from '../models/Tourist.js';
import Provider from '../models/Provider.js';
import Admin from '../models/Admin.js';

const router = express.Router();

// Ensure Uploads directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`[${new Date().toISOString()}] Created Uploads directory: ${uploadsDir}`);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// Login route
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  try {
    console.log(`[${new Date().toISOString()}] Login attempt:`, { email, role });
    if (!email || !password || !role) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    const validRoles = ['tourist', 'provider', 'admin'];
    if (!validRoles.includes(role)) {
      console.error(`[${new Date().toISOString()}] Invalid role: ${role}`);
      return res.status(400).json({ error: 'Invalid role' });
    }

    let user;
    if (role === 'tourist') {
      user = await Tourist.findOne({ email }).select('+password');
    } else if (role === 'provider') {
      user = await Provider.findOne({ email }).select('+password');
    } else if (role === 'admin') {
      user = await Admin.findOne({ username: email }).select('+password');
    }

    if (!user) {
      console.error(`[${new Date().toISOString()}] No ${role} found with ${role === 'admin' ? 'username' : 'email'}: ${email}`);
      return res.status(400).json({ error: `No ${role} found with this ${role === 'admin' ? 'username' : 'email'}` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.error(`[${new Date().toISOString()}] Invalid credentials for ${email}`);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (role === 'provider' && !user.approved) {
      console.error(`[${new Date().toISOString()}] Provider not approved: ${email}`);
      return res.status(403).json({ error: 'Provider not approved yet' });
    }

    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );
    console.log(`[${new Date().toISOString()}] Generated token for user:`, { id: user._id, role });

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return res.status(200).json({ token, role, message: 'Login successful' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Login error:`, {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Tourist signup
router.post('/tourist/signup', async (req, res) => {
  const { fullName, email, password, country } = req.body;

  try {
    console.log(`[${new Date().toISOString()}] Tourist signup attempt:`, { fullName, email, country });

    // Validate input
    if (!fullName || !email || !password || !country) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`[${new Date().toISOString()}] Invalid email format: ${email}`);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 6) {
      console.error(`[${new Date().toISOString()}] Password too short: ${password.length} characters`);
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existingTourist = await Tourist.findOne({ email });
    if (existingTourist) {
      console.error(`[${new Date().toISOString()}] Email already exists: ${email}`);
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new tourist
    const tourist = new Tourist({
      fullName,
      email,
      password: hashedPassword,
      country
    });

    await tourist.save();
    console.log(`[${new Date().toISOString()}] Tourist created:`, { id: tourist._id, email });

    // Generate JWT
    const token = jwt.sign(
      { id: tourist._id, role: 'tourist' },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );
    console.log(`[${new Date().toISOString()}] Tourist signup token:`, { id: tourist._id });

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return res.status(201).json({ token, role: 'tourist', message: 'Tourist registered successfully' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tourist signup error:`, {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Provider signup
router.post('/provider/signup', upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { serviceName, fullName, email, contact, category, location, price, description, password } = req.body;

  try {
    console.log(`[${new Date().toISOString()}] Provider signup attempt:`, { body: req.body, files: req.files });

    // Validate input
    if (!serviceName || !fullName || !email || !contact || !category || !location || !price || !description || !password) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`[${new Date().toISOString()}] Invalid email format: ${email}`);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 6) {
      console.error(`[${new Date().toISOString()}] Password too short: ${password.length} characters`);
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate price
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      console.error(`[${new Date().toISOString()}] Invalid price: ${price}`);
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Validate file uploads
    if (!req.files || !req.files.profilePicture || !req.files.photos || req.files.photos.length === 0) {
      console.error(`[${new Date().toISOString()}] Missing file uploads:`, req.files);
      return res.status(400).json({ error: 'Profile picture and at least one photo are required' });
    }

    // Check if email already exists
    const existingProvider = await Provider.findOne({ email });
    if (existingProvider) {
      console.error(`[${new Date().toISOString()}] Email already exists: ${email}`);
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Process file paths
    const profilePicture = req.files.profilePicture[0].path.replace(/\\/g, '/').split('Uploads/').pop();
    const photos = req.files.photos.map(file => file.path.replace(/\\/g, '/').split('Uploads/').pop());

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new provider
    const provider = new Provider({
      serviceName,
      fullName,
      email,
      contact,
      category,
      location,
      price: parsedPrice,
      description,
      password: hashedPassword,
      approved: false,
      profilePicture: `/Uploads/${profilePicture}`,
      photos: photos.map(photo => `/Uploads/${photo}`)
    });

    await provider.save();
    console.log(`[${new Date().toISOString()}] Provider created:`, { id: provider._id, email });

    // Generate JWT
    const token = jwt.sign(
      { id: provider._id, role: 'provider' },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );
    console.log(`[${new Date().toISOString()}] Provider signup token:`, { id: provider._id });

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return res.status(201).json({ token, role: 'provider', message: 'Provider registered successfully' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Provider signup error:`, {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;