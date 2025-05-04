const { AuthenticationError, ForbiddenError, UserInputError } = require('apollo-server-express');
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Model = require('../models/Model');
const License = require('../models/License');
const Payment = require('../models/Payment');

// Import services
const blockchainService = require('../services/blockchain/blockchainService');
const ipfsService = require('../services/ipfs/ipfsService');

// Custom JSON scalar type
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return ast.value;
    }
    return null;
  },
});

// Helper function to check authentication
const checkAuth = (context) => {
  const user = context.user;
  if (!user) {
    throw new AuthenticationError('Not authenticated');
  }
  return user;
};

// Helper function to check admin role
const checkAdmin = (context) => {
  const user = checkAuth(context);
  if (user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  return user;
};

// Helper function to generate tokens
const generateTokens = (user) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION }
  );

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { token, refreshToken };
};

// Resolvers
const resolvers = {
  // Custom scalar
  JSON: JSONScalar,

  // Query resolvers
  Query: {
    // User queries
    me: async (_, __, context) => {
      const user = checkAuth(context);
      return await User.findById(user.id);
    },
    
    user: async (_, { id }, context) => {
      checkAuth(context);
      return await User.findById(id);
    },
    
    users: async (_, { limit = 10, offset = 0 }, context) => {
      checkAdmin(context);
      return await User.find()
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
    },
    
    searchUsers: async (_, { query, limit = 10, offset = 0 }, context) => {
      checkAuth(context);
      return await User.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
    },

    // Model queries
    model: async (_, { id }, context) => {
      // Check if MongoDB is connected
      if (mongoose.connection.readyState !== 1) {
        console.warn('MongoDB not connected, returning mock data');
        
        // Return mock data
        return {
          id,
          name: 'Mock Model',
          description: 'This is a mock model returned when MongoDB is not available',
          tokenId: `token-${id}`,
          modelHash: `hash-${id}`,
          metadataURI: `ipfs://mock-metadata-${id}`,
          modelURI: `ipfs://mock-model-${id}`,
          owner: {
            id: 'mock-user-1',
            name: 'Mock User',
            email: 'mock@example.com',
            walletAddress: '0x1234567890abcdef',
            role: 'user',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          category: 'language',
          tags: ['mock', 'test'],
          framework: 'pytorch',
          version: '1.0.0',
          versionHistory: [],
          metrics: { accuracy: 0.95 },
          isPublic: true,
          status: 'active',
          views: 1000,
          downloads: 500,
          rating: { average: 4.5, count: 100 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      
      return await Model.findById(id);
    },
    
    models: async (_, { filter = {}, limit = 10, offset = 0, sortBy = 'createdAt', sortDirection = 'desc' }, context) => {
      // Check if MongoDB is connected
      if (mongoose.connection.readyState !== 1) {
        console.warn('MongoDB not connected, returning mock data');
        
        // Return mock data
        return [
          {
            id: 'mock-model-1',
            name: 'Mock GPT Model',
            description: 'A mock language model for testing',
            tokenId: 'token-1',
            modelHash: 'hash-1',
            metadataURI: 'ipfs://mock-metadata-1',
            modelURI: 'ipfs://mock-model-1',
            owner: {
              id: 'mock-user-1',
              name: 'Mock User',
              email: 'mock@example.com',
              walletAddress: '0x1234567890abcdef',
              role: 'user',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            category: 'language',
            tags: ['nlp', 'gpt', 'transformer'],
            framework: 'pytorch',
            version: '1.0.0',
            versionHistory: [],
            metrics: { accuracy: 0.95 },
            isPublic: true,
            status: 'active',
            views: 1000,
            downloads: 500,
            rating: { average: 4.5, count: 100 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'mock-model-2',
            name: 'Mock Image Model',
            description: 'A mock image generation model for testing',
            tokenId: 'token-2',
            modelHash: 'hash-2',
            metadataURI: 'ipfs://mock-metadata-2',
            modelURI: 'ipfs://mock-model-2',
            owner: {
              id: 'mock-user-2',
              name: 'Another User',
              email: 'another@example.com',
              walletAddress: '0xabcdef1234567890',
              role: 'user',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            category: 'image',
            tags: ['diffusion', 'gan', 'image-generation'],
            framework: 'tensorflow',
            version: '2.0.0',
            versionHistory: [],
            metrics: { fid: 20.5 },
            isPublic: true,
            status: 'active',
            views: 2000,
            downloads: 1000,
            rating: { average: 4.8, count: 200 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      
      const query = {};
      
      if (filter.category) query.category = filter.category;
      if (filter.framework) query.framework = filter.framework;
      if (filter.tags) query.tags = { $in: filter.tags };
      if (filter.owner) query.owner = filter.owner;
      if (filter.isPublic !== undefined) query.isPublic = filter.isPublic;
      if (filter.status) query.status = filter.status;
      if (filter.search) {
        query.$or = [
          { name: { $regex: filter.search, $options: 'i' } },
          { description: { $regex: filter.search, $options: 'i' } },
          { tags: { $regex: filter.search, $options: 'i' } },
        ];
      }
      
      const sortOrder = sortDirection === 'desc' ? -1 : 1;
      const sortOptions = { [sortBy]: sortOrder };
      
      return await Model.find(query)
        .sort(sortOptions)
        .skip(offset)
        .limit(limit);
    },
    
    modelByTokenId: async (_, { tokenId }, context) => {
      return await Model.findOne({ tokenId });
    },
    
    modelByHash: async (_, { modelHash }, context) => {
      return await Model.findOne({ modelHash });
    },
    
    searchModels: async (_, { query, limit = 10, offset = 0 }, context) => {
      return await Model.find({
        $text: { $search: query },
        isPublic: true,
        status: 'active',
      })
        .sort({ score: { $meta: 'textScore' } })
        .skip(offset)
        .limit(limit);
    },
    
    featuredModels: async (_, { limit = 5 }, context) => {
      return await Model.find({ isPublic: true, status: 'active' })
        .sort({ rating: -1, downloads: -1 })
        .limit(limit);
    },
    
    trendingModels: async (_, { limit = 5 }, context) => {
      return await Model.find({ isPublic: true, status: 'active' })
        .sort({ downloads: -1, views: -1 })
        .limit(limit);
    },
    
    recentModels: async (_, { limit = 5 }, context) => {
      return await Model.find({ isPublic: true, status: 'active' })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    // License queries
    license: async (_, { id }, context) => {
      const user = checkAuth(context);
      const license = await License.findById(id);
      
      // Check if user is authorized to view this license
      if (!license) {
        return null;
      }
      
      const model = await Model.findById(license.model);
      if (
        user.role !== 'admin' &&
        license.licensee.toString() !== user.id &&
        license.issuer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to view this license');
      }
      
      return license;
    },
    
    licenses: async (_, { filter = {}, limit = 10, offset = 0, sortBy = 'createdAt', sortDirection = 'desc' }, context) => {
      const user = checkAuth(context);
      const query = {};
      
      // Apply filters
      if (filter.modelId) query.model = filter.modelId;
      if (filter.licenseeId) query.licensee = filter.licenseeId;
      if (filter.issuerId) query.issuer = filter.issuerId;
      if (filter.licenseType) query.licenseType = filter.licenseType;
      if (filter.accessLevel) query.accessLevel = filter.accessLevel;
      if (filter.isActive !== undefined) query.isActive = filter.isActive;
      if (filter.expiresAfter) query.expiresAt = { $gte: new Date(filter.expiresAfter) };
      if (filter.expiresBefore) {
        query.expiresAt = { ...query.expiresAt, $lte: new Date(filter.expiresBefore) };
      }
      
      // Non-admin users can only see their own licenses or licenses for models they own
      if (user.role !== 'admin') {
        const ownedModels = await Model.find({ owner: user.id }).select('_id');
        const ownedModelIds = ownedModels.map(model => model._id);
        
        query.$or = [
          { licensee: user.id },
          { issuer: user.id },
          { model: { $in: ownedModelIds } },
        ];
      }
      
      const sortOrder = sortDirection === 'desc' ? -1 : 1;
      const sortOptions = { [sortBy]: sortOrder };
      
      return await License.find(query)
        .sort(sortOptions)
        .skip(offset)
        .limit(limit);
    },
    
    licenseByLicenseId: async (_, { licenseId }, context) => {
      const user = checkAuth(context);
      const license = await License.findOne({ licenseId });
      
      if (!license) {
        return null;
      }
      
      // Check if user is authorized to view this license
      const model = await Model.findById(license.model);
      if (
        user.role !== 'admin' &&
        license.licensee.toString() !== user.id &&
        license.issuer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to view this license');
      }
      
      return license;
    },
    
    validateLicense: async (_, { licenseId, accessLevel }, context) => {
      const user = checkAuth(context);
      
      const license = await License.findOne({ licenseId });
      if (!license) {
        return false;
      }
      
      // Check if license is valid
      if (!license.isValid()) {
        return false;
      }
      
      // Check if user is the licensee
      if (license.licensee.toString() !== user.id) {
        return false;
      }
      
      // Check access level
      const accessLevels = ['ReadOnly', 'InferenceOnly', 'FineTuning', 'FullAccess'];
      const requiredAccessIndex = accessLevels.indexOf(accessLevel);
      const licenseAccessIndex = accessLevels.indexOf(license.accessLevel);
      
      if (requiredAccessIndex > licenseAccessIndex) {
        return false;
      }
      
      return true;
    },

    // Payment queries
    payment: async (_, { id }, context) => {
      const user = checkAuth(context);
      const payment = await Payment.findById(id);
      
      if (!payment) {
        return null;
      }
      
      // Check if user is authorized to view this payment
      const model = await Model.findById(payment.model);
      if (
        user.role !== 'admin' &&
        payment.payer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to view this payment');
      }
      
      return payment;
    },
    
    payments: async (_, { filter = {}, limit = 10, offset = 0, sortBy = 'createdAt', sortDirection = 'desc' }, context) => {
      const user = checkAuth(context);
      const query = {};
      
      // Apply filters
      if (filter.modelId) query.model = filter.modelId;
      if (filter.licenseId) query.license = filter.licenseId;
      if (filter.payerId) query.payer = filter.payerId;
      if (filter.status) query.status = filter.status;
      if (filter.paymentType) query.paymentType = filter.paymentType;
      if (filter.currency) query.currency = filter.currency;
      if (filter.startDate) query.createdAt = { $gte: new Date(filter.startDate) };
      if (filter.endDate) {
        query.createdAt = { ...query.createdAt, $lte: new Date(filter.endDate) };
      }
      
      // Non-admin users can only see their own payments or payments for models they own
      if (user.role !== 'admin') {
        const ownedModels = await Model.find({ owner: user.id }).select('_id');
        const ownedModelIds = ownedModels.map(model => model._id);
        
        query.$or = [
          { payer: user.id },
          { model: { $in: ownedModelIds } },
        ];
      }
      
      const sortOrder = sortDirection === 'desc' ? -1 : 1;
      const sortOptions = { [sortBy]: sortOrder };
      
      return await Payment.find(query)
        .sort(sortOptions)
        .skip(offset)
        .limit(limit);
    },
    
    paymentByTransactionHash: async (_, { transactionHash }, context) => {
      const user = checkAuth(context);
      const payment = await Payment.findOne({ transactionHash });
      
      if (!payment) {
        return null;
      }
      
      // Check if user is authorized to view this payment
      const model = await Model.findById(payment.model);
      if (
        user.role !== 'admin' &&
        payment.payer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to view this payment');
      }
      
      return payment;
    },
    
    modelRevenue: async (_, { modelId, startDate, endDate }, context) => {
      const user = checkAuth(context);
      
      // Check if user is authorized to view this model's revenue
      const model = await Model.findById(modelId);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      if (user.role !== 'admin' && model.owner.toString() !== user.id) {
        throw new ForbiddenError('Not authorized to view this model\'s revenue');
      }
      
      // Get revenue data
      const query = {
        model: mongoose.Types.ObjectId(modelId),
        status: 'completed',
      };
      
      if (startDate) {
        query.createdAt = { $gte: new Date(startDate) };
      }
      
      if (endDate) {
        query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
      }
      
      const revenueByDay = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              currency: '$currency',
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]);
      
      const revenueByType = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              paymentType: '$paymentType',
              currency: '$currency',
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      
      const totalRevenue = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$currency',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      
      return {
        modelId,
        totalRevenue,
        revenueByDay,
        revenueByType,
        startDate,
        endDate,
      };
    },
    
    userRevenue: async (_, { userId, startDate, endDate }, context) => {
      const user = checkAuth(context);
      
      // Check if user is authorized to view this user's revenue
      if (user.role !== 'admin' && user.id !== userId) {
        throw new ForbiddenError('Not authorized to view this user\'s revenue');
      }
      
      // Get models owned by the user
      const ownedModels = await Model.find({ owner: userId }).select('_id');
      const ownedModelIds = ownedModels.map(model => model._id);
      
      // Get revenue data
      const query = {
        model: { $in: ownedModelIds },
        status: 'completed',
      };
      
      if (startDate) {
        query.createdAt = { $gte: new Date(startDate) };
      }
      
      if (endDate) {
        query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
      }
      
      const revenueByDay = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              currency: '$currency',
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]);
      
      const revenueByModel = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              model: '$model',
              currency: '$currency',
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      
      const totalRevenue = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$currency',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      
      return {
        userId,
        totalRevenue,
        revenueByDay,
        revenueByModel,
        startDate,
        endDate,
      };
    },
  },

  // Mutation resolvers
  Mutation: {
    // Auth mutations
    register: async (_, { input }) => {
      const { name, email, password, walletAddress } = input;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new UserInputError('User with this email already exists');
      }
      
      // Check if wallet address is already in use
      if (walletAddress) {
        const existingWallet = await User.findOne({ walletAddress });
        if (existingWallet) {
          throw new UserInputError('Wallet address already in use');
        }
      }
      
      // Create new user
      const user = new User({
        name,
        email,
        password,
        walletAddress,
        role: 'user',
      });
      
      await user.save();
      
      // Generate tokens
      const { token, refreshToken } = generateTokens(user);
      
      return {
        token,
        refreshToken,
        user,
      };
    },
    
    login: async (_, { email, password }) => {
      // Find user by email
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        throw new UserInputError('Invalid email or password');
      }
      
      // Check password
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        throw new UserInputError('Invalid email or password');
      }
      
      // Generate tokens
      const { token, refreshToken } = generateTokens(user);
      
      return {
        token,
        refreshToken,
        user,
      };
    },
    
    refreshToken: async (_, { token }) => {
      try {
        // Verify refresh token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user
        const user = await User.findById(decoded.id);
        if (!user) {
          throw new AuthenticationError('Invalid token');
        }
        
        // Generate new tokens
        const { token: newToken, refreshToken } = generateTokens(user);
        
        return {
          token: newToken,
          refreshToken,
          user,
        };
      } catch (error) {
        throw new AuthenticationError('Invalid or expired token');
      }
    },
    
    forgotPassword: async (_, { email }) => {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        // Return true even if user doesn't exist for security reasons
        return true;
      }
      
      // Generate reset token
      const resetToken = user.getResetPasswordToken();
      await user.save({ validateBeforeSave: false });
      
      // TODO: Send email with reset token
      
      return true;
    },
    
    resetPassword: async (_, { token, password }) => {
      // Hash token
      const resetPasswordToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      
      // Find user by token
      const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
      });
      
      if (!user) {
        throw new UserInputError('Invalid or expired token');
      }
      
      // Set new password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      
      await user.save();
      
      return true;
    },
    
    changePassword: async (_, { currentPassword, newPassword }, context) => {
      const user = checkAuth(context);
      
      // Get user with password
      const userWithPassword = await User.findById(user.id).select('+password');
      
      // Check current password
      const isMatch = await userWithPassword.matchPassword(currentPassword);
      if (!isMatch) {
        throw new UserInputError('Current password is incorrect');
      }
      
      // Set new password
      userWithPassword.password = newPassword;
      await userWithPassword.save();
      
      return true;
    },

    // User mutations
    updateUser: async (_, { input }, context) => {
      const user = checkAuth(context);
      
      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        user.id,
        { $set: input },
        { new: true, runValidators: true }
      );
      
      return updatedUser;
    },
    
    deleteUser: async (_, __, context) => {
      const user = checkAuth(context);
      
      // Delete user
      await User.findByIdAndDelete(user.id);
      
      return true;
    },
    
    connectWallet: async (_, { walletAddress }, context) => {
      const user = checkAuth(context);
      
      // Check if wallet address is already in use
      const existingWallet = await User.findOne({ walletAddress });
      if (existingWallet && existingWallet.id !== user.id) {
        throw new UserInputError('Wallet address already in use');
      }
      
      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        user.id,
        { $set: { walletAddress } },
        { new: true, runValidators: true }
      );
      
      return updatedUser;
    },

    // Model mutations
    createModel: async (_, { input }, context) => {
      const user = checkAuth(context);
      
      // Create model
      const model = new Model({
        ...input,
        owner: user.id,
      });
      
      await model.save();
      
      return model;
    },
    
    updateModel: async (_, { id, input }, context) => {
      const user = checkAuth(context);
      
      // Find model
      const model = await Model.findById(id);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to update this model
      if (user.role !== 'admin' && model.owner.toString() !== user.id) {
        throw new ForbiddenError('Not authorized to update this model');
      }
      
      // Update model
      const updatedModel = await Model.findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      );
      
      return updatedModel;
    },
    
    deleteModel: async (_, { id }, context) => {
      const user = checkAuth(context);
      
      // Find model
      const model = await Model.findById(id);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to delete this model
      if (user.role !== 'admin' && model.owner.toString() !== user.id) {
        throw new ForbiddenError('Not authorized to delete this model');
      }
      
      // Delete model
      await Model.findByIdAndDelete(id);
      
      return true;
    },
    
    transferModelOwnership: async (_, { id, newOwnerId }, context) => {
      const user = checkAuth(context);
      
      // Find model
      const model = await Model.findById(id);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to transfer ownership
      if (user.role !== 'admin' && model.owner.toString() !== user.id) {
        throw new ForbiddenError('Not authorized to transfer ownership of this model');
      }
      
      // Find new owner
      const newOwner = await User.findById(newOwnerId);
      if (!newOwner) {
        throw new UserInputError('New owner not found');
      }
      
      // Update model
      const updatedModel = await Model.findByIdAndUpdate(
        id,
        { $set: { owner: newOwnerId } },
        { new: true, runValidators: true }
      );
      
      return updatedModel;
    },
    
    rateModel: async (_, { id, rating }, context) => {
      const user = checkAuth(context);
      
      // Validate rating
      if (rating < 1 || rating > 5) {
        throw new UserInputError('Rating must be between 1 and 5');
      }
      
      // Find model
      const model = await Model.findById(id);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Update rating
      const newAverage = (model.rating.average * model.rating.count + rating) / (model.rating.count + 1);
      const updatedModel = await Model.findByIdAndUpdate(
        id,
        {
          $set: {
            'rating.average': newAverage,
            'rating.count': model.rating.count + 1,
          },
        },
        { new: true, runValidators: true }
      );
      
      return updatedModel;
    },
    
    incrementModelViews: async (_, { id }) => {
      // Find and update model
      const updatedModel = await Model.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true, runValidators: true }
      );
      
      if (!updatedModel) {
        throw new UserInputError('Model not found');
      }
      
      return updatedModel;
    },
    
    incrementModelDownloads: async (_, { id }) => {
      // Find and update model
      const updatedModel = await Model.findByIdAndUpdate(
        id,
        { $inc: { downloads: 1 } },
        { new: true, runValidators: true }
      );
      
      if (!updatedModel) {
        throw new UserInputError('Model not found');
      }
      
      return updatedModel;
    },

    // License mutations
    issueLicense: async (_, { input }, context) => {
      const user = checkAuth(context);
      
      const { modelId, licenseeId, licenseType, accessLevel, expiresAt } = input;
      
      // Find model
      const model = await Model.findById(modelId);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to issue license
      if (user.role !== 'admin' && model.owner.toString() !== user.id) {
        throw new ForbiddenError('Not authorized to issue license for this model');
      }
      
      // Find licensee
      const licensee = await User.findById(licenseeId);
      if (!licensee) {
        throw new UserInputError('Licensee not found');
      }
      
      // Generate license ID
      const licenseId = `LIC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create license
      const license = new License({
        licenseId,
        model: modelId,
        licensee: licenseeId,
        issuer: user.id,
        licenseType,
        accessLevel,
        issuedAt: new Date(),
        expiresAt: new Date(expiresAt),
        isActive: true,
        usageLimit: input.usageLimit || 0,
        usageCount: 0,
        price: input.price || 0,
        currency: input.currency || 'ETH',
        termsAndConditions: input.termsAndConditions,
        customTerms: input.customTerms,
      });
      
      await license.save();
      
      return license;
    },
    
    updateLicense: async (_, { id, input }, context) => {
      const user = checkAuth(context);
      
      // Find license
      const license = await License.findById(id);
      if (!license) {
        throw new UserInputError('License not found');
      }
      
      // Find model
      const model = await Model.findById(license.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to update license
      if (
        user.role !== 'admin' &&
        license.issuer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to update this license');
      }
      
      // Update license
      const updatedLicense = await License.findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      );
      
      return updatedLicense;
    },
    
    revokeLicense: async (_, { id, reason }, context) => {
      const user = checkAuth(context);
      
      // Find license
      const license = await License.findById(id);
      if (!license) {
        throw new UserInputError('License not found');
      }
      
      // Find model
      const model = await Model.findById(license.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to revoke license
      if (
        user.role !== 'admin' &&
        license.issuer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to revoke this license');
      }
      
      // Revoke license
      await license.revoke(reason);
      
      return license;
    },
    
    renewLicense: async (_, { id, duration }, context) => {
      const user = checkAuth(context);
      
      // Find license
      const license = await License.findById(id);
      if (!license) {
        throw new UserInputError('License not found');
      }
      
      // Find model
      const model = await Model.findById(license.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to renew license
      if (
        user.role !== 'admin' &&
        license.licensee.toString() !== user.id &&
        license.issuer.toString() !== user.id &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to renew this license');
      }
      
      // Renew license
      await license.renew(duration);
      
      return license;
    },
    
    recordLicenseUsage: async (_, { id, operation, details }, context) => {
      const user = checkAuth(context);
      
      // Find license
      const license = await License.findById(id);
      if (!license) {
        throw new UserInputError('License not found');
      }
      
      // Check if user is authorized to record usage
      if (
        user.role !== 'admin' &&
        license.licensee.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to record usage for this license');
      }
      
      // Check if license is valid
      if (!license.isValid()) {
        throw new UserInputError('License is not valid');
      }
      
      // Record usage
      await license.recordUsage(operation, details);
      
      return license;
    },

    // Payment mutations
    createPayment: async (_, { input }, context) => {
      const user = checkAuth(context);
      
      const { modelId, licenseId, amount, currency, paymentType, tokenAddress, transactionHash } = input;
      
      // Find model
      const model = await Model.findById(modelId);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Find license if provided
      let license = null;
      if (licenseId) {
        license = await License.findById(licenseId);
        if (!license) {
          throw new UserInputError('License not found');
        }
      }
      
      // Create payment
      const payment = new Payment({
        transactionHash,
        model: modelId,
        license: licenseId,
        payer: user.id,
        amount,
        currency,
        status: 'pending',
        paymentType,
        tokenAddress,
        metadata: input.metadata || {},
      });
      
      await payment.save();
      
      // Update license if provided
      if (license) {
        license.paymentTransactionHash = transactionHash;
        await license.save();
      }
      
      return payment;
    },
    
    updatePaymentStatus: async (_, { id, status }, context) => {
      const user = checkAuth(context);
      
      // Find payment
      const payment = await Payment.findById(id);
      if (!payment) {
        throw new UserInputError('Payment not found');
      }
      
      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to update payment status
      if (
        user.role !== 'admin' &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to update this payment status');
      }
      
      // Update payment status
      const updatedPayment = await Payment.findByIdAndUpdate(
        id,
        { $set: { status } },
        { new: true, runValidators: true }
      );
      
      return updatedPayment;
    },
    
    refundPayment: async (_, { id, reason }, context) => {
      const user = checkAuth(context);
      
      // Find payment
      const payment = await Payment.findById(id);
      if (!payment) {
        throw new UserInputError('Payment not found');
      }
      
      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to refund payment
      if (
        user.role !== 'admin' &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to refund this payment');
      }
      
      // Refund payment
      await payment.refund(reason);
      
      return payment;
    },
    
    distributePayment: async (_, { id }, context) => {
      const user = checkAuth(context);
      
      // Find payment
      const payment = await Payment.findById(id);
      if (!payment) {
        throw new UserInputError('Payment not found');
      }
      
      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to distribute payment
      if (
        user.role !== 'admin' &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to distribute this payment');
      }
      
      // Check if payment is already processed
      if (payment.status !== 'completed') {
        throw new UserInputError('Payment must be completed before distribution');
      }
      
      // TODO: Implement payment distribution logic
      // This would typically involve blockchain transactions
      
      // For now, just mark the payment as processed
      payment.isProcessed = true;
      await payment.save();
      
      return payment.distributions || [];
    },
    
    setPaymentSplit: async (_, { modelId, recipients, shares }, context) => {
      const user = checkAuth(context);
      
      // Find model
      const model = await Model.findById(modelId);
      if (!model) {
        throw new UserInputError('Model not found');
      }
      
      // Check if user is authorized to set payment split
      if (
        user.role !== 'admin' &&
        model.owner.toString() !== user.id
      ) {
        throw new ForbiddenError('Not authorized to set payment split for this model');
      }
      
      // Validate recipients and shares
      if (recipients.length !== shares.length) {
        throw new UserInputError('Recipients and shares arrays must have the same length');
      }
      
      // Check if all recipients exist
      for (const recipientId of recipients) {
        const recipient = await User.findById(recipientId);
        if (!recipient) {
          throw new UserInputError(`Recipient with ID ${recipientId} not found`);
        }
      }
      
      // Check if shares sum to 100
      const totalShares = shares.reduce((sum, share) => sum + share, 0);
      if (totalShares !== 100) {
        throw new UserInputError('Shares must sum to 100');
      }
      
      // TODO: Implement blockchain payment split
      // This would typically involve a blockchain transaction
      
      return true;
    },
  },

  // Type resolvers
  User: {
    models: async (parent, _, context) => {
      return await Model.find({ owner: parent.id });
    },
    
    licenses: async (parent, _, context) => {
      return await License.find({ licensee: parent.id });
    },
  },
  
  Model: {
    owner: async (parent, _, context) => {
      return await User.findById(parent.owner);
    },
    
    licenses: async (parent, _, context) => {
      return await License.find({ model: parent.id });
    },
    
    payments: async (parent, _, context) => {
      return await Payment.find({ model: parent.id });
    },
  },
  
  License: {
    model: async (parent, _, context) => {
      return await Model.findById(parent.model);
    },
    
    licensee: async (parent, _, context) => {
      return await User.findById(parent.licensee);
    },
    
    issuer: async (parent, _, context) => {
      return await User.findById(parent.issuer);
    },
    
    payments: async (parent, _, context) => {
      return await Payment.find({ license: parent.id });
    },
  },
  
  Payment: {
    model: async (parent, _, context) => {
      return await Model.findById(parent.model);
    },
    
    license: async (parent, _, context) => {
      if (!parent.license) {
        return null;
      }
      return await License.findById(parent.license);
    },
    
    payer: async (parent, _, context) => {
      return await User.findById(parent.payer);
    },
    
    distributions: async (parent, _, context) => {
      if (!parent.distributions || parent.distributions.length === 0) {
        return [];
      }
      
      // Populate recipient information for each distribution
      const populatedDistributions = [];
      
      for (const distribution of parent.distributions) {
        const recipient = await User.findById(distribution.recipient);
        
        populatedDistributions.push({
          ...distribution.toObject(),
          recipient,
        });
      }
      
      return populatedDistributions;
    },
  },
  
  Distribution: {
    recipient: async (parent, _, context) => {
      return await User.findById(parent.recipient);
    },
  },

  // Subscription resolvers
  Subscription: {
    modelCreated: {
      subscribe: (_, __, { pubsub }) => pubsub.asyncIterator(['MODEL_CREATED']),
    },
    
    licenseIssued: {
      subscribe: (_, { modelId }, { pubsub }) => {
        if (modelId) {
          return pubsub.asyncIterator([`LICENSE_ISSUED_${modelId}`]);
        }
        return pubsub.asyncIterator(['LICENSE_ISSUED']);
      },
    },
    
    paymentReceived: {
      subscribe: (_, { modelId }, { pubsub }) => {
        if (modelId) {
          return pubsub.asyncIterator([`PAYMENT_RECEIVED_${modelId}`]);
        }
        return pubsub.asyncIterator(['PAYMENT_RECEIVED']);
      },
    },
  },
};

module.exports = resolvers;
