import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, ClipboardList, Menu, X, LogOut, Crown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { User } from "@/entities/User";

// Customer-facing items accept both "customer" (Supabase profile role) and the
// legacy "user" value so the sidebar is never empty for a signed-in customer.
const CUSTOMER_ROLES = ["customer", "user", "admin"];

const navigationItems = [
  {
    title: "Book Simulator",
    url: createPageUrl("BookSimulator"),
    icon: Calendar,
    roles: CUSTOMER_ROLES,
  },
  {
    title: "My Reservations",
    url: createPageUrl("MyReservations"),
    icon: ClipboardList,
    roles: CUSTOMER_ROLES,
  },
  {
    title: "Member Signup",
    url: createPageUrl("MemberSignup"),
    icon: Crown,
    roles: CUSTOMER_ROLES,
  },
  {
    title: "Member Bookings",
    url: createPageUrl("MemberBookings"),
    icon: Crown,
    roles: CUSTOMER_ROLES,
  },
  {
    title: "Vadnais Heights Admin",
    url: createPageUrl("AdminDashboardVadnaisHeights"),
    icon: ClipboardList,
    roles: ["admin"],
  },
  {
    title: "Burnsville Admin",
    url: createPageUrl("AdminDashboardBurnsville"),
    icon: ClipboardList,
    roles: ["admin"],
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (e) {
      // User not logged in - redirect to built-in login
      const currentUrl = window.location.href;
      await User.loginWithRedirect(currentUrl);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await User.logout();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const visibleNavItems = React.useMemo(() => {
    if (!currentUser) return [];
    return navigationItems.filter(item =>
      item.roles.includes(currentUser.role)
    );
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2d5567]"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2d5567]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');
        
        :root {
          --primary: 201 62% 28%;
          --primary-foreground: 0 0% 98%;
          --accent: 201 62% 35%;
          --accent-foreground: 0 0% 98%;
        }
        
        * {
          font-family: 'Inter', sans-serif;
        }
        
        h1, h2, h3, h4, h5, h6, .heading-font {
          font-family: 'Montserrat', sans-serif;
        }
      `}</style>

      <SidebarProvider>
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar className="border-r border-slate-200 bg-white/80 backdrop-blur-xl">
            <SidebarHeader className="border-b border-slate-200 p-6">
              <div className="flex flex-col items-center space-y-4">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg"
                  alt="Element Indoor Golf"
                  className="h-20 w-auto object-contain"
                />
                {currentUser && (
                  <div className="text-center w-full">
                    <p className="text-base font-bold text-slate-800 heading-font tracking-wide">{currentUser.full_name}</p>
                    <p className="text-xs text-slate-500 mt-1">{currentUser.email}</p>
                    {currentUser.role === 'admin' && (
                      <span className="inline-block mt-2 px-3 py-1 bg-[#2d5567] text-white text-xs font-semibold rounded-full tracking-wide">
                        ADMIN
                      </span>
                    )}
                  </div>
                )}
              </div>
            </SidebarHeader>

            <SidebarContent className="p-4">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleNavItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`mb-2 hover:bg-slate-100 hover:text-slate-800 transition-all duration-200 rounded-xl ${
                            location.pathname === item.url ? 'bg-[#2d5567] text-white shadow-sm' : ''
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-4 py-3">
                            <item.icon className="w-5 h-5" />
                            <span className="font-semibold tracking-wide">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-4 border-t border-slate-200">
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full justify-start gap-3 font-semibold"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </Button>
            </SidebarFooter>
          </Sidebar>
        </div>

        {/* Mobile Header */}
        <header className="lg:hidden bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50 shadow-sm">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg"
                alt="Element Indoor Golf"
                className="h-12 w-auto object-contain"
              />
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors active:scale-95"
            >
              {mobileMenuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="border-t border-slate-200 bg-white p-4">
              {currentUser && (
                <div className="mb-4 pb-4 border-b border-slate-200 text-center">
                  <p className="text-base font-bold text-slate-800 heading-font">{currentUser.full_name}</p>
                  <p className="text-xs text-slate-500 mt-1">{currentUser.email}</p>
                  {currentUser.role === 'admin' && (
                    <span className="inline-block mt-2 px-3 py-1 bg-[#2d5567] text-white text-xs font-semibold rounded-full tracking-wide">
                      ADMIN
                    </span>
                  )}
                </div>
              )}
              <nav className="space-y-2">
                {visibleNavItems.map((item) => (
                  <Link
                    key={item.title}
                    to={item.url}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-95 font-semibold ${
                      location.pathname === item.url
                        ? 'bg-[#2d5567] text-white shadow-sm'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="tracking-wide">{item.title}</span>
                  </Link>
                ))}
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  variant="outline"
                  className="w-full justify-start gap-3 mt-3 font-semibold"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </Button>
              </nav>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>
      </SidebarProvider>
    </div>
  );
}