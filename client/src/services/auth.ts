export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
}

class AuthService {
  private baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // Get stored token
  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  // Store token
  setToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  // Remove token
  removeToken(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  // Get stored user
  getUser(): User | null {
    const userStr = localStorage.getItem('auth_user');
    return userStr ? JSON.parse(userStr) : null;
  }

  // Store user
  setUser(user: User): void {
    localStorage.setItem('auth_user', JSON.stringify(user));
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  }

  // Register new user
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Registration failed');
    }

    // Store token and user
    this.setToken(result.token);
    this.setUser(result.user);

    return result;
  }

  // Login user
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Login failed');
    }

    // Store token and user
    this.setToken(result.token);
    this.setUser(result.user);

    return result;
  }

  // Logout user
  async logout(): Promise<void> {
    const token = this.getToken();
    
    if (token) {
      try {
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Logout request failed:', error);
      }
    }

    // Always clear local storage
    this.removeToken();
  }

  // Get current user from server
  async getCurrentUser(): Promise<User> {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        this.removeToken();
        throw new Error('Authentication expired');
      }
      throw new Error(result.error || 'Failed to get user');
    }

    this.setUser(result.user);
    return result.user;
  }

  // Update password
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${this.baseUrl}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Password update failed');
    }
  }

  // Update profile
  async updateProfile(data: { name?: string; avatar?: string }): Promise<User> {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${this.baseUrl}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Profile update failed');
    }

    this.setUser(result.user);
    return result.user;
  }

  // Get auth headers for API requests
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}

// Authenticated fetch wrapper
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = authService.getToken();
  
  if (!token) {
    throw new Error('No authentication token');
  }

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };

  // Add any existing headers
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  }

  // Only add Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // Handle authentication errors
  if (response.status === 401) {
    authService.removeToken();
    window.location.href = '/login';
    throw new Error('Authentication expired');
  }

  return response;
};

export const authService = new AuthService();
export default authService;