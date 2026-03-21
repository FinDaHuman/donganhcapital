import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

const Header = ({ activeTab, onTabChange }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleTabChange = (tab) => {
        onTabChange(tab);
        setIsMenuOpen(false);
    };
    return (
        <div className="h-[60px] w-full flex items-center px-6 z-50 shrink-0 relative" style={{ backgroundColor: '#000000' }}>
            {/* Brand Logo & Name */}
            <div className="flex items-center mr-auto sm:mr-10 cursor-pointer text-gray-100 hover:text-white transition-colors">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white mr-3 shrink-0">
                    D
                </div>
                <span className="font-bold text-xl tracking-tight hidden sm:block">DongAnh Capital</span>
            </div>

            {/* Mobile Menu Button */}
            <button 
                className="sm:hidden text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Navigation Tabs */}
            <div className="hidden sm:flex items-center gap-6 h-full">
                <button
                    onClick={() => onTabChange('home')}
                    className={`h-full flex items-center px-1 font-medium transition-all border-b-2 ${activeTab === 'home'
                        ? 'text-white border-white'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                >
                    Home
                </button>
                <button
                    onClick={() => onTabChange('dashboard')}
                    className={`h-full flex items-center px-1 font-medium transition-all border-b-2 ${activeTab === 'dashboard'
                        ? 'text-blue-500 border-blue-500'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                >
                    Dashboard
                </button>
                <button
                    onClick={() => onTabChange('chart')}
                    className={`h-full flex items-center px-1 font-medium transition-all border-b-2 ${activeTab === 'chart'
                        ? 'text-blue-500 border-blue-500'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                >
                    Chart
                </button>
                <button
                    onClick={() => handleTabChange('analyst')}
                    className={`h-full flex items-center px-1 font-medium transition-all border-b-2 ${activeTab === 'analyst'
                        ? 'text-blue-500 border-blue-500'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                >
                    AI Analyst
                </button>
            </div>

            {/* Mobile Dropdown Menu */}
            {isMenuOpen && (
                <div className="absolute top-[60px] left-0 right-0 bg-[#000000] border-t border-gray-800 flex flex-col px-6 py-4 gap-4 sm:hidden z-50 shadow-2xl">
                    <button
                        onClick={() => handleTabChange('home')}
                        className={`text-left text-lg font-medium transition-colors ${activeTab === 'home' ? 'text-white' : 'text-gray-400'}`}
                    >
                        Home
                    </button>
                    <button
                        onClick={() => handleTabChange('dashboard')}
                        className={`text-left text-lg font-medium transition-colors ${activeTab === 'dashboard' ? 'text-blue-400' : 'text-gray-400'}`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => handleTabChange('chart')}
                        className={`text-left text-lg font-medium transition-colors ${activeTab === 'chart' ? 'text-blue-400' : 'text-gray-400'}`}
                    >
                        Chart
                    </button>
                    <button
                        onClick={() => handleTabChange('analyst')}
                        className={`text-left text-lg font-medium transition-colors ${activeTab === 'analyst' ? 'text-blue-400' : 'text-gray-400'}`}
                    >
                        AI Analyst
                    </button>
                </div>
            )}
        </div>
    );
};

export default Header;
