const express = require('express');
const router = express.Router();
const User = require('../models/user');
const logger = require('../logger');

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (err) {
    logger.error(`Error fetching users: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    logger.error(`Error fetching user: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new user
router.post('/', async (req, res) => {
  try {
    // Bug: We're not checking if user already exists before creation
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    logger.error(`Error creating user: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'email', 'password', 'role'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ error: 'Invalid updates' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    updates.forEach(update => user[update] = req.body[update]);
    await user.save();
    res.json(user);
  } catch (err) {
    logger.error(`Error updating user: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    logger.error(`Error deleting user: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;