// Deployment script for AI Model Blockchain System contracts
// This script uses Hardhat for deployment

const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment of AI Model Blockchain System contracts...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(balance)} ETH`);

  // Deploy ModelRegistry contract
  console.log("\nDeploying ModelRegistry...");
  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const modelRegistry = await ModelRegistry.deploy();
  await modelRegistry.deployed();
  console.log(`ModelRegistry deployed to: ${modelRegistry.address}`);

  // Deploy LicenseManager contract
  console.log("\nDeploying LicenseManager...");
  const LicenseManager = await ethers.getContractFactory("LicenseManager");
  const licenseManager = await LicenseManager.deploy(modelRegistry.address);
  await licenseManager.deployed();
  console.log(`LicenseManager deployed to: ${licenseManager.address}`);

  // Deploy PaymentProcessor contract
  console.log("\nDeploying PaymentProcessor...");
  
  // Platform fee is set to 5% (500 basis points)
  const platformFeePercentage = 500;
  
  // Platform fee recipient is the deployer by default
  const platformFeeRecipient = deployer.address;
  
  const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
  const paymentProcessor = await PaymentProcessor.deploy(
    modelRegistry.address,
    licenseManager.address,
    platformFeePercentage,
    platformFeeRecipient
  );
  await paymentProcessor.deployed();
  console.log(`PaymentProcessor deployed to: ${paymentProcessor.address}`);

  // Set up roles
  console.log("\nSetting up roles...");
  
  // Grant LICENSE_ADMIN role to PaymentProcessor
  const LICENSE_ADMIN_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("LICENSE_ADMIN")
  );
  await licenseManager.grantRole(LICENSE_ADMIN_ROLE, paymentProcessor.address);
  console.log(`Granted LICENSE_ADMIN role to PaymentProcessor`);

  console.log("\nDeployment complete!");
  console.log("\nContract Addresses:");
  console.log(`ModelRegistry: ${modelRegistry.address}`);
  console.log(`LicenseManager: ${licenseManager.address}`);
  console.log(`PaymentProcessor: ${paymentProcessor.address}`);

  // Verify contracts on Etherscan (if not on a local network)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nVerifying contracts on Etherscan...");
    
    console.log("Waiting for block confirmations...");
    // Wait for 6 block confirmations to ensure the contracts are mined
    await modelRegistry.deployTransaction.wait(6);
    await licenseManager.deployTransaction.wait(6);
    await paymentProcessor.deployTransaction.wait(6);
    
    console.log("Verifying ModelRegistry...");
    await hre.run("verify:verify", {
      address: modelRegistry.address,
      constructorArguments: [],
    });
    
    console.log("Verifying LicenseManager...");
    await hre.run("verify:verify", {
      address: licenseManager.address,
      constructorArguments: [modelRegistry.address],
    });
    
    console.log("Verifying PaymentProcessor...");
    await hre.run("verify:verify", {
      address: paymentProcessor.address,
      constructorArguments: [
        modelRegistry.address,
        licenseManager.address,
        platformFeePercentage,
        platformFeeRecipient
      ],
    });
    
    console.log("Contract verification complete!");
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
