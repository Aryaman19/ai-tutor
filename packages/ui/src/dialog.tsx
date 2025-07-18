import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@ai-tutor/utils';

interface DialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  open,
  onOpenChange,
  title,
  children,
  className
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Support both isOpen/onClose and open/onOpenChange patterns
  const isDialogOpen = open ?? isOpen ?? false;
  const handleClose = () => {
    if (onOpenChange) {
      onOpenChange(false);
    }
    if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      document.body.style.overflow = 'hidden';
      dialogRef.current?.focus();
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDialogOpen]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isDialogOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isDialogOpen]);

  if (!isDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        tabIndex={-1}
        className={cn(
          "relative bg-card border shadow-lg rounded-lg w-full max-w-md mx-4 p-6 transform transition-all",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h2 id="dialog-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
          )}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 rounded-md hover:bg-accent transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
};

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogContent: React.FC<DialogContentProps> = ({ children, className }) => (
  <div className={cn("space-y-4", className)}>
    {children}
  </div>
);

interface DialogActionsProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogActions: React.FC<DialogActionsProps> = ({ children, className }) => (
  <div className={cn("flex justify-end space-x-2 mt-6", className)}>
    {children}
  </div>
);

// Additional dialog components for compatibility
export const DialogTrigger: React.FC<{ children: React.ReactNode; asChild?: boolean }> = ({ 
  children, 
  asChild = false 
}) => {
  if (asChild) {
    return <>{children}</>;
  }
  return <>{children}</>;
};

export const DialogHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className 
}) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}>
    {children}
  </div>
);

export const DialogTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className 
}) => (
  <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
    {children}
  </h2>
);