import React, { useState } from 'react';
import { Copy, Send, FileText, Settings, Workflow, Zap } from 'lucide-react';

interface TestPrompt {
  id: string;
  title: string;
  description: string;
  category: 'simple' | 'complex' | 'workflows' | 'policies';
  prompt: string;
  expectedTools: string[];
  complexity: 'low' | 'medium' | 'high';
}

interface TestPromptsPanelProps {
  onSendMessage: (message: string) => void;
  onClose: () => void;
}

const TestPromptsPanel: React.FC<TestPromptsPanelProps> = ({ onSendMessage, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('simple');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const testPrompts: TestPrompt[] = [
    // Simple Variable Creation
    {
      id: 'simple-variable',
      title: 'Simple Variable Creation',
      description: 'Create a basic single-line text variable',
      category: 'simple',
      prompt: 'Create a catalog item variable called "Employee Name" that accepts text input, is required, and has a maximum length of 100 characters.',
      expectedTools: ['servicenow-mcp:create-catalog-item-variable'],
      complexity: 'low'
    },
    {
      id: 'dropdown-variable',
      title: 'Dropdown Variable',
      description: 'Create a dropdown variable with predefined options',
      category: 'simple',
      prompt: 'Create a dropdown variable called "Department" with options: IT, HR, Finance, Marketing, Operations. Make it required and set the default value to IT.',
      expectedTools: ['servicenow-mcp:create-catalog-item-variable'],
      complexity: 'low'
    },
    {
      id: 'reference-variable',
      title: 'Reference Variable',
      description: 'Create a reference variable linking to another table',
      category: 'simple',
      prompt: 'Create a reference variable called "Manager" that references the sys_user table and is filtered to show only users with the manager role.',
      expectedTools: ['servicenow-mcp:create-catalog-item-variable'],
      complexity: 'medium'
    },

    // Complex Multi-Variable Catalog Item
    {
      id: 'laptop-request',
      title: 'Laptop Request Form',
      description: 'Complete laptop request catalog item with multiple variables',
      category: 'complex',
      prompt: `Create a complete laptop request catalog item with the following specifications:

Catalog Item Details:
- Name: "Laptop Request"
- Short Description: "Request a new laptop for employees"
- Category: "Hardware"
- Workflow: "Laptop Provisioning Workflow"

Variables needed:
1. Employee Information section:
   - Employee Name (text, required, max 100 chars)
   - Employee ID (text, required, max 20 chars)
   - Department (dropdown: IT, HR, Finance, Marketing, Operations)
   - Manager (reference to sys_user table, manager role only)

2. Laptop Specifications section:
   - Laptop Type (dropdown: Standard Business, High Performance, Developer Workstation)
   - Operating System (dropdown: Windows 11, macOS, Ubuntu Linux)
   - RAM (dropdown: 8GB, 16GB, 32GB, 64GB)
   - Storage (dropdown: 256GB SSD, 512GB SSD, 1TB SSD, 2TB SSD)
   - Additional Software (multi-line text, optional)

3. Delivery Information section:
   - Delivery Location (dropdown: Office, Home, Client Site)
   - Delivery Address (text area, conditional on delivery location)
   - Rush Delivery (checkbox)
   - Preferred Delivery Date (date picker, minimum 3 days from today)

4. Justification section:
   - Business Justification (text area, required, max 500 chars)
   - Budget Code (text, required, pattern validation for format: DEPT-YYYY-####)

Please create this step by step, showing each variable creation clearly.`,
      expectedTools: [
        'servicenow-mcp:create-catalog-item',
        'servicenow-mcp:create-catalog-item-variable'
      ],
      complexity: 'high'
    },

    // UI Policies and Client Scripts
    {
      id: 'conditional-fields',
      title: 'Conditional Field Display',
      description: 'Create UI policies for conditional field visibility',
      category: 'policies',
      prompt: `For the laptop request form we created, add the following UI policies and client scripts:

UI Policies:
1. When "Laptop Type" is "Developer Workstation":
   - Show additional field "Development Tools" (multi-select: Visual Studio, IntelliJ, Docker, Git, NodeJS)
   - Make RAM minimum 16GB
   - Make Storage minimum 512GB SSD

2. When "Delivery Location" is "Home" or "Client Site":
   - Make "Delivery Address" visible and required
   - Show warning message about security policies

3. When "Rush Delivery" is checked:
   - Show warning about additional costs
   - Make "Business Justification" more prominent

Client Scripts:
1. Budget Code validation:
   - Real-time validation of format DEPT-YYYY-####
   - Show error if format is incorrect
   - Auto-populate department based on user's department

2. Delivery Date validation:
   - Prevent selection of weekends
   - Prevent selection of dates less than 3 days from today
   - Show business days only for rush delivery

Please implement these policies and scripts with proper error handling.`,
      expectedTools: [
        'servicenow-mcp:create-ui-policy',
        'servicenow-mcp:create-client-script'
      ],
      complexity: 'high'
    },

    // Full Workflow
    {
      id: 'approval-workflow',
      title: 'Multi-Level Approval Workflow',
      description: 'Create a complete approval workflow with multiple stages',
      category: 'workflows',
      prompt: `Create a comprehensive approval workflow for the laptop request with the following stages:

Workflow: "Laptop Provisioning Workflow"

Stage 1: Manager Approval
- Route to requesting user's manager
- If laptop cost > $2000, require additional VP approval
- Auto-approve if manager and requestor are the same person
- Escalate after 3 business days if no response

Stage 2: IT Security Review (conditional)
- Required if delivery location is "Home" or "Client Site"
- Route to IT Security team
- Check against security policies
- May require additional security software installation

Stage 3: Budget Approval (conditional)
- Required if total cost > $1500
- Route to Finance team member based on department
- Verify budget code and availability
- May request cost center manager approval

Stage 4: Procurement
- Once all approvals are complete
- Create purchase order
- Send to preferred vendor based on laptop type
- Track delivery status

Stage 5: Delivery & Setup
- Schedule delivery with employee
- Create setup appointment with IT
- Generate welcome email with setup instructions
- Update asset management system

Notifications needed:
- Approval requests with summary and direct action buttons
- Status updates to requestor at each stage
- Escalation notifications for overdue approvals
- Completion notification with tracking information

Please create this workflow with proper error handling, rollback procedures, and audit logging.`,
      expectedTools: [
        'servicenow-mcp:create-workflow',
        'servicenow-mcp:create-approval-rule',
        'servicenow-mcp:create-notification'
      ],
      complexity: 'high'
    },

    // Integration Testing
    {
      id: 'integration-test',
      title: 'End-to-End Integration Test',
      description: 'Test complete flow from creation to approval',
      category: 'workflows',
      prompt: `Let's test the complete laptop request process end-to-end:

1. First, create a test user account:
   - Name: "John Tester"
   - Department: "IT"
   - Role: "Employee"
   - Manager: [assign to any existing manager]

2. Submit a laptop request as this user:
   - Laptop Type: "High Performance"
   - OS: "Windows 11"
   - RAM: "32GB"
   - Storage: "1TB SSD"
   - Delivery Location: "Home"
   - Delivery Address: "123 Test St, Test City, TC 12345"
   - Rush Delivery: Yes
   - Justification: "Working on critical client project requiring high-performance computing"
   - Budget Code: "IT-2024-1001"

3. Track the request through the approval workflow:
   - Show current stage
   - Display pending approvers
   - Show expected completion timeline

4. Simulate the approval process:
   - Approve at manager level
   - Show IT security review (due to home delivery)
   - Show budget approval (due to cost)
   - Move to procurement stage

5. Generate status report showing:
   - Request details
   - Approval history with timestamps
   - Current status
   - Next steps
   - Estimated delivery date

This will test our entire MCP integration, UI components, workflows, and data flow.`,
      expectedTools: [
        'servicenow-mcp:create-user',
        'servicenow-mcp:submit-catalog-request',
        'servicenow-mcp:query-approval-status',
        'servicenow-mcp:simulate-approval',
        'servicenow-mcp:generate-status-report'
      ],
      complexity: 'high'
    },

    // Error Testing
    {
      id: 'error-scenarios',
      title: 'Error Handling Test',
      description: 'Test various error conditions and recovery',
      category: 'workflows',
      prompt: `Test error handling and recovery scenarios:

1. Invalid Data Tests:
   - Try to create a variable with invalid characters in the name
   - Submit a catalog request with missing required fields
   - Use an invalid budget code format
   - Try to set a delivery date in the past

2. Permission Tests:
   - Try to create a catalog item without proper permissions
   - Attempt to approve a request you're not authorized for
   - Try to access restricted workflow stages

3. System Integration Tests:
   - Test behavior when ServiceNow is temporarily unavailable
   - Test with network connectivity issues
   - Test with malformed MCP responses

4. Data Consistency Tests:
   - Test concurrent modifications to the same catalog item
   - Test workflow conflicts (multiple approvers acting simultaneously)
   - Test rollback scenarios when workflow fails mid-process

5. UI Error Tests:
   - Test form submission with JavaScript disabled
   - Test with very long text inputs
   - Test special characters in text fields

Please run through these scenarios and show how our error handling and UI display behaves in each case. Focus on graceful degradation and user-friendly error messages.`,
      expectedTools: [
        'servicenow-mcp:test-invalid-input',
        'servicenow-mcp:test-permissions',
        'servicenow-mcp:test-system-availability'
      ],
      complexity: 'medium'
    }
  ];

  const categories = [
    { id: 'simple', label: 'Simple Variables', icon: FileText, color: 'bg-green-100 text-green-800' },
    { id: 'complex', label: 'Complex Items', icon: Settings, color: 'bg-blue-100 text-blue-800' },
    { id: 'policies', label: 'UI Policies', icon: Zap, color: 'bg-yellow-100 text-yellow-800' },
    { id: 'workflows', label: 'Workflows', icon: Workflow, color: 'bg-purple-100 text-purple-800' }
  ];

  const filteredPrompts = testPrompts.filter(prompt => 
    selectedCategory === 'all' || prompt.category === selectedCategory
  );

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ServiceNow Test Prompts</h2>
            <p className="text-sm text-gray-600 mt-1">
              Pre-built prompts for testing catalog item creation, workflows, and MCP integration
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-gray-50">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Categories</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                    selectedCategory === 'all' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'hover:bg-gray-200'
                  }`}
                >
                  All Prompts ({testPrompts.length})
                </button>
                {categories.map((category) => {
                  const count = testPrompts.filter(p => p.category === category.id).length;
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center space-x-2 ${
                        selectedCategory === category.id 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{category.label} ({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="p-6">
              <div className="space-y-6">
                {filteredPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {prompt.title}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getComplexityColor(prompt.complexity)}`}>
                            {prompt.complexity}
                          </span>
                        </div>
                        <p className="text-gray-600 mb-3">{prompt.description}</p>
                        
                        {/* Expected Tools */}
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Expected Tools:</h4>
                          <div className="flex flex-wrap gap-2">
                            {prompt.expectedTools.map((tool) => (
                              <span
                                key={tool}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Prompt Text */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700">Test Prompt:</h4>
                        <button
                          onClick={() => copyToClipboard(prompt.prompt, prompt.id)}
                          className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700"
                        >
                          <Copy className="w-4 h-4" />
                          <span>{copiedId === prompt.id ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                        {prompt.prompt}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => copyToClipboard(prompt.prompt, prompt.id)}
                        className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy Prompt</span>
                      </button>
                      <button
                        onClick={() => onSendMessage(prompt.prompt)}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        <span>Send to Chat</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredPrompts.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500">No prompts found for the selected category.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestPromptsPanel;