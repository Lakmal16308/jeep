import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  targetId: { 
    type: String, // Supports ObjectIds for services/tourists, strings for products
    required: true 
  },
  reviewerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Tourist', 
    required: true 
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  reviewType: { 
    type: String, 
    enum: ['service', 'product', 'tourist'], 
    required: true 
  },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Review', reviewSchema);