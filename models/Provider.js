import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema({
  serviceName: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  contact: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['Jeep Safari', 'Tuk Tuk Ride', 'Catamaran Boat Ride', 'Bullock Cart Ride', 'Village Lunch']
  },
  location: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, required: true },
  password: { type: String, required: true },
  approved: { type: Boolean, default: false },
  profilePicture: { type: String },
  photos: [{ type: String }]
}, {
  timestamps: true // Add createdAt/updatedAt for better tracking
});

// Handle duplicate email errors
providerSchema.post('save', function (error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('Email already exists'));
  } else {
    next(error);
  }
});

export default mongoose.model('Provider', providerSchema);