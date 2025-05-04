// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ModelRegistry.sol";
import "./LicenseManager.sol";

/**
 * @title PaymentProcessor
 * @dev Contract for handling payments and revenue distribution for AI models
 */
contract PaymentProcessor is AccessControl, ReentrancyGuard {
    bytes32 public constant PAYMENT_ADMIN = keccak256("PAYMENT_ADMIN");
    
    // Payment split configuration
    struct PaymentSplit {
        address[] recipients;
        uint256[] shares;  // Shares are in percentage points (0-100)
        bool isConfigured;
    }
    
    // Payment record
    struct Payment {
        uint256 modelId;
        address payer;
        uint256 amount;
        address tokenAddress;  // address(0) for ETH
        uint256 timestamp;
        bool isProcessed;
    }
    
    // Reference to other contracts
    ModelRegistry public modelRegistry;
    LicenseManager public licenseManager;
    
    // Mapping from model ID to payment split configuration
    mapping(uint256 => PaymentSplit) public paymentSplits;
    
    // Array of all payments
    Payment[] public payments;
    
    // Mapping from model ID to payment indices
    mapping(uint256 => uint256[]) public modelPayments;
    
    // Mapping from address to payment indices (as payer)
    mapping(address => uint256[]) public userPayments;
    
    // Platform fee percentage (in basis points, 100 = 1%)
    uint256 public platformFeePercentage;
    
    // Platform fee recipient
    address public platformFeeRecipient;
    
    // Events
    event PaymentReceived(uint256 indexed paymentId, uint256 indexed modelId, address indexed payer, uint256 amount);
    event PaymentDistributed(uint256 indexed paymentId, uint256 indexed modelId, uint256 amount);
    event PaymentSplitUpdated(uint256 indexed modelId);
    event PlatformFeeUpdated(uint256 newFeePercentage);
    event PlatformFeeRecipientUpdated(address newRecipient);
    event TokenPaymentReceived(uint256 indexed paymentId, uint256 indexed modelId, address indexed payer, uint256 amount, address tokenAddress);
    
    /**
     * @dev Constructor sets up roles and links to other contracts
     * @param _modelRegistryAddress Address of the ModelRegistry contract
     * @param _licenseManagerAddress Address of the LicenseManager contract
     * @param _platformFeePercentage Initial platform fee percentage (in basis points)
     * @param _platformFeeRecipient Address to receive platform fees
     */
    constructor(
        address _modelRegistryAddress,
        address _licenseManagerAddress,
        uint256 _platformFeePercentage,
        address _platformFeeRecipient
    ) {
        require(_modelRegistryAddress != address(0), "Invalid ModelRegistry address");
        require(_licenseManagerAddress != address(0), "Invalid LicenseManager address");
        require(_platformFeePercentage <= 3000, "Platform fee cannot exceed 30%");
        require(_platformFeeRecipient != address(0), "Invalid platform fee recipient");
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PAYMENT_ADMIN, msg.sender);
        
        modelRegistry = ModelRegistry(_modelRegistryAddress);
        licenseManager = LicenseManager(_licenseManagerAddress);
        
        platformFeePercentage = _platformFeePercentage;
        platformFeeRecipient = _platformFeeRecipient;
    }
    
    /**
     * @dev Set the payment split configuration for a model
     * @param modelId ID of the model
     * @param recipients Array of recipient addresses
     * @param shares Array of shares (must sum to 100)
     */
    function setPaymentSplit(
        uint256 modelId,
        address[] memory recipients,
        uint256[] memory shares
    ) public {
        // Only model owner or admin can set payment split
        require(
            modelRegistry.ownerOf(modelId) == msg.sender || 
            hasRole(PAYMENT_ADMIN, msg.sender),
            "Not authorized to set payment split"
        );
        
        require(recipients.length == shares.length, "Recipients and shares length mismatch");
        require(recipients.length > 0, "At least one recipient required");
        
        uint256 totalShares = 0;
        for (uint i = 0; i < shares.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient address");
            totalShares += shares[i];
        }
        require(totalShares == 100, "Total shares must equal 100");
        
        paymentSplits[modelId] = PaymentSplit({
            recipients: recipients,
            shares: shares,
            isConfigured: true
        });
        
        emit PaymentSplitUpdated(modelId);
    }
    
    /**
     * @dev Process a payment in ETH
     * @param modelId ID of the model being paid for
     */
    function processPayment(uint256 modelId) public payable nonReentrant {
        require(msg.value > 0, "Payment amount must be greater than 0");
        
        // Create payment record
        uint256 paymentId = payments.length;
        payments.push(Payment({
            modelId: modelId,
            payer: msg.sender,
            amount: msg.value,
            tokenAddress: address(0),  // ETH payment
            timestamp: block.timestamp,
            isProcessed: false
        }));
        
        modelPayments[modelId].push(paymentId);
        userPayments[msg.sender].push(paymentId);
        
        emit PaymentReceived(paymentId, modelId, msg.sender, msg.value);
        
        // Distribute payment if split is configured
        if (paymentSplits[modelId].isConfigured) {
            _distributeEthPayment(paymentId);
        }
    }
    
    /**
     * @dev Process a payment in ERC20 tokens
     * @param modelId ID of the model being paid for
     * @param tokenAddress Address of the ERC20 token
     * @param amount Amount of tokens to pay
     */
    function processTokenPayment(
        uint256 modelId,
        address tokenAddress,
        uint256 amount
    ) public nonReentrant {
        require(amount > 0, "Payment amount must be greater than 0");
        require(tokenAddress != address(0), "Invalid token address");
        
        IERC20 token = IERC20(tokenAddress);
        
        // Transfer tokens from payer to this contract
        require(token.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        // Create payment record
        uint256 paymentId = payments.length;
        payments.push(Payment({
            modelId: modelId,
            payer: msg.sender,
            amount: amount,
            tokenAddress: tokenAddress,
            timestamp: block.timestamp,
            isProcessed: false
        }));
        
        modelPayments[modelId].push(paymentId);
        userPayments[msg.sender].push(paymentId);
        
        emit TokenPaymentReceived(paymentId, modelId, msg.sender, amount, tokenAddress);
        
        // Distribute payment if split is configured
        if (paymentSplits[modelId].isConfigured) {
            _distributeTokenPayment(paymentId);
        }
    }
    
    /**
     * @dev Distribute an ETH payment according to the payment split
     * @param paymentId ID of the payment to distribute
     */
    function _distributeEthPayment(uint256 paymentId) internal {
        Payment storage payment = payments[paymentId];
        require(!payment.isProcessed, "Payment already processed");
        
        PaymentSplit storage split = paymentSplits[payment.modelId];
        require(split.isConfigured, "No payment split configured");
        
        // Calculate platform fee
        uint256 platformFee = (payment.amount * platformFeePercentage) / 10000;
        uint256 remainingAmount = payment.amount - platformFee;
        
        // Transfer platform fee
        if (platformFee > 0) {
            (bool feeSuccess, ) = platformFeeRecipient.call{value: platformFee}("");
            require(feeSuccess, "Platform fee transfer failed");
        }
        
        // Distribute to recipients
        for (uint i = 0; i < split.recipients.length; i++) {
            uint256 recipientAmount = (remainingAmount * split.shares[i]) / 100;
            if (recipientAmount > 0) {
                (bool success, ) = split.recipients[i].call{value: recipientAmount}("");
                require(success, "Payment distribution failed");
            }
        }
        
        payment.isProcessed = true;
        
        emit PaymentDistributed(paymentId, payment.modelId, payment.amount);
    }
    
    /**
     * @dev Distribute a token payment according to the payment split
     * @param paymentId ID of the payment to distribute
     */
    function _distributeTokenPayment(uint256 paymentId) internal {
        Payment storage payment = payments[paymentId];
        require(!payment.isProcessed, "Payment already processed");
        
        PaymentSplit storage split = paymentSplits[payment.modelId];
        require(split.isConfigured, "No payment split configured");
        
        IERC20 token = IERC20(payment.tokenAddress);
        
        // Calculate platform fee
        uint256 platformFee = (payment.amount * platformFeePercentage) / 10000;
        uint256 remainingAmount = payment.amount - platformFee;
        
        // Transfer platform fee
        if (platformFee > 0) {
            require(token.transfer(platformFeeRecipient, platformFee), "Platform fee transfer failed");
        }
        
        // Distribute to recipients
        for (uint i = 0; i < split.recipients.length; i++) {
            uint256 recipientAmount = (remainingAmount * split.shares[i]) / 100;
            if (recipientAmount > 0) {
                require(token.transfer(split.recipients[i], recipientAmount), "Payment distribution failed");
            }
        }
        
        payment.isProcessed = true;
        
        emit PaymentDistributed(paymentId, payment.modelId, payment.amount);
    }
    
    /**
     * @dev Manually distribute a payment that wasn't automatically distributed
     * @param paymentId ID of the payment to distribute
     */
    function distributePayment(uint256 paymentId) public nonReentrant {
        require(hasRole(PAYMENT_ADMIN, msg.sender), "Only admin can manually distribute payments");
        
        Payment storage payment = payments[paymentId];
        require(!payment.isProcessed, "Payment already processed");
        
        if (payment.tokenAddress == address(0)) {
            _distributeEthPayment(paymentId);
        } else {
            _distributeTokenPayment(paymentId);
        }
    }
    
    /**
     * @dev Update the platform fee percentage
     * @param newFeePercentage New fee percentage (in basis points)
     */
    function updatePlatformFee(uint256 newFeePercentage) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeePercentage <= 3000, "Platform fee cannot exceed 30%");
        platformFeePercentage = newFeePercentage;
        emit PlatformFeeUpdated(newFeePercentage);
    }
    
    /**
     * @dev Update the platform fee recipient
     * @param newRecipient New recipient address
     */
    function updatePlatformFeeRecipient(address newRecipient) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRecipient != address(0), "Invalid platform fee recipient");
        platformFeeRecipient = newRecipient;
        emit PlatformFeeRecipientUpdated(newRecipient);
    }
    
    /**
     * @dev Get payment split for a model
     * @param modelId ID of the model
     * @return recipients Array of recipient addresses
     * @return shares Array of shares
     */
    function getPaymentSplit(uint256 modelId) public view returns (address[] memory recipients, uint256[] memory shares) {
        PaymentSplit storage split = paymentSplits[modelId];
        return (split.recipients, split.shares);
    }
    
    /**
     * @dev Get all payments for a model
     * @param modelId ID of the model
     * @return Array of payment IDs
     */
    function getPaymentsForModel(uint256 modelId) public view returns (uint256[] memory) {
        return modelPayments[modelId];
    }
    
    /**
     * @dev Get all payments made by a user
     * @param user Address of the user
     * @return Array of payment IDs
     */
    function getPaymentsByUser(address user) public view returns (uint256[] memory) {
        return userPayments[user];
    }
    
    /**
     * @dev Get payment details
     * @param paymentId ID of the payment
     * @return modelId ID of the model
     * @return payer Address of the payer
     * @return amount Payment amount
     * @return tokenAddress Address of the token (address(0) for ETH)
     * @return timestamp Time of payment
     * @return isProcessed Whether the payment has been processed
     */
    function getPaymentDetails(uint256 paymentId) public view returns (
        uint256 modelId,
        address payer,
        uint256 amount,
        address tokenAddress,
        uint256 timestamp,
        bool isProcessed
    ) {
        require(paymentId < payments.length, "Invalid payment ID");
        Payment storage payment = payments[paymentId];
        return (
            payment.modelId,
            payment.payer,
            payment.amount,
            payment.tokenAddress,
            payment.timestamp,
            payment.isProcessed
        );
    }
    
    /**
     * @dev Grant PAYMENT_ADMIN role to an address
     * @param admin Address to grant role to
     */
    function addPaymentAdmin(address admin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(PAYMENT_ADMIN, admin);
    }
    
    /**
     * @dev Revoke PAYMENT_ADMIN role from an address
     * @param admin Address to revoke role from
     */
    function removePaymentAdmin(address admin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(PAYMENT_ADMIN, admin);
    }
    
    /**
     * @dev Withdraw any stuck ETH (emergency function)
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function emergencyWithdraw(uint256 amount, address payable recipient) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient balance");
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    /**
     * @dev Withdraw any stuck ERC20 tokens (emergency function)
     * @param tokenAddress Address of the token
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function emergencyTokenWithdraw(address tokenAddress, uint256 amount, address recipient) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(tokenAddress != address(0), "Invalid token address");
        
        IERC20 token = IERC20(tokenAddress);
        require(token.transfer(recipient, amount), "Token transfer failed");
    }
    
    // Function to receive ETH
    receive() external payable {}
}
