const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: any[];
  model?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  totalTokensUsed: number;
  contextLimit: number;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
  _count?: {
    messages: number;
  };
}

export interface CreateSessionData {
  title?: string;
  model: string;
  projectId?: string;
}

class ChatService {
  private getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async getSessions(limit: number = 50, offset: number = 0): Promise<ChatSession[]> {
    try {
      console.log('🔄 ChatService: Fetching sessions...', { limit, offset });
      console.log('🔄 ChatService: API URL:', `${API_BASE_URL}/api/chats?limit=${limit}&offset=${offset}`);
      console.log('🔄 ChatService: Headers:', this.getAuthHeaders());
      
      const response = await fetch(
        `${API_BASE_URL}/api/chats?limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders()
        }
      );

      console.log('🔄 ChatService: Response status:', response.status);
      console.log('🔄 ChatService: Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ChatService: Error response body:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔄 ChatService: Response data:', data);
      
      // Convert timestamp strings back to Date objects
      const sessions = data.sessions.map((session: any) => ({
        ...session,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt)
      }));
      
      console.log('🔄 ChatService: Processed sessions:', sessions);
      return sessions;
    } catch (error) {
      console.error('❌ ChatService: Error fetching chat sessions:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${sessionId}`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert timestamp strings back to Date objects
      const session = {
        ...data.session,
        createdAt: new Date(data.session.createdAt),
        updatedAt: new Date(data.session.updatedAt),
        messages: data.session.messages?.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.createdAt)
        })) || []
      };

      return session;
    } catch (error) {
      console.error('Error fetching chat session:', error);
      throw error;
    }
  }

  async createSession(data: CreateSessionData): Promise<ChatSession> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        ...result.session,
        createdAt: new Date(result.session.createdAt),
        updatedAt: new Date(result.session.updatedAt)
      };
    } catch (error) {
      console.error('Error creating chat session:', error);
      throw error;
    }
  }

  async updateSession(sessionId: string, data: { title?: string }): Promise<ChatSession> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${sessionId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        ...result.session,
        createdAt: new Date(result.session.createdAt),
        updatedAt: new Date(result.session.updatedAt)
      };
    } catch (error) {
      console.error('Error updating chat session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${sessionId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting chat session:', error);
      throw error;
    }
  }

  async getCurrentSession(): Promise<ChatSession | null> {
    try {
      console.log('🔄 ChatService: Getting current session...');
      const sessions = await this.getSessions(1, 0);
      console.log('🔄 ChatService: Got sessions:', sessions);
      const currentSession = sessions.length > 0 ? sessions[0] : null;
      console.log('🔄 ChatService: Current session result:', currentSession);
      return currentSession;
    } catch (error) {
      console.error('❌ ChatService: Error getting current session:', error);
      return null;
    }
  }
}

export default new ChatService();