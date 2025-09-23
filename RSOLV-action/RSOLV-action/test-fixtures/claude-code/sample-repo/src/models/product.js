const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  inStock: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    required: true
  },
  // Bug: The user reference is incorrectly set up
  createdBy: {
    type: String,
    ref: 'user',  // Should be 'User' (capital U)
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', productSchema);