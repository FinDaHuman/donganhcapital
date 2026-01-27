import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children }) => {
    return (
        <div className="flex bg-[#0b0e11] min-h-screen text-gray-200 font-sans">
            <Sidebar />

            <div className="flex-1 flex flex-col ml-16">
                <Header />

                <main className="flex-1 p-6 mt-16 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
