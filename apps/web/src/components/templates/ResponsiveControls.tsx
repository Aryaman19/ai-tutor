/**
 * Responsive Controls Component
 * 
 * Controls for adjusting container size and testing responsive breakpoints
 */

import React, { useState } from 'react';

interface ContainerSize {
  width: number;
  height: number;
}

interface ResponsiveControlsProps {
  containerSize: ContainerSize;
  onSizeChange: (size: ContainerSize) => void;
}

// Common device presets
const DEVICE_PRESETS = [
  { name: 'iPhone SE', width: 375, height: 667, icon: '📱' },
  { name: 'iPhone 12', width: 390, height: 844, icon: '📱' },
  { name: 'iPad', width: 768, height: 1024, icon: '📱' },
  { name: 'iPad Pro', width: 1024, height: 1366, icon: '📱' },
  { name: 'Laptop', width: 1366, height: 768, icon: '💻' },
  { name: 'Desktop', width: 1920, height: 1080, icon: '🖥️' },
];

const ResponsiveControls: React.FC<ResponsiveControlsProps> = ({
  containerSize,
  onSizeChange
}) => {
  const [showCustomControls, setShowCustomControls] = useState(false);

  const handlePresetSelect = (preset: { width: number; height: number }) => {
    onSizeChange(preset);
  };

  const handleCustomSizeChange = (dimension: 'width' | 'height', value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      onSizeChange({
        ...containerSize,
        [dimension]: Math.min(numValue, dimension === 'width' ? 3840 : 2160)
      });
    }
  };

  const getBreakpointLabel = () => {
    if (containerSize.width < 768) return 'Mobile';
    if (containerSize.width < 1024) return 'Tablet';
    return 'Desktop';
  };

  const getBreakpointColor = () => {
    if (containerSize.width < 768) return 'bg-green-100 text-green-800';
    if (containerSize.width < 1024) return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="flex items-center space-x-4">
      {/* Current size display */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700">Size:</span>
        <div className="flex items-center space-x-1 bg-gray-100 rounded-md px-2 py-1 text-sm">
          <span>{containerSize.width}</span>
          <span className="text-gray-400">×</span>
          <span>{containerSize.height}</span>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBreakpointColor()}`}>
          {getBreakpointLabel()}
        </span>
      </div>

      {/* Device presets */}
      <div className="flex items-center space-x-1">
        {DEVICE_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => handlePresetSelect(preset)}
            className="flex items-center space-x-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={`${preset.name} (${preset.width}×${preset.height})`}
          >
            <span>{preset.icon}</span>
            <span className="hidden sm:inline">{preset.name}</span>
          </button>
        ))}
      </div>

      {/* Custom controls toggle */}
      <button
        onClick={() => setShowCustomControls(!showCustomControls)}
        className="flex items-center space-x-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>Custom</span>
        <svg
          className={`w-4 h-4 transition-transform ${showCustomControls ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Custom size inputs */}
      {showCustomControls && (
        <div className="flex items-center space-x-2 bg-gray-50 rounded-md p-2">
          <div className="flex items-center space-x-1">
            <label className="text-xs text-gray-600">W:</label>
            <input
              type="number"
              value={containerSize.width}
              onChange={(e) => handleCustomSizeChange('width', e.target.value)}
              min="320"
              max="3840"
              className="w-16 px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-1">
            <label className="text-xs text-gray-600">H:</label>
            <input
              type="number"
              value={containerSize.height}
              onChange={(e) => handleCustomSizeChange('height', e.target.value)}
              min="240"
              max="2160"
              className="w-16 px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResponsiveControls;