// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ModelRegistry.sol";

/**
 * @title LicenseManager
 * @dev Contract for managing licenses for AI models
 */
contract LicenseManager is AccessControl, ReentrancyGuard {
    bytes32 public constant LICENSE_ADMIN = keccak256("LICENSE_ADMIN");
    bytes32 public constant MODEL_OWNER = keccak256("MODEL_OWNER");
    
    // License types
    enum LicenseType { OpenSource, Research, Commercial, Enterprise }
    
    // Access levels
    enum AccessLevel { ReadOnly, InferenceOnly, FineTuning, FullAccess }
    
    // License structure
    struct License {
        uint256 modelId;
        address licensee;
        LicenseType licenseType;
        AccessLevel accessLevel;
        uint256 issuedAt;
        uint256 expiresAt;
        bool isActive;
        uint256 usageLimit;
        uint256 usageCount;
    }
    
    // Reference to the ModelRegistry contract
    ModelRegistry public modelRegistry;
    
    // Mapping from license ID to License
    mapping(uint256 => License) public licenses;
    uint256 private licenseCounter;
    
    // Mapping from model ID to list of license IDs
    mapping(uint256 => uint256[]) public modelLicenses;
    
    // Mapping from licensee address to their licenses
    mapping(address => uint256[]) public userLicenses;
    
    // Events
    event LicenseIssued(uint256 indexed licenseId, uint256 indexed modelId, address indexed licensee);
    event LicenseRevoked(uint256 indexed licenseId);
    event LicenseUsed(uint256 indexed licenseId, uint256 usageCount);
    event LicenseExpired(uint256 indexed licenseId);
    event LicenseRenewed(uint256 indexed licenseId, uint256 newExpiryDate);
    
    /**
     * @dev Constructor sets up roles and links to ModelRegistry
     * @param _modelRegistryAddress Address of the ModelRegistry contract
     */
    constructor(address _modelRegistryAddress) {
        require(_modelRegistryAddress != address(0), "Invalid ModelRegistry address");
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(LICENSE_ADMIN, msg.sender);
        
        modelRegistry = ModelRegistry(_modelRegistryAddress);
    }
    
    /**
     * @dev Modifier to check if caller is the owner of the model
     * @param modelId ID of the model
     */
    modifier onlyModelOwner(uint256 modelId) {
        require(
            modelRegistry.ownerOf(modelId) == msg.sender || 
            hasRole(LICENSE_ADMIN, msg.sender),
            "Caller is not the model owner or admin"
        );
        _;
    }
    
    /**
     * @dev Issue a new license for a model
     * @param modelId ID of the model
     * @param licensee Address of the licensee
     * @param licenseType Type of license
     * @param accessLevel Level of access granted
     * @param duration Duration of the license in seconds
     * @param usageLimit Maximum number of uses (0 for unlimited)
     * @return licenseId of the newly issued license
     */
    function issueLicense(
        uint256 modelId,
        address licensee,
        LicenseType licenseType,
        AccessLevel accessLevel,
        uint256 duration,
        uint256 usageLimit
    ) public onlyModelOwner(modelId) returns (uint256) {
        require(licensee != address(0), "Invalid licensee address");
        require(duration > 0, "License duration must be greater than 0");
        
        licenseCounter++;
        uint256 licenseId = licenseCounter;
        
        licenses[licenseId] = License({
            modelId: modelId,
            licensee: licensee,
            licenseType: licenseType,
            accessLevel: accessLevel,
            issuedAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            isActive: true,
            usageLimit: usageLimit,
            usageCount: 0
        });
        
        modelLicenses[modelId].push(licenseId);
        userLicenses[licensee].push(licenseId);
        
        emit LicenseIssued(licenseId, modelId, licensee);
        
        return licenseId;
    }
    
    /**
     * @dev Revoke a license
     * @param licenseId ID of the license to revoke
     */
    function revokeLicense(uint256 licenseId) public {
        License storage license = licenses[licenseId];
        require(license.isActive, "License already inactive");
        
        // Only model owner or admin can revoke
        require(
            modelRegistry.ownerOf(license.modelId) == msg.sender || 
            hasRole(LICENSE_ADMIN, msg.sender),
            "Not authorized to revoke this license"
        );
        
        license.isActive = false;
        
        emit LicenseRevoked(licenseId);
    }
    
    /**
     * @dev Record usage of a license
     * @param licenseId ID of the license
     * @param usageAmount Amount of usage to record
     */
    function recordUsage(uint256 licenseId, uint256 usageAmount) public {
        require(hasRole(LICENSE_ADMIN, msg.sender), "Only admin can record usage");
        
        License storage license = licenses[licenseId];
        
        require(license.isActive, "License not active");
        require(block.timestamp < license.expiresAt, "License expired");
        
        license.usageCount += usageAmount;
        
        emit LicenseUsed(licenseId, license.usageCount);
        
        // Check if usage limit is reached
        if (license.usageLimit > 0 && license.usageCount >= license.usageLimit) {
            license.isActive = false;
            emit LicenseExpired(licenseId);
        }
    }
    
    /**
     * @dev Validate if a license is valid for a specific use
     * @param licenseId ID of the license
     * @param user Address of the user
     * @param requiredAccess Minimum access level required
     * @return bool indicating if the license is valid
     */
    function validateLicense(
        uint256 licenseId, 
        address user, 
        AccessLevel requiredAccess
    ) public view returns (bool) {
        License memory license = licenses[licenseId];
        
        return (
            license.isActive &&
            license.licensee == user &&
            block.timestamp < license.expiresAt &&
            (license.usageLimit == 0 || license.usageCount < license.usageLimit) &&
            uint(license.accessLevel) >= uint(requiredAccess)
        );
    }
    
    /**
     * @dev Renew a license
     * @param licenseId ID of the license
     * @param additionalDuration Additional time to add in seconds
     */
    function renewLicense(uint256 licenseId, uint256 additionalDuration) public {
        License storage license = licenses[licenseId];
        
        // Only model owner, licensee, or admin can renew
        require(
            modelRegistry.ownerOf(license.modelId) == msg.sender || 
            license.licensee == msg.sender ||
            hasRole(LICENSE_ADMIN, msg.sender),
            "Not authorized to renew this license"
        );
        
        require(additionalDuration > 0, "Additional duration must be greater than 0");
        
        // If license has expired, set new expiry from current time
        if (block.timestamp >= license.expiresAt) {
            license.expiresAt = block.timestamp + additionalDuration;
        } else {
            // Otherwise extend from current expiry
            license.expiresAt += additionalDuration;
        }
        
        // Reactivate license if it was inactive due to expiration
        if (!license.isActive && license.usageCount < license.usageLimit) {
            license.isActive = true;
        }
        
        emit LicenseRenewed(licenseId, license.expiresAt);
    }
    
    /**
     * @dev Get all licenses for a model
     * @param modelId ID of the model
     * @return Array of license IDs
     */
    function getLicensesForModel(uint256 modelId) public view returns (uint256[] memory) {
        return modelLicenses[modelId];
    }
    
    /**
     * @dev Get all licenses for a user
     * @param user Address of the user
     * @return Array of license IDs
     */
    function getLicensesForUser(address user) public view returns (uint256[] memory) {
        return userLicenses[user];
    }
    
    /**
     * @dev Check if a user has a valid license for a model
     * @param modelId ID of the model
     * @param user Address of the user
     * @param requiredAccess Minimum access level required
     * @return bool indicating if the user has a valid license
     */
    function hasValidLicense(uint256 modelId, address user, AccessLevel requiredAccess) public view returns (bool) {
        uint256[] memory userLicenseIds = userLicenses[user];
        
        for (uint i = 0; i < userLicenseIds.length; i++) {
            License memory license = licenses[userLicenseIds[i]];
            
            if (license.modelId == modelId && 
                validateLicense(userLicenseIds[i], user, requiredAccess)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * @dev Grant LICENSE_ADMIN role to an address
     * @param admin Address to grant role to
     */
    function addLicenseAdmin(address admin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(LICENSE_ADMIN, admin);
    }
    
    /**
     * @dev Revoke LICENSE_ADMIN role from an address
     * @param admin Address to revoke role from
     */
    function removeLicenseAdmin(address admin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(LICENSE_ADMIN, admin);
    }
}
