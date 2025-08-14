import React from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../../lib/firebase';

interface SignInProps {
  onClose: () => void;
}

const SignIn: React.FC<SignInProps> = ({ onClose }) => {
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      // `onClose` will be called by the auth state listener in the parent component
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold mb-4">Why Sign In?</h2>
        <p className="mb-6 text-left">
          We use Google Sign-In to securely save your session and allow for future collaboration features.
          <br/><br/>
          Please sign in with your Google account to continue.
        </p>
        <button
          onClick={handleSignIn}
          className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Sign In with Google
        </button>
      </div>
    </div>
  );
};

export default SignIn;
