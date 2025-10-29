import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { WorkflowTile } from '@/components/automation/WorkflowTile';
import { Instagram } from 'lucide-react';

export default function InstagramPage() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-1 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center">
              <Instagram className="h-4 w-4 text-white" />
            </div>
            <h1 className="font-black text-2xl tracking-tight">Instagram</h1>
          </div>
          <p className="text-xs text-secondary">Monitor and reply to comments & DMs</p>
        </div>

        {/* Workflow Tiles Grid */}
        <div className="grid grid-cols-3 gap-4 animate-slide-up">
          <WorkflowTile
            title="Reply to Comments"
            description="Engage with your Instagram community by automatically responding to post comments with authentic, positive replies"
            jobName="instagram-reply-comments"
            defaultInterval="*/30 * * * *"
            defaultPrompt="You are a friendly Instagram creator. Reply to comments on your posts in an engaging, authentic way. Keep it brief and positive."
          />

          <WorkflowTile
            title="Reply to DMs"
            description="Manage Instagram direct messages efficiently with AI-powered professional and helpful responses"
            jobName="instagram-reply-dms"
            defaultInterval="*/15 * * * *"
            defaultPrompt="You are a helpful assistant. Reply to Instagram direct messages professionally and helpfully. Be concise and friendly."
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
