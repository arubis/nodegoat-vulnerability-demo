const mongoose = require('mongoose');
const logger = require('./logger');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sample-app';

async function connectDB() {
  try {
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { connectDB, mongoose };