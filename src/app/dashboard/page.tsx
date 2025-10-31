'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Play } from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { isMilestone, fireMilestoneConfetti } from '@/lib/confetti';

interface DashboardStats {
  automations: {
    successfulRuns: number;
    failedRuns: number;
    activeJobs: number;
    totalExecutions: number;
  };
  system: {
    database: string;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (response.ok) {
          const data = await response.json();
          console.log('Dashboard stats:', data); // Debug log
          setStats(data);
        } else {
          console.error('Failed to fetch stats:', response.status);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-secondary" />
        </div>
      </DashboardLayout>
    );
  }

  const successfulRuns = stats?.automations?.successfulRuns ?? 0;
  const failedRuns = stats?.automations?.failedRuns ?? 0;
  const activeJobs = stats?.automations?.activeJobs ?? 0;
  const totalExecutions = stats?.automations?.totalExecutions ?? 0;
  const database = stats?.system?.database ?? 'SQLite';

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Successful Runs */}
          <Card className="transition-all border-l-4 border-l-green-500 animate-slide-up">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <CardTitle className="card-title text-gray-900">Successful Runs</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="card-stat-large text-gray-1000 tabular-nums">
                <AnimatedCounter
                  value={successfulRuns}
                  onEnd={(value) => {
                    if (isMilestone(value)) fireMilestoneConfetti();
                  }}
                />
              </div>
              <p className="card-label text-gray-900">total successful executions</p>
            </CardContent>
          </Card>

          {/* Failed Runs */}
          <Card className="transition-all border-l-4 border-l-red-500 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <CardTitle className="card-title text-gray-900">Failed Runs</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="card-stat-large text-gray-1000 tabular-nums">
                <AnimatedCounter value={failedRuns} />
              </div>
              <p className="card-label text-gray-900">total failed executions</p>
            </CardContent>
          </Card>

          {/* Active Jobs */}
          <Card className="transition-all border-l-4 border-l-blue-500 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-blue-500" />
                <CardTitle className="card-title text-gray-900">Active Jobs</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="card-stat-large text-blue-500 tabular-nums">
                <AnimatedCounter value={activeJobs} />
              </div>
              <p className="card-label text-gray-900">currently enabled</p>
            </CardContent>
          </Card>
        </div>

        {/* System Info */}
        <div className="space-y-4 animate-fade-in">
          <h2 className="section-title tracking-tight">System</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="transition-all">
              <CardContent className="pt-4">
                <div className="space-y-1">
                  <div className="card-label text-gray-900">Total Executions</div>
                  <div className="card-stat-medium text-gray-1000 tabular-nums">
                    <AnimatedCounter value={totalExecutions} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all">
              <CardContent className="pt-4">
                <div className="space-y-1">
                  <div className="card-label text-gray-900">Database</div>
                  <div className="card-stat-medium text-gray-1000">
                    {database}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
