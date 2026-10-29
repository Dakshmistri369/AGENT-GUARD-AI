import React, { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Code2, Calendar,
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageContainer } from '../components/ui/PageContainer';
import type { Project, ProjectListResponse } from '../types';

// ── Create Project Modal ──────────────────────────────────────────────────────
const CreateModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [name, setName]     = useState('');
  const [desc, setDesc]     = useState('');
  const [lang, setLang]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    setError(null);
    try {
      await api.projects.create({ name: name.trim(), description: desc || undefined, language: lang || undefined });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="glass-card animate-slide-in w-full max-w-md mx-4 p-5 sm:p-7">
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-primary)' }}>
          Create New Project
        </h2>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
              Project Name *
            </label>
            <input
              id="project-name-input"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My API Service"
              maxLength={255}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
              Description
            </label>
            <textarea
              className="input"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What does this project do?"
              rows={3}
              maxLength={2000}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
              Primary Language
            </label>
            <select
              id="project-lang-select"
              className="input"
              value={lang}
              onChange={e => setLang(e.target.value)}
            >
              <option value="">Select language…</option>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="other">Other</option>
            </select>
          </div>
          {error && (
            <div style={{ color: 'var(--accent-rose)', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button id="create-project-submit" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Project Card ─────────────────────────────────────────────────────────────
const ProjectCard: React.FC<{ project: Project; onDelete: (id: number) => void }> = ({ project, onDelete }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await api.projects.delete(project.id); onDelete(project.id); }
    finally { setDeleting(false); }
  };

  return (
    <div className="glass-card animate-slide-in" style={{
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '14px',
      transition: 'border-color 0.2s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--electric-blue-dim)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '8px',
        background: 'rgba(59,130,246,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: '1px solid rgba(59,130,246,0.2)',
      }}>
        <FolderOpen size={16} color="var(--electric-blue)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {project.name}
        </div>
        {project.description && (
          <div style={{
            fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {project.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {project.language && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--teal)' }}>
              <Code2 size={11} /> {project.language}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <Calendar size={11} />
            {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
      <button
        id={`delete-project-${project.id}`}
        className="btn btn-danger"
        style={{ padding: '6px 10px', fontSize: '12px' }}
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete project ${project.name}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};

// ── Projects Page ─────────────────────────────────────────────────────────────
export const ProjectsPage: React.FC = () => {
  const [data, setData]     = useState<ProjectListResponse | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.projects.list(p, 20);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const handleDelete = (id: number) => {
    setData(prev => prev ? {
      ...prev,
      items: prev.items.filter(p => p.id !== id),
      total: prev.total - 1,
    } : prev);
  };

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? 'Loading…' : data ? `${data.total} project${data.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-projects-btn"
            className="btn btn-secondary h-9 w-9 p-0 flex items-center justify-center"
            onClick={() => load(page)}
            disabled={loading}
            aria-label="Refresh projects"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            id="create-project-btn"
            className="btn btn-primary text-xs h-9 px-3.5 gap-1.5 shadow-xs"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <div className="animate-spin" style={{ width: '24px', height: '24px', border: '2px solid var(--border)', borderTopColor: 'var(--electric-blue)', borderRadius: '50%' }} />
        </div>
      )}

      {!loading && error && (
        <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
          <AlertCircle size={24} color="var(--accent-rose)" style={{ margin: '0 auto 8px' }} />
          <div style={{ color: 'var(--accent-rose)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
          <button className="btn btn-secondary" onClick={() => load(page)}>Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {data.items.length === 0 ? (
            <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
              <FolderOpen size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                No projects yet. Create your first project to start an audit.
              </div>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Create Project
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.items.map(p => (
                <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Page {data.page} of {data.pages}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={() => load(page)} />
      )}
    </PageContainer>
  );
};
