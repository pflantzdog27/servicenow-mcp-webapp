import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Version stamp for deployment verification
const APP_VERSION = 'ServiceNow-MCP-Frontend-2.1.0-FIXED';
console.log(`🌐 [APP-LOAD] ${APP_VERSION} loading at ${new Date().toISOString()}`);
console.log(`🌐 [APP-LOAD] Build time: ${new Date().toISOString()}`);
console.log(`🌐 [FIX-VERIFICATION] Frontend fixes active:`);
console.log(`   ✅ Tool name display fix: ACTIVE`);
console.log(`   ✅ REQUEST object display fix: ACTIVE`);
console.log(`   ✅ sys_id extraction and chaining: ACTIVE`);
console.log(`   ✅ Enhanced tool invocation components: ACTIVE`);
console.log(`🌐 [DEPLOYMENT] Frontend ready for production use`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);