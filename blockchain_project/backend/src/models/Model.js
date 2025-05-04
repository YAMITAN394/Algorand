const mongoose = require('mongoose');

const ModelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a model name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
      maxlength: [2000, 'Description cannot be more than 2000 characters'],
    },
    tokenId: {
      type: String,
      required: [true, 'Token ID is required'],
      unique: true,
    },
    modelHash: {
      type: String,
      required: [true, 'Model hash is required'],
      unique: true,
    },
    metadataURI: {
      type: String,
      required: [true, 'Metadata URI is required'],
    },
    modelURI: {
      type: String,
      required: [true, 'Model URI is required'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
    },
    category: {
      type: String,
      enum: [
        'natural-language-processing',
        'computer-vision',
        'speech-recognition',
        'reinforcement-learning',
        'generative-ai',
        'other',
      ],
      default: 'other',
    },
    tags: [String],
    framework: {
      type: String,
      enum: ['pytorch', 'tensorflow', 'jax', 'onnx', 'other'],
      default: 'other',
    },
    version: {
      type: String,
      default: '1.0.0',
    },
    versionHistory: [
      {
        version: String,
        modelHash: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        description: String,
      },
    ],
    metrics: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'rejected'],
      default: 'active',
    },
    downloads: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for licenses
ModelSchema.virtual('licenses', {
  ref: 'License',
  localField: '_id',
  foreignField: 'model',
  justOne: false,
});

// Virtual for payments
ModelSchema.virtual('payments', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'model',
  justOne: false,
});

// Index for search
ModelSchema.index({ name: 'text', description: 'text', tags: 'text' });

// Middleware to update version history on model update
ModelSchema.pre('save', function (next) {
  if (this.isNew) {
    // Add initial version to history if new model
    this.versionHistory = [
      {
        version: this.version,
        modelHash: this.modelHash,
        timestamp: Date.now(),
        description: 'Initial version',
      },
    ];
  } else if (this.isModified('modelHash')) {
    // Add new version to history if model hash changed
    this.versionHistory.push({
      version: this.version,
      modelHash: this.modelHash,
      timestamp: Date.now(),
      description: 'Updated version',
    });
  }
  next();
});

module.exports = mongoose.model('Model', ModelSchema);
