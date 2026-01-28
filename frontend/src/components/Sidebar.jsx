import React from 'react';
import { LayoutDashboard, LineChart, Newspaper, Settings, ChevronRight } from 'lucide-react';

const Sidebar = ({ activeTab, onTabChange }) => {
    const navItems = [
        { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Market Overview' },
        { id: 'chart', icon: <LineChart size={20} />, label: 'Technical Chart' },
        { id: 'news', icon: <Newspaper size={20} />, label: 'News Feed' },
    ];

    return (
        <div className="w-[300px] h-screen bg-[#111213] border-r border-[#2a2e39] flex flex-col z-50 fixed left-0 top-0">
            {/* Brand Header */}
            <div className="h-[60px] flex items-center px-6 border-b border-[#2a2e39]">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white mr-3">
                    D
                </div>
                <span className="font-bold text-xl text-gray-100 tracking-tight">DongAnh Capital</span>
            </div>

            {/* Nav Menu */}
            <div className="flex flex-col gap-2 p-4 w-full">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all group ${activeTab === item.id
                                ? 'bg-[#2962ff] text-white shadow-lg shadow-blue-900/20'
                                : 'text-gray-400 hover:text-white hover:bg-[#1a1c1e]'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            {item.icon}
                            <span className="font-medium text-sm">{item.label}</span>
                        </div>
                        {activeTab === item.id && <ChevronRight size={16} />}
                    </button>
                ))}
            </div>

            {/* Bottom Settings */}
            <div className="mt-auto p-4 border-t border-[#2a2e39]">
                <button className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white w-full hover:bg-[#1a1c1e] rounded-lg transition-colors">
                    <Settings size={20} />
                    <span className="font-medium text-sm">Settings</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
