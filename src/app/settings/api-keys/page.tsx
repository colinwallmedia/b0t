'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Copy, Check, Key } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  permissions: {
    workflows: { create: boolean; read: boolean; update: boolean; delete: boolean; execute: boolean };
    modules: { read: boolean };
    credentials: { read: boolean; create: boolean; delete: boolean };
    clients: { read: boolean; create: boolean; update: boolean };
  };
}

interface NewKeyResult {
  id: string;
  key: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PermissionBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        enabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
      }`}
    >
      {label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="ml-2 text-gray-500 hover:text-gray-800 transition-colors">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

const DEFAULT_PERMISSIONS = {
  workflows: { create: false, read: true, update: false, delete: false, execute: false },
  modules: { read: true },
  credentials: { read: true, create: false, delete: false },
  clients: { read: true, create: false, update: false },
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newPermissions, setNewPermissions] = useState(DEFAULT_PERMISSIONS);
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          permissions: newPermissions,
          expiresAt: newExpiresAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to create key');
        return;
      }
      setNewKeyResult(data);
      setShowCreateDialog(false);
      setNewName('');
      setNewPermissions(DEFAULT_PERMISSIONS);
      setNewExpiresAt('');
      fetchKeys();
    } catch (error) {
      logger.error({ error }, 'Failed to create API key');
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke API key "${name}"? Any services using it will stop working immediately.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to revoke key');
        return;
      }
      toast.success(`Key "${name}" revoked`);
      fetchKeys();
    } catch (error) {
      logger.error({ error }, 'Failed to revoke API key');
      toast.error('Failed to revoke key');
    }
  };

  const togglePerm = (
    resource: keyof typeof newPermissions,
    action: string,
    value: boolean
  ) => {
    setNewPermissions((prev) => ({
      ...prev,
      [resource]: { ...(prev[resource] as Record<string, boolean>), [action]: value },
    }));
  };

  const activeKeys = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title text-gray-1000">API Keys</h1>
            <p className="page-description text-gray-700 mt-1">
              Generate API keys for external access (e.g. Claude Code MCP server).
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-foreground text-background hover:bg-foreground/90 transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95 group"
          >
            <Plus className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:rotate-90" />
            New API Key
          </Button>
        </div>

        {/* Active keys */}
        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
        ) : activeKeys.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-gray-500 text-sm">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No active API keys. Create one to connect external services.
          </div>
        ) : (
          <div className="border rounded-lg divide-y overflow-hidden">
            {activeKeys.map((key) => (
              <div key={key.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{key.name}</span>
                    <code className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {key.keyPrefix}…
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(key.permissions.workflows).map(([action, enabled]) => (
                      <PermissionBadge key={`wf-${action}`} label={`workflows.${action}`} enabled={enabled} />
                    ))}
                    <PermissionBadge label="modules.read" enabled={key.permissions.modules.read} />
                    {Object.entries(key.permissions.credentials).map(([action, enabled]) => (
                      <PermissionBadge key={`cr-${action}`} label={`credentials.${action}`} enabled={enabled} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 flex gap-4">
                    <span>Created {formatDate(key.createdAt)}</span>
                    {key.lastUsedAt && <span>Last used {formatDate(key.lastUsedAt)}</span>}
                    {key.expiresAt && <span>Expires {formatDate(key.expiresAt)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(key.id, key.name)}
                  className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {revokedKeys.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
              {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? 's' : ''}
            </summary>
            <div className="border rounded-lg divide-y mt-2 overflow-hidden opacity-60">
              {revokedKeys.map((key) => (
                <div key={key.id} className="p-3 flex items-center gap-3">
                  <code className="text-xs text-gray-500">{key.keyPrefix}…</code>
                  <span className="text-sm text-gray-500">{key.name}</span>
                  <span className="ml-auto text-xs text-red-400">
                    Revoked {formatDate(key.revokedAt)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Create dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New API Key</DialogTitle>
              <DialogDescription>
                The key will be shown once — copy it immediately. It cannot be retrieved again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Claude Code on MacBook"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="space-y-2 text-sm">
                  {(
                    [
                      ['workflows', ['read', 'create', 'update', 'delete', 'execute']],
                      ['modules', ['read']],
                      ['credentials', ['read', 'create', 'delete']],
                      ['clients', ['read', 'create', 'update']],
                    ] as [keyof typeof newPermissions, string[]][]
                  ).map(([resource, actions]) => (
                    <div key={resource}>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{resource}</div>
                      <div className="flex flex-wrap gap-2">
                        {actions.map((action) => {
                          const checked = (newPermissions[resource] as Record<string, boolean>)[action] ?? false;
                          return (
                            <label key={action} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => togglePerm(resource, action, e.target.checked)}
                                className="rounded"
                              />
                              <span className="text-xs">{action}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Expiry (optional)</label>
                <input
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  {creating ? 'Creating…' : 'Create Key'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* New key reveal dialog */}
        <Dialog open={!!newKeyResult} onOpenChange={() => setNewKeyResult(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Copy this key now — it will not be shown again.
              </DialogDescription>
            </DialogHeader>
            {newKeyResult && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 border rounded-md p-3 font-mono text-sm break-all flex items-center">
                  <span className="flex-1">{newKeyResult.key}</span>
                  <CopyButton value={newKeyResult.key} />
                </div>
                <p className="text-xs text-gray-500">
                  Add this to your Claude Code MCP config as <code>B0T_API_KEY</code>.
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(newKeyResult.key);
                      toast.success('Key copied to clipboard');
                      setNewKeyResult(null);
                    }}
                    className="bg-foreground text-background hover:bg-foreground/90"
                  >
                    Copy & Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
