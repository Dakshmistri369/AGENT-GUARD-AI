import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GitBranch,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Download,
  RotateCw,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Sliders,
  Trash2,
  Copy,
  Check,
  Clock,
  History,
  RefreshCw,
  Wrench,
  Terminal,
  FileCode,
  Code2,
  Folder,
  FileSpreadsheet,
  FileText,
  Layers,
  Info,
} from 'lucide-react';
import { api, API_BASE_URL } from '../lib/api';
import type {
  Repository,
  Scan,
  ScanReport,
  Finding,
  FindingSolution,
  RepositorySolutionPlan,
} from '../types';

const SCAN_STAGES = [
  { id: 'validating', label: '1. Validating Repository' },
  { id: 'fetching_metadata', label: '2. Fetching Metadata' },
  { id: 'inspecting_file_tree', label: '3. Inspecting File Tree' },
  { id: 'running_scanners', label: '4. Running Scanners' },
  { id: 'reviewing_evidence', label: '5. Reviewing Evidence' },
  { id: 'generating_report', label: '6. Generating Report' },
];

type TabType = 'findings' | 'solutions' | 'matrix' | 'ai' | 'history';

export const RepositoriesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Input & validation state
  const [repoUrl, setRepoUrl] = useState('');
  const [urlValidation, setUrlValidation] = useState<{
    valid?: boolean;
    error?: string;
    owner?: string;
    name?: string;
  }>({});
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isDeletingRepo, setIsDeletingRepo] = useState(false);
  const [isWakingBackend, setIsWakingBackend] = useState(false);

  // Active repository state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeRepo, setActiveRepo] = useState<Repository | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);

  // Scan state
  const [currentScan, setCurrentScan] = useState<Scan | null>(null);
  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [metadataOnly, setMetadataOnly] = useState(false);
  const [targetBranch, setTargetBranch] = useState('');

  // Past scans history
  const [pastScans, setPastScans] = useState<Scan[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('findings');
  const [copiedSha, setCopiedSha] = useState(false);
  const [copiedReportJson, setCopiedReportJson] = useState(false);
  const [copiedEvidenceId, setCopiedEvidenceId] = useState<number | null>(null);
  const [copiedLocationId, setCopiedLocationId] = useState<number | null>(null);

  // Solution state
  const [solutionPlan, setSolutionPlan] = useState<RepositorySolutionPlan | null>(null);
  const [isLoadingSolutions, setIsLoadingSolutions] = useState(false);
  const [findingSolutions, setFindingSolutions] = useState<Record<number, FindingSolution>>({});
  const [enhancingFindingId, setEnhancingFindingId] = useState<number | null>(null);
  const [copiedCliCmd, setCopiedCliCmd] = useState<string | null>(null);
  const [copiedPatchFile, setCopiedPatchFile] = useState(false);
  const [copiedFilePatchIndex, setCopiedFilePatchIndex] = useState<number | null>(null);
  const [copiedSolutionId, setCopiedSolutionId] = useState<number | null>(null);
  const [selectedSolutionFilter, setSelectedSolutionFilter] = useState<'all' | 'code_diff' | 'dependency_upgrade' | 'secret_removal'>('all');

  // Findings filter & view state
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedScanner, setSelectedScanner] = useState<string>('all');
  const [selectedVerification, setSelectedVerification] = useState<string>('all');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');
  const [showPlaceholdersSection, setShowPlaceholdersSection] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFindingId, setExpandedFindingId] = useState<number | null>(null);

  // All repositories issues state & scope
  const [findingsScope, setFindingsScope] = useState<'current' | 'all'>('current');
  const [allRepoFindings, setAllRepoFindings] = useState<Finding[]>([]);
  const [isLoadingAllFindings, setIsLoadingAllFindings] = useState(false);
  const [copiedIssuesList, setCopiedIssuesList] = useState(false);

  // Initial load
  useEffect(() => {
    loadRepositories();
  }, []);

  // Handle URL query parameters (e.g. ?tab=solutions or ?repoId=123)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (
      tabParam === 'findings' ||
      tabParam === 'solutions' ||
      tabParam === 'matrix' ||
      tabParam === 'ai' ||
      tabParam === 'history'
    ) {
      setActiveTab(tabParam as TabType);
      if (tabParam === 'findings') {
        loadAllRepositoryFindings();
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const repoIdParam = searchParams.get('repoId');
    if (repoIdParam && repositories.length > 0) {
      const target = repositories.find((r) => r.id === Number(repoIdParam));
      if (target && target.id !== activeRepo?.id) {
        selectRepository(target);
      }
    }
  }, [searchParams, repositories]);

  useEffect(() => {
    const actionParam = searchParams.get('action');
    if (actionParam === 'new') {
      const input = document.getElementById('github-url-input');
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (actionParam === 'scan') {
      const scanBtn = document.getElementById('analyze-repo-btn');
      if (scanBtn) {
        scanBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        scanBtn.focus();
      }
    }
  }, [searchParams]);

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const res = await api.repositories.list();
      setRepositories(res.items);
      loadAllRepositoryFindings();
      if (res.items.length > 0 && !activeRepo) {
        const repoIdParam = searchParams.get('repoId');
        const initial = repoIdParam
          ? res.items.find((r) => r.id === Number(repoIdParam)) || res.items[0]
          : res.items[0];
        selectRepository(initial);
      }
    } catch (err) {
      console.error('Failed to load repositories', err);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const selectRepository = async (repo: Repository) => {
    setActiveRepo(repo);
    setTargetBranch(repo.default_branch || '');
    setScanReport(null);
    setCurrentScan(null);
    setSolutionPlan(null);
    setFindingSolutions({});
    setExpandedFindingId(null);
    setIsLoadingHistory(true);

    // Load past scans for this repo
    try {
      const scans = await api.scans.listByRepo(repo.id);
      setPastScans(scans);
      if (scans.length > 0) {
        const latest = scans[0];
        setCurrentScan(latest);
        if (latest.status === 'running') {
          setIsScanning(true);
          const pollTimer = setInterval(async () => {
            try {
              const updatedScans = await api.scans.listByRepo(repo.id);
              if (updatedScans.length > 0) {
                const current = updatedScans[0];
                setCurrentScan(current);
                setPastScans(updatedScans);
                if (current.status !== 'running') {
                  clearInterval(pollTimer);
                  setIsScanning(false);
                  const rep = await api.scans.report(current.id);
                  setScanReport(rep);
                }
              }
            } catch (e) {
              clearInterval(pollTimer);
            }
          }, 2500);
        } else if (latest.status === 'completed' || latest.status === 'failed') {
          const rep = await api.scans.report(latest.id);
          setScanReport(rep);
        }
      }
    } catch (err) {
      console.warn('Failed to load past scans', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // URL input handler with client-side pattern recognition and backend validation
  const handleUrlChange = async (url: string) => {
    setRepoUrl(url);
    setConnectError(null);

    const clean = url.trim();
    if (!clean) {
      setUrlValidation({});
      return;
    }

    // Client-side instant format check
    const githubRegex = /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?$/i;
    const match = clean.match(githubRegex);
    if (!match) {
      setUrlValidation({ valid: false, error: 'Must be a valid GitHub repository URL (e.g. https://github.com/owner/repo)' });
      return;
    }

    // Optimistically recognize valid format so the user is not blocked
    const owner = match[1];
    const name = match[2].replace(/\.git$/, '');
    setUrlValidation({ valid: true, owner, name });

    setIsValidatingUrl(true);
    try {
      const res = await api.repositories.validate(clean);
      setUrlValidation({
        valid: res.valid,
        error: res.error,
        owner: res.owner || owner,
        name: res.name || name,
      });
    } catch (err: unknown) {
      // If client format is valid, keep valid: true so user can still attempt connection,
      // but warn about backend connection if Network Error
      const isNetworkErr = err instanceof Error && (err.message.includes('Network Error') || err.message.includes('404'));
      if (isNetworkErr) {
        setUrlValidation({
          valid: true,
          owner,
          name,
          error: 'Backend API unreachable. Ensure your Render backend is running and VITE_API_BASE_URL is set in Vercel.',
        });
      } else {
        const msg = err instanceof Error ? err.message : 'Validation failed';
        setUrlValidation({ valid: false, error: msg });
      }
    } finally {
      setIsValidatingUrl(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || !urlValidation.valid) return;

    setIsConnecting(true);
    setConnectError(null);
    try {
      const newRepo = await api.repositories.connect(repoUrl.trim());
      setRepositories((prev) => [newRepo, ...prev.filter((r) => r.id !== newRepo.id)]);
      setActiveRepo(newRepo);
      setTargetBranch(newRepo.default_branch || '');
      setRepoUrl('');
      setUrlValidation({});
      setCurrentScan(null);
      setScanReport(null);
      setPastScans([]);
    } catch (err: any) {
      const isNetworkErr = err?.message?.includes('Network Error') || !err?.response;
      const detail = isNetworkErr
        ? 'Cannot reach backend server. Please verify your Render service is awake and VITE_API_BASE_URL is set in Vercel.'
        : err?.response?.data?.detail || err?.message || 'Failed to connect repository';
      setConnectError(detail);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWakeUpBackend = async () => {
    setIsWakingBackend(true);
    try {
      await api.health.get();
      setConnectError(null);
      await loadRepositories();
    } catch {
      window.open(`${API_BASE_URL || 'https://agent-guard-ai.onrender.com'}/health`, '_blank');
    } finally {
      setIsWakingBackend(false);
    }
  };

  const handleDeleteRepository = async () => {
    if (!activeRepo || isDeletingRepo) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to disconnect ${activeRepo.full_name}? This will remove its scan history.`
    );
    if (!confirmDelete) return;

    setIsDeletingRepo(true);
    try {
      await api.repositories.delete(activeRepo.id);
      const remaining = repositories.filter((r) => r.id !== activeRepo.id);
      setRepositories(remaining);
      if (remaining.length > 0) {
        selectRepository(remaining[0]);
      } else {
        setActiveRepo(null);
        setCurrentScan(null);
        setScanReport(null);
        setPastScans([]);
      }
    } catch (err: any) {
      alert(`Failed to delete repository: ${err?.message || 'Error'}`);
    } finally {
      setIsDeletingRepo(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!activeRepo) return;

    setIsScanning(true);
    setScanReport(null);

    let pollTimer: any = null;
    const repoId = activeRepo.id;

    const stopPollingAndFinish = async (latestScan: any) => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setIsScanning(false);
      try {
        const rep = await api.scans.report(latestScan.id);
        setScanReport(rep);
        const updatedRepo = await api.repositories.get(repoId);
        setActiveRepo(updatedRepo);
      } catch (e) {
        // Report might not be available if failed immediately
      }
    };

    try {
      const scan = await api.scans.analyze(activeRepo.id, {
        metadata_only: metadataOnly,
        branch: targetBranch.trim() || activeRepo.default_branch,
      });
      setCurrentScan(scan);

      // Refresh past scans list
      const scans = await api.scans.listByRepo(activeRepo.id);
      setPastScans(scans);

      // If already finished
      if (scan.status !== 'queued' && scan.status !== 'running') {
        await stopPollingAndFinish(scan);
        return;
      }

      // Live polling timer to poll until terminal state
      pollTimer = setInterval(async () => {
        try {
          const updatedScans = await api.scans.listByRepo(repoId);
          if (updatedScans.length > 0) {
            const latest = updatedScans[0];
            setCurrentScan(latest);
            setPastScans(updatedScans);
            if (latest.status !== 'queued' && latest.status !== 'running') {
              await stopPollingAndFinish(latest);
            }
          }
        } catch (err) {
          // ignore polling network errors
        }
      }, 2000);
    } catch (err: any) {
      if (pollTimer) clearInterval(pollTimer);
      setIsScanning(false);
      const msg = err?.response?.data?.detail || err?.message || 'Analysis failed to start';
      alert(`Scan failed: ${msg}`);
    }
  };

  const handleCancelScan = async () => {
    if (!currentScan || isCancelling) return;
    setIsCancelling(true);
    try {
      const cancelled = await api.scans.cancel(currentScan.id);
      setCurrentScan(cancelled);
      const scans = await api.scans.listByRepo(activeRepo!.id);
      setPastScans(scans);
    } catch (err) {
      console.error('Failed to cancel scan', err);
    } finally {
      setIsCancelling(false);
    }
  };

  const viewPastScanReport = async (scan: Scan) => {
    setCurrentScan(scan);
    try {
      const rep = await api.scans.report(scan.id);
      setScanReport(rep);
      switchTab('findings');
    } catch (err: any) {
      alert(`Could not load report for scan #${scan.id}: ${err?.message || 'Error'}`);
    }
  };

  const downloadReportJson = () => {
    if (!scanReport) return;
    const jsonString = JSON.stringify(scanReport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    const repoSafeName = (activeRepo?.name || 'repository').replace(/[^a-zA-Z0-9_-]/g, '_');
    const shaSafe = scanReport.commit_sha ? scanReport.commit_sha.slice(0, 7) : `scan-${scanReport.scan_id}`;
    const filename = `agentguard-report-${repoSafeName}-${shaSafe}.json`;
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const copyReportJson = async () => {
    if (!scanReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(scanReport, null, 2));
      setCopiedReportJson(true);
      setTimeout(() => setCopiedReportJson(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const copyToClipboard = async (text: string, onDone: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const loadAllRepositoryFindings = async () => {
    setIsLoadingAllFindings(true);
    try {
      const res = await api.findings.list();
      setAllRepoFindings(res.findings);
    } catch (e) {
      console.warn('Failed to load all repository findings:', e);
    } finally {
      setIsLoadingAllFindings(false);
    }
  };

  const downloadIssuesCsv = () => {
    const listToExport = filteredFindings;
    if (listToExport.length === 0) return;
    const headers = [
      'Repository',
      'Severity',
      'Scanner',
      'Rule ID',
      'Title',
      'Folder / File Location',
      'Line Start',
      'Line End',
      'Exact Location',
      'Confidence',
      'Verification Status',
      'Classification',
      'Classification Reason',
      'Masked Secret Preview',
      'Evidence',
      'Remediation',
      'Commit SHA',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = listToExport.map((f) => {
      const lineRangeStr = f.line_number
        ? (f.line_end && f.line_end !== f.line_number ? `${f.line_number}-${f.line_end}` : `${f.line_number}`)
        : '';
      const exactLocation = f.file_path ? `${f.file_path}${lineRangeStr ? `:${lineRangeStr}` : ''}` : 'Manifest-level';
      const repoName = f.repository_name || activeRepo?.full_name || 'Repository';

      return [
        escapeCsv(repoName),
        escapeCsv(f.severity),
        escapeCsv(f.scanner),
        escapeCsv(f.rule_id || ''),
        escapeCsv(f.title),
        escapeCsv(f.file_path || ''),
        escapeCsv(f.line_number || ''),
        escapeCsv(f.line_end || ''),
        escapeCsv(exactLocation),
        escapeCsv(f.confidence),
        escapeCsv(f.verification_status),
        escapeCsv(f.classification || 'N/A'),
        escapeCsv(f.classification_reason || ''),
        escapeCsv(f.secret_redacted_preview || ''),
        escapeCsv(f.sanitized_evidence || ''),
        escapeCsv(f.remediation || ''),
        escapeCsv(f.commit_sha || activeRepo?.pinned_sha || ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = findingsScope === 'all'
      ? `agentguard-all-issues-${new Date().toISOString().slice(0, 10)}.csv`
      : `agentguard-issues-${(activeRepo?.name || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadIssuesMarkdown = () => {
    const listToExport = filteredFindings;
    if (listToExport.length === 0) return;
    const scopeTitle = findingsScope === 'all'
      ? 'All Connected Repositories'
      : (activeRepo?.full_name || 'Repository');

    let md = `# AgentGuard AI — Security Issues Report\n\n`;
    md += `**Scope:** ${scopeTitle}\n`;
    md += `**Generated:** ${new Date().toUTCString()}\n`;
    md += `**Total Issues:** ${listToExport.length}\n\n`;

    md += `## Summary by Severity\n\n`;
    md += `| Critical | High | Medium | Low / Info |\n`;
    md += `| :---: | :---: | :---: | :---: |\n`;
    md += `| ${listToExport.filter((f) => f.severity === 'critical').length} | ${listToExport.filter((f) => f.severity === 'high').length} | ${listToExport.filter((f) => f.severity === 'medium').length} | ${listToExport.filter((f) => f.severity === 'low' || f.severity === 'info').length} |\n\n`;

    md += `## Detailed Issues List with Folder/File Locations & Lines\n\n`;
    listToExport.forEach((f, idx) => {
      const lineRangeStr = f.line_number
        ? (f.line_end && f.line_end !== f.line_number ? `${f.line_number}-${f.line_end}` : `${f.line_number}`)
        : '';
      const exactLocation = f.file_path ? `${f.file_path}${lineRangeStr ? `:${lineRangeStr}` : ''}` : 'Manifest-level';
      const repoName = f.repository_name || activeRepo?.full_name || 'Repository';

      md += `### ${idx + 1}. [${f.severity.toUpperCase()}] ${f.title}\n\n`;
      md += `- **Repository:** \`${repoName}\`\n`;
      md += `- **Exact Location:** \`${exactLocation}\`\n`;
      md += `- **Scanner & Rule:** ${f.scanner} (\`${f.rule_id || 'GENERAL'}\`)\n`;
      md += `- **Verification:** ${f.verification_status} (Confidence: ${f.confidence})\n`;
      if (f.classification) {
        md += `- **Classification:** \`${f.classification}\`${f.secret_redacted_preview ? ` (Masked Preview: \`${f.secret_redacted_preview}\`)` : ''}\n`;
        if (f.classification_reason) {
          md += `- **Classification Reason:** ${f.classification_reason}\n`;
        }
      }
      if (f.sanitized_evidence) {
        md += `- **Sanitized Evidence:**\n\`\`\`\n${f.sanitized_evidence}\n\`\`\`\n`;
      }
      if (f.explanation) {
        md += `- **Explanation:** ${f.explanation}\n`;
      }
      if (f.remediation) {
        md += `- **Remediation:** ${f.remediation}\n`;
      }
      md += `\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = findingsScope === 'all'
      ? `agentguard-all-issues-${new Date().toISOString().slice(0, 10)}.md`
      : `agentguard-issues-${(activeRepo?.name || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.md`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadIssuesJson = () => {
    const listToExport = filteredFindings;
    if (listToExport.length === 0) return;
    const data = {
      report_name: 'AgentGuard Security Issues',
      generated_at: new Date().toISOString(),
      scope: findingsScope === 'all' ? 'all_repositories' : activeRepo?.full_name,
      total_issues: listToExport.length,
      issues: listToExport.map((f) => {
        const lineRangeStr = f.line_number
          ? (f.line_end && f.line_end !== f.line_number ? `${f.line_number}-${f.line_end}` : `${f.line_number}`)
          : null;
        return {
          id: f.id,
          repository: f.repository_name || activeRepo?.full_name,
          severity: f.severity,
          scanner: f.scanner,
          rule_id: f.rule_id,
          title: f.title,
          file_path: f.file_path,
          line_number: f.line_number,
          line_end: f.line_end,
          line_formatted: lineRangeStr,
          exact_location: f.file_path ? `${f.file_path}${lineRangeStr ? `:${lineRangeStr}` : ''}` : 'Manifest-level',
          confidence: f.confidence,
          verification_status: f.verification_status,
          classification: f.classification,
          classification_reason: f.classification_reason,
          secret_redacted_preview: f.secret_redacted_preview,
          sanitized_evidence: f.sanitized_evidence,
          remediation: f.remediation,
          commit_sha: f.commit_sha || activeRepo?.pinned_sha,
        };
      }),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = findingsScope === 'all'
      ? `agentguard-all-issues-${new Date().toISOString().slice(0, 10)}.json`
      : `agentguard-issues-${(activeRepo?.name || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyAllIssuesText = () => {
    const listToExport = filteredFindings;
    if (listToExport.length === 0) return;
    const lines = listToExport.map((f) => {
      const lineRangeStr = f.line_number
        ? (f.line_end && f.line_end !== f.line_number ? `:${f.line_number}-${f.line_end}` : `:${f.line_number}`)
        : '';
      const location = f.file_path ? `${f.file_path}${lineRangeStr}` : 'Manifest-level';
      const repoPrefix = findingsScope === 'all' && f.repository_name ? `[${f.repository_name}] ` : '';
      return `${repoPrefix}${f.severity}\t${f.scanner}\t${f.rule_id || 'RULE'}\t${f.title}\t${location}`;
    });

    const formattedText = lines.join('\n');
    copyToClipboard(formattedText, () => {
      setCopiedIssuesList(true);
      setTimeout(() => setCopiedIssuesList(false), 2000);
    });
  };

  // Load solutions whenever scanReport changes
  useEffect(() => {
    if (scanReport?.scan_id) {
      loadSolutionsForScan(scanReport.scan_id);
    }
  }, [scanReport?.scan_id]);

  const loadSolutionsForScan = async (scanId: number) => {
    setIsLoadingSolutions(true);
    try {
      const plan = await api.solutions.getByScan(scanId);
      setSolutionPlan(plan);
      const solMap: Record<number, FindingSolution> = {};
      plan.solutions.forEach((s) => {
        solMap[s.finding_id] = s;
      });
      setFindingSolutions((prev) => ({ ...prev, ...solMap }));
    } catch (err) {
      console.warn('Could not load solutions for scan', err);
    } finally {
      setIsLoadingSolutions(false);
    }
  };

  // Lazy-load individual solution if finding is expanded and not yet in findingSolutions
  useEffect(() => {
    if (expandedFindingId && !findingSolutions[expandedFindingId]) {
      api.solutions
        .getByFinding(expandedFindingId)
        .then((sol) => {
          setFindingSolutions((prev) => ({ ...prev, [expandedFindingId]: sol }));
        })
        .catch((err) => {
          console.warn('Could not load single solution for finding #', expandedFindingId, err);
        });
    }
  }, [expandedFindingId, findingSolutions]);

  const handleAiEnhanceFinding = async (findingId: number) => {
    setEnhancingFindingId(findingId);
    try {
      const enhanced = await api.solutions.aiEnhance(findingId);
      setFindingSolutions((prev) => ({ ...prev, [findingId]: enhanced }));
      if (solutionPlan) {
        setSolutionPlan({
          ...solutionPlan,
          solutions: solutionPlan.solutions.map((s) =>
            s.finding_id === findingId ? enhanced : s
          ),
          file_groups: solutionPlan.file_groups.map((group) => {
            const hasFinding = group.solutions.some((s) => s.finding_id === findingId);
            if (!hasFinding) return group;
            const updatedSolutions = group.solutions.map((s) =>
              s.finding_id === findingId ? enhanced : s
            );
            const diffs = updatedSolutions.map((s) => s.diff).filter(Boolean);
            return {
              ...group,
              solutions: updatedSolutions,
              combined_patch: diffs.length > 0 ? diffs.join('\n') : null,
            };
          }),
        });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'AI Enhancement failed';
      alert(`AI Solution generation error: ${msg}`);
    } finally {
      setEnhancingFindingId(null);
    }
  };

  const downloadPatchFile = () => {
    if (!solutionPlan?.full_unified_patch) return;
    const blob = new Blob([solutionPlan.full_unified_patch], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    const repoSafeName = (activeRepo?.name || 'repository').replace(/[^a-zA-Z0-9_-]/g, '_');
    const shaSafe = scanReport?.commit_sha ? scanReport.commit_sha.slice(0, 7) : `scan-${scanReport?.scan_id || '0'}`;
    downloadAnchor.setAttribute('download', `agentguard-fixes-${repoSafeName}-${shaSafe}.patch`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const renderUnifiedDiff = (diffText: string | null) => {
    if (!diffText) return null;
    const lines = diffText.split('\n');
    return (
      <div
        style={{
          borderRadius: '6px',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
          overflowX: 'auto',
          lineHeight: 1.5,
          padding: '10px 12px',
        }}
      >
        {lines.map((l, idx) => {
          let color = '#334155';
          let bg = 'transparent';
          if (l.startsWith('+') && !l.startsWith('+++')) {
            color = '#15803d';
            bg = '#f0fdf4';
          } else if (l.startsWith('-') && !l.startsWith('---')) {
            color = '#b91c1c';
            bg = '#fef2f2';
          } else if (l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++')) {
            color = '#1d4ed8';
            bg = '#eff6ff';
          }
          return (
            <div
              key={idx}
              style={{
                color,
                background: bg,
                padding: '1px 6px',
                borderRadius: '2px',
                whiteSpace: 'pre',
              }}
            >
              {l || ' '}
            </div>
          );
        })}
      </div>
    );
  };

  // Active findings based on scope (selected repository vs all connected repositories)
  const activeFindingsList: Finding[] = findingsScope === 'all'
    ? allRepoFindings
    : (scanReport?.findings || []);

  const findings: Finding[] = activeFindingsList;

  const filteredFindings = activeFindingsList.filter((f) => {
    const matchesSev = selectedSeverity === 'all' || f.severity === selectedSeverity;
    const matchesScanner =
      selectedScanner === 'all' ||
      f.scanner.toLowerCase().includes(selectedScanner.toLowerCase()) ||
      selectedScanner.toLowerCase().includes(f.scanner.toLowerCase());
    const matchesVerification =
      selectedVerification === 'all' ||
      f.verification_status.toLowerCase() === selectedVerification.toLowerCase();
    const matchesClassification =
      selectedClassification === 'all' ||
      (f.classification && f.classification.toLowerCase() === selectedClassification.toLowerCase());
    const matchesSearch =
      !searchQuery.trim() ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.file_path && f.file_path.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.rule_id && f.rule_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.explanation && f.explanation.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.repository_name && f.repository_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      f.scanner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSev && matchesScanner && matchesVerification && matchesClassification && matchesSearch;
  });

  const metricsSource = findingsScope === 'all' || !scanReport
    ? {
        total: activeFindingsList.length,
        critical: activeFindingsList.filter((f) => f.severity === 'critical').length,
        high: activeFindingsList.filter((f) => f.severity === 'high').length,
        medium: activeFindingsList.filter((f) => f.severity === 'medium').length,
        low: activeFindingsList.filter((f) => f.severity === 'low' || f.severity === 'info').length,
      }
    : {
        total: scanReport.summary.total_findings,
        critical: scanReport.summary.critical,
        high: scanReport.summary.high,
        medium: scanReport.summary.medium,
        low: scanReport.summary.low + scanReport.summary.info,
      };

  const meta = activeRepo?.metadata_json;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', padding: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              GitHub Security Auditor
            </h1>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(20, 184, 166, 0.15)',
                color: 'var(--teal-bright)',
                border: '1px solid rgba(45, 212, 191, 0.3)',
                fontWeight: 600,
              }}
            >
              Public & Private Ready
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Connect repositories, inspect project structure, pin commit SHAs, and run isolated static analyzers with verifiable evidence.
          </p>
        </div>

        {activeRepo && scanReport && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={copyReportJson}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              title="Copy complete JSON report to clipboard"
              aria-label="Copy JSON report"
            >
              {copiedReportJson ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
              {copiedReportJson ? 'Report Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={downloadReportJson}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}
              aria-label="Download JSON Report"
            >
              <Download size={14} />
              Export JSON Report
            </button>
          </div>
        )}
      </div>

      {/* URL Connect Bar */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} aria-label="Connect GitHub Repository">
          <label htmlFor="github-url-input" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Connect Public or Private GitHub Repository
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '320px', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
                aria-hidden="true"
              >
                <FolderGit2 size={16} />
              </div>
              <input
                id="github-url-input"
                className="input"
                style={{ paddingLeft: '38px', width: '100%' }}
                placeholder="https://github.com/owner/repository"
                value={repoUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isConnecting}
                aria-label="GitHub Repository URL"
                aria-invalid={urlValidation.valid === false}
              />
              {isValidatingUrl && (
                <div
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                  role="status"
                >
                  Checking...
                </div>
              )}
            </div>

            <button
              id="connect-repo-btn"
              type="submit"
              className="btn btn-primary"
              disabled={!urlValidation.valid || isConnecting}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '170px', justifyContent: 'center' }}
              aria-label="Connect repository"
            >
              {isConnecting ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <GitBranch size={14} />
                  Connect Repository
                </>
              )}
            </button>
          </div>

          {/* Validation Feedback */}
          {urlValidation.valid && (
            <div style={{ fontSize: '12px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '6px' }} role="status">
              <CheckCircle2 size={13} />
              Validated GitHub repository: <strong style={{ color: 'var(--text-primary)' }}>{urlValidation.owner}/{urlValidation.name}</strong> (Public access requires zero tokens)
            </div>
          )}

          {urlValidation.error && (
            <div
              style={{
                fontSize: '12px',
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#fef2f2',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #fecaca',
              }}
              role="alert"
            >
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>{urlValidation.error}</span>
            </div>
          )}

          {connectError && (
            <div
              style={{
                fontSize: '12px',
                color: '#991b1b',
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #f87171',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
              role="alert"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#dc2626' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{connectError}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                    💡 <strong>Tip for Render Free Tier:</strong> Render automatically hibernates free services after 15 minutes of inactivity. When asleep, incoming requests take ~50 seconds to wake up the server. Once awake, all requests respond instantly.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: '24px', flexWrap: 'wrap', marginTop: '2px' }}>
                <a
                  href={`${API_BASE_URL || 'https://agent-guard-ai.onrender.com'}/health`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#2563eb',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={12} />
                  Ping Backend Service ({API_BASE_URL || 'https://agent-guard-ai.onrender.com'}) ↗
                </a>

                <button
                  type="button"
                  onClick={handleWakeUpBackend}
                  disabled={isWakingBackend}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#334155',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCw size={12} className={isWakingBackend ? 'animate-spin' : ''} />
                  {isWakingBackend ? 'Waking up backend...' : 'Retry Connection'}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Existing connected repository switcher pills */}
        {repositories.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Connected Repositories:</span>
            {repositories.map((repo) => {
              const isSelected = activeRepo?.id === repo.id;
              return (
                <button
                  key={repo.id}
                  onClick={() => selectRepository(repo)}
                  style={{
                    fontSize: '12px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: isSelected ? '#eff6ff' : '#f8fafc',
                    color: isSelected ? '#1d4ed8' : '#0f172a',
                    border: isSelected ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Select repository ${repo.full_name}`}
                >
                  <GitBranch size={12} color={isSelected ? '#1d4ed8' : '#64748b'} />
                  <span>{repo.full_name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Analysis Section */}
      {isLoadingRepos ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="animate-spin" style={{ width: '24px', height: '24px', border: '2px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', margin: '0 auto 12px' }} />
          Loading repositories and security reports...
        </div>
      ) : activeRepo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Repository Overview Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {activeRepo.full_name}
                  </h2>
                  <a
                    href={activeRepo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}
                    title="Open on GitHub"
                    aria-label="Open repository on GitHub"
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>
                <div style={{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>
                    Default Branch: <strong style={{ color: '#0f766e', fontWeight: 700 }}>{activeRepo.default_branch}</strong>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Commit SHA:{' '}
                    <code
                      style={{
                        background: '#f1f5f9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        color: '#0f172a',
                        fontWeight: 600,
                      }}
                    >
                      {activeRepo.pinned_sha ? activeRepo.pinned_sha.slice(0, 7) : 'Unpinned'}
                    </code>
                    {activeRepo.pinned_sha && (
                      <button
                        onClick={() =>
                          copyToClipboard(activeRepo.pinned_sha || '', () => {
                            setCopiedSha(true);
                            setTimeout(() => setCopiedSha(false), 1500);
                          })
                        }
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                        title="Copy full commit SHA"
                        aria-label="Copy commit SHA"
                      >
                        {copiedSha ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                      </button>
                    )}
                  </span>
                  <span>
                    Files: <strong style={{ color: 'var(--text-primary)' }}>{meta?.file_count ?? 0}</strong>
                  </span>
                  <span>
                    Directories: <strong style={{ color: 'var(--text-primary)' }}>{meta?.directory_count ?? 0}</strong>
                  </span>
                  <span>
                    Size: <strong style={{ color: 'var(--text-primary)' }}>{meta?.size_kb ?? 0} KB</strong>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Branch selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label htmlFor="branch-select" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Branch:
                  </label>
                  <input
                    id="branch-select"
                    className="input"
                    style={{ width: '110px', height: '32px', fontSize: '12px', padding: '4px 8px' }}
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    placeholder={activeRepo.default_branch}
                    disabled={isScanning}
                  />
                </div>

                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={metadataOnly}
                    onChange={(e) => setMetadataOnly(e.target.checked)}
                    disabled={isScanning}
                  />
                  Metadata-only
                </label>

                {isScanning ? (
                  <button onClick={handleCancelScan} disabled={isCancelling} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <XCircle size={14} color="var(--accent-rose)" />
                    {isCancelling ? 'Cancelling...' : 'Cancel Scan'}
                  </button>
                ) : (
                  <button
                    id="analyze-repo-btn"
                    onClick={handleStartAnalysis}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Shield size={14} />
                    Analyze Repository
                  </button>
                )}

                <button
                  onClick={handleDeleteRepository}
                  disabled={isDeletingRepo || isScanning}
                  className="btn btn-danger"
                  style={{ padding: '8px 12px' }}
                  title="Disconnect and remove repository"
                  aria-label="Disconnect repository"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Inspection Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '20px' }}>
              {/* Languages */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '11px', color: '#0f172a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Detected Languages
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {meta?.languages && meta.languages.length > 0 ? (
                    meta.languages.map((lang) => (
                      <span
                        key={lang}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        {lang}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>None detected</span>
                  )}
                </div>
              </div>

              {/* Manifests */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '11px', color: '#0f172a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Detected Manifests
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {meta?.manifests && meta.manifests.length > 0 ? (
                    meta.manifests.map((m) => (
                      <span
                        key={m}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: '#f0fdf4',
                          color: '#15803d',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        {m}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>No manifests detected</span>
                  )}
                </div>
              </div>

              {/* Test & Config */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '11px', color: '#0f172a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Test & CI Detection
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {meta?.test_directories && meta.test_directories.length > 0 ? (
                    meta.test_directories.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: '#faf5ff',
                          color: '#7e22ce',
                          border: '1px solid #e9d5ff',
                        }}
                      >
                        📁 {t}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>No test directories</span>
                  )}
                  {meta?.workflow_files && meta.workflow_files.length > 0 && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      ⚡ Workflows ({meta.workflow_files.length})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 6-Stage Security Verification Stepper */}
          {(isScanning || currentScan) && (
            <div className="glass-card" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isScanning ? (
                    <RotateCw size={15} className="animate-spin" color="var(--electric-blue-bright)" />
                  ) : currentScan?.status === 'completed' ? (
                    <CheckCircle2 size={16} color="var(--accent-green)" />
                  ) : currentScan?.status === 'failed' ? (
                    <XCircle size={16} color="var(--accent-rose)" />
                  ) : (
                    <Clock size={16} color="var(--text-muted)" />
                  )}
                  <span>
                    {isScanning
                      ? 'Security Verification in Progress — Executing Isolated Workspaces'
                      : currentScan?.status === 'completed'
                      ? `Scan #${currentScan.id} Completed — Verified at SHA ${currentScan.commit_sha?.slice(0, 7) || 'latest'}`
                      : `Scan #${currentScan?.id} Status: ${currentScan?.status}`}
                  </span>
                </div>
                {currentScan?.completed_at && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Finished: {new Date(currentScan.completed_at).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* 6 Stages Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                {SCAN_STAGES.map((stg, idx) => {
                  const isScanRunning = isScanning || currentScan?.status === 'running';
                  const isCompletedScan = currentScan?.status === 'completed';
                  const isFailedScan = currentScan?.status === 'failed';

                  // Stage states
                  let isStageDone = isCompletedScan;
                  let isStageCurrent = false;

                  if (isScanRunning) {
                    const currentStageIdx = SCAN_STAGES.findIndex((s) => s.id === currentScan?.stage);
                    if (currentStageIdx >= 0) {
                      isStageDone = idx < currentStageIdx;
                      isStageCurrent = idx === currentStageIdx;
                    } else {
                      isStageCurrent = idx === 0;
                    }
                  } else if (isFailedScan) {
                    const failStageIdx = SCAN_STAGES.findIndex((s) => s.id === currentScan?.stage);
                    isStageDone = failStageIdx >= 0 && idx < failStageIdx;
                    isStageCurrent = idx === failStageIdx;
                  }

                  return (
                    <div
                      key={stg.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: isStageDone
                          ? '#f0fdf4'
                          : isStageCurrent
                          ? '#eff6ff'
                          : '#f8fafc',
                        border: isStageDone
                          ? '1px solid #86efac'
                          : isStageCurrent
                          ? '1px solid #3b82f6'
                          : '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: isStageDone
                          ? '#15803d'
                          : isStageCurrent
                          ? '#1d4ed8'
                          : '#475569',
                      }}
                    >
                      {isStageDone ? (
                        <CheckCircle2 size={13} color="var(--accent-green)" />
                      ) : isStageCurrent ? (
                        <RotateCw size={13} className="animate-spin" color="var(--electric-blue-bright)" />
                      ) : (
                        <Clock size={13} color="var(--text-muted)" />
                      )}
                      <span style={{ fontWeight: isStageCurrent ? 600 : 400 }}>{stg.label}</span>
                    </div>
                  );
                })}
              </div>

              {currentScan?.error_message && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--accent-rose)', fontSize: '12px' }}>
                  <strong>Scan Error:</strong> {currentScan.error_message}
                </div>
              )}
            </div>
          )}

          {/* Navigation Tabs Bar */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '2px', flexWrap: 'wrap' }}>
            <button
              onClick={() => switchTab('findings')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'findings' ? '2px solid var(--electric-blue)' : '2px solid transparent',
                color: activeTab === 'findings' ? 'var(--electric-blue-bright)' : 'var(--text-secondary)',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-selected={activeTab === 'findings'}
            >
              <AlertTriangle size={15} />
              Issues & Findings
              {activeFindingsList.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: activeFindingsList.length > 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: activeFindingsList.length > 0 ? '#f87171' : '#34d399',
                  }}
                >
                  {activeFindingsList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => switchTab('solutions')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'solutions' ? '2px solid var(--accent-green)' : '2px solid transparent',
                color: activeTab === 'solutions' ? 'var(--accent-green)' : 'var(--text-secondary)',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-selected={activeTab === 'solutions'}
            >
              <Wrench size={15} />
              Exact Solutions & Fixes
              {solutionPlan?.total_solutions ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                  }}
                >
                  {solutionPlan.total_solutions}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => switchTab('matrix')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'matrix' ? '2px solid var(--teal)' : '2px solid transparent',
                color: activeTab === 'matrix' ? 'var(--teal-bright)' : 'var(--text-secondary)',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-selected={activeTab === 'matrix'}
            >
              <Shield size={15} />
              Scanner Engine Matrix
              {scanReport?.scanners_run && (
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(20, 184, 166, 0.2)', color: 'var(--teal-bright)' }}>
                  {scanReport.scanners_run.length}
                </span>
              )}
            </button>

            <button
              onClick={() => switchTab('ai')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'ai' ? '2px solid var(--accent-purple)' : '2px solid transparent',
                color: activeTab === 'ai' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-selected={activeTab === 'ai'}
            >
              <Sparkles size={15} />
              AI Security Audit (4-Agent)
            </button>

            <button
              onClick={() => switchTab('history')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'history' ? '2px solid var(--accent-amber)' : '2px solid transparent',
                color: activeTab === 'history' ? 'var(--accent-amber)' : 'var(--text-secondary)',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-selected={activeTab === 'history'}
            >
              <History size={15} />
              Scan History
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                {pastScans.length}
              </span>
            </button>
          </div>

          {/* TAB 1: FINDINGS */}
          {activeTab === 'findings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(scanReport || (findingsScope === 'all' && allRepoFindings.length > 0)) ? (
                <>
                  {/* Coverage Notice Banner (if active repo has skipped files) */}
                  {scanReport && ((scanReport.files_skipped && scanReport.files_skipped > 0) ||
                    (scanReport.coverage_summary?.files_skipped && scanReport.coverage_summary.files_skipped > 0)) && (
                    <div
                      style={{
                        padding: '12px 18px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        fontSize: '13px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle size={18} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
                        <span>
                          <strong>Coverage note:</strong>{' '}
                          {scanReport.files_scanned ?? scanReport.coverage_summary?.files_scanned ?? 0} of{' '}
                          {scanReport.files_discovered ?? scanReport.coverage_summary?.files_discovered ?? 0} source files scanned.{' '}
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                            {scanReport.files_skipped ?? scanReport.coverage_summary?.files_skipped ?? 0} files skipped.
                          </span>{' '}
                          Skipped files were <strong>not verified</strong>.
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Oversized (&gt;1 MB source) &amp; binary exclusions
                      </span>
                    </div>
                  )}

                  {/* Summary Metric Counters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {metricsSource.total}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Total Findings
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center', borderTop: '2px solid var(--accent-rose)' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#f87171' }}>
                        {metricsSource.critical}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Critical
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center', borderTop: '2px solid var(--accent-amber)' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#fbbf24' }}>
                        {metricsSource.high}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        High
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center', borderTop: '2px solid var(--electric-blue)' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa' }}>
                        {metricsSource.medium}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Medium
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center', borderTop: '2px solid var(--accent-green)' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                        {metricsSource.low}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Low / Info
                      </div>
                    </div>
                  </div>

                  {/* Findings Filters & Table */}
                  <div className="glass-card" style={{ padding: '20px 24px' }}>
                    {/* Header Row: Title, Scope Switcher, and Save/Export Action Toolbar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                          <AlertTriangle size={18} color="var(--electric-blue-bright)" />
                          Issues in Repositories ({filteredFindings.length})
                        </h3>

                        {/* Scope Switcher Pills */}
                        <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <button
                            onClick={() => setFindingsScope('current')}
                            style={{
                              background: findingsScope === 'current' ? '#ffffff' : 'transparent',
                              color: findingsScope === 'current' ? '#1d4ed8' : '#64748b',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: findingsScope === 'current' ? 700 : 500,
                              cursor: 'pointer',
                              boxShadow: findingsScope === 'current' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              transition: 'all 0.15s ease',
                            }}
                            title="Show issues in selected repository only"
                          >
                            <GitBranch size={12} color={findingsScope === 'current' ? '#1d4ed8' : '#64748b'} />
                            <span>{activeRepo?.name || 'Current Repo'}</span>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: findingsScope === 'current' ? '#dbeafe' : '#e2e8f0' }}>
                              {scanReport?.findings?.length || 0}
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              setFindingsScope('all');
                              loadAllRepositoryFindings();
                            }}
                            style={{
                              background: findingsScope === 'all' ? '#ffffff' : 'transparent',
                              color: findingsScope === 'all' ? '#1d4ed8' : '#64748b',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: findingsScope === 'all' ? 700 : 500,
                              cursor: 'pointer',
                              boxShadow: findingsScope === 'all' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              transition: 'all 0.15s ease',
                            }}
                            title="Show and save all issues across all connected repositories"
                          >
                            {isLoadingAllFindings ? <RotateCw size={12} className="animate-spin" /> : <Layers size={12} color={findingsScope === 'all' ? '#1d4ed8' : '#64748b'} />}
                            <span>All Repositories</span>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: findingsScope === 'all' ? '#dbeafe' : '#e2e8f0' }}>
                              {isLoadingAllFindings ? '...' : allRepoFindings.length}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Save & Export Action Toolbar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={downloadIssuesCsv}
                          disabled={filteredFindings.length === 0}
                          className="btn btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 10px' }}
                          title="Save issues with exact file path and line numbers to CSV"
                          aria-label="Save CSV report"
                        >
                          <FileSpreadsheet size={13} color="#15803d" />
                          Save CSV
                        </button>

                        <button
                          onClick={downloadIssuesMarkdown}
                          disabled={filteredFindings.length === 0}
                          className="btn btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 10px' }}
                          title="Save issues report with remediation steps to Markdown (.md)"
                          aria-label="Save Markdown report"
                        >
                          <FileText size={13} color="#2563eb" />
                          Save Markdown
                        </button>

                        <button
                          onClick={downloadIssuesJson}
                          disabled={filteredFindings.length === 0}
                          className="btn btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 10px' }}
                          title="Save structured issues JSON dataset"
                          aria-label="Save JSON report"
                        >
                          <Download size={13} color="#7c3aed" />
                          Save JSON
                        </button>

                        <button
                          onClick={copyAllIssuesText}
                          disabled={filteredFindings.length === 0}
                          className="btn btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 10px' }}
                          title="Copy issues formatted line-by-line with folder/file:line location"
                          aria-label="Copy All Issues text"
                        >
                          {copiedIssuesList ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
                          {copiedIssuesList ? 'All Issues Copied!' : 'Copy Lines'}
                        </button>
                      </div>
                    </div>

                    {/* Filter controls row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
                        {/* Search */}
                        <div style={{ position: 'relative', width: '220px' }}>
                          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} aria-hidden="true" />
                          <input
                            className="input"
                            style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
                            placeholder="Search rules, paths, messages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Filter findings by text"
                          />
                        </div>

                        {/* Severity Filter */}
                        <select
                          className="input"
                          style={{ height: '34px', fontSize: '12px', width: '135px' }}
                          value={selectedSeverity}
                          onChange={(e) => setSelectedSeverity(e.target.value)}
                          aria-label="Filter by severity"
                        >
                          <option value="all">All Severities</option>
                          <option value="critical">Critical</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                          <option value="info">Info</option>
                        </select>

                        {/* Scanner Engine Filter */}
                        <select
                          className="input"
                          style={{ height: '34px', fontSize: '12px', width: '150px' }}
                          value={selectedScanner}
                          onChange={(e) => setSelectedScanner(e.target.value)}
                          aria-label="Filter by scanner engine"
                        >
                          <option value="all">All Scanners</option>
                          <option value="semgrep">Semgrep</option>
                          <option value="bandit">Bandit</option>
                          <option value="detect-secrets">detect-secrets</option>
                          <option value="osv-scanner">OSV-Scanner</option>
                          <option value="agentguard_sast">AgentGuard SAST</option>
                        </select>

                        {/* Verification Status Filter */}
                        <select
                          className="input"
                          style={{ height: '34px', fontSize: '12px', width: '140px' }}
                          value={selectedVerification}
                          onChange={(e) => setSelectedVerification(e.target.value)}
                          aria-label="Filter by verification status"
                        >
                          <option value="all">All Verification</option>
                          <option value="verified">Verified</option>
                          <option value="unverified">Unverified</option>
                          <option value="fixed">Fixed</option>
                        </select>

                        {/* Classification Filter */}
                        <select
                          className="input"
                          style={{ height: '34px', fontSize: '12px', width: '160px' }}
                          value={selectedClassification}
                          onChange={(e) => setSelectedClassification(e.target.value)}
                          aria-label="Filter by credential classification"
                        >
                          <option value="all">All Classifications</option>
                          <option value="confirmed_secret">Confirmed Secrets</option>
                          <option value="likely_placeholder">Likely Placeholders</option>
                          <option value="needs_review">Needs Review</option>
                        </select>
                      </div>
                    </div>

                    {/* Table */}
                    {filteredFindings.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {findings.length === 0 ? (
                          <div>
                            <ShieldCheck size={40} color="var(--accent-green)" style={{ margin: '0 auto 12px' }} />
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              No Security Findings Identified
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '480px', margin: '4px auto 0' }}>
                              All inspected files and manifests passed active static security analyzer rules.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <Sliders size={32} color="var(--text-muted)" style={{ margin: '0 auto 10px' }} />
                            <div>No findings match the selected filters.</div>
                            <button
                              onClick={() => {
                                setSelectedSeverity('all');
                                setSelectedScanner('all');
                                setSelectedVerification('all');
                                setSearchQuery('');
                              }}
                              className="btn btn-secondary"
                              style={{ marginTop: '12px', fontSize: '11px' }}
                            >
                              Reset Filters
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                              <th style={{ padding: '10px 12px', width: '32px' }}></th>
                              <th style={{ padding: '10px 12px' }}>Severity</th>
                              <th style={{ padding: '10px 12px' }}>Scanner & Rule</th>
                              {findingsScope === 'all' && <th style={{ padding: '10px 12px' }}>Repository</th>}
                              <th style={{ padding: '10px 12px' }}>Title</th>
                              <th style={{ padding: '10px 12px' }}>Folder / File Location & Line</th>
                              <th style={{ padding: '10px 12px' }}>Verification</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const primaryFindings = filteredFindings.filter(
                                (f) => f.classification !== 'likely_placeholder'
                              );
                              const placeholderFindings = filteredFindings.filter(
                                (f) => f.classification === 'likely_placeholder'
                              );

                              const renderFindingRow = (finding: Finding) => {
                                const isExpanded = expandedFindingId === finding.id;
                                const sevClass = `severity-${finding.severity}`;

                              return (
                                <React.Fragment key={finding.id}>
                                  <tr
                                    onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                                    style={{
                                      borderBottom: '1px solid rgba(30, 58, 110, 0.4)',
                                      cursor: 'pointer',
                                      background: isExpanded ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                      transition: 'background 0.15s',
                                    }}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setExpandedFindingId(isExpanded ? null : finding.id);
                                      }
                                    }}
                                    aria-expanded={isExpanded}
                                  >
                                    <td style={{ padding: '12px' }}>
                                      {isExpanded ? <ChevronDown size={14} color="var(--teal)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                      <span
                                        className={sevClass}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        {finding.severity}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{finding.scanner}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{finding.rule_id || 'GENERAL'}</div>
                                    </td>
                                    {findingsScope === 'all' && (
                                      <td style={{ padding: '12px' }}>
                                        <span
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: '#f1f5f9',
                                            color: '#1e293b',
                                            fontWeight: 600,
                                            border: '1px solid #cbd5e1',
                                            whiteSpace: 'nowrap',
                                          }}
                                          title={`Repository: ${finding.repository_name || 'Repository'}`}
                                        >
                                          <GitBranch size={11} color="#64748b" />
                                          {finding.repository_name || 'Repository'}
                                        </span>
                                      </td>
                                    )}
                                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span>{finding.title}</span>
                                        {finding.classification && (
                                          <span
                                            style={{
                                              fontSize: '10px',
                                              padding: '2px 7px',
                                              borderRadius: '4px',
                                              fontWeight: 700,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.3px',
                                              background:
                                                finding.classification === 'confirmed_secret'
                                                  ? '#fef2f2'
                                                  : finding.classification === 'likely_placeholder'
                                                  ? '#fffbeb'
                                                  : '#faf5ff',
                                              color:
                                                finding.classification === 'confirmed_secret'
                                                  ? '#dc2626'
                                                  : finding.classification === 'likely_placeholder'
                                                  ? '#b45309'
                                                  : '#7e22ce',
                                              border:
                                                finding.classification === 'confirmed_secret'
                                                  ? '1px solid #fecaca'
                                                  : finding.classification === 'likely_placeholder'
                                                  ? '1px solid #fde68a'
                                                  : '1px solid #e9d5ff',
                                            }}
                                            title={`Classification: ${finding.classification}${finding.classification_reason ? ` — ${finding.classification_reason}` : ''}`}
                                          >
                                            {finding.classification === 'confirmed_secret'
                                              ? 'Confirmed Secret'
                                              : finding.classification === 'likely_placeholder'
                                              ? 'Likely Placeholder'
                                              : 'Needs Review'}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                                      {(() => {
                                        const isManifest = finding.location_type === 'manifest' || (!finding.line_number && Boolean(finding.file_path));
                                        const lineRangeStr = finding.line_number
                                          ? (finding.line_end && finding.line_end !== finding.line_number ? `:${finding.line_number}-${finding.line_end}` : `:${finding.line_number}`)
                                          : '';
                                        const fullLocationStr = finding.file_path ? `${finding.file_path}${lineRangeStr}` : 'Manifest-level';

                                        let gitDeepLink: string | null = null;
                                        const targetRepoUrl = finding.repository_url || activeRepo?.url;
                                        if (targetRepoUrl && finding.file_path && finding.line_number) {
                                          const cleanUrl = targetRepoUrl.trim().replace(/\.git$/, '');
                                          if (cleanUrl.startsWith('https://github.com') || cleanUrl.startsWith('https://gitlab.com')) {
                                            const sha = finding.commit_sha || activeRepo?.pinned_sha || 'main';
                                            const lineFragment = finding.line_end && finding.line_end !== finding.line_number
                                              ? `#L${finding.line_number}-L${finding.line_end}`
                                              : `#L${finding.line_number}`;
                                            gitDeepLink = `${cleanUrl}/blob/${sha}/${finding.file_path}${lineFragment}`;
                                          }
                                        }

                                        return finding.file_path ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <Folder size={12} color="#3b82f6" style={{ flexShrink: 0 }} />
                                            {isManifest && (
                                              <span
                                                style={{
                                                  fontSize: '10px',
                                                  background: '#fef3c7',
                                                  color: '#b45309',
                                                  border: '1px solid #fde68a',
                                                  padding: '1px 5px',
                                                  borderRadius: '4px',
                                                  fontWeight: 700,
                                                  textTransform: 'uppercase',
                                                }}
                                                title="Manifest-level dependency finding (package manifest)"
                                              >
                                                Manifest
                                              </span>
                                            )}
                                            <span
                                              style={{
                                                color: isManifest ? '#b45309' : 'var(--electric-blue-bright)',
                                                fontWeight: 600,
                                              }}
                                              title={`Exact repository location: ${fullLocationStr}`}
                                            >
                                              {fullLocationStr}
                                            </span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                copyToClipboard(fullLocationStr, () => {
                                                  setCopiedLocationId(finding.id);
                                                  setTimeout(() => setCopiedLocationId(null), 1500);
                                                });
                                              }}
                                              className="btn-icon"
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '2px',
                                                color: copiedLocationId === finding.id ? 'var(--accent-green)' : '#94a3b8',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                              }}
                                              title="Copy path:line"
                                              aria-label="Copy exact location path"
                                            >
                                              {copiedLocationId === finding.id ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                            {gitDeepLink && (
                                              <a
                                                href={gitDeepLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Open in GitHub at this exact line"
                                                style={{
                                                  color: '#64748b',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  textDecoration: 'none',
                                                }}
                                                aria-label="Open source line in repository"
                                              >
                                                <ExternalLink size={12} />
                                              </a>
                                            )}
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            Manifest-level finding
                                          </span>
                                        );
                                      })()}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(148, 163, 184, 0.15)',
                                          color: 'var(--text-secondary)',
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        {finding.verification_status}
                                      </span>
                                    </td>
                                  </tr>

                                  {/* Expanded Detail Row */}
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={findingsScope === 'all' ? 7 : 6} style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                          {/* Exact Location & Repository Header Banner */}
                                          <div
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              flexWrap: 'wrap',
                                              gap: '8px',
                                              padding: '10px 14px',
                                              borderRadius: '6px',
                                              background: '#eff6ff',
                                              border: '1px solid #bfdbfe',
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                              <Folder size={14} color="#2563eb" />
                                              <span style={{ color: '#1e3a8a', fontWeight: 600 }}>File & Line Location:</span>
                                              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1d4ed8', fontWeight: 700 }}>
                                                {finding.file_path ? `${finding.file_path}${finding.line_number ? `:${finding.line_number}${finding.line_end && finding.line_end !== finding.line_number ? `-${finding.line_end}` : ''}` : ''}` : 'Manifest-level'}
                                              </span>
                                              {finding.repository_name && (
                                                <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>
                                                  (Repository: <strong>{finding.repository_name}</strong>)
                                                </span>
                                              )}
                                            </div>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const lineRange = finding.line_number
                                                  ? (finding.line_end && finding.line_end !== finding.line_number ? `:${finding.line_number}-${finding.line_end}` : `:${finding.line_number}`)
                                                  : '';
                                                const loc = finding.file_path ? `${finding.file_path}${lineRange}` : '';
                                                copyToClipboard(loc, () => {
                                                  setCopiedLocationId(finding.id + 500000);
                                                  setTimeout(() => setCopiedLocationId(null), 1500);
                                                });
                                              }}
                                              className="btn btn-secondary"
                                              style={{ fontSize: '11px', padding: '3px 8px' }}
                                            >
                                              {copiedLocationId === finding.id + 500000 ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                                              {copiedLocationId === finding.id + 500000 ? 'Copied Location' : 'Copy File:Line'}
                                            </button>
                                          </div>

                                          {/* Evidence-Based Credential Classification Card */}
                                          {finding.classification && (
                                            <div
                                              style={{
                                                padding: '12px 16px',
                                                borderRadius: '8px',
                                                background:
                                                  finding.classification === 'likely_placeholder'
                                                    ? '#fffbeb'
                                                    : finding.classification === 'needs_review'
                                                    ? '#faf5ff'
                                                    : '#fef2f2',
                                                border:
                                                  finding.classification === 'likely_placeholder'
                                                    ? '1px solid #fde68a'
                                                    : finding.classification === 'needs_review'
                                                    ? '1px solid #e9d5ff'
                                                    : '1px solid #fecaca',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                              }}
                                            >
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span
                                                    style={{
                                                      fontSize: '11px',
                                                      fontWeight: 800,
                                                      textTransform: 'uppercase',
                                                      padding: '2px 8px',
                                                      borderRadius: '4px',
                                                      background: '#ffffff',
                                                      border:
                                                        finding.classification === 'likely_placeholder'
                                                          ? '1px solid #fde68a'
                                                          : finding.classification === 'needs_review'
                                                          ? '1px solid #e9d5ff'
                                                          : '1px solid #fecaca',
                                                      color:
                                                        finding.classification === 'likely_placeholder'
                                                          ? '#b45309'
                                                          : finding.classification === 'needs_review'
                                                          ? '#7e22ce'
                                                          : '#dc2626',
                                                    }}
                                                  >
                                                    {finding.classification === 'confirmed_secret'
                                                      ? '🛡 Confirmed Secret'
                                                      : finding.classification === 'likely_placeholder'
                                                      ? 'ℹ Likely Placeholder (Tutorial/Documentation Example)'
                                                      : '⚠ Needs Review'}
                                                  </span>
                                                </div>
                                                {finding.secret_redacted_preview && (
                                                  <span
                                                    style={{
                                                      fontFamily: 'JetBrains Mono, monospace',
                                                      fontSize: '12px',
                                                      background: '#ffffff',
                                                      padding: '2px 8px',
                                                      borderRadius: '4px',
                                                      border: '1px solid #cbd5e1',
                                                      fontWeight: 700,
                                                      color: '#1e293b',
                                                    }}
                                                    title="Safe masked preview of detected secret string (raw value is never stored or exposed)"
                                                  >
                                                    Masked Preview: <code>{finding.secret_redacted_preview}</code>
                                                  </span>
                                                )}
                                              </div>
                                              {finding.classification_reason && (
                                                <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>
                                                  <strong>Classification Evidence:</strong> {finding.classification_reason}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Flagged Code Snippet */}
                                          {finding.code_snippet && (
                                            <div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '11px', color: '#0284c7', textTransform: 'uppercase', fontWeight: 600 }}>
                                                  Flagged Code Snippet ({finding.file_path}{finding.line_number ? `:${finding.line_number}` : ''}):
                                                </span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(finding.code_snippet || '', () => {
                                                      setCopiedEvidenceId(finding.id + 999999);
                                                      setTimeout(() => setCopiedEvidenceId(null), 1500);
                                                    });
                                                  }}
                                                  className="btn btn-secondary"
                                                  style={{ fontSize: '11px', padding: '2px 8px' }}
                                                  aria-label="Copy flagged code snippet"
                                                >
                                                  {copiedEvidenceId === (finding.id + 999999) ? (
                                                    <>
                                                      <Check size={12} color="var(--accent-green)" />
                                                      Copied!
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Copy size={12} />
                                                      Copy Code
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                              <pre
                                                style={{
                                                  padding: '12px 14px',
                                                  borderRadius: '6px',
                                                  background: '#0f172a',
                                                  border: '1px solid #334155',
                                                  fontFamily: 'JetBrains Mono, monospace',
                                                  fontSize: '12px',
                                                  color: '#38bdf8',
                                                  overflowX: 'auto',
                                                  whiteSpace: 'pre-wrap',
                                                  lineHeight: 1.5,
                                                }}
                                              >
                                                {finding.code_snippet}
                                              </pre>
                                            </div>
                                          )}

                                          {/* Redacted Evidence */}
                                          {finding.sanitized_evidence && (
                                            <div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                                  Sanitized Evidence Excerpt (Redacted):
                                                </span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(finding.sanitized_evidence || '', () => {
                                                      setCopiedEvidenceId(finding.id);
                                                      setTimeout(() => setCopiedEvidenceId(null), 1500);
                                                    });
                                                  }}
                                                  className="btn btn-secondary"
                                                  style={{ fontSize: '11px', padding: '2px 8px' }}
                                                  aria-label="Copy sanitized evidence excerpt"
                                                >
                                                  {copiedEvidenceId === finding.id ? (
                                                    <>
                                                      <Check size={12} color="var(--accent-green)" />
                                                      Copied!
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Copy size={12} />
                                                      Copy Excerpt
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                              <pre
                                                style={{
                                                  padding: '12px 14px',
                                                  borderRadius: '6px',
                                                  background: '#ffffff',
                                                  border: '1px solid #cbd5e1',
                                                  fontFamily: 'JetBrains Mono, monospace',
                                                  fontSize: '12px',
                                                  color: '#0f172a',
                                                  overflowX: 'auto',
                                                  whiteSpace: 'pre-wrap',
                                                  lineHeight: 1.5,
                                                }}
                                              >
                                                {finding.sanitized_evidence}
                                              </pre>
                                            </div>
                                          )}

                                          {/* Explanation */}
                                          {finding.explanation && (
                                            <div>
                                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>
                                                Technical Explanation:
                                              </div>
                                              <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                {finding.explanation}
                                              </div>
                                            </div>
                                          )}

                                          {/* Remediation */}
                                          {finding.remediation && (
                                            <div>
                                              <div style={{ fontSize: '11px', color: 'var(--accent-green)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>
                                                Recommended Remediation:
                                              </div>
                                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                {finding.remediation}
                                              </div>
                                            </div>
                                          )}

                                          {/* Exact Solution & Code Patch */}
                                          {(() => {
                                            const sol = findingSolutions[finding.id];
                                            const isEnhancing = enhancingFindingId === finding.id;

                                            return (
                                              <div
                                                style={{
                                                  padding: '14px 16px',
                                                  borderRadius: '8px',
                                                  background: '#ffffff',
                                                  border: '1px solid #e2e8f0',
                                                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  gap: '12px',
                                                }}
                                              >
                                                {/* Header */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Wrench size={15} color="var(--accent-green)" />
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                      Exact Solution & Actionable Fix
                                                    </span>
                                                    {sol && (
                                                      <span
                                                        style={{
                                                          fontSize: '10px',
                                                          padding: '2px 8px',
                                                          borderRadius: '4px',
                                                          fontWeight: 600,
                                                          textTransform: 'uppercase',
                                                          background:
                                                            sol.solution_type === 'dependency_upgrade'
                                                              ? '#f0fdf4'
                                                              : sol.solution_type === 'secret_removal'
                                                              ? '#fef2f2'
                                                              : sol.solution_type === 'security_config'
                                                              ? '#faf5ff'
                                                              : '#eff6ff',
                                                          color:
                                                            sol.solution_type === 'dependency_upgrade'
                                                              ? '#15803d'
                                                              : sol.solution_type === 'secret_removal'
                                                              ? '#dc2626'
                                                              : sol.solution_type === 'security_config'
                                                              ? '#7c3aed'
                                                              : '#1d4ed8',
                                                          border:
                                                            sol.solution_type === 'dependency_upgrade'
                                                              ? '1px solid #bbf7d0'
                                                              : sol.solution_type === 'secret_removal'
                                                              ? '1px solid #fecaca'
                                                              : sol.solution_type === 'security_config'
                                                              ? '1px solid #e9d5ff'
                                                              : '1px solid #bfdbfe',
                                                        }}
                                                      >
                                                        {sol.solution_type.replace('_', ' ')}
                                                      </span>
                                                    )}
                                                    {sol?.model_used && (
                                                      <span style={{ fontSize: '10px', color: 'var(--accent-purple)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <Sparkles size={11} /> Nemotron Enhanced
                                                      </span>
                                                    )}
                                                  </div>

                                                  {/* Action buttons */}
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAiEnhanceFinding(finding.id);
                                                      }}
                                                      disabled={isEnhancing}
                                                      className="btn btn-secondary"
                                                      style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                      title="Regenerate deep solution via NVIDIA Nemotron"
                                                    >
                                                      {isEnhancing ? (
                                                        <>
                                                          <RotateCw size={12} className="animate-spin" color="var(--accent-purple)" />
                                                          AI Reasoning...
                                                        </>
                                                      ) : (
                                                        <>
                                                          <Sparkles size={12} color="var(--accent-purple)" />
                                                          AI Deep Remediate
                                                        </>
                                                      )}
                                                    </button>
                                                  </div>
                                                </div>

                                                {sol ? (
                                                  <>
                                                    {/* Action summary */}
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                      {sol.action_summary}
                                                    </div>

                                                    {/* CLI Command */}
                                                    {sol.cli_command && (
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Terminal size={12} color="var(--teal-bright)" /> Terminal Remediation Command:
                                                          </span>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              copyToClipboard(sol.cli_command || '', () => {
                                                                setCopiedCliCmd(sol.cli_command);
                                                                setTimeout(() => setCopiedCliCmd(null), 1500);
                                                              });
                                                            }}
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: '11px', padding: '2px 8px' }}
                                                          >
                                                            {copiedCliCmd === sol.cli_command ? (
                                                              <>
                                                                <Check size={12} color="var(--accent-green)" /> Copied!
                                                              </>
                                                            ) : (
                                                              <>
                                                                <Copy size={12} /> Copy Command
                                                              </>
                                                            )}
                                                          </button>
                                                        </div>
                                                        <div
                                                          style={{
                                                            padding: '8px 12px',
                                                            background: '#f1f5f9',
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '6px',
                                                            fontFamily: 'JetBrains Mono, monospace',
                                                            fontSize: '12px',
                                                            color: '#0f172a',
                                                            overflowX: 'auto',
                                                            userSelect: 'all',
                                                          }}
                                                        >
                                                          $ {sol.cli_command}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* Unified Diff */}
                                                    {sol.diff && (
                                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Code2 size={12} color="var(--electric-blue-bright)" /> Unified Code Diff (Before / After Patch):
                                                          </span>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              copyToClipboard(sol.diff || '', () => {
                                                                setCopiedSolutionId(sol.finding_id);
                                                                setTimeout(() => setCopiedSolutionId(null), 1500);
                                                              });
                                                            }}
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: '11px', padding: '2px 8px' }}
                                                          >
                                                            {copiedSolutionId === sol.finding_id ? (
                                                              <>
                                                                <Check size={12} color="var(--accent-green)" /> Copied!
                                                              </>
                                                            ) : (
                                                              <>
                                                                <Copy size={12} /> Copy Diff
                                                              </>
                                                            )}
                                                          </button>
                                                        </div>
                                                        {renderUnifiedDiff(sol.diff)}
                                                      </div>
                                                    )}

                                                    {/* Verification Step */}
                                                    {sol.verification_step && (
                                                      <div style={{ fontSize: '12px', color: '#166534', background: '#f0fdf4', padding: '8px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                                        <strong style={{ color: '#15803d' }}>Verification Step:</strong> {sol.verification_step}
                                                      </div>
                                                    )}
                                                  </>
                                                ) : (
                                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <RotateCw size={13} className="animate-spin" />
                                                    Computing exact automated solution...
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()}

                                          {/* Metadata footer */}
                                          <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', paddingTop: '6px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                            <span>Scanner: <strong>{finding.scanner}</strong></span>
                                            {finding.scanner_version && <span>Version: <strong>v{finding.scanner_version}</strong></span>}
                                            {finding.rule_id && <span>Rule: <strong>{finding.rule_id}</strong></span>}
                                            {finding.fingerprint && <span>Fingerprint: <code>{finding.fingerprint.slice(0, 12)}…</code></span>}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            };

                            return (
                              <>
                                {primaryFindings.map(renderFindingRow)}

                                {placeholderFindings.length > 0 && (
                                  <>
                                    <tr
                                      style={{
                                        background: '#fffbeb',
                                        borderTop: '2px solid #fde68a',
                                        borderBottom: '2px solid #fde68a',
                                      }}
                                    >
                                      <td
                                        colSpan={findingsScope === 'all' ? 7 : 6}
                                        style={{ padding: '12px 16px' }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '8px',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Info size={16} color="#b45309" />
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#92400e' }}>
                                              Likely Placeholders / Documentation Examples ({placeholderFindings.length})
                                            </span>
                                            <span
                                              style={{
                                                fontSize: '11px',
                                                color: '#b45309',
                                                background: '#fef3c7',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                border: '1px solid #fde68a',
                                              }}
                                            >
                                              Documented example credentials & non-production placeholders
                                            </span>
                                          </div>
                                          <button
                                            onClick={() => setShowPlaceholdersSection(!showPlaceholdersSection)}
                                            className="btn-outline"
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                              fontSize: '12px',
                                              padding: '4px 10px',
                                              borderColor: '#fde68a',
                                              color: '#92400e',
                                              background: '#ffffff',
                                              cursor: 'pointer',
                                              borderRadius: '6px',
                                            }}
                                            type="button"
                                          >
                                            {showPlaceholdersSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            {showPlaceholdersSection ? 'Hide Placeholders' : `Show Placeholders (${placeholderFindings.length})`}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {showPlaceholdersSection && placeholderFindings.map(renderFindingRow)}
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Ready to Scan State */
                <div className="glass-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <ShieldAlert size={40} color="var(--electric-blue)" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Repository Ready for Security Audit
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '520px', margin: '8px auto 20px' }}>
                    Click <strong>Analyze Repository</strong> above to clone into an isolated ephemeral workspace, execute static analyzers (Semgrep, Bandit, OSV-Scanner, detect-secrets), and review evidence.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleStartAnalysis} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <Shield size={14} />
                      Start Security Analysis Now
                    </button>
                    {allRepoFindings.length > 0 && (
                      <button
                        onClick={() => {
                          switchTab('findings');
                          setFindingsScope('all');
                          loadAllRepositoryFindings();
                        }}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Layers size={14} />
                        View All Issues Across Repositories ({allRepoFindings.length})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXACT SOLUTIONS */}
          {activeTab === 'solutions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {scanReport ? (
                <>
                  {/* Summary Metric Counters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                        {solutionPlan?.total_solutions ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Total Automated Fixes
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--electric-blue-bright)' }}>
                        {solutionPlan?.code_diffs_count ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Code Diff Patches
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--teal-bright)' }}>
                        {solutionPlan?.dependency_upgrades_count ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Dependency Upgrades
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-rose)' }}>
                        {solutionPlan?.secret_removals_count ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
                        Secret Redactions
                      </div>
                    </div>
                  </div>

                  {/* Quick-Fix All Action Card */}
                  <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Wrench size={18} color="var(--accent-green)" />
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Automated Repository Remediation Plan
                          </h3>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          One-click CLI commands and verified unified diffs to resolve all detected vulnerabilities on commit{' '}
                          <code style={{ color: 'var(--electric-blue-bright)' }}>{scanReport.commit_sha?.slice(0, 7) || 'latest'}</code>.
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {solutionPlan?.full_unified_patch && (
                          <>
                            <button
                              onClick={() => {
                                copyToClipboard(solutionPlan.full_unified_patch || '', () => {
                                  setCopiedPatchFile(true);
                                  setTimeout(() => setCopiedPatchFile(false), 2000);
                                });
                              }}
                              className="btn btn-secondary"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                            >
                              {copiedPatchFile ? (
                                <>
                                  <Check size={14} color="var(--accent-green)" />
                                  Patch Copied!
                                </>
                              ) : (
                                <>
                                  <Copy size={14} />
                                  Copy Git Patch
                                </>
                              )}
                            </button>

                            <button
                              onClick={downloadPatchFile}
                              className="btn btn-primary"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                            >
                              <Download size={14} />
                              Download .patch File
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick-Fix CLI Commands */}
                    {solutionPlan?.quick_fix_cli_commands && solutionPlan.quick_fix_cli_commands.length > 0 && (
                      <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Terminal size={14} /> Batch Terminal Upgrade Commands:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {solutionPlan.quick_fix_cli_commands.map((cmd, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                gap: '12px',
                              }}
                            >
                              <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#0f172a', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                $ {cmd}
                              </code>
                              <button
                                onClick={() => {
                                  copyToClipboard(cmd, () => {
                                    setCopiedCliCmd(cmd);
                                    setTimeout(() => setCopiedCliCmd(null), 1500);
                                  });
                                }}
                                className="btn btn-secondary"
                                style={{ fontSize: '11px', padding: '2px 8px', flexShrink: 0 }}
                              >
                                {copiedCliCmd === cmd ? (
                                  <>
                                    <Check size={12} color="var(--accent-green)" /> Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} /> Copy
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSelectedSolutionFilter('all')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: selectedSolutionFilter === 'all' ? '#2563eb' : '#ffffff',
                        color: selectedSolutionFilter === 'all' ? '#fff' : '#334155',
                        border: selectedSolutionFilter === 'all' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                      }}
                    >
                      All Solutions ({solutionPlan?.total_solutions ?? 0})
                    </button>
                    <button
                      onClick={() => setSelectedSolutionFilter('code_diff')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: selectedSolutionFilter === 'code_diff' ? '#2563eb' : '#ffffff',
                        color: selectedSolutionFilter === 'code_diff' ? '#fff' : '#334155',
                        border: selectedSolutionFilter === 'code_diff' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                      }}
                    >
                      Code Diffs ({solutionPlan?.code_diffs_count ?? 0})
                    </button>
                    <button
                      onClick={() => setSelectedSolutionFilter('dependency_upgrade')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: selectedSolutionFilter === 'dependency_upgrade' ? '#0d9488' : '#ffffff',
                        color: selectedSolutionFilter === 'dependency_upgrade' ? '#fff' : '#334155',
                        border: selectedSolutionFilter === 'dependency_upgrade' ? '1px solid #0d9488' : '1px solid #cbd5e1',
                      }}
                    >
                      Dependency Upgrades ({solutionPlan?.dependency_upgrades_count ?? 0})
                    </button>
                    <button
                      onClick={() => setSelectedSolutionFilter('secret_removal')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: selectedSolutionFilter === 'secret_removal' ? '#e11d48' : '#ffffff',
                        color: selectedSolutionFilter === 'secret_removal' ? '#fff' : '#334155',
                        border: selectedSolutionFilter === 'secret_removal' ? '1px solid #e11d48' : '1px solid #cbd5e1',
                      }}
                    >
                      Secret Removals ({solutionPlan?.secret_removals_count ?? 0})
                    </button>
                  </div>

                  {/* File-by-File Fix Plan */}
                  {isLoadingSolutions ? (
                    <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RotateCw size={24} className="animate-spin" color="var(--electric-blue-bright)" style={{ margin: '0 auto 12px' }} />
                      <div>Computing precision fixes and unified patches...</div>
                    </div>
                  ) : solutionPlan?.file_groups && solutionPlan.file_groups.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {solutionPlan.file_groups.map((group, gIdx) => {
                        const matchingSolutions = group.solutions.filter(
                          (s) => selectedSolutionFilter === 'all' || s.solution_type === selectedSolutionFilter
                        );
                        if (matchingSolutions.length === 0) return null;

                        return (
                          <div key={gIdx} className="glass-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* File Group Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileCode size={18} color="var(--electric-blue-bright)" />
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {group.file_path}
                                </span>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: 'rgba(59, 130, 246, 0.15)',
                                    color: 'var(--electric-blue-bright)',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                  }}
                                >
                                  {matchingSolutions.length} {matchingSolutions.length === 1 ? 'fix' : 'fixes'}
                                </span>
                              </div>

                              {group.combined_patch && (
                                <button
                                  onClick={() => {
                                    copyToClipboard(group.combined_patch || '', () => {
                                      setCopiedFilePatchIndex(gIdx);
                                      setTimeout(() => setCopiedFilePatchIndex(null), 1500);
                                    });
                                  }}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  {copiedFilePatchIndex === gIdx ? (
                                    <>
                                      <Check size={12} color="var(--accent-green)" /> Copied File Patch!
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} /> Copy File Patch
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Group Combined Diff */}
                            {group.combined_patch && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                  File Unified Diff:
                                </div>
                                {renderUnifiedDiff(group.combined_patch)}
                              </div>
                            )}

                            {/* Itemized Solutions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                              {matchingSolutions.map((sol) => (
                                <div
                                  key={sol.finding_id}
                                  style={{
                                    padding: '12px 14px',
                                    borderRadius: '6px',
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span
                                        className={`severity-${sol.severity}`}
                                        style={{
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        {sol.severity}
                                      </span>
                                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {sol.action_summary}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {sol.scanner} {sol.rule_id ? `(${sol.rule_id})` : ''}
                                      </span>
                                      <button
                                        onClick={() => handleAiEnhanceFinding(sol.finding_id)}
                                        disabled={enhancingFindingId === sol.finding_id}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '10px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        title="Enhance with AI"
                                      >
                                        {enhancingFindingId === sol.finding_id ? (
                                          <RotateCw size={10} className="animate-spin" />
                                        ) : (
                                          <Sparkles size={10} color="var(--accent-purple)" />
                                        )}
                                        AI Enhance
                                      </button>
                                    </div>
                                  </div>

                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    {sol.explanation}
                                  </div>

                                  {sol.cli_command && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                      <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#0f172a' }}>
                                        $ {sol.cli_command}
                                      </code>
                                      <button
                                        onClick={() => {
                                          copyToClipboard(sol.cli_command || '', () => {
                                            setCopiedCliCmd(sol.cli_command);
                                            setTimeout(() => setCopiedCliCmd(null), 1500);
                                          });
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                                        title="Copy CLI command"
                                      >
                                        {copiedCliCmd === sol.cli_command ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                                      </button>
                                    </div>
                                  )}

                                  {sol.verification_step && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                      <strong style={{ color: 'var(--accent-green)' }}>Verify:</strong> {sol.verification_step}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No fixable findings found for this filter.
                    </div>
                  )}
                </>
              ) : (
                <div className="glass-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <ShieldAlert size={40} color="var(--electric-blue)" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    No Active Scan Report
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '520px', margin: '8px auto 20px' }}>
                    Click <strong>Analyze Repository</strong> above to run security analysis and generate automated exact solutions.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleStartAnalysis} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <Shield size={14} />
                      Start Security Analysis Now
                    </button>
                    {allRepoFindings.length > 0 && (
                      <button
                        onClick={() => {
                          switchTab('findings');
                          setFindingsScope('all');
                          loadAllRepositoryFindings();
                        }}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Layers size={14} />
                        View All Issues Across Repositories ({allRepoFindings.length})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SCANNER ENGINE MATRIX */}
          {activeTab === 'matrix' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {scanReport ? (
                <>
                  {/* Coverage Notice Banner */}
                  {scanReport.coverage_summary &&
                    (!scanReport.coverage_summary.is_complete ||
                      (scanReport.coverage_summary.failed_scanners && scanReport.coverage_summary.failed_scanners.length > 0)) && (
                      <div
                        style={{
                          padding: '14px 18px',
                          borderRadius: '8px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                        }}
                      >
                        <AlertTriangle size={18} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '2px' }}>
                            Security Coverage Notice
                          </div>
                          <div>
                            {scanReport.coverage_summary.missing_scanners && scanReport.coverage_summary.missing_scanners.length > 0 && (
                              <span>
                                Some applicable security scanners were skipped because required binaries are not installed on the host:
                                <strong> {scanReport.coverage_summary.missing_scanners.join(', ')}</strong>.
                              </span>
                            )}
                            {scanReport.coverage_summary.failed_scanners && scanReport.coverage_summary.failed_scanners.length > 0 && (
                              <span style={{ marginLeft: '4px', color: 'var(--accent-rose)' }}>
                                Scanners with execution failures: <strong>{scanReport.coverage_summary.failed_scanners.join(', ')}</strong>.
                              </span>
                            )}
                          </div>
                          {scanReport.coverage_summary.notes && scanReport.coverage_summary.notes.length > 0 && (
                            <ul style={{ paddingLeft: '16px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {scanReport.coverage_summary.notes.map((note: string, idx: number) => (
                                <li key={idx}>{note}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Multi-Engine Scanner Execution & Availability Matrix */}
                  <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={16} color="var(--electric-blue-bright)" />
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Security Scanner Engine Matrix
                        </h3>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Semgrep • Bandit • OSV-Scanner • detect-secrets • AgentGuard SAST
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                      {scanReport.scanners_run.map((sc, idx) => {
                        const isCompleted = sc.status === 'completed' || sc.status === 'success';
                        const isUnavailable = sc.status === 'skipped_unavailable';
                        const isFailed = sc.status === 'failed';
                        const isNotApplicable = sc.status === 'skipped_not_applicable';

                        return (
                          <div
                            key={idx}
                            style={{
                              background: '#ffffff',
                              borderRadius: '8px',
                              border: isCompleted
                                ? '1px solid #86efac'
                                : isUnavailable
                                ? '1px solid #fde68a'
                                : isFailed
                                ? '1px solid #fca5a5'
                                : '1px solid var(--border)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                                {sc.name}
                              </span>
                              {isCompleted && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 600 }}>
                                  ✓ Active {sc.version ? `v${sc.version}` : ''}
                                </span>
                              )}
                              {isUnavailable && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontWeight: 600 }}>
                                  ⚠ Unavailable
                                </span>
                              )}
                              {isFailed && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600 }}>
                                  ✕ Failed
                                </span>
                              )}
                              {isNotApplicable && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                                  ○ Not Applicable
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {sc.reason || sc.error || `${sc.findings_count ?? 0} findings recorded in ${sc.duration_seconds ?? 0}s`}
                            </div>

                            {sc.findings_count !== undefined && sc.findings_count > 0 && (
                              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--electric-blue)', fontWeight: 600 }}>
                                {sc.findings_count} {sc.findings_count === 1 ? 'Finding' : 'Findings'} Detected
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Shield size={36} color="var(--teal)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                  <div>Run an analysis to inspect the active Scanner Engine Matrix.</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI SECURITY AUDIT (4-AGENT) */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {scanReport?.ai_analysis && scanReport.ai_analysis.status !== 'not_configured' ? (
                <div
                  className="glass-card"
                  style={{
                    padding: '22px 24px',
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={18} color="var(--electric-blue)" />
                      <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        NVIDIA Nemotron • LangGraph 4-Agent Security Audit
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 600 }}>
                        Model: {scanReport.ai_analysis.model || 'NVIDIA Nemotron'}
                      </span>
                      {scanReport.ai_analysis.is_fallback && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontWeight: 600 }}>
                          Deterministic Heuristic Fallback
                        </span>
                      )}
                    </div>
                  </div>

                  {/* LangGraph Pipeline Stage Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#0f766e', fontWeight: 600 }}>Orchestration Pipeline:</span>
                    <span style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>1. Threat Modeler</span>
                    <span>→</span>
                    <span style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>2. Test Strategist</span>
                    <span>→</span>
                    <span style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>3. Evidence Analyst</span>
                    <span>→</span>
                    <span style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>4. Remediation Verifier</span>
                  </div>

                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '16px' }}>
                    {scanReport.ai_analysis.executive_summary}
                  </p>

                  {/* 4-Agent Results Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginTop: '12px' }}>
                    {/* Agent 1: Threat Modeler */}
                    {scanReport.ai_analysis.threat_model && (
                      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #bfdbfe', borderTop: '3px solid #2563eb' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
                          Agent 1 • Threat Modeler
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          {scanReport.ai_analysis.threat_model.threat_model_summary}
                        </div>
                        {scanReport.ai_analysis.threat_model.threat_scenarios && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {scanReport.ai_analysis.threat_model.threat_scenarios.slice(0, 3).map((sc: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                • <strong style={{ color: 'var(--text-primary)' }}>[{sc.stride_category || 'Threat'}]</strong> {sc.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agent 2: Test Strategist */}
                    {scanReport.ai_analysis.test_strategy && (
                      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0', borderTop: '3px solid #16a34a' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', marginBottom: '6px' }}>
                          Agent 2 • Test Strategist
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          {scanReport.ai_analysis.test_strategy.strategy_overview}
                        </div>
                        {scanReport.ai_analysis.test_strategy.test_cases && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {scanReport.ai_analysis.test_strategy.test_cases.slice(0, 3).map((tc: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                • <strong style={{ color: 'var(--text-primary)' }}>{tc.title}:</strong> {tc.expected_secure_behavior}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agent 3: Evidence Analyst */}
                    {scanReport.ai_analysis.evidence_analysis && (
                      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #fde68a', borderTop: '3px solid #d97706' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '6px' }}>
                          Agent 3 • Evidence Analyst
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          {scanReport.ai_analysis.evidence_analysis.analysis_summary}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px' }}>
                          <span style={{ color: '#15803d' }}>
                            Verified Proof: <strong>{scanReport.ai_analysis.evidence_analysis.verified_findings_count ?? 0}</strong>
                          </span>
                          <span style={{ color: '#b45309' }}>
                            Unverified/Heuristic: <strong>{scanReport.ai_analysis.evidence_analysis.unverified_findings_count ?? 0}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Agent 4: Remediation Verifier */}
                    {scanReport.ai_analysis.remediation_plan && (
                      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #99f6e4', borderTop: '3px solid #0d9488' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', marginBottom: '6px' }}>
                          Agent 4 • Remediation Verifier
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          {scanReport.ai_analysis.remediation_plan.executive_remediation_summary}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Status: <strong style={{ color: '#b45309' }}>Unverified</strong> (Requires passing CI test assertions)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Sparkles size={36} color="var(--teal)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                  <div>Run an analysis to trigger the LangGraph 4-Agent security audit.</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SCAN HISTORY */}
          {activeTab === 'history' && (
            <div className="glass-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={16} color="var(--accent-amber)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Scan Audit History ({pastScans.length})
                  </h3>
                </div>
                <button
                  onClick={async () => {
                    if (!activeRepo) return;
                    setIsLoadingHistory(true);
                    try {
                      const scans = await api.scans.listByRepo(activeRepo.id);
                      setPastScans(scans);
                    } finally {
                      setIsLoadingHistory(false);
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  title="Refresh scan history"
                  aria-label="Refresh scan history"
                >
                  <RefreshCw size={12} className={isLoadingHistory ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {isLoadingHistory ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RotateCw size={16} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading past scans...
                </div>
              ) : pastScans.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    No Previous Scans Found
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Click Analyze Repository to run your first security audit for {activeRepo.full_name}.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '10px 12px' }}>Scan ID</th>
                        <th style={{ padding: '10px 12px' }}>Date & Time</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 12px' }}>Pinned SHA</th>
                        <th style={{ padding: '10px 12px' }}>Findings Summary</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastScans.map((scan) => {
                        const isCurrentlyViewed = currentScan?.id === scan.id;
                        const statusColor =
                          scan.status === 'completed'
                            ? 'var(--accent-green)'
                            : scan.status === 'running'
                            ? 'var(--electric-blue-bright)'
                            : scan.status === 'cancelled'
                            ? 'var(--accent-amber)'
                            : 'var(--accent-rose)';

                        return (
                          <tr
                            key={scan.id}
                            style={{
                              borderBottom: '1px solid rgba(30, 58, 110, 0.4)',
                              background: isCurrentlyViewed ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              #{scan.id}
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                              {new Date(scan.created_at).toLocaleString()}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  background: `${statusColor}22`,
                                  color: statusColor,
                                  fontWeight: 600,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {scan.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <code
                                style={{
                                  background: '#f1f5f9',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #e2e8f0',
                                  color: '#1d4ed8',
                                  fontWeight: 600,
                                }}
                              >
                                {scan.commit_sha ? scan.commit_sha.slice(0, 7) : 'Unpinned'}
                              </code>
                            </td>
                            <td style={{ padding: '12px' }}>
                              {scan.summary ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {scan.summary.total_findings} findings
                                  </span>
                                  {scan.summary.critical > 0 && (
                                    <span style={{ color: '#f87171', fontSize: '11px' }}>({scan.summary.critical} Crit)</span>
                                  )}
                                  {scan.summary.high > 0 && (
                                    <span style={{ color: '#fbbf24', fontSize: '11px' }}>({scan.summary.high} High)</span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              {isCurrentlyViewed ? (
                                <span style={{ fontSize: '11px', color: 'var(--teal-bright)', fontWeight: 600 }}>
                                  ✓ Viewing Report
                                </span>
                              ) : (
                                <button
                                  onClick={() => viewPastScanReport(scan)}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '11px', padding: '4px 10px' }}
                                  aria-label={`View report for scan #${scan.id}`}
                                >
                                  Inspect Report
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Zero Connected Repositories Empty State */
        <div className="glass-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <FolderGit2 size={48} color="var(--teal)" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            No GitHub Repository Connected
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '8px auto 24px' }}>
            Enter a public HTTPS GitHub repository URL above (e.g., <code>https://github.com/octocat/Hello-World</code>) to begin evidence-based static code analysis.
          </p>
          <div style={{ display: 'inline-flex', gap: '12px' }}>
            <button
              onClick={() => handleUrlChange('https://github.com/octocat/Hello-World')}
              className="btn btn-secondary"
              style={{ fontSize: '12px' }}
            >
              Try Example: octocat/Hello-World
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
