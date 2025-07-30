import React from 'react';
import { Socket } from 'socket.io-client';
import { 
  AlertCircle, 
  GitPullRequest, 
  Package, 
  Users, 
  FileText,
  Plus
} from 'lucide-react';

interface SidebarProps {
  socket: Socket | null;
}

const quickActions = [
  {
    id: 'create-incident',
    label: 'Create Incident',
    icon: AlertCircle,
    description: 'Report and track issues',
    prompt: 'Create a new incident for '
  },
  {
    id: 'update-change',
    label: 'Update Change Request',
    icon: GitPullRequest,
    description: 'Modify change requests',
    prompt: 'Update change request '
  },
  {
    id: 'new-catalog-item',
    label: 'New Catalog Item',
    icon: Package,
    description: 'Add service catalog items',
    prompt: 'Create a new catalog item for '
  },
  {
    id: 'manage-groups',
    label: 'Manage Groups',
    icon: Users,
    description: 'User and group management',
    prompt: 'Help me manage groups for '
  },
  {
    id: 'generate-report',
    label: 'Generate Report',
    icon: FileText,
    description: 'Create custom reports',
    prompt: 'Generate a report for '
  }
];

const templates = [
  {
    id: 'office-supplies',
    name: 'Office Supplies Request',
    description: 'Standard office supply catalog item'
  },
  {
    id: 'hardware-refresh',
    name: 'Hardware Refresh',
    description: 'Computer replacement workflow'
  },
  {
    id: 'access-request',
    name: 'Access Request Form',
    description: 'System access request template'
  }
];

const Sidebar: React.FC<SidebarProps> = ({ socket }) => {
  const handleQuickAction = (action: typeof quickActions[0]) => {
    if (socket) {
      socket.emit('quick_action', {
        actionId: action.id,
        prompt: action.prompt
      });
    }
  };

  const handleTemplate = (template: typeof templates[0]) => {
    if (socket) {
      socket.emit('template_selected', {
        templateId: template.id,
        name: template.name
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Quick Actions Section */}
      <div className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="space-y-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleQuickAction(action)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg bg-surface-light hover:bg-gray-600 transition-colors text-left"
            >
              <action.icon className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <div className="text-white text-sm font-medium">{action.label}</div>
                <div className="text-gray-400 text-xs">{action.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Templates Section */}
      <div className="px-6 pb-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Templates</h2>
          <button className="p-1 rounded hover:bg-surface-light">
            <Plus className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplate(template)}
              className="w-full p-3 rounded-lg bg-surface-light hover:bg-gray-600 transition-colors text-left"
            >
              <div className="text-white text-sm font-medium mb-1">{template.name}</div>
              <div className="text-gray-400 text-xs">{template.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-700">
        <div className="text-xs text-gray-500 text-center">
          ServiceNow MCP Integration
        </div>
      </div>
    </div>
  );
};

export default Sidebar;