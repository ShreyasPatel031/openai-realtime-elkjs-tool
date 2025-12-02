// Manual mock for Firebase to avoid import.meta.env issues in Jest tests
export const auth = {};
export const db = {};
export const initializeApp = jest.fn();
export const getAuth = jest.fn(() => ({}));
export const getFirestore = jest.fn(() => ({}));
export const GoogleAuthProvider = jest.fn();


