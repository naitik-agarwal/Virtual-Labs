import { io } from 'socket.io-client';

const BACKEND_URL = 'https://virtual-lab-backend-27yv.onrender.com';

// Create a single socket instance to be shared across the app
export const socket = io(BACKEND_URL, {
  autoConnect: false, // We will manually connect when the canvas loads
});