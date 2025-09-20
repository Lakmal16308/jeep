import express from 'express';
import mongoose from 'mongoose';
import Provider from '../models/Provider.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Images only (jpeg, jpg, png)!'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Clean image paths (remove leading slashes)
const cleanImagePaths = (provider) => {
  if (provider.profilePicture) {
    provider.profilePicture = provider.profilePicture.replace(/^\/+/, '');
  }
  if (provider.photos && Array.isArray(provider.photos)) {
    provider.photos = provider.photos.map(photo => photo.replace(/^\/+/, ''));
  }
  return provider;
};

// Get all approved providers (public)
router.get('/', async (req, res) => {
  try {
    const { approved, limit } = req.query;
    const query = approved === 'true' ? { approved: true } : {};
    const providers = await Provider.find(query)
      .limit(parseInt(limit) || 0)
      .lean();
    // Clean image paths for all providers
    const cleanedProviders = providers.map(cleanImagePaths);
    console.log(`Fetched ${cleanedProviders.length} providers (approved=${approved}, limit=${limit})`);
    res.json(cleanedProviders);
  } catch (err) {
    console.error('Error fetching providers:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch providers' });
  }
});

// Get all providers (admin)
router.get('/admin', authenticateToken, isAdmin, async (req, res) => {
  try {
    const providers = await Provider.find().lean();
    // Clean image paths for all providers
    const cleanedProviders = providers.map(cleanImagePaths);
    console.log(`Fetched ${cleanedProviders.length} providers for admin`);
    res.json(cleanedProviders);
  } catch (err) {
    console.error('Error fetching providers for admin:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch providers' });
  }
});

// Get pending providers (admin)
router.get('/admin/pending', authenticateToken, isAdmin, async (req, res) => {
  try {
    const providers = await Provider.find({ approved: false }).lean();
    // Clean image paths for all providers
    const cleanedProviders = providers.map(cleanImagePaths);
    console.log(`Fetched ${cleanedProviders.length} pending providers for admin`);
    res.json(cleanedProviders);
  } catch (err) {
    console.error('Error fetching pending providers:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch pending providers' });
  }
});

// Add provider (admin)
router.post('/admin', authenticateToken, isAdmin, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  try {
    const { serviceName, fullName, email, contact, category, location, price, description, password } = req.body;
    const profilePicture = req.files['profilePicture'] ? `uploads/${req.files['profilePicture'][0].filename}` : null;
    const photos = req.files['photos'] ? req.files['photos'].map(file => `uploads/${file.filename}`) : [];

    if (!serviceName || !fullName || !email || !contact || !category || !location || !price || !description || !password || !profilePicture) {
      console.error('Missing required fields:', { body: req.body, files: req.files });
      return res.status(400).json({ error: 'All fields and profile picture are required' });
    }

    const provider = await Provider.create({
      serviceName,
      fullName,
      email,
      contact,
      category,
      location,
      price: parseFloat(price),
      description,
      password,
      profilePicture,
      photos,
      approved: true // Admin-added providers are auto-approved
    });
    console.log('Provider added:', provider._id);
    res.json({ message: 'Provider added', provider: cleanImagePaths(provider.toObject()) });
  } catch (err) {
    console.error('Error adding provider:', err.message, err.stack);
    if (err.message === 'Email already exists') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error: Failed to add provider' });
  }
});

// Approve provider (admin)
router.put('/admin/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('Invalid provider ID:', req.params.id);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    const provider = await Provider.findByIdAndUpdate(
      req.params.id,
      { approved: true },
      { new: true }
    ).lean();
    if (!provider) {
      console.error('Provider not found:', req.params.id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider approved:', provider._id);
    res.json({ message: 'Provider approved', provider: cleanImagePaths(provider) });
  } catch (err) {
    console.error('Error approving provider:', req.params.id, err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to approve provider' });
  }
});

// Delete provider (admin)
router.delete('/admin/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('Invalid provider ID:', req.params.id);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    const provider = await Provider.findByIdAndDelete(req.params.id);
    if (!provider) {
      console.error('Provider not found:', req.params.id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider deleted:', req.params.id);
    res.json({ message: 'Provider deleted' });
  } catch (err) {
    console.error('Error deleting provider:', req.params.id, err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to delete provider' });
  }
});

// Get provider by ID (public)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('Invalid provider ID:', req.params.id);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    const provider = await Provider.findById(req.params.id).lean();
    if (!provider) {
      console.error('Provider not found:', req.params.id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Fetched provider:', provider._id);
    res.json(cleanImagePaths(provider));
  } catch (err) {
    console.error('Error fetching provider:', req.params.id, err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch provider' });
  }
});

export default router;