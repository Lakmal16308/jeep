import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: function() { return !this.productType; } }, // Optional if product
  touristId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tourist', required: true },
  productType: { type: String }, // For company products (e.g., 'Jeep Safari')
  date: { type: Date, required: true },
  time: { type: String, required: true },
  adults: { type: Number, required: true },
  children: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true }, // Stored in LKR
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  specialNotes: { type: String }, // For product bookings
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }, // Links to contact form
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Booking', bookingSchema);