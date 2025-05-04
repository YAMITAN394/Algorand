const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator');

// Import models
const User = require('../models/User');

// Import middleware
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Import utils
const logger = require('../utils/logger');

/**
 * @route   POST /api/users/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, walletAddress } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Check if wallet address is already in use
      if (walletAddress) {
        const existingWallet = await User.findOne({ walletAddress });
        if (existingWallet) {
          return res.status(400).json({ message: 'Wallet address already in use' });
        }
      }

      // Create new user
      user = new User({
        name,
        email,
        password,
        walletAddress,
        role: 'user',
      });

      // Save user to database
      await user.save();

      // Generate JWT
      const token = user.getSignedJwtToken();

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          walletAddress: user.walletAddress,
        },
      });
    } catch (err) {
      logger.error('Error in user registration:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   POST /api/users/login
 * @desc    Login user and get token
 * @access  Public
 */
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check if password matches
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT
      const token = user.getSignedJwtToken();

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          walletAddress: user.walletAddress,
        },
      });
    } catch (err) {
      logger.error('Error in user login:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/users/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Get user without password
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error('Error getting current user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/users/me
 * @desc    Update current user
 * @access  Private
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email, walletAddress, profileImage, bio, website } = req.body;

    // Build user object
    const userFields = {};
    if (name) userFields.name = name;
    if (email) userFields.email = email;
    if (walletAddress) {
      // Check if wallet address is already in use by another user
      const existingWallet = await User.findOne({ walletAddress });
      if (existingWallet && existingWallet.id !== req.user.id) {
        return res.status(400).json({ message: 'Wallet address already in use' });
      }
      userFields.walletAddress = walletAddress;
    }
    if (profileImage) userFields.profileImage = profileImage;
    if (bio) userFields.bio = bio;
    if (website) userFields.website = website;

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: userFields },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/users/password
 * @desc    Update password
 * @access  Private
 */
router.put(
  '/password',
  [
    requireAuth,
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { currentPassword, newPassword } = req.body;

      // Get user with password
      const user = await User.findById(req.user.id).select('+password');

      // Check if current password matches
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password updated successfully',
      });
    } catch (err) {
      logger.error('Error updating password:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   POST /api/users/forgot-password
 * @desc    Forgot password
 * @access  Public
 */
router.post(
  '/forgot-password',
  [check('email', 'Please include a valid email').isEmail()],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        // Return success even if user doesn't exist for security reasons
        return res.json({
          success: true,
          message: 'Password reset email sent if email exists',
        });
      }

      // Generate reset token
      const resetToken = user.getResetPasswordToken();
      await user.save({ validateBeforeSave: false });

      // TODO: Send email with reset token
      // For now, just log it
      logger.info(`Reset token for ${email}: ${resetToken}`);

      res.json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (err) {
      logger.error('Error in forgot password:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   POST /api/users/reset-password/:token
 * @desc    Reset password
 * @access  Public
 */
router.post(
  '/reset-password/:token',
  [check('password', 'Password must be at least 6 characters').isLength({ min: 6 })],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { password } = req.body;
      const { token } = req.params;

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
        return res.status(400).json({ message: 'Invalid or expired token' });
      }

      // Set new password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'Password reset successful',
      });
    } catch (err) {
      logger.error('Error in reset password:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error('Error getting user by ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Admin
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    logger.error('Error getting all users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Admin
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.remove();

    res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (err) {
    logger.error('Error deleting user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
