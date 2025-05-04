import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';

// Import reducers
import authReducer from './slices/authSlice';
import modelReducer from './slices/modelSlice';
import licenseReducer from './slices/licenseSlice';
import paymentReducer from './slices/paymentSlice';
import uiReducer from './slices/uiSlice';

// Combine reducers
const rootReducer = combineReducers({
  auth: authReducer,
  models: modelReducer,
  licenses: licenseReducer,
  payments: paymentReducer,
  ui: uiReducer,
});

// Configure store
const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['auth/login/fulfilled', 'auth/register/fulfilled'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['auth.user', 'models.selectedModel'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export default store;
