import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { 
  Activity, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Download
} from 'lucide-react';

interface ActivityLog {
  timestamp: Date;
  operations: Array<{
    tool: string;
    arguments: any;
    success: boolean;
  }>;
}

interface ActivityPanelProps {
  socket: Socket | null;
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({ socket }) => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleActivityLog = (data: ActivityLog) => {
      setActivities(prev => [
        { ...data, timestamp: new Date(data.timestamp) },
        ...prev
      ].slice(0, 100)); // Keep only last 100 activities
    };

    socket.on('activity:log', handleActivityLog);

    return () => {
      socket.off('activity:log', handleActivityLog);
    };
  }, [socket]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return 'Today';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const exportActivities = () => {
    const dataStr = JSON.stringify(activities, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `servicenow_activity_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const groupActivitiesByDate = () => {
    const groups: { [key: string]: ActivityLog[] } = {};
    
    activities.forEach(activity => {
      const dateKey = activity.timestamp.toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });
    
    return Object.entries(groups).sort(([a], [b]) => 
      new Date(b).getTime() - new Date(a).getTime()
    );
  };

  const groupedActivities = groupActivitiesByDate();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          </div>
          <button
            onClick={exportActivities}
            disabled={activities.length === 0}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export activity log"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Track all ServiceNow operations
        </p>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activities.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No activity yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Operations will appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {groupedActivities.map(([dateString, dayActivities]) => (
              <div key={dateString}>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="text-sm font-medium text-gray-300">
                    {formatDate(new Date(dateString))}
                  </div>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                
                <div className="space-y-3">
                  {dayActivities.map((activity, index) => (
                    <div key={index} className="bg-surface-light rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">
                          {formatTime(activity.timestamp)}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {activity.operations.map((operation, opIndex) => (
                          <div key={opIndex} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {operation.success ? (
                                <CheckCircle className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-sm text-white font-medium">
                                {operation.tool}
                              </span>
                            </div>
                            
                            {/* Show key arguments */}
                            {operation.arguments && (
                              <div className="text-xs text-gray-400">
                                {Object.entries(operation.arguments)
                                  .slice(0, 1) // Show only first argument
                                  .map(([key, value]) => (
                                    <span key={key}>
                                      {typeof value === 'string' 
                                        ? value.length > 20 
                                          ? value.substring(0, 20) + '...' 
                                          : value
                                        : JSON.stringify(value)
                                      }
                                    </span>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="text-xs text-gray-500 text-center">
          {activities.length} operation{activities.length !== 1 ? 's' : ''} logged
        </div>
      </div>
    </div>
  );
};

export default ActivityPanel;