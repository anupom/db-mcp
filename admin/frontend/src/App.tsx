import { Routes, Route, NavLink } from 'react-router-dom';
import { Database, Shield, Play, Settings, MessageCircle, Plug } from 'lucide-react';
import DatabasePage from './pages/DatabasePage';
import GovernancePage from './pages/GovernancePage';
import PlaygroundPage from './pages/PlaygroundPage';
import ChatPage from './pages/ChatPage';
import MCPPage from './pages/MCPPage';

const navItems = [
  { to: '/', icon: Database, label: 'Database' },
  { to: '/governance', icon: Shield, label: 'Governance' },
  { to: '/playground', icon: Play, label: 'Playground' },
  { to: '/chat', icon: MessageCircle, label: 'AI Chat' },
  { to: '/mcp', icon: Plug, label: 'MCP' },
];

function App() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" />
            DB-MCP Admin
          </h1>
        </div>
        <nav className="p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                  end={item.to === '/'}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<DatabasePage />} />
          <Route path="/governance" element={<GovernancePage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/mcp" element={<MCPPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
