'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';

interface JobLog {
  id: number;
  jobName: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: string | null;
  duration?: number | null;
  createdAt: Date | string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-gray-500" />;
  }
};

const formatJobName = (name: string) => {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatDuration = (ms?: number | null) => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatDate = (date: Date | string) => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const columns: ColumnDef<JobLog>[] = [
  {
    accessorKey: 'status',
    header: () => <div className="w-10">Status</div>,
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        {getStatusIcon(row.original.status)}
      </div>
    ),
  },
  {
    accessorKey: 'jobName',
    header: 'Job',
    cell: ({ row }) => (
      <div className="font-medium text-sm">{formatJobName(row.original.jobName)}</div>
    ),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ row }) => (
      <div className="text-xs text-secondary max-w-md truncate">{row.original.message}</div>
    ),
  },
  {
    accessorKey: 'duration',
    header: () => <div className="text-right">Duration</div>,
    cell: ({ row }) => (
      <div className="text-right text-xs font-mono text-secondary">
        {formatDuration(row.original.duration)}
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: () => <div className="text-right">Time</div>,
    cell: ({ row }) => (
      <div className="text-right text-xs text-secondary tabular-nums">
        {formatDate(row.original.createdAt)}
      </div>
    ),
  },
];

export default function ActivityPage() {
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs?limit=50');
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">

        {/* Activity Table */}
        <div className="animate-slide-up">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-secondary">
              <Clock className="h-5 w-5 animate-pulse" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-secondary space-y-1">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity logs yet</p>
              <p className="text-xs opacity-60">Enable workflows to see activity here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table */}
              <div className="border border-border rounded-lg overflow-hidden bg-surface">
                <table className="w-full">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-border bg-muted/30">
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="px-4 py-2.5 text-left text-xs font-medium text-secondary"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-secondary">
                <div>
                  Showing {table.getRowModel().rows.length} of {logs.length} logs
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="px-3 py-1.5 rounded border border-border hover:border-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <span>
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="px-3 py-1.5 rounded border border-border hover:border-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
