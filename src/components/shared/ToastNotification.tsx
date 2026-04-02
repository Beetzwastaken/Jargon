/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react';
import { create } from 'zustand';

// Toast types and interfaces
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'score';
  title: string;
  message?: string;
  duration?: number;
  icon?: string;
  points?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

// Toast store for managing notifications
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration || 3000,
    };
    
    set((state) => ({
      toasts: [...state.toasts, newToast]
    }));
    
    // Auto-remove toast after duration
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }));
    }, newToast.duration);
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },
  
  clearAll: () => {
    set({ toasts: [] });
  }
}));

// Individual toast component
interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-900/90 border-green-500/50 text-green-100';
      case 'error':
        return 'bg-red-900/90 border-red-500/50 text-red-100';
      case 'warning':
        return 'bg-yellow-900/90 border-yellow-500/50 text-yellow-100';
      case 'score':
        return toast.points && toast.points > 0 
          ? 'bg-j-me/20 border-j-me/40 text-j-text'
          : 'bg-j-error/20 border-j-error/40 text-j-text';
      case 'info':
      default:
        return 'bg-j-surface border-white/[0.06] text-j-text';
    }
  };

  const getIcon = () => {
    if (toast.icon) return toast.icon;
    
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'score':
        return toast.points && toast.points > 0 ? '🎯' : '💥';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-out
        ${isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isExiting ? 'scale-95' : 'scale-100'}
      `}
    >
      <div
        className={`
          relative p-4 rounded-lg border shadow-lg backdrop-blur-sm
          max-w-sm min-w-[300px] cursor-pointer
          hover:shadow-xl transition-shadow
          ${getToastStyles()}
        `}
        onClick={handleRemove}
      >
        <div className="flex items-start space-x-3">
          <div className="text-lg flex-shrink-0">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm truncate">
                {toast.title}
              </h4>
              
              {toast.type === 'score' && toast.points && (
                <div className={`
                  px-2 py-1 rounded-full text-xs font-bold
                  ${toast.points > 0 
                    ? 'bg-j-me/20 text-j-me'
                    : 'bg-j-error/20 text-j-error'
                  }
                `}>
                  {toast.points > 0 ? '+' : ''}{toast.points}
                </div>
              )}
            </div>
            
            {toast.message && (
              <p className="text-xs opacity-90 mt-1 line-clamp-2">
                {toast.message}
              </p>
            )}
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity p-1"
          >
            ✕
          </button>
        </div>
        
        {/* Progress bar for duration */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 rounded-b-lg overflow-hidden">
          <div
            className={`h-full transition-transform ${
              toast.type === 'score' 
                ? 'bg-j-me'
                : 'bg-white/30'
            }`}
            style={{
              animation: `shrink ${toast.duration}ms linear forwards`,
              transformOrigin: 'left'
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Main toast container component
export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
      <div className="space-y-3 pointer-events-auto">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onRemove={removeToast}
          />
        ))}
      </div>
    </div>
  );
}

// Utility functions for common toast types
export const showScoreToast = (points: number, reason: string) => {
  const { addToast } = useToastStore.getState();
  
  addToast({
    type: 'score',
    title: points > 0 ? 'Points Earned!' : 'Points Lost',
    message: reason,
    points,
    duration: 2500,
  });
};

export const showGameToast = (title: string, message?: string, type: Toast['type'] = 'info') => {
  const { addToast } = useToastStore.getState();
  
  addToast({
    type,
    title,
    message,
    duration: 3000,
  });
};