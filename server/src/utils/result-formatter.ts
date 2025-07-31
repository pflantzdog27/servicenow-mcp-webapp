export class ResultFormatter {
  constructor(private instanceUrl: string) {}
  
  formatToolResult(toolName: string, result: any): string {
    // Handle error cases first
    if (result.isError || result.error) {
      return this.formatErrorResult(toolName, result);
    }

    // Format based on tool type
    switch (toolName) {
      case 'servicenow-mcp:create-catalog-item':
        return this.formatCatalogItemResult(result);
      case 'servicenow-mcp:query-records':
        return this.formatQueryResult(result);
      case 'servicenow-mcp:create-incident':
        return this.formatIncidentResult(result);
      case 'servicenow-mcp:update-record':
        return this.formatUpdateResult(result);
      case 'servicenow-mcp:get-record':
        return this.formatGetRecordResult(result);
      case 'servicenow-mcp:create-workflow':
        return this.formatWorkflowResult(result);
      case 'servicenow-mcp:create-variable':
        return this.formatVariableResult(result);
      case 'servicenow-mcp:test-connection':
        return this.formatConnectionTestResult(result);
      default:
        return this.formatGenericResult(toolName, result);
    }
  }
  
  private formatErrorResult(toolName: string, result: any): string {
    const errorMessage = result.error || result.content?.[0]?.text || 'Unknown error occurred';
    return `❌ **${this.getToolDisplayName(toolName)} Failed**\n\n${errorMessage}`;
  }
  
  private formatCatalogItemResult(result: any): string {
    const content = this.extractContent(result);
    const sysId = this.extractSysId(content);
    
    // Try to extract item details from the content
    const nameMatch = content.match(/name['":\s]*([^",\n]+)/i);
    const categoryMatch = content.match(/category['":\s]*([^",\n]+)/i);
    
    const name = nameMatch ? nameMatch[1].replace(/['"]/g, '') : 'New Catalog Item';
    const category = categoryMatch ? categoryMatch[1].replace(/['"]/g, '') : 'Unknown Category';
    
    let formatted = `✅ **Catalog Item Created Successfully**\n\n`;
    formatted += `**Name:** ${name}\n`;
    formatted += `**Category:** ${category}\n`;
    
    if (sysId) {
      const url = `${this.instanceUrl}/nav_to.do?uri=sc_cat_item.do?sys_id=${sysId}`;
      formatted += `\n[**View in ServiceNow →**](${url})`;
    }
    
    return formatted;
  }
  
  private formatQueryResult(result: any): string {
    const content = this.extractContent(result);
    
    // Try to parse JSON response for structured data
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.result && Array.isArray(data.result)) {
          return this.formatRecordList(data.result, data.table || 'records');
        }
      }
    } catch (e) {
      // Fall back to text parsing
    }
    
    // Parse text-based results
    const recordPattern = /(\w+\d+)[^\n]*([^\n]+)/g;
    const matches = Array.from(content.matchAll(recordPattern));
    
    if (matches.length === 0) {
      return '📭 **No records found** matching your criteria.';
    }
    
    let formatted = `📋 **Found ${matches.length} record(s):**\n\n`;
    
    matches.forEach((match, index) => {
      const recordNumber = match[1];
      const description = match[2].trim();
      formatted += `${index + 1}. **${recordNumber}** - ${description}\n`;
    });
    
    return formatted;
  }
  
  private formatIncidentResult(result: any): string {
    const content = this.extractContent(result);
    const sysId = this.extractSysId(content);
    
    // Extract incident details
    const numberMatch = content.match(/number['":\s]*([^",\n]+)/i) || 
                       content.match(/(INC\d+)/i);
    const descriptionMatch = content.match(/short_description['":\s]*([^",\n]+)/i) ||
                            content.match(/description['":\s]*([^",\n]+)/i);
    
    const number = numberMatch ? numberMatch[1].replace(/['"]/g, '') : 'New Incident';
    const description = descriptionMatch ? 
      descriptionMatch[1].replace(/['"]/g, '').substring(0, 100) : 
      'Incident created';
    
    let formatted = `🎫 **Incident Created Successfully**\n\n`;
    formatted += `**Number:** ${number}\n`;
    formatted += `**Description:** ${description}\n`;
    
    if (sysId) {
      const url = `${this.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`;
      formatted += `\n[**Open Incident →**](${url})`;
    }
    
    return formatted;
  }
  
  private formatUpdateResult(result: any): string {
    const content = this.extractContent(result);
    const sysId = this.extractSysId(content);
    
    let formatted = `✅ **Record Updated Successfully**\n\n`;
    
    // Try to extract what was updated
    const updatePattern = /updated?\s+([^,\n]+)/i;
    const updateMatch = content.match(updatePattern);
    
    if (updateMatch) {
      formatted += `**Changes:** ${updateMatch[1]}\n`;
    }
    
    if (sysId) {
      const url = `${this.instanceUrl}/nav_to.do?uri=sys_id=${sysId}`;
      formatted += `\n[**View Record →**](${url})`;
    }
    
    return formatted;
  }
  
  private formatGetRecordResult(result: any): string {
    const content = this.extractContent(result);
    
    try {
      // Try to parse as JSON for structured display
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const record = JSON.parse(jsonMatch[0]);
        return this.formatSingleRecord(record);
      }
    } catch (e) {
      // Fall back to text display
    }
    
    return `📄 **Record Details:**\n\n\`\`\`\n${content}\n\`\`\``;
  }
  
  private formatWorkflowResult(result: any): string {
    const content = this.extractContent(result);
    const sysId = this.extractSysId(content);
    
    const nameMatch = content.match(/name['":\s]*([^",\n]+)/i);
    const name = nameMatch ? nameMatch[1].replace(/['"]/g, '') : 'New Workflow';
    
    let formatted = `🔄 **Workflow Created Successfully**\n\n`;
    formatted += `**Name:** ${name}\n`;
    
    if (sysId) {
      const url = `${this.instanceUrl}/nav_to.do?uri=wf_workflow.do?sys_id=${sysId}`;
      formatted += `\n[**View Workflow →**](${url})`;
    }
    
    return formatted;
  }
  
  private formatVariableResult(result: any): string {
    const content = this.extractContent(result);
    
    const nameMatch = content.match(/name['":\s]*([^",\n]+)/i);
    const typeMatch = content.match(/type['":\s]*([^",\n]+)/i);
    
    const name = nameMatch ? nameMatch[1].replace(/['"]/g, '') : 'New Variable';
    const type = typeMatch ? typeMatch[1].replace(/['"]/g, '') : 'Unknown Type';
    
    return `📝 **Form Variable Created**\n\n**Name:** ${name}\n**Type:** ${type}`;
  }
  
  private formatConnectionTestResult(result: any): string {
    const content = this.extractContent(result);
    
    if (content.toLowerCase().includes('success') || 
        content.toLowerCase().includes('connected')) {
      return `✅ **ServiceNow Connection Test Successful**\n\nYour ServiceNow instance is accessible and responding properly.`;
    } else {
      return `❌ **ServiceNow Connection Test Failed**\n\n${content}`;
    }
  }
  
  private formatGenericResult(toolName: string, result: any): string {
    const content = this.extractContent(result);
    const displayName = this.getToolDisplayName(toolName);
    
    if (content.toLowerCase().includes('success') ||
        content.toLowerCase().includes('created') ||
        content.toLowerCase().includes('updated')) {
      return `✅ **${displayName} Completed Successfully**\n\n${content}`;
    } else {
      return `📋 **${displayName} Result:**\n\n${content}`;
    }
  }
  
  private formatRecordList(records: any[], tableName: string): string {
    if (records.length === 0) {
      return `📭 **No ${tableName} found** matching your criteria.`;
    }
    
    let formatted = `📋 **Found ${records.length} ${tableName}:**\n\n`;
    
    records.forEach((record, index) => {
      const number = record.number || record.name || record.sys_id?.substring(0, 8);
      const description = record.short_description || 
                         record.description || 
                         record.title || 
                         'No description';
      
      formatted += `${index + 1}. **${number}** - ${description.substring(0, 80)}\n`;
      
      if (record.sys_id) {
        const url = `${this.instanceUrl}/nav_to.do?uri=${tableName}.do?sys_id=${record.sys_id}`;
        formatted += `   [View Record →](${url})\n`;
      }
      formatted += '\n';
    });
    
    return formatted;
  }
  
  private formatSingleRecord(record: any): string {
    let formatted = `📄 **Record Details:**\n\n`;
    
    // Show key fields first
    const keyFields = ['number', 'name', 'title', 'short_description', 'state', 'priority'];
    const displayedFields = new Set();
    
    keyFields.forEach(field => {
      if (record[field] !== undefined) {
        const label = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        formatted += `**${label}:** ${record[field]}\n`;
        displayedFields.add(field);
      }
    });
    
    // Show other fields
    Object.entries(record).forEach(([key, value]) => {
      if (!displayedFields.has(key) && key !== 'sys_id' && value !== null && value !== '') {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        formatted += `**${label}:** ${value}\n`;
      }
    });
    
    if (record.sys_id) {
      const url = `${this.instanceUrl}/nav_to.do?uri=sys_id=${record.sys_id}`;
      formatted += `\n[**View in ServiceNow →**](${url})`;
    }
    
    return formatted;
  }
  
  private extractContent(result: any): string {
    if (typeof result === 'string') return result;
    if (result.content?.[0]?.text) return result.content[0].text;
    if (result.message) return result.message;
    if (result.text) return result.text;
    return JSON.stringify(result, null, 2);
  }
  
  private extractSysId(content: string): string | null {
    const sysIdMatch = content.match(/sys_id['\":\\s]*([a-f0-9]{32})/i);
    return sysIdMatch ? sysIdMatch[1] : null;
  }
  
  private getToolDisplayName(toolName: string): string {
    return toolName
      .replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}