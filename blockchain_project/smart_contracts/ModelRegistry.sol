// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title ModelRegistry
 * @dev Contract for registering AI models as NFTs with version history tracking
 */
contract ModelRegistry is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    // Model metadata structure
    struct ModelMetadata {
        string name;
        string description;
        string modelHash;        // SHA-256 hash of the model
        uint256 registrationTime;
        address creator;
        string[] versionHistory;
    }
    
    // Mapping from token ID to model metadata
    mapping(uint256 => ModelMetadata) public models;
    
    // Mapping from model hash to token ID to prevent duplicates
    mapping(string => uint256) private _hashToTokenId;
    
    // Events
    event ModelRegistered(uint256 indexed tokenId, address indexed creator, string modelHash);
    event ModelUpdated(uint256 indexed tokenId, string newVersionHash);
    event ModelTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    
    constructor() ERC721("AI Model Registry", "AIMODEL") {}
    
    /**
     * @dev Register a new AI model
     * @param name Name of the model
     * @param description Description of the model
     * @param modelHash SHA-256 hash of the model
     * @param tokenURI URI pointing to model metadata (IPFS)
     * @return tokenId of the newly registered model
     */
    function registerModel(
        string memory name,
        string memory description,
        string memory modelHash,
        string memory tokenURI
    ) public returns (uint256) {
        // Ensure model hash is not empty
        require(bytes(modelHash).length > 0, "Model hash cannot be empty");
        
        // Ensure model with this hash doesn't already exist
        require(_hashToTokenId[modelHash] == 0, "Model with this hash already registered");
        
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        
        _mint(msg.sender, newItemId);
        _setTokenURI(newItemId, tokenURI);
        
        string[] memory initialVersion = new string[](1);
        initialVersion[0] = modelHash;
        
        models[newItemId] = ModelMetadata({
            name: name,
            description: description,
            modelHash: modelHash,
            registrationTime: block.timestamp,
            creator: msg.sender,
            versionHistory: initialVersion
        });
        
        _hashToTokenId[modelHash] = newItemId;
        
        emit ModelRegistered(newItemId, msg.sender, modelHash);
        
        return newItemId;
    }
    
    /**
     * @dev Update an existing model with a new version
     * @param tokenId ID of the model to update
     * @param newVersionHash Hash of the new model version
     */
    function updateModel(uint256 tokenId, string memory newVersionHash) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not authorized to update this model");
        require(bytes(newVersionHash).length > 0, "Version hash cannot be empty");
        require(_hashToTokenId[newVersionHash] == 0, "Model with this hash already registered");
        
        models[tokenId].modelHash = newVersionHash;
        
        // Add to version history
        string[] storage versionHistory = models[tokenId].versionHistory;
        versionHistory.push(newVersionHash);
        
        _hashToTokenId[newVersionHash] = tokenId;
        
        emit ModelUpdated(tokenId, newVersionHash);
    }
    
    /**
     * @dev Get the version history of a model
     * @param tokenId ID of the model
     * @return Array of version hashes
     */
    function getModelVersionHistory(uint256 tokenId) public view returns (string[] memory) {
        require(_exists(tokenId), "Model does not exist");
        return models[tokenId].versionHistory;
    }
    
    /**
     * @dev Check if a model with a specific hash exists
     * @param modelHash Hash to check
     * @return bool indicating if the hash exists
     */
    function modelHashExists(string memory modelHash) public view returns (bool) {
        return _hashToTokenId[modelHash] != 0;
    }
    
    /**
     * @dev Get token ID by model hash
     * @param modelHash Hash to look up
     * @return tokenId of the model with the given hash
     */
    function getTokenIdByHash(string memory modelHash) public view returns (uint256) {
        uint256 tokenId = _hashToTokenId[modelHash];
        require(tokenId != 0, "Model with this hash does not exist");
        return tokenId;
    }
    
    /**
     * @dev Override transferFrom to track ownership changes
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        super.transferFrom(from, to, tokenId);
        emit ModelTransferred(tokenId, from, to);
    }
    
    /**
     * @dev Override safeTransferFrom to track ownership changes
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) public override {
        super.safeTransferFrom(from, to, tokenId);
        emit ModelTransferred(tokenId, from, to);
    }
    
    /**
     * @dev Override safeTransferFrom with data to track ownership changes
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        super.safeTransferFrom(from, to, tokenId, data);
        emit ModelTransferred(tokenId, from, to);
    }
}
