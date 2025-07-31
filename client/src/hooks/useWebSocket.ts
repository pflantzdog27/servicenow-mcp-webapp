import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

export const useWebSocket = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Cleanup existing socket if any
    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
    }

    // Only connect if user is authenticated and auth is not loading
    if (!isAuthenticated || authLoading) {
      if (!isAuthenticated && !authLoading) {
        console.log('User not authenticated, websocket connection skipped');
      }
      return;
    }

    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      console.log('No auth token found, websocket connection skipped');
      return;
    }

    console.log('Establishing websocket connection...');
    const newSocket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      auth: {
        token: token
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      // If it's an auth error, the auth context should handle the redirect
      if (error.message.includes('Authentication')) {
        console.warn('WebSocket authentication failed');
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [isAuthenticated, authLoading]); // React to authentication changes

  return socket;
};