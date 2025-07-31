const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface ActivityLog {
  timestamp: Date;
  operations: Array<{
    tool: string;
    arguments: any;
    success: boolean;
    result?: any;
  }>;
}

export interface ActivityStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  toolsUsed: string[];
  operationsToday: number;
  operationsThisWeek: number;
}

class ActivityService {
  private getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async getActivity(limit: number = 100, offset: number = 0): Promise<ActivityLog[]> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/activity?limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders()
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert timestamp strings back to Date objects
      return data.activities.map((activity: any) => ({
        ...activity,
        timestamp: new Date(activity.timestamp)
      }));
    } catch (error) {
      console.error('Error fetching activity:', error);
      throw error;
    }
  }

  async getActivityStats(): Promise<ActivityStats> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activity/stats`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.stats;
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      throw error;
    }
  }
}

export default new ActivityService();