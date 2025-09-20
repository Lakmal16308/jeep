import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Provider from '../models/Provider.js';
import Booking from '../models/Booking.js';
import Tourist from '../models/Tourist.js';
import Contact from '../models/Contact.js'; // Changed to Contact
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Multer configuration for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads/');
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
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.error('No token provided in Authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }
  console.log('Verifying admin token:', token.substring(0, 20) + '...');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded admin token:', decoded);
    if (decoded.role !== 'admin') {
      console.error('Not authorized: Role is not admin:', decoded.role);
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Get pending providers
router.get('/pending-providers', verifyAdmin, async (req, res) => {
  try {
    const providers = await Provider.find({ approved: false });
    console.log(`Fetched ${providers.length} pending providers`);
    return res.json(providers);
  } catch (err) {
    console.error('Error fetching pending providers:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all providers
router.get('/providers', verifyAdmin, async (req, res) => {
  try {
    const providers = await Provider.find();
    console.log(`Fetched ${providers.length} providers`);
    return res.json(providers);
  } catch (err) {
    console.error('Error fetching providers:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add new provider
router.post('/providers', verifyAdmin, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { serviceName, fullName, email, contact, category, location, price, description, password } = req.body;
  try {
    if (!serviceName || !fullName || !email || !contact || !category || !location || !price || !description || !password) {
      console.error('Missing required fields for provider');
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!req.files || !req.files.profilePicture || !req.files.photos) {
      console.error('Missing profile picture or photos');
      return res.status(400).json({ error: 'Profile picture and at least one photo are required' });
    }

    const existingProvider = await Provider.findOne({ email });
    if (existingProvider) {
      console.error('Email already exists:', email);
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const profilePicture = req.files.profilePicture[0].path.replace(/\\/g, '/');
    const photos = req.files.photos.map(file => file.path.replace(/\\/g, '/'));

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
      approved: true,
      profilePicture,
      photos
    });
    console.log('Provider added:', provider._id);
    return res.json({ message: 'Provider added', provider });
  } catch (err) {
    console.error('Provider add error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update provider
router.put('/providers/:id', verifyAdmin, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  try {
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    if (req.files.profilePicture) {
      updateData.profilePicture = req.files.profilePicture[0].path.replace(/\\/g, '/');
    }
    if (req.files.photos) {
      updateData.photos = req.files.photos.map(file => file.path.replace(/\\/g, '/'));
    }
    const provider = await Provider.findByIdAndUpdate(id, updateData, { new: true });
    if (!provider) {
      console.error('Provider not found:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider updated:', id);
    return res.json({ message: 'Provider updated', provider });
  } catch (err) {
    console.error('Provider update error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete provider
router.delete('/providers/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const provider = await Provider.findByIdAndDelete(id);
    if (!provider) {
      console.error('Provider not found:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider deleted:', id);
    return res.json({ message: 'Provider deleted' });
  } catch (err) {
    console.error('Provider delete error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Approve provider
router.put('/providers/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const provider = await Provider.findByIdAndUpdate(
      req.params.id,
      { approved: true },
      { new: true }
    );
    if (!provider) {
      console.error('Provider not found:', req.params.id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider approved:', req.params.id);
    return res.json({ message: 'Provider approved', provider });
  } catch (err) {
    console.error('Error approving provider:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all bookings
router.get('/bookings/admin', verifyAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate({
        path: 'providerId',
        select: 'serviceName fullName price category'
      })
      .populate({
        path: 'touristId',
        select: 'fullName email'
      })
      .sort({ date: -1 })
      .lean();
    console.log(`Fetched ${bookings.length} bookings for admin`);
    return res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add new booking
router.post('/bookings/admin', verifyAdmin, async (req, res) => {
  const { providerId, touristId, productType, date, time, adults, children, status, totalPrice, specialNotes } = req.body;
  try {
    console.log('Adding booking:', { providerId, productType, adults, children, totalPrice });
    if (!touristId || !date || !time || !adults) {
      console.error('Missing required fields:', { touristId, date, time, adults });
      return res.status(400).json({ error: 'Tourist ID, Date, Time, and Adults are required' });
    }
    if (providerId && productType) {
      console.error('Cannot specify both providerId and productType');
      return res.status(400).json({ error: 'Cannot specify both providerId and productType' });
    }
    if (providerId && !mongoose.Types.ObjectId.isValid(providerId)) {
      console.error('Invalid providerId:', providerId);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(touristId)) {
      console.error('Invalid touristId:', touristId);
      return res.status(400).json({ error: 'Invalid Tourist ID' });
    }
    const tourist = await Tourist.findById(touristId);
    if (!tourist) {
      console.error('Tourist not found:', touristId);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    const bookingData = {
      touristId,
      date,
      time,
      adults: Number(adults),
      children: Number(children || 0),
      status: status || 'pending',
      specialNotes
    };
    if (providerId) {
      const provider = await Provider.findById(providerId);
      if (!provider) {
        console.error('Provider not found:', providerId);
        return res.status(404).json({ error: 'Provider not found' });
      }
      bookingData.providerId = providerId;
      bookingData.totalPrice = provider.price * (Number(adults) + Number(children || 0) * 0.5);
    } else if (productType) {
      const pricing = PRICING_STRUCTURE[productType];
      if (!pricing) {
        console.error('No pricing for product:', productType);
        return res.status(400).json({ error: 'Invalid product type or no pricing available' });
      }
      const totalPersons = Number(adults) + Number(children || 0);
      const tier = pricing.find(tier => totalPersons >= tier.min && totalPersons <= tier.max);
      if (!tier) {
        console.error('No pricing tier for:', { productType, totalPersons });
        return res.status(400).json({ error: `No pricing tier for ${totalPersons} persons` });
      }
      bookingData.productType = productType;
      bookingData.totalPrice = totalPersons * tier.price;
    }
    const booking = await Booking.create(bookingData);
    console.log('Booking added by admin:', booking._id, 'Total Price:', booking.totalPrice);
    return res.json({ message: 'Booking added', booking });
  } catch (err) {
    console.error('Booking add error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update booking
router.put('/bookings/admin/:id/approve', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error('Invalid booking ID:', id);
      return res.status(400).json({ error: 'Invalid Booking ID' });
    }
    const booking = await Booking.findByIdAndUpdate(
      id,
      { status: 'confirmed' },
      { new: true }
    )
      .populate({
        path: 'providerId',
        select: 'serviceName fullName price category'
      })
      .populate({
        path: 'touristId',
        select: 'fullName email'
      })
      .lean();
    if (!booking) {
      console.error('Booking not found:', id);
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.log('Booking approved:', id, 'Total Price:', booking.totalPrice);
    return res.json({ message: 'Booking approved', booking });
  } catch (err) {
    console.error('Booking approve error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete booking
router.delete('/bookings/admin/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error('Invalid booking ID:', id);
      return res.status(400).json({ error: 'Invalid Booking ID' });
    }
    const booking = await Booking.findByIdAndDelete(id);
    if (!booking) {
      console.error('Booking not found:', id);
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.log('Booking deleted:', id);
    return res.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error('Booking delete error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all tourists
router.get('/tourists', verifyAdmin, async (req, res) => {
  try {
    const tourists = await Tourist.find();
    console.log(`Fetched ${tourists.length} tourists`);
    return res.json(tourists);
  } catch (err) {
    console.error('Error fetching tourists:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add new tourist
router.post('/tourists', verifyAdmin, async (req, res) => {
  const { fullName, email, password, country } = req.body;
  try {
    if (!fullName || !email || !password || !country) {
      console.error('Missing required fields for tourist');
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingTourist = await Tourist.findOne({ email });
    if (existingTourist) {
      console.error('Email already exists:', email);
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const tourist = await Tourist.create({ fullName, email, password: hashedPassword, country });
    console.log('Tourist added:', tourist._id);
    return res.json({ message: 'Tourist added', tourist });
  } catch (err) {
    console.error('Tourist add error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update tourist
router.put('/tourists/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  try {
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const tourist = await Tourist.findByIdAndUpdate(id, updateData, { new: true });
    if (!tourist) {
      console.error('Tourist not found:', id);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    console.log('Tourist updated:', id);
    return res.json({ message: 'Tourist updated', tourist });
  } catch (err) {
    console.error('Tourist update error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete tourist
router.delete('/tourists/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const tourist = await Tourist.findByIdAndDelete(id);
    if (!tourist) {
      console.error('Tourist not found:', id);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    console.log('Tourist deleted:', id);
    return res.json({ message: 'Tourist deleted' });
  } catch (err) {
    console.error('Tourist delete error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all contact messages
router.get('/contact-messages', verifyAdmin, async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    console.log(`Fetched ${messages.length} contact messages`);
    return res.json(messages);
  } catch (err) {
    console.error('Error fetching contact messages:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete contact message
router.delete('/contact-messages/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error('Invalid contact message ID:', id);
      return res.status(400).json({ error: 'Invalid Contact Message ID' });
    }
    const message = await Contact.findByIdAndDelete(id);
    if (!message) {
      console.error('Contact message not found:', id);
      return res.status(404).json({ error: 'Contact message not found' });
    }
    console.log('Contact message deleted:', id);
    return res.json({ message: 'Contact message deleted' });
  } catch (err) {
    console.error('Contact message delete error:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;