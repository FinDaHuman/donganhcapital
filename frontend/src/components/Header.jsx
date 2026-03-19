import React from 'react';

const Header = ({ activeTab, onTabChange }) => {
    return (
        <div className="h-[60px] w-full flex items-center px-6 z-50 shrink-0" style={{ backgroundColor: '#000000' }}>
            {/* Brand Logo & Name */}
            <div className="flex items-center mr-10 cursor-pointer text-gray-100 hover:text-white transition-colors">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white mr-3">
                    D
                </div>
                <span className="font-bold text-xl tracking-tight">DongAnh Capital</span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-6 h-full">
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
                    onClick={() => onTabChange('analyst')}
                    className={`h-full flex items-center px-1 font-medium transition-all border-b-2 ${activeTab === 'analyst'
                        ? 'text-blue-500 border-blue-500'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                >
                    AI Analyst
                </button>
            </div>
        </div>
    );
};

export default Header;
