import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

// GraphQL endpoint
const GRAPHQL_URL = process.env.REACT_APP_GRAPHQL_URL || 'http://localhost:4000/graphql';

// Create an http link
const httpLink = createHttpLink({
  uri: GRAPHQL_URL,
});

// Create an auth link
const authLink = setContext((_, { headers }) => {
  // Get the token from local storage
  const token = localStorage.getItem('token');
  
  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

// Create an error link
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
      
      // Handle authentication errors
      if (message === 'Not authenticated' || message === 'Invalid token') {
        // Clear token from local storage
        localStorage.removeItem('token');
        
        // Redirect to login page if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    });
  }
  
  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

// Create cache
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        models: {
          // Merge function for paginated queries
          keyArgs: ['filter'],
          merge(existing = { models: [], total: 0 }, incoming) {
            return {
              models: [...(existing.models || []), ...(incoming.models || [])],
              total: incoming.total,
            };
          },
        },
        licenses: {
          keyArgs: ['filter'],
          merge(existing = { licenses: [], total: 0 }, incoming) {
            return {
              licenses: [...(existing.licenses || []), ...(incoming.licenses || [])],
              total: incoming.total,
            };
          },
        },
        payments: {
          keyArgs: ['filter'],
          merge(existing = { payments: [], total: 0 }, incoming) {
            return {
              payments: [...(existing.payments || []), ...(incoming.payments || [])],
              total: incoming.total,
            };
          },
        },
      },
    },
    User: {
      fields: {
        models: {
          merge(existing = [], incoming) {
            return incoming;
          },
        },
        licenses: {
          merge(existing = [], incoming) {
            return incoming;
          },
        },
      },
    },
    Model: {
      fields: {
        licenses: {
          merge(existing = [], incoming) {
            return incoming;
          },
        },
        payments: {
          merge(existing = [], incoming) {
            return incoming;
          },
        },
      },
    },
  },
});

// Create Apollo client
const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});

export default client;
