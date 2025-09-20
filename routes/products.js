import express from 'express';

const router = express.Router();

// Define company products with prices (in USD)
const companyProducts = [
  { name: 'Jeep Safari', price: 38, description: 'Explore the wilderness with an exciting jeep safari adventure.' },
  { name: 'Tuk Tuk Adventures', price: null, description: 'Experience the local culture with a thrilling tuk-tuk ride.' },
  { name: 'Catamaran Boat Ride', price: 9.8, description: 'Sail on a traditional catamaran for a serene experience.' },
  { name: 'Village Cooking Experience', price: 15, description: 'Learn to cook authentic local dishes with villagers.' },
  { name: 'Traditional Village Lunch', price: 15, description: 'Enjoy a delicious traditional meal in a village setting.' },
  { name: 'Sundowners Cocktail', price: null, description: 'Relax with a cocktail while watching the sunset.' },
  { name: 'High Tea', price: null, description: 'Indulge in a classic high tea experience.' },
  { name: 'Bullock Cart Ride', price: 9.9, description: 'Travel back in time with a traditional bullock cart ride.' },
  { name: 'Budget Village Tour', price: 19.9, description: 'Discover village life on a budget-friendly tour.' },
  { name: 'Village Tour', price: 19.9, description: 'Immerse yourself in the rich culture and traditions of a local village.' }
];

// Get all company products (public)
router.get('/', async (req, res) => {
  try {
    console.log('Fetching company products');
    res.json(companyProducts);
  } catch (err) {
    console.error('Error fetching company products:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: Failed to fetch products' });
  }
});

export default router;