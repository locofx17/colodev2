import React, { useState } from 'react';
import AppLoader from './app-loader';

interface AppLoaderWrapperProps {
    children: React.ReactNode;
    duration?: number; // Duration in milliseconds, default 5000ms (5 seconds)
    enabled?: boolean; // Whether to show the loader, default true
}

const AppLoaderWrapper: React.FC<AppLoaderWrapperProps> = ({ 
    children, 
    duration = 5000, 
    enabled = true 
}) => {
    const [isLoading, setIsLoading] = useState(enabled);

    const handleLoadingComplete = () => {
        setIsLoading(false);
    };

    return (
        <>
            {isLoading && (
                <AppLoader 
                    onLoadingComplete={handleLoadingComplete}
                    duration={duration}
                />
            )}
            {!isLoading && children}
        </>
    );
};

export default AppLoaderWrapper;
