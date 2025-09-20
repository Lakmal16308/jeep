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
const uploadsDir = path.join(__dirname, '..', 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(UploadsDir, { recursive: true });
  console.log(`[${new Date().toISOString()}] Created Uploads directory: ${uploadsDir}`);
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

// Add new provider
router.post('/providers', verifyAdmin, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { serviceName, fullName, email, contact, category, location, price, description, password } = req.body;
  try {
    console.log(`[${new Date().toISOString()}] Adding provider:`, { serviceName, email });
    if (!serviceName || !fullName || !email || !contact || !category || !location || !price || !description || !password) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!req.files || !req.files.profilePicture || !req.files.photos) {
      console.error(`[${new Date().toISOString()}] Missing file uploads`);
      return res.status(400).json({ error: 'Profile picture and at least one photo are required' });
    }
    if (password.length < 6) {
      console.error(`[${new Date().toISOString()}] Password too short: ${password.length} characters`);
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existingProvider = await Provider.findOne({ email });
    if (existingProvider) {
      console.error(`[${new Date().toISOString()}] Email already exists: ${email}`);
      return res.status(400).json({ error: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const profilePicture = req.files.profilePicture[0].path.replace(/\\/g, '/').split('Uploads/').pop();
    const photos = req.files.photos.map(file => file.path.replace(/\\/g, '/').split('Uploads/').pop());
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
      profilePicture: `Uploads/${profilePicture}`,
      photos: photos.map(photo => `Uploads/${photo}`)
    });
    console.log(`[${new Date().toISOString()}] Provider added: ${provider._id}`);
    return res.status(201).json({ message: 'Provider added', provider: provider.toObject() });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Provider add error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Update provider
router.put('/providers/:id', verifyAdmin, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid provider ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    if (updateData.password) {
      if (updateData.password.length < 6) {
        console.error(`[${new Date().toISOString()}] Password too short: ${updateData.password.length} characters`);
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    if (req.files.profilePicture) {
      updateData.profilePicture = `Uploads/${req.files.profilePicture[0].path.replace(/\\/g, '/').split('Uploads/').pop()}`;
    }
    if (req.files.photos) {
      updateData.photos = req.files.photos.map(file => `Uploads/${file.path.replace(/\\/g, '/').split('Uploads/').pop()}`);
    }
    const provider = await Provider.findByIdAndUpdate(id, updateData, { new: true }).lean();
    if (!provider) {
      console.error(`[${new Date().toISOString()}] Provider not found: ${id}`);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log(`[${new Date().toISOString()}] Provider updated: ${id}`);
    return res.json({ message: 'Provider updated', provider });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Provider update error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete provider
router.delete('/providers/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid provider ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    const provider = await Provider.findByIdAndDelete(id);
    if (!provider) {
      console.error(`[${new Date().toISOString()}] Provider not found: ${id}`);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log(`[${new Date().toISOString()}] Provider deleted: ${id}`);
    return res.json({ message: 'Provider deleted' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Provider delete error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Approve provider
router.put('/providers/:id/approve', verifyAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error(`[${new Date().toISOString()}] Invalid provider ID: ${req.params.id}`);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    const provider = await Provider.findByIdAndUpdate(
      req.params.id,
      { approved: true },
      { new: true }
    ).lean();
    if (!provider) {
      console.error(`[${new Date().toISOString()}] Provider not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log(`[${new Date().toISOString()}] Provider approved: ${req.params.id}`);
    return res.json({ message: 'Provider approved', provider });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error approving provider:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
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
    console.log(`[${new Date().toISOString()}] Fetched ${bookings.length} bookings for admin`);
    return res.json(bookings);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching bookings:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Add new booking
router.post('/bookings/admin', verifyAdmin, async (req, res) => {
  const { providerId, touristId, productType, date, time, adults, children, status, totalPrice, specialNotes } = req.body;
  try {
    console.log(`[${new Date().toISOString()}] Adding booking:`, { providerId, productType, adults, children });
    if (!touristId || !date || !time || !adults) {
      console.error(`[${new Date().toISOString()}] Missing required fields:`, req.body);
      return res.status(400).json({ error: 'Tourist ID, Date, Time, and Adults are required' });
    }
    if (providerId && productType) {
      console.error(`[${new Date().toISOString()}] Cannot specify both providerId and productType`);
      return res.status(400).json({ error: 'Cannot specify both providerId and productType' });
    }
    if (providerId && !mongoose.Types.ObjectId.isValid(providerId)) {
      console.error(`[${new Date().toISOString()}] Invalid providerId: ${providerId}`);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(touristId)) {
      console.error(`[${new Date().toISOString()}] Invalid touristId: ${touristId}`);
      return res.status(400).json({ error: 'Invalid Tourist ID' });
    }
    const tourist = await Tourist.findById(touristId);
    if (!tourist) {
      console.error(`[${new Date().toISOString()}] Tourist not found: ${touristId}`);
      return res.status(404).json({ error: 'Tourist not found' });
    }
    const bookingData = {
      touristId,
      date: new Date(date),
      time,
      adults: Number(adults),
      children: Number(children || 0),
      status: status || 'pending',
      specialNotes
    };
    if (providerId) {
      const provider = await Provider.findById(providerId);
      if (!provider) {
        console.error(`[${new Date().toISOString()}] Provider not found: ${providerId}`);
        return res.status(404).json({ error: 'Provider not found' });
      }
      bookingData.providerId = providerId;
      bookingData.totalPrice = provider.price * (Number(adults) + Number(children || 0) * 0.5);
    } else if (productType) {
      const pricing = PRICING_STRUCTURE[productType];
      if (!pricing) {
        console.error(`[${new Date().toISOString()}] No pricing for product: ${productType}`);
        return res.status(400).json({ error: 'Invalid product type or no pricing available' });
      }
      const totalPersons = Number(adults) + Number(children || 0);
      const tier = pricing.find(tier => totalPersons >= tier.min && totalPersons <= tier.max);
      if (!tier) {
        console.error(`[${new Date().toISOString()}] No pricing tier for:`, { productType, totalPersons });
        return res.status(400).json({ error: `No pricing tier for ${totalPersons} persons` });
      }
      bookingData.productType = productType;
      bookingData.totalPrice = totalPersons * tier.price;
    } else {
      console.error(`[${new Date().toISOString()}] Either providerId or productType is required`);
      return res.status(400).json({ error: 'Either providerId or productType is required' });
    }
    const booking = await Booking.create(bookingData);
    console.log(`[${new Date().toISOString()}] Booking added: ${booking._id}, Total Price: ${booking.totalPrice}`);
    return res.status(201).json({ message: 'Booking added', booking });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Booking add error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Update booking
router.put('/bookings/admin/:id/approve', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid booking ID: ${id}`);
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
      console.error(`[${new Date().toISOString()}] Booking not found: ${id}`);
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.log(`[${new Date().toISOString()}] Booking approved: ${id}, Total Price: ${booking.totalPrice}`);
    return res.json({ message: 'Booking approved', booking });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Booking approve error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete booking
router.delete('/bookings/admin/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`[${new Date().toISOString()}] Invalid booking ID: ${id}`);
      return res.status(400).json({ error: 'Invalid Booking ID' });
    }
    const booking = await Booking.findByIdAndDelete(id);
    if (!booking) {
      console.error(`[${new Date().toISOString()}] Booking not found: ${id}`);
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.log(`[${new Date().toISOString()}] Booking deleted: ${id}`);
    return res.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Booking delete error:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Get all tourists
router.get('/tourists', verifyAdmin, async (req, res) => {
  try {
    const tourists = await Tourist.find().lean();
    console.log(`[${new Date().toISOString()}] Fetched ${tourists.length} tourists`);
    return res.json(tourists);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching tourists:`, err.message, err.stack);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Add new tourist
router.post('/tourists', verifyAdmin, async (req, res) => {
  const { fullName, email, password, country } = req.body;
  try {
    console.log(`[${new Date().toISOString()}] Adding tourist:`, { email });
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