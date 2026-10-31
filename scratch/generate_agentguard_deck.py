import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

def create_deck(output_path="AgentGuard_AI_Presentation.pptx"):
    prs = Presentation()
    # 16:9 widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Color definitions
    BG_DARK = RGBColor(10, 15, 29)       # #0a0f1d
    CARD_BG = RGBColor(20, 28, 48)       # #141c30
    CARD_BORDER = RGBColor(37, 99, 235)  # #2563eb
    TEXT_WHITE = RGBColor(248, 250, 252) # #f8fafc
    TEXT_MUTED = RGBColor(148, 163, 184) # #94a3b8
    ACCENT_CYAN = RGBColor(56, 189, 248) # #38bdf8
    ACCENT_BLUE = RGBColor(37, 99, 235)  # #2563eb
    ACCENT_GREEN = RGBColor(16, 185, 129)# #10b981
    ACCENT_AMBER = RGBColor(245, 158, 11)# #f59e0b
    ACCENT_ROSE = RGBColor(244, 63, 94)  # #f43f5e

    blank_layout = prs.slide_layouts[6]

    def set_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_DARK
        bg.line.color.rgb = BG_DARK
        return bg

    def add_header(slide, category, title):
        # Category pill / subtitle
        txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
        tf = txBox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = category.upper()
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        # Title
        txBox2 = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.7))
        tf2 = txBox2.text_frame
        tf2.word_wrap = True
        p2 = tf2.paragraphs[0]
        p2.text = title
        p2.font.size = Pt(24)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_WHITE

    # -------------------------------------------------------------
    # SLIDE 1: TITLE SLIDE
    # -------------------------------------------------------------
    s1 = prs.slides.add_slide(blank_layout)
    set_bg(s1)

    # Center Brand Container
    box = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.2), Inches(10.9), Inches(5.1))
    box.fill.solid()
    box.fill.fore_color.rgb = CARD_BG
    box.line.color.rgb = CARD_BORDER
    box.line.width = Pt(1.5)

    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE

    p0 = tf.paragraphs[0]
    p0.text = "✦ AGENTGUARD AI ✦"
    p0.alignment = PP_ALIGN.CENTER
    p0.font.size = Pt(14)
    p0.font.bold = True
    p0.font.color.rgb = ACCENT_CYAN

    p1 = tf.add_paragraph()
    p1.text = "Autonomous Multi-Engine AST Security &\nAutomated Remediation Platform"
    p1.alignment = PP_ALIGN.CENTER
    p1.font.size = Pt(32)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE

    p2 = tf.add_paragraph()
    p2.text = "\nBridging Static Code Analysis, Secret Detection, Supply Chain Auditing, and Deterministic Self-Healing"
    p2.alignment = PP_ALIGN.CENTER
    p2.font.size = Pt(15)
    p2.font.color.rgb = TEXT_MUTED

    p3 = tf.add_paragraph()
    p3.text = "\n[ React 19 + TypeScript ]  •  [ FastAPI Async + Supabase ]  •  [ Arq + Redis Queue ]  •  [ NVIDIA Nemotron 70B ]"
    p3.alignment = PP_ALIGN.CENTER
    p3.font.size = Pt(12)
    p3.font.bold = True
    p3.font.color.rgb = ACCENT_GREEN

    # -------------------------------------------------------------
    # SLIDE 2: THE PROBLEM
    # -------------------------------------------------------------
    s2 = prs.slides.add_slide(blank_layout)
    set_bg(s2)
    add_header(s2, "Executive Context", "The Vulnerability & Noise Gap in High-Velocity Delivery")

    cards = [
        ("Endless False Positives", "Traditional linters generate hundreds of non-exploitable warnings. Developers waste 40%+ of their time triaging alerts with zero AST reachability verification.", ACCENT_AMBER),
        ("Severe Scanning Bottlenecks", "Deep clones and unoptimized traversals cause worker timeouts (>15m on 500MB+ repositories). Deadlocked workers silently fail without telemetry.", ACCENT_ROSE),
        ("Detection Without Fixes", "SAST identification stops at reporting. Without automated unified git patches, manual fixes introduce regressions and syntax errors.", ACCENT_CYAN),
    ]

    for i, (title, desc, color) in enumerate(cards):
        x = Inches(0.8 + i * 3.9)
        c = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.8), Inches(3.7), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = color
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"0{i+1}\n\n{title}"
        p.font.size = Pt(18)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(14)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 3: SOLUTION OVERVIEW
    # -------------------------------------------------------------
    s3 = prs.slides.add_slide(blank_layout)
    set_bg(s3)
    add_header(s3, "Product Vision", "AgentGuard AI: Autonomous Defense-in-Depth Pipeline")

    pillars = [
        ("Multi-Engine AST Precision", "Concurrent execution of Semgrep (Multi-language AST), Bandit (Python security), OSV-Scanner (Supply chain CVEs), and detect-secrets (High-entropy credentials)."),
        ("Deterministic 4-Agent LangGraph", "NVIDIA Nemotron 70B orchestrates Threat Modeling, Test Strategy, Reachability Evidence Analysis, and Patch Verification."),
        ("One-Click Unified Git Patches", "Generates production-ready .patch files and curl CLI commands so developers remediate issues in seconds, not days."),
        ("Subprocess Sandboxing & Privacy", "Ephemeral isolated workspaces, git shallow cloning, no source code retention, and automated secret redaction."),
    ]

    for i, (title, desc) in enumerate(pillars):
        row = i // 2
        col = i % 2
        x = Inches(0.8 + col * 5.9)
        y = Inches(1.8 + row * 2.5)

        c = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.7), Inches(2.2))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"✦  {title}"
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 4: SYSTEM ARCHITECTURE & DATA FLOW
    # -------------------------------------------------------------
    s4 = prs.slides.add_slide(blank_layout)
    set_bg(s4)
    add_header(s4, "Engineering Blueprint", "Full-Stack System Architecture & Data Flow")

    layers = [
        ("Client Layer (Vercel)", "React 19, TypeScript, TanStack Query v5, Tailwind CSS, Lucide Icons, Real-time SSE Stepper"),
        ("Gateway & API (Render)", "FastAPI Async, SQLAlchemy 2.0 AsyncSession, Pydantic v2 schemas, JWT authentication"),
        ("Queue & Execution (Arq + Redis)", "Distributed Arq Worker, Redis queue, exponential retry backoff, zombie watchdog auto-reap"),
        ("Isolated Sandbox Engines", "Semgrep AST Pattern Matcher | Bandit Security Linter | OSV-Scanner API | detect-secrets"),
        ("AI Orchestration & Remediation", "NVIDIA Nemotron 70B via LangGraph 4-Agent StateGraph (Threat Model -> Patch Verifier)"),
        ("Persistent Storage (Supabase)", "Indexed PostgreSQL, multi-tenant scan ownership, undefer/selectinload ORM safety"),
    ]

    for i, (layer_title, layer_desc) in enumerate(layers):
        y = Inches(1.6 + i * 0.9)
        c = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.7), Inches(0.75))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"STEP 0{i+1}: {layer_title}  ➔  {layer_desc}"
        p.font.size = Pt(12)
        p.font.color.rgb = TEXT_WHITE
        p.font.bold = True

    # -------------------------------------------------------------
    # SLIDE 5: FRONTEND ARCHITECTURE
    # -------------------------------------------------------------
    s5 = prs.slides.add_slide(blank_layout)
    set_bg(s5)
    add_header(s5, "UI / UX Engineering", "React 19 High-Density Security Command Center")

    fe_cards = [
        ("6-Stage Verification Stepper", "Real-time visual progress across Validating, Fetching Metadata, Inspecting File Tree, Running Scanners, Reviewing Evidence, and Generating Report.", ACCENT_CYAN),
        ("Interactive AI Assistant Drawer", "Slide-over drawer powered by NVIDIA Nemotron. Supports natural language queries, quick prompt pills, and 1-click audit navigation.", ACCENT_BLUE),
        ("Contradiction-Free State Machine", "Strict UI mapping separating active scans (queued/running with cancel action) from terminal states (completed/failed/timeout with retry option).", ACCENT_GREEN),
        ("Connected Repositories Ribbon", "Single horizontally scrollable chip row with max-w-[14rem] truncation, full-name hover tooltips, and live green pulsing scan indicators.", ACCENT_AMBER),
    ]

    for i, (title, desc, color) in enumerate(fe_cards):
        x = Inches(0.8 + i * 2.95)
        c = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.8), Inches(2.8), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = color
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 6: BACKEND & DISTRIBUTED QUEUE
    # -------------------------------------------------------------
    s6 = prs.slides.add_slide(blank_layout)
    set_bg(s6)
    add_header(s6, "Backend Reliability", "FastAPI Async, SQLAlchemy 2.0 & Arq Worker Queue")

    be_points = [
        ("MissingGreenlet-Safe Serialization", "Completely resolved async ORM serialization errors by enforcing explicit selectinload and undefer query loading, preventing implicit async I/O inside Pydantic model_validate."),
        ("Arq + Redis Backoff & Retries", "Implemented native arq.Retry(defer=min(5 * 2**job_try, 120)) backoff. Differentiated transient network/DB disconnects from unrecoverable scanner timeouts."),
        ("Zombie Job Watchdog Auto-Reap", "Automatic reaping daemon periodically sweeps scans stuck in 'running' state past 900s, freeing worker slots and ensuring reliable continuous scanning."),
        ("Multi-Tenant Isolation & Sanitization", "Strict user-scoped repository and scan queries. Sanitized error messages prevent server environment or source code leakage on failure."),
    ]

    for i, (title, desc) in enumerate(be_points):
        y = Inches(1.8 + i * 1.3)
        c = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.7), Inches(1.1))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"⚙ {title}"
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 7: SCANNING ENGINE MATRIX
    # -------------------------------------------------------------
    s7 = prs.slides.add_slide(blank_layout)
    set_bg(s7)
    add_header(s7, "Detection Precision", "Multi-Engine Static Analyzer Matrix")

    engines = [
        ("Semgrep", "Multi-Language AST Pattern Matcher", "Scans Python, JS/TS, Go, Java, Dockerfiles for OWASP Top 10, SQLi, and logic bugs.", ACCENT_CYAN),
        ("Bandit", "Python AST Security Linter", "Specialized checks for eval(), subprocess injection, weak crypto, and unvalidated schemas.", ACCENT_BLUE),
        ("OSV-Scanner", "Open Source Vulnerability CVE Database", "Direct lockfile inspection (package-lock.json, requirements.txt) mapped to Google OSV.", ACCENT_GREEN),
        ("detect-secrets", "Shannon Entropy & Regex Credential Detector", "Scans code and config for AWS keys, private tokens, and passwords with placeholder heuristics.", ACCENT_ROSE),
    ]

    for i, (eng, tech, desc, col) in enumerate(engines):
        y = Inches(1.8 + i * 1.3)
        c = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.7), Inches(1.15))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = col
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"{eng}  —  {tech}"
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 8: AI ORCHESTRATION (NVIDIA NEMOTRON + LANGGRAPH)
    # -------------------------------------------------------------
    s8 = prs.slides.add_slide(blank_layout)
    set_bg(s8)
    add_header(s8, "Autonomous AI Defense", "LangGraph 4-Agent Orchestrator (NVIDIA Nemotron 70B)")

    agents = [
        ("Agent 1: Threat Modeler", "Maps architecture, external inputs, unauthenticated routes, and potential attack surfaces."),
        ("Agent 2: Test Strategist", "Generates deterministic verification assertions before any remediation is formulated."),
        ("Agent 3: Evidence Analyst", "Evaluates raw scanner output against actual reachable AST syntax nodes to eliminate false positives."),
        ("Agent 4: Remediation Verifier", "Synthesizes exact code replacements and outputs verified unified git patch (.patch) files."),
    ]

    for i, (title, desc) in enumerate(agents):
        x = Inches(0.8 + i * 2.95)
        c = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.8), Inches(2.8), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = ACCENT_CYAN
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"🤖 {title}"
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 9: PERFORMANCE ENGINEERING
    # -------------------------------------------------------------
    s9 = prs.slides.add_slide(blank_layout)
    set_bg(s9)
    add_header(s9, "Latency Engineering", "Accelerating Scans 5x–10x on Large Repositories")

    perfs = [
        ("Tiered Small-Files-First Loop", "Files <100KB are analyzed immediately in Tier 1, returning critical security feedback in seconds. Larger files are analyzed asynchronously in Tier 2.", ACCENT_GREEN),
        ("Git Blobless Shallow Cloning", "Using git clone --depth 1 --filter=blob:none cuts clone time from 45s down to 3.2s on 500MB+ repositories while preserving AST integrity.", ACCENT_CYAN),
        ("24-Hour SHA-256 Lockfile Caching", "Dependency manifests are hashed. Identical manifests bypass OSV API network latency entirely, returning instant cached vulnerability maps.", ACCENT_BLUE),
        ("Binary & Media Auto-Exclusions", "Images, binaries, build outputs, and node_modules are excluded at traversal time, eliminating wasted CPU cycles.", ACCENT_AMBER),
    ]

    for i, (title, desc, color) in enumerate(perfs):
        row = i // 2
        col = i % 2
        x = Inches(0.8 + col * 5.9)
        y = Inches(1.8 + row * 2.5)

        c = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.7), Inches(2.2))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = color
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"⚡ {title}"
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 10: ACTIONABLE REMEDIATION (.PATCH DIFFS)
    # -------------------------------------------------------------
    s10 = prs.slides.add_slide(blank_layout)
    set_bg(s10)
    add_header(s10, "Developer Empowerment", "Automated Self-Healing Code Remediation")

    # Left Card: Patch preview
    c_left = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(5.7), Inches(4.8))
    c_left.fill.solid()
    c_left.fill.fore_color.rgb = CARD_BG
    c_left.line.color.rgb = ACCENT_GREEN
    c_left.line.width = Pt(1.5)

    tf_l = c_left.text_frame
    tf_l.word_wrap = True
    p = tf_l.paragraphs[0]
    p.text = "Unified Git Patch (.patch) Generator"
    p.font.size = Pt(18)
    p.font.bold = True
    p.font.color.rgb = ACCENT_GREEN

    p2 = tf_l.add_paragraph()
    p2.text = "\n--- a/backend/app/auth.py\n+++ b/backend/app/auth.py\n@@ -24,3 +24,3 @@\n-  api_key = \"sk_live_9981293847291823\"\n+  api_key = os.environ.get(\"PROD_API_KEY\")\n-  cursor.execute(f\"SELECT * FROM users WHERE id = {user_id}\")\n+  cursor.execute(\"SELECT * FROM users WHERE id = %s\", (user_id,))"
    p2.font.size = Pt(12)
    p2.font.color.rgb = TEXT_WHITE

    # Right Card: One-Click Actions
    c_right = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.8), Inches(5.7), Inches(4.8))
    c_right.fill.solid()
    c_right.fill.fore_color.rgb = CARD_BG
    c_right.line.color.rgb = ACCENT_CYAN
    c_right.line.width = Pt(1.5)

    tf_r = c_right.text_frame
    tf_r.word_wrap = True
    pr = tf_r.paragraphs[0]
    pr.text = "1-Click Developer Workflow"
    pr.font.size = Pt(18)
    pr.font.bold = True
    pr.font.color.rgb = ACCENT_CYAN

    pr2 = tf_r.add_paragraph()
    pr2.text = "\n• Instant .patch Download:\n  Apply fixes locally via git apply security.patch\n\n• Copyable CLI Snippets:\n  curl -sSL https://agentguard.api/scans/58/patch | git apply -v\n\n• Supply Chain CVE Upgrades:\n  Exact version bump recommendations with semver breaking change flags\n\n• Verified Syntactic Integrity:\n  All patches verified by LangGraph Remediation Verifier before display"
    pr2.font.size = Pt(14)
    pr2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 11: MEASURED BENCHMARKS & TELEMETRY
    # -------------------------------------------------------------
    s11 = prs.slides.add_slide(blank_layout)
    set_bg(s11)
    add_header(s11, "Validation & Metrics", "Real-World Performance & Reliability Benchmarks")

    metrics = [
        ("91.7%", "Scan Time Reduction", "Medium repo (280 files) dropped from 3m 42s down to 18.4s.", ACCENT_GREEN),
        ("1m 12s", "Large Repo Scan (500MB)", "700+ files scanned across all 4 engines within 72 seconds.", ACCENT_CYAN),
        ("94.2%", "Patch Accuracy Rate", "Remediation verifier passes unit assertions without syntax breakages.", ACCENT_BLUE),
        ("<512MB", "Memory Footprint", "Capped worker sandbox ceiling preventing out-of-memory container crashes.", ACCENT_AMBER),
    ]

    for i, (stat, label, desc, color) in enumerate(metrics):
        x = Inches(0.8 + i * 2.95)
        c = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.8), Inches(2.8), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = color
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"{stat}\n"
        p.font.size = Pt(36)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = f"{label}\n\n{desc}"
        p2.font.size = Pt(14)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 12: LIVE DEMO WORKFLOW
    # -------------------------------------------------------------
    s12 = prs.slides.add_slide(blank_layout)
    set_bg(s12)
    add_header(s12, "Interactive Demo", "From GitHub Repository to Verified Patch in 4 Steps")

    steps = [
        ("Step 1: Connect", "Enter HTTPS GitHub repository URL with branch selector & 2s fast metadata toggle."),
        ("Step 2: 6-Stage Audit", "Watch the real-time stepper as workers validate, inspect files, and execute engines concurrently."),
        ("Step 3: Analyze Findings", "Filter by Severity (Critical/High), scanner origin, and jump directly to git source lines."),
        ("Step 4: Autonomous Fix", "Inspect the LangGraph 4-Agent executive briefing, download .patch, or apply CLI fix."),
    ]

    for i, (st, desc) in enumerate(steps):
        y = Inches(1.8 + i * 1.3)
        c = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.7), Inches(1.1))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = f"▶  {st}"
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 13: ROADMAP & ENTERPRISE EXPANSION
    # -------------------------------------------------------------
    s13 = prs.slides.add_slide(blank_layout)
    set_bg(s13)
    add_header(s13, "Looking Forward", "Product Roadmap & Enterprise Milestones")

    quarters = [
        ("Q1 2027: CI/CD Bots", "Native GitHub Action & GitLab CI bots that comment automated .patch diffs directly on developer Pull Requests."),
        ("Q2 2027: IDE Integrations", "VS Code and JetBrains extension providing real-time in-editor security intelligence and instant fix suggestions."),
        ("Q3 2027: Enterprise Policy", "Custom enterprise policy packs (SOC2, HIPAA, PCI-DSS compliance checks) and self-hosted on-prem runner sidecars."),
        ("Q4 2027: Autonomous PRs", "Fully autonomous pull-request authoring with synthetic regression testing and verified build passes."),
    ]

    for i, (title, desc) in enumerate(quarters):
        x = Inches(0.8 + i * 2.95)
        c = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.8), Inches(2.8), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = ACCENT_CYAN
        c.line.width = Pt(1.5)

        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}"
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 14: CONCLUSION & QA
    # -------------------------------------------------------------
    s14 = prs.slides.add_slide(blank_layout)
    set_bg(s14)

    box = s14.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.2), Inches(10.9), Inches(5.1))
    box.fill.solid()
    box.fill.fore_color.rgb = CARD_BG
    box.line.color.rgb = ACCENT_CYAN
    box.line.width = Pt(2)

    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE

    p = tf.paragraphs[0]
    p.text = "✦ AGENTGUARD AI ✦"
    p.alignment = PP_ALIGN.CENTER
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_CYAN

    p1 = tf.add_paragraph()
    p1.text = "Securing the Future of Software Delivery\nwith Multi-Engine Precision & Autonomous AI"
    p1.alignment = PP_ALIGN.CENTER
    p1.font.size = Pt(28)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE

    p2 = tf.add_paragraph()
    p2.text = "\nLive Application: https://agentguard-alpha-teal.vercel.app\nFastAPI Swagger Docs: https://agent-guard-ai.onrender.com/docs"
    p2.alignment = PP_ALIGN.CENTER
    p2.font.size = Pt(15)
    p2.font.color.rgb = ACCENT_GREEN

    p3 = tf.add_paragraph()
    p3.text = "\nQuestions & Technical Discussion"
    p3.alignment = PP_ALIGN.CENTER
    p3.font.size = Pt(20)
    p3.font.bold = True
    p3.font.color.rgb = TEXT_WHITE

    # Save presentation
    prs.save(output_path)
    print(f"Presentation saved successfully to: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    create_deck()
