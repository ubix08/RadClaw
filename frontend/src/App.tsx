import { useStore } from "./store"
import { Sidebar } from "./components/Sidebar"
import { ChatPage }      from "./pages/ChatPage"
import { SessionsPage }  from "./pages/SessionsPage"
import { AdminPage }     from "./pages/AdminPage"
import { MemoryPage }    from "./pages/MemoryPage"
import { SettingsPage }  from "./pages/SettingsPage"
import { SourcesPage }   from "./pages/SourcesPage"
import { DashboardPage } from "./pages/DashboardPage"

export default function App() {
  const { view } = useStore()

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === "chat"      && <ChatPage />}
        {view === "sessions"  && <SessionsPage />}
        {view === "admin"     && <AdminPage />}
        {view === "memory"    && <MemoryPage />}
        {view === "settings"  && <SettingsPage />}
        {view === "sources"   && <SourcesPage />}
        {view === "dashboard" && <DashboardPage />}
      </main>
    </div>
  )
}
