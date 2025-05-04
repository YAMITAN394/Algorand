# AI Model Blockchain System - Frontend Application

This directory contains the frontend web application for the AI Model Blockchain System. The application provides a user interface for interacting with the blockchain-based AI model ownership, licensing, and monetization system.

## Technology Stack

- **React.js**: JavaScript library for building user interfaces
- **TypeScript**: Typed superset of JavaScript
- **Material-UI**: React component library implementing Material Design
- **Redux**: State management
- **Web3.js/ethers.js**: Ethereum JavaScript libraries
- **Apollo Client**: GraphQL client for React

## Directory Structure

```
/frontend
├── /public             # Static files
├── /src
│   ├── /assets         # Images, fonts, etc.
│   ├── /components     # Reusable UI components
│   │   ├── /common     # Common UI components
│   │   ├── /layout     # Layout components
│   │   ├── /models     # Model-related components
│   │   ├── /licenses   # License-related components
│   │   └── /payments   # Payment-related components
│   ├── /contexts       # React contexts
│   ├── /hooks          # Custom React hooks
│   ├── /pages          # Page components
│   ├── /services       # API services
│   │   ├── /api        # Backend API services
│   │   └── /blockchain # Blockchain interaction services
│   ├── /store          # Redux store
│   │   ├── /actions    # Redux actions
│   │   ├── /reducers   # Redux reducers
│   │   └── /selectors  # Redux selectors
│   ├── /types          # TypeScript type definitions
│   ├── /utils          # Utility functions
│   ├── App.tsx         # Root component
│   └── index.tsx       # Entry point
├── .env.example        # Example environment variables
├── .gitignore          # Git ignore file
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```

## Setup and Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Edit the `.env` file with your configuration.

## Development

Start the development server:

```bash
npm start
```

## Features

### Model Management

- Browse and search AI models
- Register new models
- Update existing models
- View model details and version history
- Transfer model ownership

### License Management

- Create and manage license templates
- Issue licenses to users
- View and manage active licenses
- Renew or revoke licenses

### Monetization

- Set up payment splits for models
- Process payments
- View payment history and analytics
- Configure subscription plans

### User Dashboard

- Overview of owned models
- License management
- Payment history
- Usage analytics

## Pages

1. **Home**: Landing page with featured models and system overview
2. **Model Explorer**: Browse and search available models
3. **Model Details**: View detailed information about a specific model
4. **Model Registration**: Form to register a new model
5. **License Management**: Interface for managing licenses
6. **Payment Dashboard**: Payment processing and history
7. **User Profile**: User information and settings
8. **Admin Dashboard**: System administration (for admins only)

## Building for Production

Build the production version:

```bash
npm run build
```

The build artifacts will be stored in the `build/` directory.

## Testing

Run tests:

```bash
npm test
```

## License

MIT
