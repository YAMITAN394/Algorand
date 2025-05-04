const { gql } = require('apollo-server-express');

const typeDefs = gql`
  # User types
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    walletAddress: String
    profileImage: String
    bio: String
    website: String
    createdAt: String!
    updatedAt: String!
    models: [Model]
    licenses: [License]
  }

  input UserInput {
    name: String!
    email: String!
    password: String!
    walletAddress: String
    profileImage: String
    bio: String
    website: String
  }

  input UserUpdateInput {
    name: String
    email: String
    walletAddress: String
    profileImage: String
    bio: String
    website: String
    currentPassword: String
    newPassword: String
  }

  # Model types
  type Model {
    id: ID!
    name: String!
    description: String!
    tokenId: String!
    modelHash: String!
    metadataURI: String!
    modelURI: String!
    owner: User!
    category: String!
    tags: [String]
    framework: String!
    version: String!
    versionHistory: [VersionHistory]
    metrics: JSON
    isPublic: Boolean!
    status: String!
    downloads: Int!
    views: Int!
    rating: Rating
    createdAt: String!
    updatedAt: String!
    licenses: [License]
    payments: [Payment]
  }

  type VersionHistory {
    version: String!
    modelHash: String!
    timestamp: String!
    description: String
  }

  type Rating {
    average: Float!
    count: Int!
  }

  input ModelInput {
    name: String!
    description: String!
    tokenId: String!
    modelHash: String!
    metadataURI: String!
    modelURI: String!
    category: String
    tags: [String]
    framework: String
    version: String
    metrics: JSON
    isPublic: Boolean
  }

  input ModelUpdateInput {
    name: String
    description: String
    modelHash: String
    metadataURI: String
    modelURI: String
    category: String
    tags: [String]
    framework: String
    version: String
    metrics: JSON
    isPublic: Boolean
    status: String
  }

  input ModelFilterInput {
    category: String
    framework: String
    tags: [String]
    owner: ID
    isPublic: Boolean
    status: String
    search: String
  }

  # License types
  type License {
    id: ID!
    licenseId: String!
    model: Model!
    licensee: User!
    issuer: User!
    licenseType: String!
    accessLevel: String!
    issuedAt: String!
    expiresAt: String!
    isActive: Boolean!
    usageLimit: Int!
    usageCount: Int!
    price: Float!
    currency: String!
    paymentTransactionHash: String
    termsAndConditions: String
    customTerms: JSON
    revocationReason: String
    usageHistory: [UsageHistory]
    createdAt: String!
    updatedAt: String!
    payments: [Payment]
  }

  type UsageHistory {
    timestamp: String!
    operation: String!
    details: JSON
  }

  input LicenseInput {
    modelId: ID!
    licenseeId: ID!
    licenseType: String!
    accessLevel: String!
    expiresAt: String!
    usageLimit: Int
    price: Float
    currency: String
    termsAndConditions: String
    customTerms: JSON
  }

  input LicenseUpdateInput {
    expiresAt: String
    isActive: Boolean
    usageLimit: Int
    termsAndConditions: String
    customTerms: JSON
  }

  input LicenseFilterInput {
    modelId: ID
    licenseeId: ID
    issuerId: ID
    licenseType: String
    accessLevel: String
    isActive: Boolean
    expiresAfter: String
    expiresBefore: String
  }

  # Payment types
  type Payment {
    id: ID!
    transactionHash: String!
    model: Model!
    license: License
    payer: User!
    amount: Float!
    currency: String!
    status: String!
    paymentType: String!
    tokenAddress: String
    blockNumber: Int
    blockTimestamp: String
    gasUsed: Int
    effectiveGasPrice: Float
    platformFee: Float
    platformFeePercentage: Float
    distributions: [Distribution]
    metadata: JSON
    refundReason: String
    createdAt: String!
    updatedAt: String!
  }

  type Distribution {
    recipient: User!
    amount: Float!
    percentage: Float!
    transactionHash: String
    status: String!
  }

  input PaymentInput {
    modelId: ID!
    licenseId: ID
    amount: Float!
    currency: String!
    paymentType: String!
    tokenAddress: String
    transactionHash: String!
    metadata: JSON
  }

  input PaymentFilterInput {
    modelId: ID
    licenseId: ID
    payerId: ID
    status: String
    paymentType: String
    currency: String
    startDate: String
    endDate: String
  }

  # Custom scalar for JSON data
  scalar JSON

  # Queries
  type Query {
    # User queries
    me: User
    user(id: ID!): User
    users(limit: Int, offset: Int): [User]
    searchUsers(query: String!, limit: Int, offset: Int): [User]

    # Model queries
    model(id: ID!): Model
    models(
      filter: ModelFilterInput
      limit: Int
      offset: Int
      sortBy: String
      sortDirection: String
    ): [Model]
    modelByTokenId(tokenId: String!): Model
    modelByHash(modelHash: String!): Model
    searchModels(query: String!, limit: Int, offset: Int): [Model]
    featuredModels(limit: Int): [Model]
    trendingModels(limit: Int): [Model]
    recentModels(limit: Int): [Model]

    # License queries
    license(id: ID!): License
    licenses(
      filter: LicenseFilterInput
      limit: Int
      offset: Int
      sortBy: String
      sortDirection: String
    ): [License]
    licenseByLicenseId(licenseId: String!): License
    validateLicense(licenseId: String!, accessLevel: String!): Boolean

    # Payment queries
    payment(id: ID!): Payment
    payments(
      filter: PaymentFilterInput
      limit: Int
      offset: Int
      sortBy: String
      sortDirection: String
    ): [Payment]
    paymentByTransactionHash(transactionHash: String!): Payment
    modelRevenue(modelId: ID!, startDate: String, endDate: String): JSON
    userRevenue(userId: ID!, startDate: String, endDate: String): JSON
  }

  # Mutations
  type Mutation {
    # Auth mutations
    register(input: UserInput!): AuthPayload
    login(email: String!, password: String!): AuthPayload
    refreshToken(token: String!): AuthPayload
    forgotPassword(email: String!): Boolean
    resetPassword(token: String!, password: String!): Boolean
    changePassword(currentPassword: String!, newPassword: String!): Boolean

    # User mutations
    updateUser(input: UserUpdateInput!): User
    deleteUser: Boolean
    connectWallet(walletAddress: String!): User

    # Model mutations
    createModel(input: ModelInput!): Model
    updateModel(id: ID!, input: ModelUpdateInput!): Model
    deleteModel(id: ID!): Boolean
    transferModelOwnership(id: ID!, newOwnerId: ID!): Model
    rateModel(id: ID!, rating: Int!): Model
    incrementModelViews(id: ID!): Model
    incrementModelDownloads(id: ID!): Model

    # License mutations
    issueLicense(input: LicenseInput!): License
    updateLicense(id: ID!, input: LicenseUpdateInput!): License
    revokeLicense(id: ID!, reason: String): License
    renewLicense(id: ID!, duration: Int!): License
    recordLicenseUsage(id: ID!, operation: String!, details: JSON): License

    # Payment mutations
    createPayment(input: PaymentInput!): Payment
    updatePaymentStatus(id: ID!, status: String!): Payment
    refundPayment(id: ID!, reason: String!): Payment
    distributePayment(id: ID!): [Distribution]
    setPaymentSplit(modelId: ID!, recipients: [ID!]!, shares: [Int!]!): Boolean
  }

  # Auth payload
  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  # Subscription
  type Subscription {
    modelCreated: Model
    licenseIssued(modelId: ID): License
    paymentReceived(modelId: ID): Payment
  }
`;

module.exports = typeDefs;
