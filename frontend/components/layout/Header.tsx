'use client';

import { BarChart3 } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-neutral-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-neutral-900">
              Diversity Analyzer
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a 
              href="https://drafted.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              Back to Drafted
            </a>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="https://drafted.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm"
            >
              Start Drafting
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

