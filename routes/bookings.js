import express from 'express';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Contact from '../models/Contact.js';
import Provider from '../models/Provider.js';
import Tourist from '../models/Tourist.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Create provider-based booking (tourist) with contact form details
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('Creating booking for user:', { userId: req.user.id, role: req.user.role, payload: req.body });
    if (req.user.role !== 'tourist') {
      console.error('Access denied: Not a tourist', { userId: req.user.id });
      return res.status(403).json({ error: 'Access denied: Only tourists can book' });
    }
    const { providerId, date, time, adults, children, specialNotes, contact } = req.body;
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      console.error('Invalid providerId:', providerId);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    if (!contact || !contact.name || !contact.email || !contact.message || !contact.phone) {
      console.error('Missing contact form details');
      return res.status(400).json({ error: 'Contact details (name, email, message, phone) are required' });
    }
    const provider = await Provider.findById(providerId);
    if (!provider) {
      console.error('Provider not found:', providerId);
      return res.status(404).json({ error: 'Provider not found' });
    }
    // Save contact form details
    const contactDoc = new Contact({
      name: contact.name,
      email: contact.email,
      message: contact.message,
      phone: contact.phone // Added phone
    });
    await contactDoc.save();
    // Calculate total price in LKR (provider.price is in USD)
    const totalPrice = provider.price * 300 * (parseInt(adults) + 0.5 * parseInt(children || 0));
    const booking = await Booking.create({
      touristId: req.user.id,
      providerId,
      date,
      time,
      adults: parseInt(adults),
      children: parseInt(children || 0),
      specialNotes,
      totalPrice,
      status: 'pending',
      contactId: contactDoc._id
    });
    const populatedBooking = await Booking.findById(booking._id)
      .populate('providerId touristId contactId')
      .lean();
    console.log('Booking created with contact:', { bookingId: booking._id, providerId, touristId: req.user.id, contactId: contactDoc._id });
    res.json({ message: 'Booking created', booking: populatedBooking });
  } catch (err) {
    console.error('Error creating booking:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to create booking' });
  }
});

// Create product booking (tourist) with contact form details
router.post('/product', authenticateToken, async (req, res) => {
  try {
    console.log('Creating product booking for user:', { userId: req.user.id, role: req.user.role, payload: req.body });
    if (req.user.role !== 'tourist') {
      console.error('Access denied: Not a tourist', { userId: req.user.id });
      return res.status(403).json({ error: 'Access denied: Only tourists can book' });
    }
    const { productType, date, time, adults, children, totalPrice, specialNotes, contact } = req.body;
    if (!productType || !date || !time || !adults || !totalPrice || !contact || !contact.name || !contact.email || !contact.message || !contact.phone) {
      console.error('Missing required fields for product booking');
      return res.status(400).json({ error: 'Product type, date, time, adults, total price, and contact details (name, email, message, phone) are required' });
    }
    // Save contact form details
    const contactDoc = new Contact({
      name: contact.name,
      email: contact.email,
      message: contact.message,
      phone: contact.phone // Added phone
    });
    await contactDoc.save();
    const booking = await Booking.create({
      touristId: req.user.id,
      productType,
      date,
      time,
      adults: parseInt(adults),
      children: parseInt(children || 0),
      totalPrice: Number(totalPrice) * 300, // Convert USD to LKR
      specialNotes,
      status: 'pending',
      contactId: contactDoc._id
    });
    const populatedBooking = await Booking.findById(booking._id)
      .populate('providerId touristId contactId')
      .lean();
    console.log('Product booking created with contact:', { bookingId: booking._id, productType, touristId: req.user.id, contactId: contactDoc._id });
    res.json({ message: 'Product booking created - awaiting admin approval', booking: populatedBooking });
  } catch (err) {
    console.error('Error creating product booking:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to create product booking' });
  }
});

// Get tourist's bookings
router.get('/my-bookings', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching bookings for tourist:', { userId: req.user.id, role: req.user.role });
    if (req.user.role !== 'tourist') {
      console.error('Access denied: Not a tourist', { userId: req.user.id });
      return res.status(403).json({ error: 'Access denied: Only tourists can view their bookings' });
    }
    const bookings = await Booking.find({ touristId: req.user.id })
      .populate({
        path: 'providerId',
        select: 'serviceName category price _id'
      })
      .populate({
        path: 'touristId',
        select: 'fullName email _id'
      })
      .populate({
        path: 'contactId',
        select: 'name email message phone createdAt' // Added phone
      })
      .lean();
    console.log(`Fetched ${bookings.length} bookings for tourist ${req.user.id}`);
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching tourist bookings:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch bookings' });
  }
});

// Get provider's bookings
router.get('/provider-bookings', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching bookings for provider:', { userId: req.user.id, role: req.user.role });
    if (req.user.role !== 'provider') {
      console.error('Access denied: Not a provider', { userId: req.user.id });
      return res.status(403).json({ error: 'Access denied: Only providers can view their bookings' });
    }
    const bookings = await Booking.find({ providerId: req.user.id })
      .populate({
        path: 'touristId',
        select: 'fullName email _id'
      })
      .populate({
        path: 'contactId',
        select: 'name email message phone createdAt' // Added phone
      })
      .lean();
    console.log(`Fetched ${bookings.length} bookings for provider ${req.user.id}`);
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching provider bookings:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch bookings' });
  }
});

// Get all bookings (admin)
router.get('/admin', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('Fetching all bookings for admin:', { userId: req.user.id });
    const bookings = await Booking.find()
      .populate({
        path: 'providerId',
        select: 'serviceName category price _id'
      })
      .populate({
        path: 'touristId',
        select: 'fullName email _id'
      })
      .populate({
        path: 'contactId',
        select: 'name email message phone createdAt' // Added phone
      })
      .lean();
    console.log(`Fetched ${bookings.length} bookings for admin`);
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching admin bookings:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch bookings' });
  }
});

// Approve booking (admin)
router.put('/admin/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('Approving booking:', { bookingId: req.params.id, adminId: req.user.id });
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      console.error('Booking not found:', req.params.id);
      return res.status(404).json({ error: 'Booking not found' });
    }
    booking.status = 'confirmed';
    await booking.save();
    const populatedBooking = await Booking.findById(booking._id)
      .populate('providerId touristId contactId')
      .lean();
    console.log('Booking approved:', { bookingId: booking._id });
    res.json({ message: 'Booking approved', booking: populatedBooking });
  } catch (err) {
    console.error('Error approving booking:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to approve booking' });
  }
});

// Delete booking (admin)
router.delete('/admin/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('Deleting booking:', { bookingId: req.params.id, adminId: req.user.id });
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      console.error('Booking not found:', req.params.id);
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.log('Booking deleted:', { bookingId: req.params.id });
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error('Error deleting booking:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to delete booking' });
  }
});

// Create booking (admin)
router.post('/admin', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('Admin creating booking:', { adminId: req.user.id, payload: req.body });
    const { providerId, touristId, productType, date, time, adults, children, totalPrice, status, specialNotes, contact } = req.body;
    if (!touristId || !date || !time || !adults || (!providerId && !productType)) {
      console.error('Missing required fields for admin booking');
      return res.status(400).json({ error: 'Tourist ID, date, time, adults, and either provider ID or product type are required' });
    }
    if (providerId && !mongoose.Types.ObjectId.isValid(providerId)) {
      console.error('Invalid providerId:', providerId);
      return res.status(400).json({ error: 'Invalid Provider ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(touristId)) {
      console.error('Invalid touristId:', touristId);
      return res.status(400).json({ error: 'Invalid Tourist ID' });
    }
    let contactId = null;
    if (contact && contact.name && contact.email && contact.message) {
      const contactDoc = new Contact({
        name: contact.name,
        email: contact.email,
        message: contact.message
      });
      await contactDoc.save();
      contactId = contactDoc._id;
    }
    const bookingData = {
      touristId,
      date,
      time,
      adults: parseInt(adults),
      children: parseInt(children || 0),
      status: status || 'pending',
      specialNotes,
      contactId
    };
    if (providerId) {
      const provider = await Provider.findById(providerId);
      if (!provider) {
        console.error('Provider not found:', providerId);
        return res.status(404).json({ error: 'Provider not found' });
      }
      bookingData.providerId = providerId;
      bookingData.totalPrice = totalPrice ? Number(totalPrice) * 300 : provider.price * 300 * (parseInt(adults) + 0.5 * parseInt(children || 0));
    } else if (productType) {
      bookingData.productType = productType;
      bookingData.totalPrice = Number(totalPrice) * 300; // Convert USD to LKR
    }
    const booking = await Booking.create(bookingData);
    const populatedBooking = await Booking.findById(booking._id)
      .populate('providerId touristId contactId')
      .lean();
    console.log('Admin booking created:', { bookingId: booking._id, providerId, productType, touristId, contactId });
    res.json({ message: 'Booking created', booking: populatedBooking });
  } catch (err) {
    console.error('Error creating admin booking:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to create booking' });
  }
});

export default router;