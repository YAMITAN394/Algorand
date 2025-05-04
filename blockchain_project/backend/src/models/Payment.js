const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    transactionHash: {
      type: String,
      required: [true, 'Transaction hash is required'],
      unique: true,
    },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: [true, 'Model is required'],
    },
    license: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'License',
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payer is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be positive'],
    },
    currency: {
      type: String,
      enum: ['ETH', 'USDC', 'DAI', 'USD', 'EUR'],
      required: [true, 'Currency is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentType: {
      type: String,
      enum: ['license', 'subscription', 'usage', 'donation'],
      required: [true, 'Payment type is required'],
    },
    tokenAddress: {
      type: String,
      default: null, // null for ETH, contract address for tokens
    },
    blockNumber: {
      type: Number,
    },
    blockTimestamp: {
      type: Date,
    },
    gasUsed: {
      type: Number,
    },
    effectiveGasPrice: {
      type: Number,
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    platformFeePercentage: {
      type: Number,
      default: 0,
    },
    distributions: [
      {
        recipient: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        amount: Number,
        percentage: Number,
        transactionHash: String,
        status: {
          type: String,
          enum: ['pending', 'completed', 'failed'],
          default: 'pending',
        },
      },
    ],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refundReason: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient queries
PaymentSchema.index({ model: 1 });
PaymentSchema.index({ license: 1 });
PaymentSchema.index({ payer: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ createdAt: 1 });

// Method to mark payment as completed
PaymentSchema.methods.markCompleted = async function (blockData = {}) {
  this.status = 'completed';
  
  if (blockData.blockNumber) {
    this.blockNumber = blockData.blockNumber;
  }
  
  if (blockData.blockTimestamp) {
    this.blockTimestamp = blockData.blockTimestamp;
  }
  
  if (blockData.gasUsed) {
    this.gasUsed = blockData.gasUsed;
  }
  
  if (blockData.effectiveGasPrice) {
    this.effectiveGasPrice = blockData.effectiveGasPrice;
  }
  
  return this.save();
};

// Method to mark payment as failed
PaymentSchema.methods.markFailed = async function (reason = '') {
  this.status = 'failed';
  this.metadata.set('failureReason', reason);
  return this.save();
};

// Method to refund payment
PaymentSchema.methods.refund = async function (reason = '', refundTransactionHash = '') {
  this.status = 'refunded';
  this.refundReason = reason;
  this.metadata.set('refundTransactionHash', refundTransactionHash);
  return this.save();
};

// Method to add distribution
PaymentSchema.methods.addDistribution = async function (distribution) {
  this.distributions.push(distribution);
  return this.save();
};

// Method to update distribution status
PaymentSchema.methods.updateDistributionStatus = async function (index, status, transactionHash = null) {
  if (index >= 0 && index < this.distributions.length) {
    this.distributions[index].status = status;
    
    if (transactionHash) {
      this.distributions[index].transactionHash = transactionHash;
    }
    
    return this.save();
  }
  
  throw new Error('Distribution index out of bounds');
};

// Static method to get total revenue for a model
PaymentSchema.statics.getModelRevenue = async function (modelId) {
  const result = await this.aggregate([
    {
      $match: {
        model: mongoose.Types.ObjectId(modelId),
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$currency',
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);
  
  return result;
};

// Static method to get revenue by time period
PaymentSchema.statics.getRevenueByPeriod = async function (modelId, startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        model: mongoose.Types.ObjectId(modelId),
        status: 'completed',
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      },
    },
    {
      $group: {
        _id: {
          currency: '$currency',
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        totalAmount: { $sum: '$amount' },
      },
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
        '_id.day': 1,
      },
    },
  ]);
  
  return result;
};

module.exports = mongoose.model('Payment', PaymentSchema);
