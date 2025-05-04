const mongoose = require('mongoose');

const LicenseSchema = new mongoose.Schema(
  {
    licenseId: {
      type: String,
      required: [true, 'License ID is required'],
      unique: true,
    },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: [true, 'Model is required'],
    },
    licensee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Licensee is required'],
    },
    issuer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Issuer is required'],
    },
    licenseType: {
      type: String,
      enum: ['OpenSource', 'Research', 'Commercial', 'Enterprise'],
      required: [true, 'License type is required'],
    },
    accessLevel: {
      type: String,
      enum: ['ReadOnly', 'InferenceOnly', 'FineTuning', 'FullAccess'],
      required: [true, 'Access level is required'],
    },
    issuedAt: {
      type: Date,
      required: [true, 'Issue date is required'],
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageLimit: {
      type: Number,
      default: 0, // 0 means unlimited
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      enum: ['ETH', 'USDC', 'DAI', 'USD', 'EUR'],
      default: 'ETH',
    },
    paymentTransactionHash: {
      type: String,
    },
    termsAndConditions: {
      type: String,
    },
    customTerms: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    revocationReason: {
      type: String,
    },
    usageHistory: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        operation: String,
        details: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for efficient queries
LicenseSchema.index({ model: 1, licensee: 1 });
LicenseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
LicenseSchema.index({ isActive: 1 });

// Virtual for payments
LicenseSchema.virtual('payments', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'license',
  justOne: false,
});

// Method to check if license is valid
LicenseSchema.methods.isValid = function () {
  const now = new Date();
  
  // Check if license is active
  if (!this.isActive) {
    return false;
  }
  
  // Check if license has expired
  if (now > this.expiresAt) {
    return false;
  }
  
  // Check if usage limit has been reached
  if (this.usageLimit > 0 && this.usageCount >= this.usageLimit) {
    return false;
  }
  
  return true;
};

// Method to record usage
LicenseSchema.methods.recordUsage = async function (operation, details = {}) {
  // Add usage to history
  this.usageHistory.push({
    timestamp: new Date(),
    operation,
    details,
  });
  
  // Increment usage count
  this.usageCount += 1;
  
  // Check if usage limit has been reached
  if (this.usageLimit > 0 && this.usageCount >= this.usageLimit) {
    this.isActive = false;
  }
  
  return this.save();
};

// Method to renew license
LicenseSchema.methods.renew = async function (duration) {
  const now = new Date();
  
  // If license has expired, set new expiry from current date
  if (now > this.expiresAt) {
    this.expiresAt = new Date(now.getTime() + duration * 1000);
  } else {
    // Otherwise extend from current expiry
    this.expiresAt = new Date(this.expiresAt.getTime() + duration * 1000);
  }
  
  // Reactivate license if it was inactive due to expiration
  if (!this.isActive && this.usageCount < this.usageLimit) {
    this.isActive = true;
  }
  
  return this.save();
};

// Method to revoke license
LicenseSchema.methods.revoke = async function (reason = '') {
  this.isActive = false;
  this.revocationReason = reason;
  return this.save();
};

module.exports = mongoose.model('License', LicenseSchema);
