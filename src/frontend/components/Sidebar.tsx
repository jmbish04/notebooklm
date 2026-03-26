import React, { useState } from 'react';
import { Menu } from 'lucide-react';

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-gray-800 p-4">
        <div className="text-xl font-bold mb-8">NotebookLM Power</div>
        <nav className="flex flex-col gap-4">
          <a href="/" className="hover:bg-gray-700 p-2 rounded">Home</a>
          <a href="/upload" className="hover:bg-gray-700 p-2 rounded">Batch Upload</a>
          <a href="/chat" className="hover:bg-gray-700 p-2 rounded">Honi Chat</a>
          <a href="/swagger" className="hover:bg-gray-700 p-2 rounded">Swagger API</a>
          <a href="/scaler" className="hover:bg-gray-700 p-2 rounded">Scalar API</a>
        </nav>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="md:hidden flex items-center p-4 bg-gray-800">
          <button onClick={() => setIsOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <div className="ml-4 font-bold">NotebookLM</div>
        </header>

        {/* Mobile Sheet/Sidebar */}
        {isOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)}></div>
            <aside className="w-64 bg-gray-800 p-4 z-10 h-full flex flex-col">
              <div className="text-xl font-bold mb-8">Menu</div>
              <nav className="flex flex-col gap-4">
                <a href="/" className="hover:bg-gray-700 p-2 rounded">Home</a>
                <a href="/upload" className="hover:bg-gray-700 p-2 rounded">Batch Upload</a>
                <a href="/chat" className="hover:bg-gray-700 p-2 rounded">Honi Chat</a>
                <a href="/swagger" className="hover:bg-gray-700 p-2 rounded">Swagger API</a>
                <a href="/scaler" className="hover:bg-gray-700 p-2 rounded">Scalar API</a>
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-auto bg-gray-950 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
