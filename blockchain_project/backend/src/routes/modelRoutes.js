const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Import models
const Model = require('../models/Model');
const User = require('../models/User');

// Import middleware
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Import services
const blockchainService = require('../services/blockchain/blockchainService');
const ipfsService = require('../services/ipfs/ipfsService');

// Import utils
const logger = require('../utils/logger');

/**
 * @route   POST /api/models
 * @desc    Register a new AI model
 * @access  Private
 */
router.post(
  '/',
  [
    requireAuth,
    check('name', 'Name is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('tokenId', 'Token ID is required').not().isEmpty(),
    check('modelHash', 'Model hash is required').not().isEmpty(),
    check('metadataURI', 'Metadata URI is required').not().isEmpty(),
    check('modelURI', 'Model URI is required').not().isEmpty(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        name,
        description,
        tokenId,
        modelHash,
        metadataURI,
        modelURI,
        category,
        tags,
        framework,
        version,
        metrics,
        isPublic,
      } = req.body;

      // Check if model with this token ID already exists
      const existingModelByToken = await Model.findOne({ tokenId });
      if (existingModelByToken) {
        return res.status(400).json({ message: 'Model with this token ID already exists' });
      }

      // Check if model with this hash already exists
      const existingModelByHash = await Model.findOne({ modelHash });
      if (existingModelByHash) {
        return res.status(400).json({ message: 'Model with this hash already exists' });
      }

      // Create new model
      const model = new Model({
        name,
        description,
        tokenId,
        modelHash,
        metadataURI,
        modelURI,
        owner: req.user.id,
        category: category || 'other',
        tags: tags || [],
        framework: framework || 'other',
        version: version || '1.0.0',
        metrics: metrics || {},
        isPublic: isPublic !== undefined ? isPublic : true,
      });

      // Save model to database
      await model.save();

      res.status(201).json({
        success: true,
        model,
      });
    } catch (err) {
      logger.error('Error registering model:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/models
 * @desc    Get all models with filtering
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const {
      category,
      framework,
      tags,
      owner,
      isPublic,
      status,
      search,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      limit = 10,
      offset = 0,
    } = req.query;

    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      logger.warn('MongoDB not connected, returning mock data');
      
      // Return mock data
      const mockModels = [
        {
          _id: 'mock-model-1',
          name: 'Mock GPT Model',
          description: 'A mock language model for testing',
          tokenId: 'token-1',
          modelHash: 'hash-1',
          metadataURI: 'ipfs://mock-metadata-1',
          modelURI: 'ipfs://mock-model-1',
          owner: {
            _id: 'mock-user-1',
            name: 'Mock User',
            email: 'mock@example.com',
            walletAddress: '0x1234567890abcdef',
          },
          category: 'language',
          tags: ['nlp', 'gpt', 'transformer'],
          framework: 'pytorch',
          version: '1.0.0',
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
          _id: 'mock-model-2',
          name: 'Mock Image Model',
          description: 'A mock image generation model for testing',
          tokenId: 'token-2',
          modelHash: 'hash-2',
          metadataURI: 'ipfs://mock-metadata-2',
          modelURI: 'ipfs://mock-model-2',
          owner: {
            _id: 'mock-user-2',
            name: 'Another User',
            email: 'another@example.com',
            walletAddress: '0xabcdef1234567890',
          },
          category: 'image',
          tags: ['diffusion', 'gan', 'image-generation'],
          framework: 'tensorflow',
          version: '2.0.0',
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
      
      return res.json({
        success: true,
        count: mockModels.length,
        total: mockModels.length,
        models: mockModels,
        mock: true,
      });
    }

    // Build query
    const query = {};

    if (category) query.category = category;
    if (framework) query.framework = framework;
    if (tags) {
      const tagArray = tags.split(',');
      query.tags = { $in: tagArray };
    }
    if (owner) query.owner = owner;
    if (isPublic !== undefined) query.isPublic = isPublic === 'true';
    if (status) query.status = status;

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // If not admin or owner, only show public and active models
    if (!req.user || req.user.role !== 'admin') {
      if (!owner || owner !== req.user?.id) {
        query.isPublic = true;
        query.status = 'active';
      }
    }

    // Set up sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const models = await Model.find(query)
      .sort(sortOptions)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('owner', 'name email walletAddress');

    // Get total count for pagination
    const total = await Model.countDocuments(query);

    res.json({
      success: true,
      count: models.length,
      total,
      models,
    });
  } catch (err) {
    logger.error('Error getting models:', err);
    
    // Return mock data in case of error
    const mockModels = [
      {
        _id: 'mock-model-1',
        name: 'Mock GPT Model (Error Fallback)',
        description: 'A mock language model for testing',
        tokenId: 'token-1',
        modelHash: 'hash-1',
        metadataURI: 'ipfs://mock-metadata-1',
        modelURI: 'ipfs://mock-model-1',
        owner: {
          _id: 'mock-user-1',
          name: 'Mock User',
          email: 'mock@example.com',
          walletAddress: '0x1234567890abcdef',
        },
        category: 'language',
        tags: ['nlp', 'gpt', 'transformer'],
        framework: 'pytorch',
        version: '1.0.0',
        metrics: { accuracy: 0.95 },
        isPublic: true,
        status: 'active',
        views: 1000,
        downloads: 500,
        rating: { average: 4.5, count: 100 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ];
    
    return res.json({
      success: true,
      count: mockModels.length,
      total: mockModels.length,
      models: mockModels,
      mock: true,
      error: err.message,
    });
  }
});

/**
 * @route   GET /api/models/:id
 * @desc    Get model by ID
 * @access  Public/Private (depends on model visibility)
 */
router.get('/:id', async (req, res) => {
  try {
    const model = await Model.findById(req.params.id).populate('owner', 'name email walletAddress');

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if model is public or user is owner/admin
    if (!model.isPublic && (!req.user || (req.user.role !== 'admin' && model.owner.id !== req.user.id))) {
      return res.status(403).json({ message: 'Not authorized to view this model' });
    }

    // Increment views
    model.views += 1;
    await model.save();

    res.json({
      success: true,
      model,
    });
  } catch (err) {
    logger.error('Error getting model by ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/models/:id
 * @desc    Update model
 * @access  Private
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const model = await Model.findById(req.params.id);

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is owner or admin
    if (model.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this model' });
    }

    const {
      name,
      description,
      modelHash,
      metadataURI,
      modelURI,
      category,
      tags,
      framework,
      version,
      metrics,
      isPublic,
      status,
    } = req.body;

    // Build model object
    const modelFields = {};
    if (name) modelFields.name = name;
    if (description) modelFields.description = description;
    if (modelHash) {
      // Check if model hash already exists
      const existingModelByHash = await Model.findOne({ modelHash });
      if (existingModelByHash && existingModelByHash.id !== req.params.id) {
        return res.status(400).json({ message: 'Model with this hash already exists' });
      }
      modelFields.modelHash = modelHash;
    }
    if (metadataURI) modelFields.metadataURI = metadataURI;
    if (modelURI) modelFields.modelURI = modelURI;
    if (category) modelFields.category = category;
    if (tags) modelFields.tags = tags;
    if (framework) modelFields.framework = framework;
    if (version) modelFields.version = version;
    if (metrics) modelFields.metrics = metrics;
    if (isPublic !== undefined) modelFields.isPublic = isPublic;
    if (status) modelFields.status = status;

    // Update model
    const updatedModel = await Model.findByIdAndUpdate(
      req.params.id,
      { $set: modelFields },
      { new: true, runValidators: true }
    ).populate('owner', 'name email walletAddress');

    res.json({
      success: true,
      model: updatedModel,
    });
  } catch (err) {
    logger.error('Error updating model:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/models/:id
 * @desc    Delete model
 * @access  Private
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const model = await Model.findById(req.params.id);

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is owner or admin
    if (model.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this model' });
    }

    // Delete model
    await model.remove();

    res.json({
      success: true,
      message: 'Model deleted',
    });
  } catch (err) {
    logger.error('Error deleting model:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/models/:id/transfer
 * @desc    Transfer model ownership
 * @access  Private
 */
router.put(
  '/:id/transfer',
  [requireAuth, check('newOwnerId', 'New owner ID is required').not().isEmpty()],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const model = await Model.findById(req.params.id);

      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is owner or admin
      if (model.owner.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized to transfer ownership of this model' });
      }

      const { newOwnerId } = req.body;

      // Check if new owner exists
      const newOwner = await User.findById(newOwnerId);
      if (!newOwner) {
        return res.status(404).json({ message: 'New owner not found' });
      }

      // Update model owner
      model.owner = newOwnerId;
      await model.save();

      // Populate owner details
      await model.populate('owner', 'name email walletAddress');

      res.json({
        success: true,
        model,
      });
    } catch (err) {
      logger.error('Error transferring model ownership:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/models/:id/rate
 * @desc    Rate a model
 * @access  Private
 */
router.put(
  '/:id/rate',
  [requireAuth, check('rating', 'Rating must be between 1 and 5').isInt({ min: 1, max: 5 })],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const model = await Model.findById(req.params.id);

      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      const { rating } = req.body;

      // Calculate new average rating
      const newAverage = (model.rating.average * model.rating.count + rating) / (model.rating.count + 1);
      
      // Update model rating
      model.rating.average = newAverage;
      model.rating.count += 1;
      
      await model.save();

      res.json({
        success: true,
        rating: model.rating,
      });
    } catch (err) {
      logger.error('Error rating model:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/models/:id/download
 * @desc    Increment model downloads
 * @access  Public
 */
router.put('/:id/download', async (req, res) => {
  try {
    const model = await Model.findById(req.params.id);

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if model is public or user is owner/admin
    if (!model.isPublic && (!req.user || (req.user.role !== 'admin' && model.owner.toString() !== req.user.id))) {
      return res.status(403).json({ message: 'Not authorized to download this model' });
    }

    // Increment downloads
    model.downloads += 1;
    await model.save();

    res.json({
      success: true,
      downloads: model.downloads,
    });
  } catch (err) {
    logger.error('Error incrementing model downloads:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/models/token/:tokenId
 * @desc    Get model by token ID
 * @access  Public/Private (depends on model visibility)
 */
router.get('/token/:tokenId', async (req, res) => {
  try {
    const model = await Model.findOne({ tokenId: req.params.tokenId }).populate('owner', 'name email walletAddress');

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if model is public or user is owner/admin
    if (!model.isPublic && (!req.user || (req.user.role !== 'admin' && model.owner.id !== req.user.id))) {
      return res.status(403).json({ message: 'Not authorized to view this model' });
    }

    res.json({
      success: true,
      model,
    });
  } catch (err) {
    logger.error('Error getting model by token ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/models/hash/:modelHash
 * @desc    Get model by hash
 * @access  Public/Private (depends on model visibility)
 */
router.get('/hash/:modelHash', async (req, res) => {
  try {
    const model = await Model.findOne({ modelHash: req.params.modelHash }).populate('owner', 'name email walletAddress');

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if model is public or user is owner/admin
    if (!model.isPublic && (!req.user || (req.user.role !== 'admin' && model.owner.id !== req.user.id))) {
      return res.status(403).json({ message: 'Not authorized to view this model' });
    }

    res.json({
      success: true,
      model,
    });
  } catch (err) {
    logger.error('Error getting model by hash:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/models/featured
 * @desc    Get featured models
 * @access  Public
 */
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const models = await Model.find({ isPublic: true, status: 'active' })
      .sort({ 'rating.average': -1, downloads: -1 })
      .limit(limit)
      .populate('owner', 'name email walletAddress');

    res.json({
      success: true,
      count: models.length,
      models,
    });
  } catch (err) {
    logger.error('Error getting featured models:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/models/trending
 * @desc    Get trending models
 * @access  Public
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const models = await Model.find({ isPublic: true, status: 'active' })
      .sort({ downloads: -1, views: -1 })
      .limit(limit)
      .populate('owner', 'name email walletAddress');

    res.json({
      success: true,
      count: models.length,
      models,
    });
  } catch (err) {
    logger.error('Error getting trending models:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/models/recent
 * @desc    Get recent models
 * @access  Public
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const models = await Model.find({ isPublic: true, status: 'active' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('owner', 'name email walletAddress');

    res.json({
      success: true,
      count: models.length,
      models,
    });
  } catch (err) {
    logger.error('Error getting recent models:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
