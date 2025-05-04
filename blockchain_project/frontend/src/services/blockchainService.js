import { ethers } from 'ethers';

// Import contract ABIs
import ModelRegistryABI from '../contracts/ModelRegistry.json';
import LicenseManagerABI from '../contracts/LicenseManager.json';
import PaymentProcessorABI from '../contracts/PaymentProcessor.json';

// Contract addresses from environment variables
const MODEL_REGISTRY_ADDRESS = process.env.REACT_APP_MODEL_REGISTRY_ADDRESS;
const LICENSE_MANAGER_ADDRESS = process.env.REACT_APP_LICENSE_MANAGER_ADDRESS;
const PAYMENT_PROCESSOR_ADDRESS = process.env.REACT_APP_PAYMENT_PROCESSOR_ADDRESS;

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.modelRegistry = null;
    this.licenseManager = null;
    this.paymentProcessor = null;
    this.initialized = false;
    this.account = null;
  }

  /**
   * Initialize the blockchain service
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize() {
    try {
      // Check if MetaMask is installed
      if (!window.ethereum) {
        console.error('MetaMask is not installed');
        return false;
      }

      // Create provider
      this.provider = new ethers.providers.Web3Provider(window.ethereum);

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Get signer
      this.signer = this.provider.getSigner();
      this.account = await this.signer.getAddress();

      // Create contract instances
      this.modelRegistry = new ethers.Contract(
        MODEL_REGISTRY_ADDRESS,
        ModelRegistryABI,
        this.signer
      );

      this.licenseManager = new ethers.Contract(
        LICENSE_MANAGER_ADDRESS,
        LicenseManagerABI,
        this.signer
      );

      this.paymentProcessor = new ethers.Contract(
        PAYMENT_PROCESSOR_ADDRESS,
        PaymentProcessorABI,
        this.signer
      );

      // Set up event listeners for account changes
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.account = null;
        } else {
          this.account = accounts[0];
          this.signer = this.provider.getSigner();
          this.updateContracts();
        }
      });

      // Set up event listeners for network changes
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
      return false;
    }
  }

  /**
   * Update contract instances with new signer
   */
  updateContracts() {
    this.modelRegistry = new ethers.Contract(
      MODEL_REGISTRY_ADDRESS,
      ModelRegistryABI,
      this.signer
    );

    this.licenseManager = new ethers.Contract(
      LICENSE_MANAGER_ADDRESS,
      LicenseManagerABI,
      this.signer
    );

    this.paymentProcessor = new ethers.Contract(
      PAYMENT_PROCESSOR_ADDRESS,
      PaymentProcessorABI,
      this.signer
    );
  }

  /**
   * Ensure the service is initialized
   * @throws {Error} If the service is not initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Blockchain service not initialized');
    }
  }

  /**
   * Get the current account
   * @returns {string|null} The current account address
   */
  getAccount() {
    return this.account;
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

      return {
        tokenId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error('Error registering model:', error);
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
      // Update model
      const tx = await this.modelRegistry.updateModel(tokenId, newVersionHash);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error(`Error updating model ${tokenId}:`, error);
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
      console.error(`Error getting model details for ${tokenId}:`, error);
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
      // Map license type and access level to enum values
      const licenseTypeEnum = this.getLicenseTypeEnum(licenseType);
      const accessLevelEnum = this.getAccessLevelEnum(accessLevel);

      // Issue license
      const tx = await this.licenseManager.issueLicense(
        modelId,
        licensee,
        licenseTypeEnum,
        accessLevelEnum,
        duration,
        usageLimit
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get license ID from event
      const event = receipt.events.find(e => e.event === 'LicenseIssued');
      const licenseId = event.args.licenseId.toString();

      return {
        licenseId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error('Error issuing license:', error);
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
      // Map access level to enum value
      const accessLevelEnum = this.getAccessLevelEnum(requiredAccess);

      // Validate license
      const isValid = await this.licenseManager.validateLicense(
        licenseId,
        user,
        accessLevelEnum
      );

      return isValid;
    } catch (error) {
      console.error(`Error validating license ${licenseId}:`, error);
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
      // Record usage
      const tx = await this.licenseManager.recordUsage(licenseId, usageAmount);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error(`Error recording usage for license ${licenseId}:`, error);
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
      // Revoke license
      const tx = await this.licenseManager.revokeLicense(licenseId);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error(`Error revoking license ${licenseId}:`, error);
      throw error;
    }
  }

  /**
   * Process a payment in ETH
   * @param {string} modelId - Token ID of the model
   * @param {string} amount - Amount to pay in ETH
   * @returns {Promise<Object>} Transaction receipt
   */
  async processPayment(modelId, amount) {
    this.ensureInitialized();

    try {
      // Convert amount to wei
      const amountWei = ethers.utils.parseEther(amount);

      // Process payment
      const tx = await this.paymentProcessor.processPayment(modelId, {
        value: amountWei,
      });

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Get payment ID from event
      const event = receipt.events.find(e => e.event === 'PaymentReceived');
      const paymentId = event.args.paymentId.toString();

      return {
        paymentId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error('Error processing payment:', error);
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
      // Get token contract
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.signer
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

      return {
        paymentId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error('Error processing token payment:', error);
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
      // Set payment split
      const tx = await this.paymentProcessor.setPaymentSplit(
        modelId,
        recipients,
        shares
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error(`Error setting payment split for model ${modelId}:`, error);
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
      console.error(`Error getting payment split for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Helper function to map license type to enum value
   * @param {string} licenseType - License type string
   * @returns {number} Enum value
   */
  getLicenseTypeEnum(licenseType) {
    const licenseTypes = {
      'OpenSource': 0,
      'Research': 1,
      'Commercial': 2,
      'Enterprise': 3,
    };
    
    return licenseTypes[licenseType] || 0;
  }

  /**
   * Helper function to map access level to enum value
   * @param {string} accessLevel - Access level string
   * @returns {number} Enum value
   */
  getAccessLevelEnum(accessLevel) {
    const accessLevels = {
      'ReadOnly': 0,
      'InferenceOnly': 1,
      'FineTuning': 2,
      'FullAccess': 3,
    };
    
    return accessLevels[accessLevel] || 0;
  }
}

// Create and export singleton instance
const blockchainService = new BlockchainService();
export default blockchainService;
