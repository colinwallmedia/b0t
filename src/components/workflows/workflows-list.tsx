'use client';

import { WorkflowCard } from './workflow-card';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowListItem } from '@/types/workflows';

interface WorkflowsListProps {
  workflows: WorkflowListItem[];
  loading: boolean;
  onWorkflowDeleted: () => void;
  onWorkflowExport: (id: string) => void;
  onWorkflowRun: (id: string) => void;
  onWorkflowViewHistory: (id: string) => void;
  onWorkflowUpdated?: () => void;
}

export function WorkflowsList({
  workflows,
  loading,
  onWorkflowDeleted,
  onWorkflowExport,
  onWorkflowRun,
  onWorkflowViewHistory,
  onWorkflowUpdated,
}: WorkflowsListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">
          No workflows yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          onDeleted={onWorkflowDeleted}
          onExport={onWorkflowExport}
          onRun={onWorkflowRun}
          onViewHistory={onWorkflowViewHistory}
          onUpdated={onWorkflowUpdated}
        />
      ))}
    </div>
  );
}
