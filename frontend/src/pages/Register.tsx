import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, AlertCircle, CheckCircle2, ArrowRight, Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { AnimatedBrandLogo } from '../components/brand/AnimatedBrandLogo';

export const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signUp, isConfigured } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUp(email, password);
      if (res.error) {
        setError(res.error);
      } else {
        setIsSuccess(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(ellipse at top, rgba(37,99,235,0.08) 0%, rgba(248,250,252,1) 75%)',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        className="p-5 sm:p-8"
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AnimatedBrandLogo variant="full" size="md" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px', marginBottom: '6px' }}>
            Create an Account
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
            Start auditing repositories and receiving actionable security remedies
          </p>
        </div>

        {isSuccess ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle2 size={48} color="#0d9488" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
              Registration Initiated
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, marginBottom: '24px' }}>
              If email verification is enabled on your Supabase project, check your inbox for a confirmation link.
            </p>
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '13px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              }}
            >
              Proceed to Sign In
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            {!isConfigured && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  marginBottom: '20px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
                  Supabase client keys are not set in the environment.
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  marginBottom: '20px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#991b1b', lineHeight: 1.5 }}>
                  {error}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Mail
                    size={16}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock
                    size={16}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 38px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock
                    size={16}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div
              style={{
                marginTop: '24px',
                paddingTop: '20px',
                borderTop: '1px solid #f1f5f9',
                textAlign: 'center',
                fontSize: '13px',
                color: '#64748b',
              }}
            >
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Sign in
              </Link>
            </div>

            <div style={{ marginTop: '14px', textAlign: 'center' }}>
              <Link
                to="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#94a3b8',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#334155')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                <ArrowLeft size={13} />
                Back to Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
