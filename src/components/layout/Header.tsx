'use client';

export function Header() {
  return (
    <header className="flex h-14 min-h-14 items-center px-4 md:px-6 bg-background-100 border-b border-gray-alpha-400">
      <nav className="flex w-full items-center justify-between">
        {/* Left side - Logo/Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-6 rounded-sm bg-foreground text-background font-bold text-sm">
              b0
            </div>
            <span className="text-sm font-medium text-gray-1000 hidden sm:inline">
              b0t
            </span>
          </div>
        </div>
      </nav>
    </header>
  );
}
