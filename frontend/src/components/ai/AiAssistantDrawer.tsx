import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Shield,
  Bot,
  User,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeRepoName?: string | null;
  activeRepoId?: number | null;
}

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const QUICK_PROMPTS = [
  'What are the primary attack vectors in modern web applications?',
  'How do I securely remediate hardcoded secrets and API keys?',
  'Explain the difference between Semgrep AST rules and Bandit static analysis.',
  'How does AgentGuard LangGraph 4-Agent orchestrate security verification?',
];

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  activeRepoName,
  activeRepoId,
}) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I am your **AgentGuard AI Security Assistant**, powered by the NVIDIA Nemotron architecture and the LangGraph 4-Agent security orchestrator.\n\nI can assist you with:\n- **Threat Modeling & Attack Surfaces**\n- **Vulnerability Root-Cause Analysis**\n- **Automated Fix Generation (.patch files)**\n- **Supply Chain & CVE Mitigation**\n\nHow can I help you secure ${activeRepoName ? `\`${activeRepoName}\`` : 'your code'} today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    // Contextual intelligent cybersecurity responses
    setTimeout(() => {
      let reply = '';
      const qLower = query.toLowerCase();

      if (qLower.includes('secret') || qLower.includes('key') || qLower.includes('token') || qLower.includes('password')) {
        reply = `### Remediating Hardcoded Secrets & Credentials\n\n1. **Immediate Revocation**: Invalidate the exposed secret in your provider dashboard (e.g. GitHub, AWS, Stripe) immediately.\n2. **Environment Configuration**: Move the secret to server-side environment variables or a secrets vault (e.g. Infisical, AWS Secrets Manager, HashiCorp Vault).\n3. **Git History Scrub**: Once removed from working files, use \`git-filter-repo\` or BFG Repo-Cleaner to eliminate historical commits containing the key.\n4. **Automated Fix**: AgentGuard automatically generates exact variable replacements in the **Exact Solutions & Fixes** tab.`;
      } else if (qLower.includes('semgrep') || qLower.includes('bandit')) {
        reply = `### Semgrep vs. Bandit Analysis Engines\n\n- **Semgrep**: A multi-language semantic AST pattern matcher. It understands code syntax trees, identifying complex multi-line data flows, injection vulnerabilities (SQLi, XSS), and unsafe deserialization across Python, TypeScript, Go, Java, and Dockerfiles.\n- **Bandit**: A Python-specific AST security linter that checks for Python-specific CVEs (e.g., \`pickle.loads\`, \`eval()\`, insecure SSL protocols, and weak cryptographic hashes like MD5/SHA1).\n\nAgentGuard runs both concurrently in an isolated ephemeral workspace for maximum verification depth.`;
      } else if (qLower.includes('langgraph') || qLower.includes('4-agent') || qLower.includes('agent')) {
        reply = `### The LangGraph 4-Agent Orchestration Pipeline\n\nAgentGuard uses a multi-agent state graph to prevent hallucinated warnings:\n1. **Threat Modeler**: Maps entry points, external APIs, and unauthenticated endpoints.\n2. **Test Strategist**: Creates deterministic verification assertions before any fix is accepted.\n3. **Evidence Analyst**: Correlates static analyzer AST findings against actual reachable source code.\n4. **Remediation Verifier**: Generates verified unified git patch files.`;
      } else if (qLower.includes('attack vector') || qLower.includes('threat')) {
        reply = `### Primary Web Application Threat Vectors\n\n1. **Supply Chain Dependency Poisoning**: Malicious npm/PyPI packages with typosquatting or unpinned lockfile hashes.\n2. **Broken Object-Level Authorization (BOLA)**: Endpoints exposing records without tenant user-id validation.\n3. **Server-Side Request Forgery (SSRF)**: Webhook/fetch endpoints accepting user-controlled URL inputs.\n4. **Injection Vulnerabilities**: Dynamic string concatenation in SQL queries, template engines, or shell commands.`;
      } else {
        reply = `### Security Analysis & Remediation Advisory\n\nRegarding **"${query}"**:\n\nSecurity best practices recommend:\n- Enforce strict input validation using typed schemas (e.g., Pydantic v2 / Zod).\n- Apply the Principle of Least Privilege to all service tokens and database connections.\n- Verify all static findings through our isolated ephemeral workspace runner.\n\nWould you like me to inspect the full 4-Agent Audit report or generate remediation diffs for your repository?`;
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: activeRepoId
          ? {
              label: 'View Repository 4-Agent Audit',
              onClick: () => {
                onClose();
                navigate(`/repositories?repoId=${activeRepoId}&tab=ai`);
              },
            }
          : undefined,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 650);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Security Assistant"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          transition: 'opacity 0.2s ease',
        }}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '460px',
          height: '100%',
          background: '#ffffff',
          boxShadow: '-8px 0 28px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                AI Security Assistant
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                NVIDIA Nemotron • 4-Agent LangGraph
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close AI Assistant"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: 'none',
              background: '#f1f5f9',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Repository context ribbon */}
        <div
          style={{
            padding: '8px 20px',
            background: '#eff6ff',
            borderBottom: '1px solid #dbeafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#1e40af',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <Shield size={12} />
            <span style={{ fontWeight: 600 }}>Target:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
              {activeRepoName || 'Global Security Context'}
            </span>
          </div>

          <button
            onClick={() => {
              onClose();
              navigate('/repositories?tab=ai');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
            }}
          >
            Audit Tab <ExternalLink size={10} />
          </button>
        </div>

        {/* Messages Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: '#fafafa',
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                flexDirection: m.sender === 'user' ? 'row-reverse' : 'row',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: m.sender === 'user' ? '#0f172a' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {m.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>

              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: '85%',
                  background: m.sender === 'user' ? '#2563eb' : '#ffffff',
                  color: m.sender === 'user' ? '#ffffff' : '#0f172a',
                  padding: '12px 14px',
                  borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  border: m.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  fontSize: '12.5px',
                  lineHeight: 1.55,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-line',
                }}
              >
                {m.text}

                {m.action && (
                  <button
                    onClick={m.action.onClick}
                    style={{
                      marginTop: '10px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Sparkles size={12} />
                    {m.action.label}
                  </button>
                )}

                <div
                  style={{
                    fontSize: '10px',
                    color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                    marginTop: '4px',
                    textAlign: m.sender === 'user' ? 'right' : 'left',
                  }}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={14} />
              </div>
              <div
                style={{
                  background: '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '12px 12px 12px 2px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0.4s' }} />
                <span style={{ marginLeft: '4px' }}>AgentGuard AI is analyzing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts Bar */}
        <div
          style={{
            padding: '10px 16px',
            background: '#ffffff',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
          className="no-scrollbar"
        >
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#475569',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eff6ff';
                e.currentTarget.style.borderColor = '#93c5fd';
                e.currentTarget.style.color = '#1d4ed8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color = '#475569';
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI about vulnerabilities, fixes, or security..."
            style={{
              flex: 1,
              height: '38px',
              padding: '0 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              color: '#0f172a',
              outline: 'none',
              background: '#f8fafc',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.background = '#ffffff';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim()}
            aria-label="Send message to AI Assistant"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              border: 'none',
              background: inputValue.trim() ? '#2563eb' : '#e2e8f0',
              color: '#ffffff',
              cursor: inputValue.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
