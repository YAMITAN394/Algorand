const { ethers } = require('ethers');
const logger = require('../../utils/logger');

// Import contract ABIs
const ModelRegistryABI = require('./abis/ModelRegistry.json');
const LicenseManagerABI = require('./abis/LicenseManager.json');
const PaymentProcessorABI = require('./abis/PaymentProcessor.json');

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.modelRegistry = null;
    this.licenseManager = null;
    this.paymentProcessor = null;
    this.initialized = false;
  }

  /**
   * Initialize the blockchain service
   */
  async initialize() {
    try {
      // Connect to Ethereum network
      this.provider = new ethers.providers.JsonRpcProvider(
        process.env.ETHEREUM_RPC_URL
      );

      // Create wallet from private key if provided
      if (process.env.PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        logger.info(`Wallet initialized with address: ${this.wallet.address}`);
      }

      // Connect to contracts
      this.modelRegistry = new ethers.Contract(
        process.env.MODEL_REGISTRY_ADDRESS,
        ModelRegistryABI,
        this.wallet || this.provider
      );

      this.licenseManager = new ethers.Contract(
        process.env.LICENSE_MANAGER_ADDRESS,
        LicenseManagerABI,
        this.wallet || this.provider
      );

      this.paymentProcessor = new ethers.Contract(
        process.env.PAYMENT_PROCESSOR_ADDRESS,
        PaymentProcessorABI,
        this.wallet || this.provider
      );

      this.initialized = true;
      logger.info('Blockchain service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  /**
   * Ensure the service is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Blockchain service not initialized');
    }
  }

  /**
   * Get contract instance with a specific signer
   * @param {string} contractName - Name of the contract (modelRegistry, licenseManager, paymentProcessor)
   * @param {string} signerAddress - Address of the signer
   * @returns {ethers.Contract} Contract instance with signer
   */
  async getContractWithSigner(contractName, signerAddress) {
    this.ensureInitialized();

    // Get contract instance
    let contract;
    switch (contractName) {
      case 'modelRegistry':
        contract = this.modelRegistry;
        break;
      case 'licenseManager':
        contract = this.licenseManager;
        break;
      case 'paymentProcessor':
        contract = this.paymentProcessor;
        break;
      default:
        throw new Error(`Unknown contract: ${contractName}`);
    }

    // If no signer address provided, return contract with default signer
    if (!signerAddress) {
      return contract;
    }

    // Create signer from address
    const signer = this.provider.getSigner(signerAddress);
    
    // Return contract with signer
    return contract.connect(signer);
  }

  /**
   * Register a new model
   * @param {string} name - Model name
   * @param {string} description - Model description
   * @param {string} modelHash - Hash of the model
   * @param {string} tokenURI - URI pointing to model metadata
   * @returns {Promise<Object>} Transaction receipt
   */
  async registerModel(name, description, modelHash, tokenURI) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Register model
      const tx = await this.modelRegistry.registerModel(
        name,
        description,
        modelHash,
        tokenURI
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get token ID from event
      const event = receipt.events.find(e => e.event === 'ModelRegistered');
      const tokenId = event.args.tokenId.toString();

      logger.info(`Model registered with token ID: ${tokenId}`);

      return {
        tokenId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error('Error registering model:', error);
      throw error;
    }
  }

  /**
   * Update an existing model
   * @param {string} tokenId - Token ID of the model
   * @param {string} newVersionHash - Hash of the new model version
   * @returns {Promise<Object>} Transaction receipt
   */
  async updateModel(tokenId, newVersionHash) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Update model
      const tx = await this.modelRegistry.updateModel(tokenId, newVersionHash);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      logger.info(`Model ${tokenId} updated with new version: ${newVersionHash}`);

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error(`Error updating model ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Get model details
   * @param {string} tokenId - Token ID of the model
   * @returns {Promise<Object>} Model details
   */
  async getModelDetails(tokenId) {
    this.ensureInitialized();

    try {
      // Get model details from contract
      const model = await this.modelRegistry.models(tokenId);
      const owner = await this.modelRegistry.ownerOf(tokenId);
      const tokenURI = await this.modelRegistry.tokenURI(tokenId);
      const versionHistory = await this.modelRegistry.getModelVersionHistory(tokenId);

      return {
        tokenId,
        name: model.name,
        description: model.description,
        modelHash: model.modelHash,
        registrationTime: new Date(model.registrationTime.toNumber() * 1000),
        creator: model.creator,
        owner,
        tokenURI,
        versionHistory,
      };
    } catch (error) {
      logger.error(`Error getting model details for ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Issue a license for a model
   * @param {string} modelId - Token ID of the model
   * @param {string} licensee - Address of the licensee
   * @param {number} licenseType - Type of license (0=OpenSource, 1=Research, 2=Commercial, 3=Enterprise)
   * @param {number} accessLevel - Access level (0=ReadOnly, 1=InferenceOnly, 2=FineTuning, 3=FullAccess)
   * @param {number} duration - Duration of the license in seconds
   * @param {number} usageLimit - Maximum number of uses (0 for unlimited)
   * @returns {Promise<Object>} Transaction receipt
   */
  async issueLicense(modelId, licensee, licenseType, accessLevel, duration, usageLimit) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Issue license
      const tx = await this.licenseManager.issueLicense(
        modelId,
        licensee,
        licenseType,
        accessLevel,
        duration,
        usageLimit
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get license ID from event
      const event = receipt.events.find(e => e.event === 'LicenseIssued');
      const licenseId = event.args.licenseId.toString();

      logger.info(`License issued with ID: ${licenseId}`);

      return {
        licenseId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error('Error issuing license:', error);
      throw error;
    }
  }

  /**
   * Validate a license
   * @param {string} licenseId - ID of the license
   * @param {string} user - Address of the user
   * @param {number} requiredAccess - Required access level
   * @returns {Promise<boolean>} Whether the license is valid
   */
  async validateLicense(licenseId, user, requiredAccess) {
    this.ensureInitialized();

    try {
      // Validate license
      const isValid = await this.licenseManager.validateLicense(
        licenseId,
        user,
        requiredAccess
      );

      return isValid;
    } catch (error) {
      logger.error(`Error validating license ${licenseId}:`, error);
      throw error;
    }
  }

  /**
   * Record usage of a license
   * @param {string} licenseId - ID of the license
   * @param {number} usageAmount - Amount of usage to record
   * @returns {Promise<Object>} Transaction receipt
   */
  async recordLicenseUsage(licenseId, usageAmount = 1) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Record usage
      const tx = await this.licenseManager.recordUsage(licenseId, usageAmount);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      logger.info(`Recorded ${usageAmount} usage for license ${licenseId}`);

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error(`Error recording usage for license ${licenseId}:`, error);
      throw error;
    }
  }

  /**
   * Revoke a license
   * @param {string} licenseId - ID of the license
   * @returns {Promise<Object>} Transaction receipt
   */
  async revokeLicense(licenseId) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Revoke license
      const tx = await this.licenseManager.revokeLicense(licenseId);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      logger.info(`License ${licenseId} revoked`);

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error(`Error revoking license ${licenseId}:`, error);
      throw error;
    }
  }

  /**
   * Process a payment in ETH
   * @param {string} modelId - Token ID of the model
   * @param {string} amount - Amount to pay in wei
   * @returns {Promise<Object>} Transaction receipt
   */
  async processPayment(modelId, amount) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Process payment
      const tx = await this.paymentProcessor.processPayment(modelId, {
        value: ethers.utils.parseEther(amount),
      });

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get payment ID from event
      const event = receipt.events.find(e => e.event === 'PaymentReceived');
      const paymentId = event.args.paymentId.toString();

      logger.info(`Payment processed with ID: ${paymentId}`);

      return {
        paymentId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Process a payment in ERC20 tokens
   * @param {string} modelId - Token ID of the model
   * @param {string} tokenAddress - Address of the ERC20 token
   * @param {string} amount - Amount to pay in token units
   * @returns {Promise<Object>} Transaction receipt
   */
  async processTokenPayment(modelId, tokenAddress, amount) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Get token contract
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.wallet
      );

      // Approve token transfer
      const approveTx = await tokenContract.approve(
        this.paymentProcessor.address,
        amount
      );
      await approveTx.wait();

      // Process token payment
      const tx = await this.paymentProcessor.processTokenPayment(
        modelId,
        tokenAddress,
        amount
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get payment ID from event
      const event = receipt.events.find(e => e.event === 'TokenPaymentReceived');
      const paymentId = event.args.paymentId.toString();

      logger.info(`Token payment processed with ID: ${paymentId}`);

      return {
        paymentId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error('Error processing token payment:', error);
      throw error;
    }
  }

  /**
   * Set payment split for a model
   * @param {string} modelId - Token ID of the model
   * @param {string[]} recipients - Array of recipient addresses
   * @param {number[]} shares - Array of shares (must sum to 100)
   * @returns {Promise<Object>} Transaction receipt
   */
  async setPaymentSplit(modelId, recipients, shares) {
    this.ensureInitialized();

    try {
      // Ensure wallet is available for signing
      if (!this.wallet) {
        throw new Error('Wallet not available for signing transactions');
      }

      // Set payment split
      const tx = await this.paymentProcessor.setPaymentSplit(
        modelId,
        recipients,
        shares
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      logger.info(`Payment split set for model ${modelId}`);

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error(`Error setting payment split for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Get payment split for a model
   * @param {string} modelId - Token ID of the model
   * @returns {Promise<Object>} Payment split details
   */
  async getPaymentSplit(modelId) {
    this.ensureInitialized();

    try {
      // Get payment split
      const result = await this.paymentProcessor.getPaymentSplit(modelId);

      return {
        recipients: result[0],
        shares: result[1].map(share => share.toNumber()),
      };
    } catch (error) {
      logger.error(`Error getting payment split for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Listen for events from contracts
   * @param {string} contractName - Name of the contract (modelRegistry, licenseManager, paymentProcessor)
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} callback - Callback function to handle events
   * @returns {ethers.Contract} Event listener
   */
  listenForEvents(contractName, eventName, callback) {
    this.ensureInitialized();

    // Get contract instance
    let contract;
    switch (contractName) {
      case 'modelRegistry':
        contract = this.modelRegistry;
        break;
      case 'licenseManager':
        contract = this.licenseManager;
        break;
      case 'paymentProcessor':
        contract = this.paymentProcessor;
        break;
      default:
        throw new Error(`Unknown contract: ${contractName}`);
    }

    // Listen for events
    contract.on(eventName, (...args) => {
      logger.info(`Event ${eventName} received from ${contractName}`);
      callback(...args);
    });

    return contract;
  }
}

// Create and export singleton instance
const blockchainService = new BlockchainService();
module.exports = blockchainService;
