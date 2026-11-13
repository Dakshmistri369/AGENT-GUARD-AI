import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { InteractivePatchDiffViewer } from '../components/ai/InteractivePatchDiffViewer';
import { AstTaintFlowVisualizer } from '../components/ai/AstTaintFlowVisualizer';
import { LiveScanTelemetryVisualizer } from '../components/scans/LiveScanTelemetryVisualizer';
import { VulnerabilityDetailsDrawer } from '../components/findings/VulnerabilityDetailsDrawer';
import { getAstTaintFlowForFinding } from '../pages/Repositories';
import type { AstTaintFlowWidgetData, Scan, Finding, FindingSolution } from '../types';

describe('Empirical Stress Testing: InteractivePatchDiffViewer', () => {
  it('renders standard unified diff correctly', () => {
    const diff = `--- a/app.py\n+++ b/app.py\n@@ -10,3 +10,3 @@\n-eval(user_input)\n+ast.literal_eval(user_input)`;
    const html = renderToString(
      <InteractivePatchDiffViewer
        diff={diff}
        filePath="src/app.py"
        lineStart={10}
        explanation="Safely parse literals instead of raw eval."
        verificationCmd="pytest tests/test_security.py"
      />
    );
    expect(html).toContain('src/app.py');
    expect(html).toContain('Safely parse literals');
    expect(html).toContain('ast.literal_eval');
  });

  it('safely handles empty diff by returning null without crashing', () => {
    const html = renderToString(
      <InteractivePatchDiffViewer
        diff=""
        filePath="empty.py"
      />
    );
    expect(html).toBe('');
  });

  it('safely handles null/undefined props without throwing', () => {
    const html = renderToString(
      <InteractivePatchDiffViewer
        data={null}
        diff={null}
        filePath={null}
        lineStart={null}
        explanation={null}
      />
    );
    expect(html).toBe('');
  });

  it('renders with structured data object prop', () => {
    const html = renderToString(
      <InteractivePatchDiffViewer
        data={{
          file_path: 'lib/db.py',
          line_start: 45,
          language: 'python',
          diff_unified: '--- a/lib/db.py\n+++ b/lib/db.py\n@@ -45,1 +45,1 @@\n-cursor.execute(f"SELECT * FROM users WHERE id = {uid}")\n+cursor.execute("SELECT * FROM users WHERE id = %s", (uid,))',
          explanation: 'Use parameterized queries to prevent SQL injection.',
          verification_cmd: 'python -m pytest tests/test_db.py',
          original_snippet: 'cursor.execute(f"SELECT * FROM users WHERE id = {uid}")',
          fixed_snippet: 'cursor.execute("SELECT * FROM users WHERE id = %s", (uid,))',
        }}
      />
    );
    expect(html).toContain('lib/db.py');
    expect(html).toContain('parameterized queries');
  });

  it('stress tests with a massive diff (2,000 lines) without throwing or timing out', () => {
    const lines = ['--- a/large.py', '+++ b/large.py', '@@ -1,2000 +1,2000 @@'];
    for (let i = 0; i < 1000; i++) {
      lines.push(`-old_insecure_call_${i}()`);
      lines.push(`+new_hardened_call_${i}()`);
    }
    const massiveDiff = lines.join('\n');
    const start = Date.now();
    const html = renderToString(
      <InteractivePatchDiffViewer diff={massiveDiff} filePath="large.py" />
    );
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
    expect(html).toContain('large.py');
    expect(html).toContain('new_hardened_call_999');
  });

  it('handles adversarial malformed diff with no headers or diff markers', () => {
    const malformed = 'This is just some random text with no diff markers\nLine 2\n<script>alert(1)</script>';
    const html = renderToString(
      <InteractivePatchDiffViewer diff={malformed} filePath="<test>.py" />
    );
    expect(html).toContain('random text');
    expect(html).not.toContain('<script>alert(1)</script>'); // Escaped in React
  });
});

describe('Empirical Stress Testing: AstTaintFlowVisualizer', () => {
  const sampleTaintData: AstTaintFlowWidgetData = {
    vulnerability_type: 'Remote Code Execution via Command Injection',
    cwe_id: 'CWE-78',
    source_node: {
      name: "request.args.get('target_ip')",
      ast_type: 'CallExpression: User Controlled Input Source',
      file: 'backend/network.py',
      line: 42,
      label: 'Untrusted Network Input',
    },
    taint_steps: [
      {
        step_number: 1,
        title: 'Variable Binding',
        description: 'Tainted user input is bound to command buffer.',
        code_snippet: "cmd = 'ping -c 1 ' + target_ip",
        node_type: 'BinOp: String Concatenation',
        is_tainted: true,
      },
      {
        step_number: 2,
        title: 'Boundary Propagation',
        description: 'Command string passed into subprocess invocation.',
        code_snippet: 'os.system(cmd)',
        node_type: 'Call: Subprocess Invocation',
        is_tainted: true,
      },
    ],
    sink_node: {
      name: 'os.system(cmd)',
      ast_type: 'CallExpression: Execution Sink',
      file: 'backend/network.py',
      line: 44,
      dangerous_call: 'os.system',
    },
    sanitizer_recommendation: {
      fix_location_line: 43,
      recommended_code: 'subprocess.run(["ping", "-c", "1", ipaddress.ip_address(target_ip)], check=True)',
      rule_name: 'ast.guard.cwe78.sanitizer',
    },
  };

  it('renders complete source-to-sink AST taint flow trajectory correctly', () => {
    const html = renderToString(<AstTaintFlowVisualizer data={sampleTaintData} />);
    expect(html).toContain('Source-to-Sink AST Taint Trajectory');
    expect(html).toContain('CWE-78');
    expect(html).toContain('Untrusted Network Input');
    expect(html).toContain('Dangerous Execution Sink');
    expect(html).toContain('subprocess.run');
  });

  it('safely handles empty taint steps and missing sanitizer without crashing', () => {
    const minimalData: AstTaintFlowWidgetData = {
      vulnerability_type: 'Hardcoded API Key',
      cwe_id: 'CWE-798',
      source_node: {
        name: 'API_KEY = "sk-live-..."',
        ast_type: 'ConstantDeclaration',
      },
      taint_steps: [],
      sink_node: {
        name: 'client.connect(API_KEY)',
        ast_type: 'SinkCall',
      },
      sanitizer_recommendation: {
        rule_name: 'ast.guard.cwe798.sanitizer',
      },
    };
    const html = renderToString(<AstTaintFlowVisualizer data={minimalData} />);
    expect(html).toContain('CWE-798');
    expect(html).toMatch(/2<!-- --> Node Flow Vector/);
  });

  it('stress tests with 50 taint propagation steps without breaking', () => {
    const manyStepsData: AstTaintFlowWidgetData = {
      ...sampleTaintData,
      taint_steps: Array.from({ length: 50 }, (_, i) => ({
        step_number: i + 1,
        title: `AST Propagation Node ${i + 1}`,
        description: `Taint propagated through AST step ${i + 1}.`,
        code_snippet: `var_${i + 1} = transform_step_${i}(var_${i})`,
        node_type: 'ASTTraversalStep',
        is_tainted: true,
      })),
    };
    const html = renderToString(<AstTaintFlowVisualizer data={manyStepsData} />);
    expect(html).toMatch(/52<!-- --> Node Flow Vector/);
    expect(html).toContain('AST Propagation Node 50');
  });
});

describe('Empirical Stress Testing: LiveScanTelemetryVisualizer', () => {
  it('renders idle standby state when scan is null', () => {
    const html = renderToString(
      <LiveScanTelemetryVisualizer
        scan={null}
        isScanning={false}
        repoName="agentguard/core-scanner"
      />
    );
    expect(html).toContain('Ready for Scan');
    expect(html).toContain('Semgrep SAST');
    expect(html).toContain('Standby');
  });

  it('renders active multi-engine scanning telemetry during live scan', () => {
    const activeScan: Scan = {
      id: 99,
      repository_id: 1,
      project_id: null,
      status: 'running',
      stage: 'running_scanners',
      commit_sha: 'a1b2c3d4e5f67890',
      error_message: null,
      started_at: new Date(Date.now() - 15000).toISOString(),
      completed_at: null,
      summary: null,
      configuration: null,
      files_discovered: 120,
      created_at: new Date().toISOString(),
    };
    const html = renderToString(
      <LiveScanTelemetryVisualizer
        scan={activeScan}
        isScanning={true}
        repoName="agentguard/core-scanner"
      />
    );
    expect(html).toContain('4. Multi-Engine Scanners');
    expect(html).toContain('Scanning AST');
    expect(html).toContain('Bandit AST');
    expect(html).toContain('OSV-Scanner SCA');
    expect(html).toContain('detect-secrets');
  });
});

describe('Empirical Stress Testing: getAstTaintFlowForFinding & VulnerabilityDetailsDrawer', () => {
  const mockFinding: Finding = {
    id: 101,
    scan_id: 1,
    scanner: 'semgrep',
    scanner_version: '1.45.0',
    rule_id: 'python.subprocess.injection.b602',
    title: 'Arbitrary Command Injection in Worker Subprocess',
    severity: 'critical',
    confidence: 'high',
    file_path: 'backend/workers/task.py',
    line_number: 88,
    column_number: 5,
    code_snippet: 'cmd = f"tar -xzf {archive_name}"\nos.system(cmd)',
    sanitized_evidence: 'cmd = f"tar -xzf [USER_INPUT]"',
    remediation: 'Use tarfile module or shlex.quote',
    explanation: 'Unsanitized archive_name is passed into shell',
    verification_status: 'verified',
    commit_sha: 'abcdef123456',
    fingerprint: 'fp_101',
    created_at: new Date().toISOString(),
  };

  const mockSolution: FindingSolution = {
    finding_id: 101,
    title: 'Arbitrary Command Injection in Worker Subprocess',
    severity: 'critical',
    scanner: 'semgrep',
    rule_id: 'python.subprocess.injection.b602',
    file_path: 'backend/workers/task.py',
    line_number: 88,
    solution_type: 'code_diff',
    action_summary: 'Replace os.system with safe extraction',
    cli_command: 'pytest tests/test_worker.py',
    before_code: 'os.system(cmd)',
    after_code: 'subprocess.run(["tar", "-xzf", archive_name], check=True)',
    diff: '--- a/task.py\n+++ b/task.py\n@@ -88,1 +88,1 @@\n-os.system(cmd)\n+subprocess.run(["tar", "-xzf", archive_name], check=True)',
    explanation: 'Prevent command injection',
    verification_step: 'Run pytest to verify',
    is_automated_patch: true,
  };

  it('getAstTaintFlowForFinding correctly extracts AST trajectory from finding', () => {
    const flow = getAstTaintFlowForFinding(mockFinding);
    expect(flow).not.toBeNull();
    expect(flow?.cwe_id).toBe('CWE-78');
    expect(flow?.source_node.file).toBe('backend/workers/task.py');
    expect(flow?.sink_node.dangerous_call).toBe('python.subprocess.injection.b602');
    expect(flow?.taint_steps.length).toBe(2);
  });

  it('getAstTaintFlowForFinding returns null for SCA dependencies without crashing', () => {
    const scaFinding: Finding = {
      ...mockFinding,
      scanner: 'osv',
      rule_id: 'GHSA-xxxx',
      title: 'Vulnerable requests library',
    };
    const flow = getAstTaintFlowForFinding(scaFinding);
    expect(flow).toBeNull();
  });

  it('VulnerabilityDetailsDrawer renders when open without crashing', () => {
    const html = renderToString(
      <VulnerabilityDetailsDrawer
        isOpen={true}
        onClose={() => {}}
        finding={mockFinding}
        solution={mockSolution}
      />
    );
    expect(html).toContain('CVSS');
    expect(html).toContain('CWE-78');
    expect(html).toContain('Arbitrary Command Injection in Worker Subprocess');
  });

  it('VulnerabilityDetailsDrawer returns null when isOpen is false', () => {
    const html = renderToString(
      <VulnerabilityDetailsDrawer
        isOpen={false}
        onClose={() => {}}
        finding={mockFinding}
      />
    );
    expect(html).toBe('');
  });
});
