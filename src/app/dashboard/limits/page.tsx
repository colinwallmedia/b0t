'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AlertTriangle, ArrowUpDown, Zap, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TwitterTier,
  TierLimits,
  TwitterUsageTracking,
  getTierConfig,
  getAllTiers,
  calculatePercentUsed,
  getWarningLevel,
  formatResetTime,
} from '@/lib/config/twitter-tiers';
import { toast } from 'sonner';

interface LimitRow {
  window: string;
  type: 'Posts' | 'Reads';
  current: number;
  max: number | undefined;
  resetIn: number;
  percentUsed: number;
}

export default function LimitsPage() {
  const [currentTier, setCurrentTier] = useState<TwitterTier>('free');
  const [tierConfig, setTierConfig] = useState<TierLimits | null>(null);
  const [postUsage, setPostUsage] = useState<TwitterUsageTracking | null>(null);
  const [readUsage, setReadUsage] = useState<TwitterUsageTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierSaving, setTierSaving] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        // Fetch both tier and usage in parallel for better performance
        const [tierResponse, usageResponse] = await Promise.all([
          fetch('/api/settings/tier', { signal: controller.signal }),
          fetch('/api/twitter/usage', { signal: controller.signal }),
        ]);

        if (tierResponse.ok) {
          const data = await tierResponse.json();
          setCurrentTier(data.tier || 'free');
        }

        if (usageResponse.ok) {
          const data = await usageResponse.json();
          setPostUsage(data.postUsage);
          setReadUsage(data.readUsage);
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to load limits data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (currentTier) {
      setTierConfig(getTierConfig(currentTier));
    }
  }, [currentTier]);

  const handleTierChange = async (newTier: TwitterTier) => {
    if (newTier === currentTier) return; // Skip if same tier

    try {
      setTierSaving(true);
      const response = await fetch('/api/settings/tier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: newTier }),
      });

      if (response.ok) {
        const newConfig = getTierConfig(newTier);
        setCurrentTier(newTier);
        toast.success('Subscription tier updated', {
          description: `Now tracking limits for ${newConfig.name} tier`,
        });
      } else {
        toast.error('Failed to update tier');
      }
    } catch (error) {
      console.error('Error saving tier:', error);
      toast.error('Failed to update tier');
    } finally {
      setTierSaving(false);
    }
  };

  // Prepare table data with useMemo to prevent unnecessary recalculations
  const tableData = useMemo<LimitRow[]>(() => {
    if (!tierConfig || !postUsage || !readUsage) return [];

    const createRow = (
      window: string,
      type: 'Posts' | 'Reads',
      current: number,
      max: number | undefined,
      resetIn: number
    ): LimitRow => ({
      window,
      type,
      current,
      max,
      resetIn,
      percentUsed: max && max > 0 ? calculatePercentUsed(current, max) : 0,
    });

    return [
      createRow(
        '15 Minutes',
        'Posts',
        postUsage.last15Minutes.count,
        tierConfig.postLimits.per15Minutes,
        postUsage.last15Minutes.windowDuration - (Date.now() - new Date(postUsage.last15Minutes.windowStart).getTime())
      ),
      createRow(
        '1 Hour',
        'Posts',
        postUsage.lastHour.count,
        tierConfig.postLimits.perHour,
        postUsage.lastHour.windowDuration - (Date.now() - new Date(postUsage.lastHour.windowStart).getTime())
      ),
      createRow(
        '24 Hours',
        'Posts',
        postUsage.last24Hours.count,
        tierConfig.postLimits.per24Hours,
        postUsage.last24Hours.windowDuration - (Date.now() - new Date(postUsage.last24Hours.windowStart).getTime())
      ),
      createRow(
        '30 Days',
        'Posts',
        postUsage.lastMonth.count,
        tierConfig.postLimits.perMonth,
        postUsage.lastMonth.windowDuration - (Date.now() - new Date(postUsage.lastMonth.windowStart).getTime())
      ),
      createRow(
        '15 Minutes',
        'Reads',
        readUsage.last15Minutes.count,
        tierConfig.readLimits.per15Minutes,
        readUsage.last15Minutes.windowDuration - (Date.now() - new Date(readUsage.last15Minutes.windowStart).getTime())
      ),
      createRow(
        '1 Hour',
        'Reads',
        readUsage.lastHour.count,
        tierConfig.readLimits.perHour,
        readUsage.lastHour.windowDuration - (Date.now() - new Date(readUsage.lastHour.windowStart).getTime())
      ),
      createRow(
        '24 Hours',
        'Reads',
        readUsage.last24Hours.count,
        tierConfig.readLimits.per24Hours,
        readUsage.last24Hours.windowDuration - (Date.now() - new Date(readUsage.last24Hours.windowStart).getTime())
      ),
      createRow(
        '30 Days',
        'Reads',
        readUsage.lastMonth.count,
        tierConfig.readLimits.perMonth,
        readUsage.lastMonth.windowDuration - (Date.now() - new Date(readUsage.lastMonth.windowStart).getTime())
      )
    ];
  }, [tierConfig, postUsage, readUsage]);

  const columns = useMemo<ColumnDef<LimitRow>[]>(() => [
    {
      accessorKey: 'type',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Type
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="text-xs font-medium text-foreground">
            {row.original.type}
          </div>
        );
      },
    },
    {
      accessorKey: 'window',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Window
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="text-xs text-foreground">
            {row.original.window}
          </div>
        );
      },
    },
    {
      accessorKey: 'current',
      header: 'Usage',
      cell: ({ row }) => {
        const { current, max } = row.original;
        if (max === undefined || max === 0) {
          return <div className="text-xs text-secondary">N/A</div>;
        }
        return (
          <div className="text-xs text-secondary">
            {current.toLocaleString()} / {max.toLocaleString()}
          </div>
        );
      },
    },
    {
      accessorKey: 'percentUsed',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Progress
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const { max, percentUsed } = row.original;
        if (max === undefined || max === 0) {
          return (
            <div className="w-full">
              <div className="w-full h-1.5 bg-surface rounded-full" />
            </div>
          );
        }

        const warningLevel = getWarningLevel(percentUsed);
        const statusColors = {
          safe: 'bg-green-500',
          warning: 'bg-yellow-500',
          critical: 'bg-red-500',
        };

        return (
          <div className="w-full">
            <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full ${statusColors[warningLevel]} transition-all duration-300`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Status
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const { max, resetIn, percentUsed } = row.original;
        if (max === undefined || max === 0) {
          return <div className="text-xs text-secondary text-right">-</div>;
        }

        const warningLevel = getWarningLevel(percentUsed);
        const statusColors = {
          safe: 'text-green-500',
          warning: 'text-yellow-500',
          critical: 'text-red-500',
        };
        const resetTime = formatResetTime(resetIn);

        return (
          <div className="flex items-center justify-end gap-2">
            <span className={`text-xs font-bold ${statusColors[warningLevel]}`}>
              {percentUsed.toFixed(0)}%
            </span>
            <span className="text-[10px] text-secondary">{resetTime}</span>
          </div>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  if (loading || !tierConfig || !postUsage || !readUsage) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="font-black text-2xl tracking-tight">API Limits</h1>
            <p className="text-sm text-secondary">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        {/* Tier Selector */}
        <div className="flex items-start justify-end gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-secondary">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>Twitter Tier:</span>
            </div>
            <select
              value={currentTier}
              onChange={(e) => handleTierChange(e.target.value as TwitterTier)}
              disabled={tierSaving}
              className="px-3 py-1.5 bg-surface border border-border rounded-md text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 cursor-pointer"
            >
              {getAllTiers().map((tier) => (
                <option key={tier.tier} value={tier.tier}>
                  {tier.name} {tier.cost > 0 ? `($${tier.cost.toLocaleString()}/mo)` : '(Free)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Twitter Limits Table */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Twitter className="h-4 w-4 text-accent" />
            <span className="font-medium">Twitter API Limits</span>
            <span className="text-xs text-secondary">
              ({tierConfig.cost === 0 ? 'Free' : `$${tierConfig.cost.toLocaleString()}/mo`})
            </span>
          </div>

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
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="h-24 text-center">
                      <div className="text-sm text-secondary">No data</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Footer */}
        <div className="text-xs text-secondary flex items-start gap-2 px-1">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
          <span>
            Limits are enforced by platform APIs. When exceeded, requests fail with 403/429 errors. Usage resets automatically.
          </span>
        </div>
      </div>
    </DashboardLayout>
  );
}
