const express = require('express');
const { connectDB } = require('./database');
const logger = require('./logger');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/product');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

// Start server
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

startServer();