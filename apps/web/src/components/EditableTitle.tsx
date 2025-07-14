import React, { useState, useEffect } from 'react';
import { Edit3Icon, CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@ai-tutor/utils';

interface EditableTitleProps {
  title: string;
  onSave: (newTitle: string) => void;
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
}

export const EditableTitle: React.FC<EditableTitleProps> = ({
  title,
  onSave,
  isLoading = false,
  className = '',
  placeholder = 'Enter title...',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(title);
  };

  const handleSave = () => {
    if (editValue.trim() !== title && editValue.trim()) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleBlur = () => {
    if (isEditing) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleBlur}
          className="flex-1 text-xl font-bold bg-transparent border-2 border-primary rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
          placeholder={placeholder}
          autoFocus
          disabled={isLoading}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={isLoading || !editValue.trim()}
            className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
            title="Save"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="p-1 text-red-600 hover:text-red-700 disabled:opacity-50"
            title="Cancel"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex items-center gap-2', className)}>
      <h1 className="text-xl font-bold text-foreground flex-1 truncate">
        {title || placeholder}
      </h1>
      <button
        onClick={handleStartEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground"
        title="Edit title"
      >
        <Edit3Icon className="h-4 w-4" />
      </button>
    </div>
  );
};