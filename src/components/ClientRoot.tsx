"use client";

import { SessionProvider } from "@/components/providers/SessionProvider";
import { ClientProvider } from "@/components/providers/ClientProvider";
import { Toaster } from "@/components/ui/sonner";
import { AppLoader } from "@/components/ui/app-loader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatFAB } from "@/components/agent-chat/ChatFAB";

export function ClientRoot({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppLoader />
            <ErrorBoundary>
                <SessionProvider>
                    <ClientProvider>
                        {children}
                    </ClientProvider>
                </SessionProvider>
            </ErrorBoundary>
            <ChatFAB />
            <Toaster />
        </>
    );
}
