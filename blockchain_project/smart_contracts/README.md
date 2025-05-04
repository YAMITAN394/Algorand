# AI Model Blockchain System Smart Contracts

This directory contains the smart contracts for the AI Model Blockchain System, which provides a secure and transparent mechanism for AI model ownership, licensing, and monetization.

## Contracts

1. **ModelRegistry.sol**: Handles registration and ownership of AI models as NFTs
2. **LicenseManager.sol**: Manages licensing of AI models with various access levels and terms
3. **PaymentProcessor.sol**: Processes payments and distributes revenue according to configured splits

## Development Setup

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Metamask or another Ethereum wallet

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with the following variables:

```
PRIVATE_KEY=your_private_key_here
GOERLI_URL=your_goerli_rpc_url_here
POLYGON_URL=your_polygon_rpc_url_here
POLYGON_MUMBAI_URL=your_mumbai_rpc_url_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here
```

### Compilation

Compile the smart contracts:

```bash
npx hardhat compile
```

### Testing

Run the tests:

```bash
npx hardhat test
```

### Local Deployment

1. Start a local Hardhat node:

```bash
npx hardhat node
```

2. Deploy the contracts to the local node:

```bash
npx hardhat run deploy.js --network localhost
```

### Testnet Deployment

Deploy to Goerli testnet:

```bash
npx hardhat run deploy.js --network goerli
```

Deploy to Polygon Mumbai testnet:

```bash
npx hardhat run deploy.js --network polygonMumbai
```

## Contract Interaction

### ModelRegistry

#### Register a new model

```javascript
// Connect to the contract
const modelRegistry = await ethers.getContractAt("ModelRegistry", "CONTRACT_ADDRESS");

// Register a model
const tx = await modelRegistry.registerModel(
  "Model Name",
  "Model Description",
  "0x123...abc", // Model hash
  "ipfs://QmXyz..." // Metadata URI
);
await tx.wait();

// Get the token ID from the event
const receipt = await tx.wait();
const event = receipt.events.find(e => e.event === 'ModelRegistered');
const tokenId = event.args.tokenId;
```

#### Update a model

```javascript
await modelRegistry.updateModel(tokenId, "0x456...def"); // New model hash
```

### LicenseManager

#### Issue a license

```javascript
// Connect to the contract
const licenseManager = await ethers.getContractAt("LicenseManager", "CONTRACT_ADDRESS");

// Issue a license
const tx = await licenseManager.issueLicense(
  tokenId, // Model ID
  "0xabc...123", // Licensee address
  0, // License type (0 = OpenSource, 1 = Research, 2 = Commercial, 3 = Enterprise)
  1, // Access level (0 = ReadOnly, 1 = InferenceOnly, 2 = FineTuning, 3 = FullAccess)
  30 * 24 * 60 * 60, // Duration in seconds (30 days)
  1000 // Usage limit (0 for unlimited)
);
await tx.wait();

// Get the license ID from the event
const receipt = await tx.wait();
const event = receipt.events.find(e => e.event === 'LicenseIssued');
const licenseId = event.args.licenseId;
```

#### Validate a license

```javascript
const isValid = await licenseManager.validateLicense(
  licenseId,
  "0xabc...123", // User address
  1 // Required access level
);
```

### PaymentProcessor

#### Set payment split

```javascript
// Connect to the contract
const paymentProcessor = await ethers.getContractAt("PaymentProcessor", "CONTRACT_ADDRESS");

// Set payment split
await paymentProcessor.setPaymentSplit(
  tokenId, // Model ID
  ["0xabc...123", "0xdef...456"], // Recipients
  [70, 30] // Shares (70% and 30%)
);
```

#### Process payment

```javascript
// Process ETH payment
await paymentProcessor.processPayment(tokenId, { value: ethers.utils.parseEther("0.1") });

// Process token payment
const tokenAddress = "0x123...abc"; // ERC20 token address
const amount = ethers.utils.parseUnits("100", 18); // 100 tokens with 18 decimals

// Approve the payment processor to spend tokens
const token = await ethers.getContractAt("IERC20", tokenAddress);
await token.approve(paymentProcessor.address, amount);

// Process the token payment
await paymentProcessor.processTokenPayment(tokenId, tokenAddress, amount);
```

## License

MIT
