# AI Model Blockchain System - Backend API

This directory contains the backend API server for the AI Model Blockchain System. The server interacts with the blockchain contracts and provides RESTful and GraphQL APIs for the frontend application.

## Technology Stack

- **Node.js**: JavaScript runtime
- **Express.js**: Web framework
- **GraphQL**: API query language with Apollo Server
- **MongoDB**: Database for storing additional metadata
- **ethers.js**: Ethereum library for blockchain interaction
- **IPFS HTTP Client**: For interacting with IPFS

## Directory Structure

```
/backend
├── /src
│   ├── /config        # Configuration files
│   ├── /controllers   # API route controllers
│   ├── /middleware    # Express middleware
│   ├── /models        # Database models
│   ├── /routes        # API routes
│   ├── /services      # Business logic
│   │   ├── /blockchain  # Blockchain interaction services
│   │   ├── /ipfs        # IPFS interaction services
│   │   └── /db          # Database services
│   ├── /utils         # Utility functions
│   ├── /graphql       # GraphQL schema and resolvers
│   └── app.js         # Express application setup
├── /test              # Test files
├── .env.example       # Example environment variables
├── .gitignore         # Git ignore file
├── package.json       # Project dependencies
└── README.md          # Project documentation
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
npm run dev
```

## API Documentation

### RESTful API Endpoints

#### Models

- `GET /api/models`: Get all models
- `GET /api/models/:id`: Get a specific model
- `POST /api/models`: Register a new model
- `PUT /api/models/:id`: Update a model
- `DELETE /api/models/:id`: Delete a model

#### Licenses

- `GET /api/licenses`: Get all licenses
- `GET /api/licenses/:id`: Get a specific license
- `POST /api/licenses`: Issue a new license
- `PUT /api/licenses/:id`: Update a license
- `DELETE /api/licenses/:id`: Revoke a license

#### Payments

- `GET /api/payments`: Get all payments
- `GET /api/payments/:id`: Get a specific payment
- `POST /api/payments`: Process a new payment

### GraphQL API

The GraphQL API provides a more flexible way to query the data. The schema includes:

- Models
- Licenses
- Payments
- Users

Example query:

```graphql
query {
  model(id: "1") {
    id
    name
    description
    owner {
      id
      name
    }
    licenses {
      id
      licensee {
        id
        name
      }
      licenseType
      accessLevel
      isActive
    }
  }
}
```

## Testing

Run tests:

```bash
npm test
```

## Deployment

Build the production version:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## License

MIT
