const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Import models
const License = require('../models/License');
const Model = require('../models/Model');
const User = require('../models/User');

// Import middleware
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Import services
const blockchainService = require('../services/blockchain/blockchainService');

// Import utils
const logger = require('../utils/logger');

/**
 * @route   POST /api/licenses
 * @desc    Issue a new license
 * @access  Private
 */
router.post(
  '/',
  [
    requireAuth,
    check('modelId', 'Model ID is required').not().isEmpty(),
    check('licenseeId', 'Licensee ID is required').not().isEmpty(),
    check('licenseType', 'License type is required').isIn(['OpenSource', 'Research', 'Commercial', 'Enterprise']),
    check('accessLevel', 'Access level is required').isIn(['ReadOnly', 'InferenceOnly', 'FineTuning', 'FullAccess']),
    check('expiresAt', 'Expiration date is required').isISO8601(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        modelId,
        licenseeId,
        licenseType,
        accessLevel,
        expiresAt,
        usageLimit,
        price,
        currency,
        termsAndConditions,
        customTerms,
      } = req.body;

      // Check if model exists
      const model = await Model.findById(modelId);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to issue license (model owner or admin)
      if (model.owner.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized to issue license for this model' });
      }

      // Check if licensee exists
      const licensee = await User.findById(licenseeId);
      if (!licensee) {
        return res.status(404).json({ message: 'Licensee not found' });
      }

      // Generate license ID
      const licenseId = `LIC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create new license
      const license = new License({
        licenseId,
        model: modelId,
        licensee: licenseeId,
        issuer: req.user.id,
        licenseType,
        accessLevel,
        issuedAt: new Date(),
        expiresAt: new Date(expiresAt),
        isActive: true,
        usageLimit: usageLimit || 0,
        usageCount: 0,
        price: price || 0,
        currency: currency || 'ETH',
        termsAndConditions,
        customTerms,
      });

      // Save license to database
      await license.save();

      // Populate references
      await license.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'licensee', select: 'name email walletAddress' },
        { path: 'issuer', select: 'name email walletAddress' },
      ]);

      res.status(201).json({
        success: true,
        license,
      });
    } catch (err) {
      logger.error('Error issuing license:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/licenses
 * @desc    Get all licenses with filtering
 * @access  Private
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      modelId,
      licenseeId,
      issuerId,
      licenseType,
      accessLevel,
      isActive,
      expiresAfter,
      expiresBefore,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      limit = 10,
      offset = 0,
    } = req.query;

    // Build query
    const query = {};

    if (modelId) query.model = modelId;
    if (licenseeId) query.licensee = licenseeId;
    if (issuerId) query.issuer = issuerId;
    if (licenseType) query.licenseType = licenseType;
    if (accessLevel) query.accessLevel = accessLevel;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    // Date filters
    if (expiresAfter) {
      query.expiresAt = { $gte: new Date(expiresAfter) };
    }
    if (expiresBefore) {
      query.expiresAt = { ...query.expiresAt, $lte: new Date(expiresBefore) };
    }

    // Non-admin users can only see their own licenses or licenses for models they own
    if (req.user.role !== 'admin') {
      const ownedModels = await Model.find({ owner: req.user.id }).select('_id');
      const ownedModelIds = ownedModels.map(model => model._id);
      
      query.$or = [
        { licensee: req.user.id },
        { issuer: req.user.id },
        { model: { $in: ownedModelIds } },
      ];
    }

    // Set up sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const licenses = await License.find(query)
      .sort(sortOptions)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'licensee', select: 'name email walletAddress' },
        { path: 'issuer', select: 'name email walletAddress' },
      ]);

    // Get total count for pagination
    const total = await License.countDocuments(query);

    res.json({
      success: true,
      count: licenses.length,
      total,
      licenses,
    });
  } catch (err) {
    logger.error('Error getting licenses:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/licenses/:id
 * @desc    Get license by ID
 * @access  Private
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const license = await License.findById(req.params.id).populate([
      { path: 'model', select: 'name tokenId modelHash owner' },
      { path: 'licensee', select: 'name email walletAddress' },
      { path: 'issuer', select: 'name email walletAddress' },
    ]);

    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    // Check if user is authorized to view this license
    const model = await Model.findById(license.model);
    if (
      req.user.role !== 'admin' &&
      license.licensee.toString() !== req.user.id &&
      license.issuer.toString() !== req.user.id &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view this license' });
    }

    res.json({
      success: true,
      license,
    });
  } catch (err) {
    logger.error('Error getting license by ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/licenses/:id
 * @desc    Update license
 * @access  Private
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const license = await License.findById(req.params.id);

    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    // Find model
    const model = await Model.findById(license.model);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is authorized to update license
    if (
      req.user.role !== 'admin' &&
      license.issuer.toString() !== req.user.id &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to update this license' });
    }

    const {
      expiresAt,
      isActive,
      usageLimit,
      termsAndConditions,
      customTerms,
    } = req.body;

    // Build license object
    const licenseFields = {};
    if (expiresAt) licenseFields.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) licenseFields.isActive = isActive;
    if (usageLimit !== undefined) licenseFields.usageLimit = usageLimit;
    if (termsAndConditions) licenseFields.termsAndConditions = termsAndConditions;
    if (customTerms) licenseFields.customTerms = customTerms;

    // Update license
    const updatedLicense = await License.findByIdAndUpdate(
      req.params.id,
      { $set: licenseFields },
      { new: true, runValidators: true }
    ).populate([
      { path: 'model', select: 'name tokenId modelHash' },
      { path: 'licensee', select: 'name email walletAddress' },
      { path: 'issuer', select: 'name email walletAddress' },
    ]);

    res.json({
      success: true,
      license: updatedLicense,
    });
  } catch (err) {
    logger.error('Error updating license:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/licenses/:id/revoke
 * @desc    Revoke a license
 * @access  Private
 */
router.put(
  '/:id/revoke',
  [requireAuth, check('reason', 'Reason is required').not().isEmpty()],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const license = await License.findById(req.params.id);

      if (!license) {
        return res.status(404).json({ message: 'License not found' });
      }

      // Find model
      const model = await Model.findById(license.model);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to revoke license
      if (
        req.user.role !== 'admin' &&
        license.issuer.toString() !== req.user.id &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to revoke this license' });
      }

      const { reason } = req.body;

      // Revoke license
      await license.revoke(reason);

      // Populate references
      await license.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'licensee', select: 'name email walletAddress' },
        { path: 'issuer', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        license,
      });
    } catch (err) {
      logger.error('Error revoking license:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/licenses/:id/renew
 * @desc    Renew a license
 * @access  Private
 */
router.put(
  '/:id/renew',
  [requireAuth, check('duration', 'Duration is required').isInt({ min: 1 })],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const license = await License.findById(req.params.id);

      if (!license) {
        return res.status(404).json({ message: 'License not found' });
      }

      // Find model
      const model = await Model.findById(license.model);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to renew license
      if (
        req.user.role !== 'admin' &&
        license.licensee.toString() !== req.user.id &&
        license.issuer.toString() !== req.user.id &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to renew this license' });
      }

      const { duration } = req.body;

      // Renew license
      await license.renew(duration);

      // Populate references
      await license.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'licensee', select: 'name email walletAddress' },
        { path: 'issuer', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        license,
      });
    } catch (err) {
      logger.error('Error renewing license:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/licenses/:id/usage
 * @desc    Record license usage
 * @access  Private
 */
router.put(
  '/:id/usage',
  [
    requireAuth,
    check('operation', 'Operation is required').not().isEmpty(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const license = await License.findById(req.params.id);

      if (!license) {
        return res.status(404).json({ message: 'License not found' });
      }

      // Check if user is authorized to record usage
      if (
        req.user.role !== 'admin' &&
        license.licensee.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to record usage for this license' });
      }

      // Check if license is valid
      if (!license.isValid()) {
        return res.status(400).json({ message: 'License is not valid' });
      }

      const { operation, details } = req.body;

      // Record usage
      await license.recordUsage(operation, details);

      // Populate references
      await license.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'licensee', select: 'name email walletAddress' },
        { path: 'issuer', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        license,
      });
    } catch (err) {
      logger.error('Error recording license usage:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/licenses/licenseId/:licenseId
 * @desc    Get license by license ID
 * @access  Private
 */
router.get('/licenseId/:licenseId', requireAuth, async (req, res) => {
  try {
    const license = await License.findOne({ licenseId: req.params.licenseId }).populate([
      { path: 'model', select: 'name tokenId modelHash owner' },
      { path: 'licensee', select: 'name email walletAddress' },
      { path: 'issuer', select: 'name email walletAddress' },
    ]);

    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    // Check if user is authorized to view this license
    const model = await Model.findById(license.model);
    if (
      req.user.role !== 'admin' &&
      license.licensee.toString() !== req.user.id &&
      license.issuer.toString() !== req.user.id &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view this license' });
    }

    res.json({
      success: true,
      license,
    });
  } catch (err) {
    logger.error('Error getting license by license ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/licenses/validate/:licenseId
 * @desc    Validate a license
 * @access  Private
 */
router.get(
  '/validate/:licenseId',
  [requireAuth, check('accessLevel', 'Access level is required').isIn(['ReadOnly', 'InferenceOnly', 'FineTuning', 'FullAccess'])],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const license = await License.findOne({ licenseId: req.params.licenseId });

      if (!license) {
        return res.json({
          success: true,
          isValid: false,
          message: 'License not found',
        });
      }

      // Check if license is valid
      if (!license.isValid()) {
        return res.json({
          success: true,
          isValid: false,
          message: 'License is not valid',
        });
      }

      // Check if user is the licensee
      if (license.licensee.toString() !== req.user.id) {
        return res.json({
          success: true,
          isValid: false,
          message: 'User is not the licensee',
        });
      }

      // Check access level
      const accessLevels = ['ReadOnly', 'InferenceOnly', 'FineTuning', 'FullAccess'];
      const requiredAccessIndex = accessLevels.indexOf(req.query.accessLevel);
      const licenseAccessIndex = accessLevels.indexOf(license.accessLevel);
      
      if (requiredAccessIndex > licenseAccessIndex) {
        return res.json({
          success: true,
          isValid: false,
          message: 'Insufficient access level',
        });
      }

      res.json({
        success: true,
        isValid: true,
        license,
      });
    } catch (err) {
      logger.error('Error validating license:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/licenses/model/:modelId
 * @desc    Get licenses for a model
 * @access  Private
 */
router.get('/model/:modelId', requireAuth, async (req, res) => {
  try {
    const model = await Model.findById(req.params.modelId);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is authorized to view licenses for this model
    if (
      req.user.role !== 'admin' &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view licenses for this model' });
    }

    const licenses = await License.find({ model: req.params.modelId }).populate([
      { path: 'licensee', select: 'name email walletAddress' },
      { path: 'issuer', select: 'name email walletAddress' },
    ]);

    res.json({
      success: true,
      count: licenses.length,
      licenses,
    });
  } catch (err) {
    logger.error('Error getting licenses for model:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/licenses/user/:userId
 * @desc    Get licenses for a user
 * @access  Private
 */
router.get('/user/:userId', requireAuth, async (req, res) => {
  try {
    // Check if user exists
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is authorized to view licenses for this user
    if (
      req.user.role !== 'admin' &&
      req.params.userId !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view licenses for this user' });
    }

    const licenses = await License.find({ licensee: req.params.userId }).populate([
      { path: 'model', select: 'name tokenId modelHash' },
      { path: 'issuer', select: 'name email walletAddress' },
    ]);

    res.json({
      success: true,
      count: licenses.length,
      licenses,
    });
  } catch (err) {
    logger.error('Error getting licenses for user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
