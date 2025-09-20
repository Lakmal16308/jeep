import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import Tourist from '../models/Tourist.js';
import Provider from '../models/Provider.js';
import Admin from '../models/Admin.js';

const router = express.Router();

// Multer configuration for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
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

router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  try {
    console.log('Login attempt:', { email, role });
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    let user;
    if (role === 'tourist') {
      user = await Tourist.findOne({ email });
    } else if (role === 'provider') {
      user = await Provider.findOne({ email });
    } else if (role === 'admin') {
      user = await Admin.findOne({ username: email });
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!user) {
      return res.status(400).json({ error: `No ${role} found with this ${role === 'admin' ? 'username' : 'email'}` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (role === 'provider' && !user.approved) {
      return res.status(403).json({ error: 'Provider not approved yet' });
    }

    const token = jwt.sign({ id: user._id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Generated token for user:', { id: user._id, role, token });
    return res.json({ token, role });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Tourist signup
router.post('/tourist/signup', async (req, res) => {
  let { fullName, email, password, country } = req.body;

  try {
    console.log('Tourist signup attempt:', { fullName, email, country });
    if (!fullName || !email || !password || !country) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingTourist = await Tourist.findOne({ email });
    if (existingTourist) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const tourist = await Tourist.create({ fullName, email, password: hashedPassword, country });
    const token = jwt.sign({ id: tourist._id, role: 'tourist' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Tourist signup token:', { id: tourist._id, token });
    return res.json({ token, role: 'tourist' });
  } catch (err) {
    console.error('Tourist signup error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Provider signup
router.post('/provider/signup', upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { serviceName, fullName, email, contact, category, location, price, description, password } = req.body;
  try {
    console.log('Provider signup request:', { body: req.body, files: req.files });
    if (!serviceName || !fullName || !email || !contact || !category || !location || !price || !description || !password) {
      return res.status(400).json({ error: `Missing required fields: ${JSON.stringify(req.body)}` });
    }
    if (!req.files || !req.files.profilePicture || !req.files.photos) {
      return res.status(400).json({ error: 'Profile picture and at least one photo are required' });
    }

    const existingProvider = await Provider.findOne({ email });
    if (existingProvider) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const profilePicture = req.files.profilePicture[0].path.replace(/\\/g, '/').split('uploads/').pop();
    const photos = req.files.photos.map(file => file.path.replace(/\\/g, '/').split('uploads/').pop());

    const provider = await Provider.create({
      serviceName,
      fullName,
      email,
      contact,
      category,
      location,
      price: Number(price),
      description,
      password: hashedPassword,
      approved: false,
      profilePicture: `/uploads/${profilePicture}`,
      photos: photos.map(photo => `/uploads/${photo}`)
    });

    const token = jwt.sign({ id: provider._id, role: 'provider' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Provider signup token:', { id: provider._id, token });
    return res.json({ token, role: 'provider' });
  } catch (err) {
    console.error('Provider signup error:', err.message, err.stack);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

export default router;