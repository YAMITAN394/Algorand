const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ModelRegistry", function () {
  let ModelRegistry;
  let modelRegistry;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    ModelRegistry = await ethers.getContractFactory("ModelRegistry");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy a new ModelRegistry contract before each test
    modelRegistry = await ModelRegistry.deploy();
    await modelRegistry.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await modelRegistry.owner()).to.equal(owner.address);
    });

    it("Should have the correct name and symbol", async function () {
      expect(await modelRegistry.name()).to.equal("AI Model Registry");
      expect(await modelRegistry.symbol()).to.equal("AIMODEL");
    });
  });

  describe("Model Registration", function () {
    it("Should register a new model", async function () {
      const modelName = "Test Model";
      const modelDescription = "A test model for unit testing";
      const modelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("model data"));
      const tokenURI = "ipfs://QmTest";

      // Register the model
      const tx = await modelRegistry.registerModel(
        modelName,
        modelDescription,
        modelHash,
        tokenURI
      );

      // Wait for the transaction to be mined
      const receipt = await tx.wait();

      // Get the token ID from the event
      const event = receipt.events.find(e => e.event === 'ModelRegistered');
      const tokenId = event.args.tokenId;

      // Check that the model was registered correctly
      expect(event.args.creator).to.equal(owner.address);
      expect(event.args.modelHash).to.equal(modelHash);

      // Check the model metadata
      const model = await modelRegistry.models(tokenId);
      expect(model.name).to.equal(modelName);
      expect(model.description).to.equal(modelDescription);
      expect(model.modelHash).to.equal(modelHash);
      expect(model.creator).to.equal(owner.address);

      // Check token ownership
      expect(await modelRegistry.ownerOf(tokenId)).to.equal(owner.address);
      expect(await modelRegistry.tokenURI(tokenId)).to.equal(tokenURI);
    });

    it("Should prevent registering a model with an existing hash", async function () {
      const modelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("duplicate model"));

      // Register the first model
      await modelRegistry.registerModel(
        "Original Model",
        "The first model with this hash",
        modelHash,
        "ipfs://QmOriginal"
      );

      // Try to register a second model with the same hash
      await expect(
        modelRegistry.registerModel(
          "Duplicate Model",
          "A model with the same hash",
          modelHash,
          "ipfs://QmDuplicate"
        )
      ).to.be.revertedWith("Model with this hash already registered");
    });
  });

  describe("Model Updates", function () {
    let tokenId;
    const initialModelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("initial model"));
    
    beforeEach(async function () {
      // Register a model before each test in this describe block
      const tx = await modelRegistry.registerModel(
        "Updatable Model",
        "A model that will be updated",
        initialModelHash,
        "ipfs://QmUpdatable"
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === 'ModelRegistered');
      tokenId = event.args.tokenId;
    });

    it("Should update a model with a new version", async function () {
      const newVersionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("updated model"));
      
      // Update the model
      const tx = await modelRegistry.updateModel(tokenId, newVersionHash);
      const receipt = await tx.wait();
      
      // Check the event
      const event = receipt.events.find(e => e.event === 'ModelUpdated');
      expect(event.args.tokenId).to.equal(tokenId);
      expect(event.args.newVersionHash).to.equal(newVersionHash);
      
      // Check the updated model
      const model = await modelRegistry.models(tokenId);
      expect(model.modelHash).to.equal(newVersionHash);
      
      // Check the version history
      const versionHistory = await modelRegistry.getModelVersionHistory(tokenId);
      expect(versionHistory.length).to.equal(2);
      expect(versionHistory[0]).to.equal(initialModelHash);
      expect(versionHistory[1]).to.equal(newVersionHash);
    });

    it("Should prevent non-owners from updating a model", async function () {
      const newVersionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("unauthorized update"));
      
      // Try to update the model as a non-owner
      await expect(
        modelRegistry.connect(addr1).updateModel(tokenId, newVersionHash)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Model Transfers", function () {
    let tokenId;
    
    beforeEach(async function () {
      // Register a model before each test in this describe block
      const tx = await modelRegistry.registerModel(
        "Transferable Model",
        "A model that will be transferred",
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes("transferable model")),
        "ipfs://QmTransferable"
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === 'ModelRegistered');
      tokenId = event.args.tokenId;
    });

    it("Should transfer ownership of a model", async function () {
      // Transfer the model to addr1
      const tx = await modelRegistry.transferFrom(owner.address, addr1.address, tokenId);
      const receipt = await tx.wait();
      
      // Check the event
      const event = receipt.events.find(e => e.event === 'ModelTransferred');
      expect(event.args.tokenId).to.equal(tokenId);
      expect(event.args.from).to.equal(owner.address);
      expect(event.args.to).to.equal(addr1.address);
      
      // Check the new owner
      expect(await modelRegistry.ownerOf(tokenId)).to.equal(addr1.address);
    });
  });

  describe("Model Lookup", function () {
    let tokenId;
    const modelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("lookup model"));
    
    beforeEach(async function () {
      // Register a model before each test in this describe block
      const tx = await modelRegistry.registerModel(
        "Lookup Model",
        "A model for testing lookup functions",
        modelHash,
        "ipfs://QmLookup"
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === 'ModelRegistered');
      tokenId = event.args.tokenId;
    });

    it("Should check if a model hash exists", async function () {
      expect(await modelRegistry.modelHashExists(modelHash)).to.be.true;
      
      const nonExistentHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("non-existent"));
      expect(await modelRegistry.modelHashExists(nonExistentHash)).to.be.false;
    });

    it("Should get token ID by hash", async function () {
      const retrievedTokenId = await modelRegistry.getTokenIdByHash(modelHash);
      expect(retrievedTokenId).to.equal(tokenId);
      
      const nonExistentHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("non-existent"));
      await expect(
        modelRegistry.getTokenIdByHash(nonExistentHash)
      ).to.be.revertedWith("Model with this hash does not exist");
    });
  });
});
