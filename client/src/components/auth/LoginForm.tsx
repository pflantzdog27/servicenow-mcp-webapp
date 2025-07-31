import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Activity, Zap, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const LoginForm: React.FC = () => {
  const { login, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(formData);
      // Navigation will happen automatically via useEffect
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Branding and Abstract Shapes */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-blue-600/10 to-purple-600/20">
        {/* Background Abstract Shapes */}
        <div className="absolute inset-0">
          {/* Large circle */}
          <div className="absolute top-20 right-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          {/* Medium circle */}
          <div className="absolute bottom-32 left-16 w-64 h-64 bg-blue-500/15 rounded-full blur-2xl" />
          {/* Small circles */}
          <div className="absolute top-1/3 left-1/3 w-32 h-32 bg-purple-500/20 rounded-full blur-xl" />
          <div className="absolute bottom-1/4 right-1/3 w-24 h-24 bg-primary/25 rounded-full blur-lg" />
          
          {/* Geometric shapes */}
          <div className="absolute top-1/4 left-20 w-16 h-16 bg-primary/20 rotate-45 rounded-lg" />
          <div className="absolute bottom-1/3 right-24 w-12 h-12 bg-blue-500/30 rotate-12 rounded-md" />
          <div className="absolute top-2/3 left-1/4 w-8 h-8 bg-purple-500/25 rotate-45" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16">
          {/* Logo */}
          <div className="flex items-center mb-8">
            <img 
              src="/assets/nowdev-logo.png" 
              alt="NOWdev.ai" 
              className="h-12 w-auto mr-4"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">NOWdev.ai</h1>
              <p className="text-primary text-sm">AI-powered ServiceNow development</p>
            </div>
          </div>
          
          {/* Heading */}
          <h2 className="text-4xl font-bold text-white mb-6 leading-tight">
            Transform Your
            <br />
            <span className="text-primary">ServiceNow</span> Experience
          </h2>
          
          <p className="text-gray-300 text-lg mb-12 leading-relaxed">
            Harness the power of AI to streamline workflows, automate processes, and get instant answers through natural language.
          </p>
          
          {/* Features */}
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Instant Automation</h3>
                <p className="text-gray-400 text-sm">Execute complex workflows with simple commands</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Real-time Insights</h3>
                <p className="text-gray-400 text-sm">Get live updates and intelligent recommendations</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Enterprise Security</h3>
                <p className="text-gray-400 text-sm">Built with enterprise-grade security and compliance</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 lg:px-16">
        <div className="max-w-md w-full space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center mb-4">
              <img 
                src="/assets/nowdev-logo.png" 
                alt="NOWdev.ai" 
                className="h-16 w-auto"
              />
            </div>
            <h1 className="text-2xl font-bold text-white">NOWdev.ai</h1>
            <p className="text-primary text-sm">AI-powered ServiceNow development</p>
          </div>
          
          {/* Header */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white mb-2">Welcome back</h2>
            <p className="text-gray-400">Sign in to continue your AI-powered workflow</p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-surface-light border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="Enter your email"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3 pr-12 bg-surface-light border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-300 transition-colors" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-300 transition-colors" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !formData.email || !formData.password}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-black bg-primary hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] disabled:hover:scale-100"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {/* Switch to Register */}
            <div className="text-center">
              <p className="text-gray-400">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-primary hover:text-blue-400 font-medium transition-colors"
                >
                  Create account
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;