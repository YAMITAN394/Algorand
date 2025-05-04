const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Import models
const Payment = require('../models/Payment');
const Model = require('../models/Model');
const License = require('../models/License');
const User = require('../models/User');

// Import middleware
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Import services
const blockchainService = require('../services/blockchain/blockchainService');

// Import utils
const logger = require('../utils/logger');

/**
 * @route   POST /api/payments
 * @desc    Create a new payment
 * @access  Private
 */
router.post(
  '/',
  [
    requireAuth,
    check('modelId', 'Model ID is required').not().isEmpty(),
    check('amount', 'Amount is required').isNumeric(),
    check('currency', 'Currency is required').isIn(['ETH', 'USDC', 'DAI', 'USD', 'EUR']),
    check('paymentType', 'Payment type is required').isIn(['license', 'subscription', 'usage', 'donation']),
    check('transactionHash', 'Transaction hash is required').not().isEmpty(),
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
        licenseId,
        amount,
        currency,
        paymentType,
        tokenAddress,
        transactionHash,
        metadata,
      } = req.body;

      // Check if model exists
      const model = await Model.findById(modelId);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if license exists if provided
      let license = null;
      if (licenseId) {
        license = await License.findById(licenseId);
        if (!license) {
          return res.status(404).json({ message: 'License not found' });
        }
      }

      // Check if payment with this transaction hash already exists
      const existingPayment = await Payment.findOne({ transactionHash });
      if (existingPayment) {
        return res.status(400).json({ message: 'Payment with this transaction hash already exists' });
      }

      // Create new payment
      const payment = new Payment({
        transactionHash,
        model: modelId,
        license: licenseId,
        payer: req.user.id,
        amount,
        currency,
        status: 'pending',
        paymentType,
        tokenAddress,
        metadata: metadata || {},
      });

      // Save payment to database
      await payment.save();

      // Update license if provided
      if (license) {
        license.paymentTransactionHash = transactionHash;
        await license.save();
      }

      // Populate references
      await payment.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'license', select: 'licenseId licenseType accessLevel' },
        { path: 'payer', select: 'name email walletAddress' },
      ]);

      res.status(201).json({
        success: true,
        payment,
      });
    } catch (err) {
      logger.error('Error creating payment:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/payments
 * @desc    Get all payments with filtering
 * @access  Private
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      modelId,
      licenseId,
      payerId,
      status,
      paymentType,
      currency,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      limit = 10,
      offset = 0,
    } = req.query;

    // Build query
    const query = {};

    if (modelId) query.model = modelId;
    if (licenseId) query.license = licenseId;
    if (payerId) query.payer = payerId;
    if (status) query.status = status;
    if (paymentType) query.paymentType = paymentType;
    if (currency) query.currency = currency;
    
    // Date filters
    if (startDate) {
      query.createdAt = { $gte: new Date(startDate) };
    }
    if (endDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
    }

    // Non-admin users can only see their own payments or payments for models they own
    if (req.user.role !== 'admin') {
      const ownedModels = await Model.find({ owner: req.user.id }).select('_id');
      const ownedModelIds = ownedModels.map(model => model._id);
      
      query.$or = [
        { payer: req.user.id },
        { model: { $in: ownedModelIds } },
      ];
    }

    // Set up sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const payments = await Payment.find(query)
      .sort(sortOptions)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'license', select: 'licenseId licenseType accessLevel' },
        { path: 'payer', select: 'name email walletAddress' },
      ]);

    // Get total count for pagination
    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      count: payments.length,
      total,
      payments,
    });
  } catch (err) {
    logger.error('Error getting payments:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/payments/:id
 * @desc    Get payment by ID
 * @access  Private
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate([
      { path: 'model', select: 'name tokenId modelHash owner' },
      { path: 'license', select: 'licenseId licenseType accessLevel' },
      { path: 'payer', select: 'name email walletAddress' },
    ]);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user is authorized to view this payment
    const model = await Model.findById(payment.model);
    if (
      req.user.role !== 'admin' &&
      payment.payer.toString() !== req.user.id &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view this payment' });
    }

    res.json({
      success: true,
      payment,
    });
  } catch (err) {
    logger.error('Error getting payment by ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/payments/:id/status
 * @desc    Update payment status
 * @access  Private
 */
router.put(
  '/:id/status',
  [
    requireAuth,
    check('status', 'Status is required').isIn(['pending', 'completed', 'failed', 'refunded']),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await Payment.findById(req.params.id);

      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to update payment status
      if (
        req.user.role !== 'admin' &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to update this payment status' });
      }

      const { status } = req.body;

      // Update payment status
      payment.status = status;
      
      // If status is completed, add block data if provided
      if (status === 'completed' && req.body.blockData) {
        const { blockNumber, blockTimestamp, gasUsed, effectiveGasPrice } = req.body.blockData;
        
        if (blockNumber) payment.blockNumber = blockNumber;
        if (blockTimestamp) payment.blockTimestamp = new Date(blockTimestamp);
        if (gasUsed) payment.gasUsed = gasUsed;
        if (effectiveGasPrice) payment.effectiveGasPrice = effectiveGasPrice;
      }
      
      // If status is failed, add failure reason if provided
      if (status === 'failed' && req.body.reason) {
        payment.metadata = payment.metadata || {};
        payment.metadata.failureReason = req.body.reason;
      }
      
      // If status is refunded, add refund reason if provided
      if (status === 'refunded' && req.body.reason) {
        payment.refundReason = req.body.reason;
        
        if (req.body.refundTransactionHash) {
          payment.metadata = payment.metadata || {};
          payment.metadata.refundTransactionHash = req.body.refundTransactionHash;
        }
      }
      
      await payment.save();

      // Populate references
      await payment.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'license', select: 'licenseId licenseType accessLevel' },
        { path: 'payer', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        payment,
      });
    } catch (err) {
      logger.error('Error updating payment status:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/payments/:id/refund
 * @desc    Refund a payment
 * @access  Private
 */
router.put(
  '/:id/refund',
  [
    requireAuth,
    check('reason', 'Reason is required').not().isEmpty(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await Payment.findById(req.params.id);

      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to refund payment
      if (
        req.user.role !== 'admin' &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to refund this payment' });
      }

      const { reason, refundTransactionHash } = req.body;

      // Refund payment
      await payment.refund(reason, refundTransactionHash);

      // Populate references
      await payment.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'license', select: 'licenseId licenseType accessLevel' },
        { path: 'payer', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        payment,
      });
    } catch (err) {
      logger.error('Error refunding payment:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   PUT /api/payments/:id/distribute
 * @desc    Distribute a payment
 * @access  Private
 */
router.put('/:id/distribute', requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Find model
    const model = await Model.findById(payment.model);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is authorized to distribute payment
    if (
      req.user.role !== 'admin' &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to distribute this payment' });
    }

    // Check if payment is completed
    if (payment.status !== 'completed') {
      return res.status(400).json({ message: 'Payment must be completed before distribution' });
    }

    // Check if payment is already processed
    if (payment.isProcessed) {
      return res.status(400).json({ message: 'Payment has already been processed' });
    }

    // Get payment split from blockchain or use provided split
    let recipients = [];
    let shares = [];

    if (req.body.recipients && req.body.shares) {
      // Use provided split
      recipients = req.body.recipients;
      shares = req.body.shares;
      
      // Validate recipients and shares
      if (recipients.length !== shares.length) {
        return res.status(400).json({ message: 'Recipients and shares arrays must have the same length' });
      }
      
      // Check if all recipients exist
      for (const recipientId of recipients) {
        const recipient = await User.findById(recipientId);
        if (!recipient) {
          return res.status(404).json({ message: `Recipient with ID ${recipientId} not found` });
        }
      }
      
      // Check if shares sum to 100
      const totalShares = shares.reduce((sum, share) => sum + share, 0);
      if (totalShares !== 100) {
        return res.status(400).json({ message: 'Shares must sum to 100' });
      }
    } else {
      // TODO: Get payment split from blockchain
      // For now, just use model owner as recipient
      recipients = [model.owner];
      shares = [100];
    }

    // Calculate platform fee if applicable
    const platformFeePercentage = req.body.platformFeePercentage || 0;
    const platformFee = payment.amount * (platformFeePercentage / 100);
    
    // Update payment with platform fee info
    payment.platformFee = platformFee;
    payment.platformFeePercentage = platformFeePercentage;
    
    // Create distributions
    const distributions = [];
    
    for (let i = 0; i < recipients.length; i++) {
      const recipientId = recipients[i];
      const share = shares[i];
      const amount = (payment.amount - platformFee) * (share / 100);
      
      distributions.push({
        recipient: recipientId,
        amount,
        percentage: share,
        status: 'pending',
      });
    }
    
    // Add platform fee recipient if applicable
    if (platformFee > 0 && req.body.platformFeeRecipient) {
      const platformFeeRecipient = await User.findById(req.body.platformFeeRecipient);
      
      if (platformFeeRecipient) {
        distributions.push({
          recipient: platformFeeRecipient._id,
          amount: platformFee,
          percentage: platformFeePercentage,
          status: 'pending',
        });
      }
    }
    
    // Add distributions to payment
    payment.distributions = distributions;
    payment.isProcessed = true;
    
    await payment.save();

    // Populate references
    await payment.populate([
      { path: 'model', select: 'name tokenId modelHash' },
      { path: 'license', select: 'licenseId licenseType accessLevel' },
      { path: 'payer', select: 'name email walletAddress' },
      { path: 'distributions.recipient', select: 'name email walletAddress' },
    ]);

    res.json({
      success: true,
      payment,
    });
  } catch (err) {
    logger.error('Error distributing payment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/payments/:id/distribution/:index
 * @desc    Update distribution status
 * @access  Private
 */
router.put(
  '/:id/distribution/:index',
  [
    requireAuth,
    check('status', 'Status is required').isIn(['pending', 'completed', 'failed']),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await Payment.findById(req.params.id);

      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      // Find model
      const model = await Model.findById(payment.model);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to update distribution status
      if (
        req.user.role !== 'admin' &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to update this distribution status' });
      }

      const index = parseInt(req.params.index);
      
      // Check if distribution exists
      if (!payment.distributions || index < 0 || index >= payment.distributions.length) {
        return res.status(404).json({ message: 'Distribution not found' });
      }

      const { status, transactionHash } = req.body;

      // Update distribution status
      await payment.updateDistributionStatus(index, status, transactionHash);

      // Populate references
      await payment.populate([
        { path: 'model', select: 'name tokenId modelHash' },
        { path: 'license', select: 'licenseId licenseType accessLevel' },
        { path: 'payer', select: 'name email walletAddress' },
        { path: 'distributions.recipient', select: 'name email walletAddress' },
      ]);

      res.json({
        success: true,
        payment,
      });
    } catch (err) {
      logger.error('Error updating distribution status:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/payments/transaction/:hash
 * @desc    Get payment by transaction hash
 * @access  Private
 */
router.get('/transaction/:hash', requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findOne({ transactionHash: req.params.hash }).populate([
      { path: 'model', select: 'name tokenId modelHash owner' },
      { path: 'license', select: 'licenseId licenseType accessLevel' },
      { path: 'payer', select: 'name email walletAddress' },
    ]);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user is authorized to view this payment
    const model = await Model.findById(payment.model);
    if (
      req.user.role !== 'admin' &&
      payment.payer.toString() !== req.user.id &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view this payment' });
    }

    res.json({
      success: true,
      payment,
    });
  } catch (err) {
    logger.error('Error getting payment by transaction hash:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/payments/model/:modelId/revenue
 * @desc    Get revenue data for a model
 * @access  Private
 */
router.get('/model/:modelId/revenue', requireAuth, async (req, res) => {
  try {
    const model = await Model.findById(req.params.modelId);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check if user is authorized to view revenue for this model
    if (
      req.user.role !== 'admin' &&
      model.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view revenue for this model' });
    }

    const { startDate, endDate } = req.query;

    // Build query
    const query = {
      model: mongoose.Types.ObjectId(req.params.modelId),
      status: 'completed',
    };
    
    if (startDate) {
      query.createdAt = { $gte: new Date(startDate) };
    }
    
    if (endDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
    }

    // Get revenue by day
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

    // Get revenue by payment type
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

    // Get total revenue
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

    res.json({
      success: true,
      modelId: req.params.modelId,
      totalRevenue,
      revenueByDay,
      revenueByType,
      startDate,
      endDate,
    });
  } catch (err) {
    logger.error('Error getting model revenue:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/payments/user/:userId/revenue
 * @desc    Get revenue data for a user
 * @access  Private
 */
router.get('/user/:userId/revenue', requireAuth, async (req, res) => {
  try {
    // Check if user exists
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is authorized to view revenue for this user
    if (
      req.user.role !== 'admin' &&
      req.params.userId !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view revenue for this user' });
    }

    const { startDate, endDate } = req.query;

    // Get models owned by the user
    const ownedModels = await Model.find({ owner: req.params.userId }).select('_id');
    const ownedModelIds = ownedModels.map(model => model._id);

    // Build query
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

    // Get revenue by day
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

    // Get revenue by model
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

    // Get total revenue
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

    // Populate model details in revenueByModel
    const populatedRevenueByModel = [];
    
    for (const item of revenueByModel) {
      const model = await Model.findById(item._id.model).select('name tokenId');
      
      if (model) {
        populatedRevenueByModel.push({
          ...item,
          model: {
            id: model._id,
            name: model.name,
            tokenId: model.tokenId,
          },
        });
      }
    }

    res.json({
      success: true,
      userId: req.params.userId,
      totalRevenue,
      revenueByDay,
      revenueByModel: populatedRevenueByModel,
      startDate,
      endDate,
    });
  } catch (err) {
    logger.error('Error getting user revenue:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/payments/split
 * @desc    Set payment split for a model
 * @access  Private
 */
router.post(
  '/split',
  [
    requireAuth,
    check('modelId', 'Model ID is required').not().isEmpty(),
    check('recipients', 'Recipients array is required').isArray(),
    check('shares', 'Shares array is required').isArray(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { modelId, recipients, shares } = req.body;

      // Check if model exists
      const model = await Model.findById(modelId);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }

      // Check if user is authorized to set payment split
      if (
        req.user.role !== 'admin' &&
        model.owner.toString() !== req.user.id
      ) {
        return res.status(403).json({ message: 'Not authorized to set payment split for this model' });
      }

      // Validate recipients and shares
      if (recipients.length !== shares.length) {
        return res.status(400).json({ message: 'Recipients and shares arrays must have the same length' });
      }
      
      // Check if all recipients exist
      for (const recipientId of recipients) {
        const recipient = await User.findById(recipientId);
        if (!recipient) {
          return res.status(404).json({ message: `Recipient with ID ${recipientId} not found` });
        }
      }
      
      // Check if shares sum to 100
      const totalShares = shares.reduce((sum, share) => sum + share, 0);
      if (totalShares !== 100) {
        return res.status(400).json({ message: 'Shares must sum to 100' });
      }

      // TODO: Set payment split on blockchain
      // For now, just return success

      res.json({
        success: true,
        modelId,
        recipients,
        shares,
      });
    } catch (err) {
      logger.error('Error setting payment split:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
