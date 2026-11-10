import React, { useState } from 'react';
import {
  Globe,
  Search,
  Loader2,
  AlertCircle,
  Database,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { CveRemediationWidgetData } from '../../types';
import { CveRemediationCard } from './CveRemediationCard';

export const LiveWebIntelCard: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ecosystem, setEcosystem] = useState('npm');
  const [isLoading, setIsLoading] = useState(false);
  const [cveResult, setCveResult] = useState<CveRemediationWidgetData | null>(null);
  const [packageResults, setPackageResults] = useState<CveRemediationWidgetData[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async (termToSearch?: string) => {
    const query = (termToSearch || searchTerm).trim();
    if (!query) return;

    setIsLoading(true);
    setErrorMsg(null);
    setCveResult(null);
    setPackageResults([]);

    try {
      // Check if user is searching for a CVE or GHSA directly
      if (/^(cve-\d{4}-\d+|ghsa-[a-z0-9-]+)/i.test(query)) {
        const res = await api.ai.lookupCve(query);
        if (res.remediation_widget) {
          setCveResult(res.remediation_widget);
        } else {
          setErrorMsg(`No advisory found for "${query}" in live Google OSV / NIST databases.`);
        }
      } else {
        // Search package advisories
        const res = await api.ai.searchAdvisories(query, ecosystem);
        if (res.vulnerabilities && res.vulnerabilities.length > 0) {
          setPackageResults(res.vulnerabilities);
        } else {
          setErrorMsg(`No reported security vulnerabilities for package "${query}" in ${ecosystem}.`);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Live advisory intelligence query failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQueries = [
    { label: 'CVE-2024-21626 (runc)', term: 'CVE-2024-21626' },
    { label: 'CVE-2023-34034 (Spring Cloud)', term: 'CVE-2023-34034' },
    { label: 'CVE-2021-44228 (Log4j)', term: 'CVE-2021-44228' },
    { label: 'CVE-2024-3094 (XZ)', term: 'CVE-2024-3094' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'rgba(8, 18, 34, 0.95)',
        borderRadius: '12px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Globe size={16} color="#00f0ff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#00f0ff', fontSize: '13px' }}>
              Live CVE & Web Advisory Intelligence
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              Real-time query across Google OSV, NIST NVD, and GitHub GHSA databases
            </div>
          </div>
        </div>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: '#34d399',
            fontSize: '12px',
            fontWeight: 600,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          <Database size={12} /> Live Connected
        </span>
      </div>

      {/* Search Input Bar */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="Enter CVE ID (e.g. CVE-2024-21626) or package name..."
            style={{
              width: '100%',
              height: '36px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: '12px',
              color: '#ffffff',
              outline: 'none',
              background: '#060e1d',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <select
          value={ecosystem}
          onChange={(e) => setEcosystem(e.target.value)}
          style={{
            height: '36px',
            padding: '0 8px',
            borderRadius: '6px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            background: '#060e1d',
            color: '#38bdf8',
            fontSize: '12px',
            fontWeight: 600,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="npm">npm</option>
          <option value="PyPI">PyPI</option>
          <option value="Go">Go</option>
          <option value="Maven">Maven</option>
          <option value="Cargo">Cargo</option>
        </select>

        <button
          onClick={() => handleSearch()}
          disabled={isLoading || !searchTerm.trim()}
          style={{
            height: '36px',
            padding: '0 14px',
            borderRadius: '6px',
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            cursor: isLoading || !searchTerm.trim() ? 'default' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Lookup
        </button>
      </div>

      {/* Suggested Quick Searches */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Try queries:</span>
        {sampleQueries.map((item, idx) => (
          <button
            key={idx}
            onClick={() => {
              setSearchTerm(item.term);
              handleSearch(item.term);
            }}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#071527',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#38bdf8',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div
          style={{
            padding: '10px 12px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            borderRadius: '6px',
            color: '#fb7185',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
          }}
        >
          <AlertCircle size={14} color="#f43f5e" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Live CVE Result */}
      {cveResult && (
        <div>
          <div style={{ fontWeight: 700, color: '#00f0ff', marginBottom: '4px', fontSize: '12px' }}>
            Live Advisory Record Verified:
          </div>
          <CveRemediationCard data={cveResult} />
        </div>
      )}

      {/* Package Advisory List Results */}
      {packageResults.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, color: '#00f0ff', marginBottom: '8px', fontSize: '12px' }}>
            Found {packageResults.length} Advisories for package:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {packageResults.map((item, idx) => (
              <CveRemediationCard key={idx} data={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
