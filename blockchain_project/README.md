# AI Model Blockchain System

A decentralized platform for AI model registration, licensing, and monetization using blockchain technology.

## Overview

This project implements a blockchain-based system for AI model creators to register their models, issue licenses, and receive payments. The system consists of three main components:

1. **Smart Contracts**: Ethereum-based contracts for model registration, licensing, and payment processing
2. **Backend API**: Node.js/Express server with REST and GraphQL APIs
3. **Frontend**: React-based web application

## Features

- **Model Registration**: Register AI models on the blockchain with ownership verification
- **Licensing**: Issue and manage different types of licenses for AI models
- **Payment Processing**: Handle payments for licenses and usage with revenue sharing
- **IPFS Integration**: Store model metadata and files on IPFS
- **User Management**: Authentication, authorization, and user profiles
- **Analytics**: Track model usage, revenue, and other metrics

## Project Structure

```
blockchain_project/
├── smart_contracts/     # Ethereum smart contracts
├── backend/            # Node.js/Express server
└── frontend/           # React web application
```

## Smart Contracts

The project includes the following smart contracts:

- **ModelRegistry.sol**: ERC-721 token for model registration and ownership
- **LicenseManager.sol**: License issuance and validation
- **PaymentProcessor.sol**: Payment handling and revenue distribution

## Backend

The backend provides both REST and GraphQL APIs for interacting with the system:

- **REST API**: Traditional RESTful endpoints
- **GraphQL API**: Flexible queries and mutations
- **Blockchain Service**: Interface with Ethereum smart contracts
- **IPFS Service**: Interface with IPFS for decentralized storage

## Frontend

The frontend is a React application with the following features:

- **Model Marketplace**: Browse, search, and filter AI models
- **Model Dashboard**: Manage your AI models and licenses
- **License Management**: Issue and manage licenses
- **Payment Processing**: Process and track payments
- **User Profile**: Manage your account and wallet

## Prerequisites

- Node.js (v16+)
- MongoDB
- Ethereum wallet (MetaMask recommended)
- IPFS node (optional, can use public gateways)

## Setup and Installation

### Smart Contracts

1. Navigate to the smart contracts directory:
   ```
   cd smart_contracts
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example` and add your configuration.

4. Compile the contracts:
   ```
   npx hardhat compile
   ```

5. Deploy the contracts:
   ```
   npx hardhat run scripts/deploy.js --network <network>
   ```

### Backend

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example` and add your configuration.

4. Start the server:
   ```
   npm run dev
   ```

### Frontend

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

## API Documentation

### REST API

The REST API is available at `/api` with the following endpoints:

- `/api/users`: User management
- `/api/models`: Model registration and management
- `/api/licenses`: License issuance and management
- `/api/payments`: Payment processing and tracking

### GraphQL API

The GraphQL API is available at `/graphql` and provides a flexible interface for querying and mutating data.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
