'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Twitter, Youtube, Instagram, Check, X, Loader2, Cpu } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface TwitterStatus {
  connected: boolean;
  account: {
    providerAccountId: string;
    accountName?: string;
    hasRefreshToken: boolean;
    isExpired: boolean;
  } | null;
}

interface YouTubeStatus {
  connected: boolean;
  account: {
    providerAccountId: string;
    accountName?: string;
    hasRefreshToken: boolean;
    isExpired: boolean;
  } | null;
}

const OPENAI_MODELS = [
  { id: 'gpt-5', name: 'GPT-5', description: 'Best reasoning & performance' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast reasoning model' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Fast and reliable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective' },
] as const;

export default function SettingsPage() {
  const { status } = useSession();
  const [twitterAccount, setTwitterAccount] = useState<TwitterStatus['account']>(null);
  const [twitterConnected, setTwitterConnected] = useState(false);
  const [twitterLoading, setTwitterLoading] = useState(true);
  const [youtubeAccount, setYoutubeAccount] = useState<YouTubeStatus['account']>(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-mini');
  const [modelLoading, setModelLoading] = useState(true);
  const [modelSaving, setModelSaving] = useState(false);

  // Fetch Twitter and YouTube connection status on mount (only if authenticated)
  useEffect(() => {
    // Wait for session to load before making API calls
    if (status === 'loading') {
      return; // Still checking session, wait
    }

    if (status === 'authenticated') {
      fetchTwitterStatus();
      fetchYoutubeStatus();
      fetchModelSetting();
    } else {
      // Not logged in, skip API call to avoid 401 error
      setTwitterConnected(false);
      setTwitterLoading(false);
      setYoutubeConnected(false);
      setYoutubeLoading(false);
      setModelLoading(false);
    }
  }, [status]);

  // Listen for OAuth success message from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'twitter-auth-success') {
        fetchTwitterStatus();
      }
      if (event.data?.type === 'youtube-auth-success') {
        fetchYoutubeStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchTwitterStatus = async () => {
    try {
      setTwitterLoading(true);
      const response = await fetch('/api/auth/twitter/status', {
        credentials: 'include',
      });

      if (response.ok) {
        const data: TwitterStatus = await response.json();
        setTwitterConnected(data.connected);
        setTwitterAccount(data.account);
      } else {
        setTwitterConnected(false);
        setTwitterAccount(null);
      }
    } catch (error) {
      console.error('Error fetching Twitter status:', error);
      setTwitterConnected(false);
      setTwitterAccount(null);
    } finally {
      setTwitterLoading(false);
    }
  };

  const fetchYoutubeStatus = async () => {
    try {
      setYoutubeLoading(true);
      const response = await fetch('/api/auth/youtube/status', {
        credentials: 'include',
      });

      if (response.ok) {
        const data: YouTubeStatus = await response.json();
        setYoutubeConnected(data.connected);
        setYoutubeAccount(data.account);
      } else {
        setYoutubeConnected(false);
        setYoutubeAccount(null);
      }
    } catch (error) {
      console.error('Error fetching YouTube status:', error);
      setYoutubeConnected(false);
      setYoutubeAccount(null);
    } finally {
      setYoutubeLoading(false);
    }
  };

  const fetchModelSetting = async () => {
    try {
      setModelLoading(true);
      const response = await fetch('/api/settings/model', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedModel(data.model || 'gpt-4o-mini');
      } else {
        setSelectedModel('gpt-4o-mini');
      }
    } catch (error) {
      console.error('Error fetching model setting:', error);
      setSelectedModel('gpt-4o-mini');
    } finally {
      setModelLoading(false);
    }
  };

  const handleModelChange = async (model: string) => {
    try {
      setModelSaving(true);
      const response = await fetch('/api/settings/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model }),
        credentials: 'include',
      });

      if (response.ok) {
        setSelectedModel(model);
      } else {
        console.error('Failed to save model setting');
      }
    } catch (error) {
      console.error('Error saving model setting:', error);
    } finally {
      setModelSaving(false);
    }
  };

  const handleConnect = async (platform: string) => {
    if (platform === 'twitter') {
      // Check if user is logged in first
      if (status !== 'authenticated') {
        // Open login page in popup
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const loginPopup = window.open(
          '/auth/signin?callbackUrl=/settings',
          'Login',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // Poll to check if login was successful
        const checkLogin = setInterval(async () => {
          try {
            // Check if popup is closed
            if (loginPopup?.closed) {
              clearInterval(checkLogin);
              // Refresh the page to update session
              window.location.reload();
            }
          } catch {
            // Ignore cross-origin errors
          }
        }, 500);

        return;
      }

      if (twitterConnected) {
        // Disconnect
        try {
          const response = await fetch('/api/auth/twitter/status', {
            method: 'DELETE',
          });
          if (response.ok) {
            setTwitterConnected(false);
            setTwitterAccount(null);
          }
        } catch (error) {
          console.error('Failed to disconnect Twitter:', error);
        }
      } else {
        // Open Twitter OAuth in popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        window.open(
          '/api/auth/twitter/authorize',
          'Twitter Login',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    }

    if (platform === 'youtube') {
      if (youtubeConnected) {
        // Disconnect YouTube
        setYoutubeLoading(true);
        try {
          await fetch('/api/auth/youtube/status', { method: 'DELETE' });
          setYoutubeConnected(false);
          setYoutubeAccount(null);
        } catch (error) {
          console.error('Error disconnecting YouTube:', error);
        } finally {
          setYoutubeLoading(false);
        }
      } else {
        // Open YouTube/Google OAuth in popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        window.open(
          '/api/auth/youtube/authorize',
          'YouTube Login',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    }

    if (platform === 'instagram') {
      // Instagram coming soon
      alert('Instagram integration coming soon. Requires Meta Business account.');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">

        {/* AI Model Selection */}
        <Card className="border-border bg-surface">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Cpu className="h-4 w-4 text-accent" />
                <div>
                  <div className="text-sm font-medium">AI Model</div>
                  <p className="text-[10px] text-secondary">
                    Model for generating content
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-[280px]">
                {modelLoading ? (
                  <div className="flex items-center gap-2 h-8 px-3 text-xs text-secondary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={modelSaving}
                      className="h-8 flex-1 rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {OPENAI_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
                    </select>
                    {modelSaving && (
                      <Loader2 className="h-3 w-3 animate-spin text-accent flex-shrink-0" />
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform Connections - One Row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Twitter */}
          <Card className="border-border bg-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Twitter className="h-4 w-4 text-accent" />
                  <CardTitle className="text-sm font-medium">Twitter</CardTitle>
                </div>
                {twitterConnected ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <X className="h-3.5 w-3.5 text-text-muted" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-[10px] text-secondary">
                {twitterLoading
                  ? 'Checking...'
                  : twitterConnected && twitterAccount?.accountName
                  ? `@${twitterAccount.accountName}`
                  : twitterConnected
                  ? 'Connected'
                  : status !== 'authenticated'
                  ? 'Login required'
                  : 'Not connected'}
              </div>
              <Button
                onClick={() => handleConnect('twitter')}
                variant={twitterConnected ? 'outline' : 'default'}
                className="w-full h-7 text-xs"
                disabled={twitterLoading || status === 'loading'}
              >
                {twitterLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Loading
                  </>
                ) : twitterConnected ? (
                  'Disconnect'
                ) : status !== 'authenticated' ? (
                  'Login to Connect'
                ) : (
                  'Connect'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* YouTube */}
          <Card className="border-border bg-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-accent" />
                  <CardTitle className="text-sm font-medium">YouTube</CardTitle>
                </div>
                {youtubeConnected ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <X className="h-3.5 w-3.5 text-text-muted" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-[10px] text-secondary">
                {youtubeLoading
                  ? 'Checking...'
                  : youtubeConnected && youtubeAccount?.accountName
                  ? youtubeAccount.accountName
                  : youtubeConnected
                  ? 'Connected'
                  : 'Not connected'}
              </div>
              <Button
                onClick={() => handleConnect('youtube')}
                variant={youtubeConnected ? 'outline' : 'default'}
                className="w-full h-7 text-xs"
                disabled={youtubeLoading}
              >
                {youtubeLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Loading
                  </>
                ) : youtubeConnected ? (
                  'Disconnect'
                ) : (
                  'Connect'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Instagram */}
          <Card className="border-border bg-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Instagram className="h-4 w-4 text-accent" />
                  <CardTitle className="text-sm font-medium">Instagram</CardTitle>
                </div>
                {instagramConnected ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <X className="h-3.5 w-3.5 text-text-muted" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-[10px] text-secondary">
                {instagramConnected ? 'Connected' : 'Coming soon'}
              </div>
              <Button
                onClick={() => handleConnect('instagram')}
                variant={instagramConnected ? 'outline' : 'default'}
                className="w-full h-7 text-xs"
                disabled={!instagramConnected}
              >
                {instagramConnected ? 'Disconnect' : 'Coming Soon'}
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}
