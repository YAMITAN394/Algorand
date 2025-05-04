require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { ApolloServer } = require('apollo-server-express');
const rateLimit = require('express-rate-limit');

// Import routes
const userRoutes = require('./routes/userRoutes');
const modelRoutes = require('./routes/modelRoutes');
const licenseRoutes = require('./routes/licenseRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Import GraphQL schema and resolvers
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');

// Import middleware
const { authenticateJWT } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import logger
const logger = require('./utils/logger');

// Create Express app
const app = express();

// Set up rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX || 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(limiter);

// Apply authentication middleware
app.use(authenticateJWT);

// Set up routes
app.use('/api/models', modelRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

// Set up Apollo Server
async function startApolloServer() {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Add user to context if authenticated
      return {
        user: req.user,
      };
    },
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({ app });
  logger.info(`GraphQL endpoint available at /graphql`);
}

// Connect to MongoDB
const startServer = async () => {
  try {
    // Start Express server without waiting for MongoDB
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
    
    // Start Apollo Server
    try {
      await startApolloServer();
      logger.info(`GraphQL endpoint available at /graphql`);
    } catch (err) {
      logger.error('Error starting Apollo Server:', err);
    }
    
    // Try to connect to MongoDB
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      logger.info('Connected to MongoDB');
    } catch (err) {
      logger.error('Error connecting to MongoDB:', err);
      logger.warn('Server running without MongoDB connection. Some features may not work.');
    }
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};

// Start the server
startServer();

// Apply error handler middleware (must be after routes)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});
