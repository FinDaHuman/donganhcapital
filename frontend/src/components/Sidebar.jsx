import React from 'react';
import { LayoutDashboard, LineChart, Newspaper, Settings, LogOut } from 'lucide-react';

const Sidebar = () => {
    return (
        <div className="w-16 flex flex-col items-center py-6 bg-[#0b0e11] border-r border-[#2a2e39] h-screen fixed left-0 top-0 z-50">
            {/* Logo Icon */}
            <div className="mb-8">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                    D
                </div>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 flex flex-col gap-6 w-full items-center">
                <NavItem icon={<LayoutDashboard size={20} />} active />
                <NavItem icon={<LineChart size={20} />} />
                <NavItem icon={<Newspaper size={20} />} />
                <div className="mt-auto mb-4">
                    <NavItem icon={<Settings size={20} />} />
                </div>
            </nav>

            <div className="mt-auto">
                <NavItem icon={<LogOut size={20} />} />
            </div>
        </div>
    );
};

const NavItem = ({ icon, active }) => (
    <button className={`p-3 rounded-xl transition-colors ${active ? 'bg-[#2962ff] text-white shadow-lg shadow-blue-900/50' : 'text-gray-500 hover:text-gray-200 hover:bg-[#1e222d]'}`}>
        {icon}
    </button>
);

export default Sidebar;
