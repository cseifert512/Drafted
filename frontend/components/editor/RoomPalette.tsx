'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronRight, 
  GripVertical,
  Bed,
  Bath,
  Sofa,
  UtensilsCrossed,
  Car,
  Briefcase,
  Sun,
  Plus,
  Square,
} from 'lucide-react';
import type { RoomSize, RoomTypeDefinition } from '@/lib/drafted-types';
import type { DragItem, PaletteCategory } from '@/lib/editor/editorTypes';
import { ROOM_CATEGORIES } from '@/lib/drafted-types';

interface RoomPaletteProps {
  roomTypes: RoomTypeDefinition[];
  onAddRoom?: (roomType: string, size: RoomSize) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// Room category icons
const CATEGORY_ICONS: Record<string, typeof Bed> = {
  primary: Bed,
  bedrooms: Bed,
  bathrooms: Bath,
  living: Sofa,
  dining: UtensilsCrossed,
  kitchen: UtensilsCrossed,
  utility: Car,
  outdoor: Sun,
  flex: Briefcase,
};

// Category display names
const CATEGORY_LABELS: Record<string, string> = {
  primary: 'Primary Suite',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  living: 'Living Spaces',
  dining: 'Dining',
  kitchen: 'Kitchen & Pantry',
  utility: 'Utility',
  outdoor: 'Outdoor',
  flex: 'Flex Spaces',
};

export function RoomPalette({ roomTypes, onAddRoom, isOpen, onToggle }: RoomPaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['primary', 'bedrooms', 'living'])
  );
  const [selectedSize, setSelectedSize] = useState<RoomSize>('M');
  
  // Organize rooms by category
  const categories = useMemo(() => {
    const result: PaletteCategory[] = [];
    
    for (const [category, roomTypeKeys] of Object.entries(ROOM_CATEGORIES) as [string, readonly string[]][]) {
      const rooms = roomTypes.filter(rt => roomTypeKeys.includes(rt.key));
      if (rooms.length > 0) {
        result.push({
          key: category,
          label: CATEGORY_LABELS[category] || category,
          rooms: rooms.map(rt => ({
            roomType: rt.key,
            displayName: rt.display,
            icon: rt.icon,
            defaultSize: 'M' as RoomSize,
            fillColor: rt.colors.ui_hex || '#cccccc',
            category,
          })),
        });
      }
    }
    
    return result;
  }, [roomTypes]);
  
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  const handleDragStart = (e: React.DragEvent, roomType: string, fillColor: string) => {
    const dragItem: DragItem = {
      type: 'palette-room',
      roomType,
      defaultSize: selectedSize,
      fillColor,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragItem));
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 p-2 bg-white border border-drafted-border rounded-r-lg shadow-sm hover:bg-drafted-bg transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }
  
  return (
    <div className="w-64 bg-white border-r border-drafted-border flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-drafted-border flex items-center justify-between">
        <h3 className="font-semibold text-drafted-black text-sm">Room Library</h3>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-drafted-bg rounded transition-colors"
        >
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
      </div>
      
      {/* Size Selector */}
      <div className="p-3 border-b border-drafted-border">
        <label className="text-xs text-drafted-gray mb-1.5 block">Default Size</label>
        <div className="flex gap-1">
          {(['S', 'M', 'L', 'XL'] as RoomSize[]).map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(size)}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                selectedSize === size
                  ? 'bg-coral-500 text-white'
                  : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      
      {/* Room Categories */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Generic Rectangle Tool */}
        <div className="mb-3">
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, 'generic', '#e5e7eb')}
            className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-drafted-border hover:border-drafted-gray hover:bg-drafted-bg cursor-grab active:cursor-grabbing transition-colors"
          >
            <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
              <Square className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-drafted-black">Generic Room</div>
              <div className="text-xs text-drafted-muted">Assign type after placing</div>
            </div>
            <GripVertical className="w-4 h-4 text-drafted-muted" />
          </div>
        </div>
        
        {/* Categories */}
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.key] || Square;
          const isExpanded = expandedCategories.has(category.key);
          
          return (
            <div key={category.key} className="mb-2">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.key)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-drafted-bg transition-colors"
              >
                <Icon className="w-4 h-4 text-drafted-gray" />
                <span className="flex-1 text-left text-sm font-medium text-drafted-black">
                  {category.label}
                </span>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4 text-drafted-muted" />
                </motion.div>
              </button>
              
              {/* Room Items */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pl-2 pt-1 space-y-1">
                      {category.rooms.map((room) => (
                        <div
                          key={room.roomType}
                          draggable
                          onDragStart={(e) => handleDragStart(e, room.roomType, room.fillColor)}
                          className="flex items-center gap-2 p-2 rounded-lg border border-transparent hover:border-drafted-border hover:bg-drafted-bg cursor-grab active:cursor-grabbing transition-all group"
                        >
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: room.fillColor }}
                          />
                          <span className="flex-1 text-sm text-drafted-gray group-hover:text-drafted-black">
                            {room.displayName}
                          </span>
                          <GripVertical className="w-3 h-3 text-drafted-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      
      {/* Help Text */}
      <div className="p-3 border-t border-drafted-border bg-drafted-bg/50">
        <p className="text-xs text-drafted-muted">
          Drag rooms onto the canvas to add them. Hold <kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Alt</kbd> + drag to pan.
        </p>
      </div>
    </div>
  );
}








