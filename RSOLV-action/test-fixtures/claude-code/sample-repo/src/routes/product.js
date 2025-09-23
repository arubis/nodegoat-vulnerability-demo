const express = require('express');
const router = express.Router();
const Product = require('../models/product');
const logger = require('../logger');

// Get all products
router.get('/', async (req, res) => {
  try {
    // Bug: Missing pagination can cause performance issues with large datasets
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    logger.error(`Error fetching products: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    logger.error(`Error fetching product: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    logger.error(`Error creating product: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'description', 'price', 'inStock', 'category'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ error: 'Invalid updates' });
  }

  try {
    // Bug: findByIdAndUpdate bypasses mongoose middleware and validation
    const product = await Product.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (err) {
    logger.error(`Error updating product: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted' });
  } catch (err) {
    logger.error(`Error deleting product: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get products by category
router.get('/category/:category', async (req, res) => {
  try {
    const products = await Product.find({ category: req.params.category });
    res.json(products);
  } catch (err) {
    logger.error(`Error fetching products by category: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;