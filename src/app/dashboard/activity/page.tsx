'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TableSkeleton } from '@/components/ui/card-skeleton';
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
            <TableSkeleton rows={10} />
          ) : logs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground">
                No activity logs yet. Run a workflow to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Table */}
              <div className="border border-border/50 rounded-lg overflow-hidden bg-surface/80 backdrop-blur-sm shadow-sm">
                <table className="w-full">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-border/50 bg-background/50">
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 tracking-wide"
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
                        className="border-b border-border/30 hover:bg-background/30 transition-all duration-200"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-secondary px-1">
                <div className="font-medium">
                  Showing {table.getRowModel().rows.length} of {logs.length} logs
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="px-4 py-2 rounded-md border border-border/50 hover:border-primary/30 hover:bg-background/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                  >
                    Previous
                  </button>
                  <span className="font-medium tabular-nums">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="px-4 py-2 rounded-md border border-border/50 hover:border-primary/30 hover:bg-background/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 font-medium"
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
