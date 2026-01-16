'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  X, 
  ChevronDown,
  Home,
  Bath,
  Utensils,
  Sofa,
  Car,
  Trees,
  Briefcase,
  Info
} from 'lucide-react';
import type { 
  RoomSpec, 
  RoomTypeDefinition, 
  RoomSize,
  RoomCategory 
} from '@/lib/drafted-types';
import { ROOM_CATEGORIES, SIZE_LABELS, getRoomCategory } from '@/lib/drafted-types';

interface RoomSelectorProps {
  rooms: RoomSpec[];
  roomTypes: RoomTypeDefinition[];
  onAddRoom: (roomType: string, size: RoomSize) => void;
  onRemoveRoom: (id: string) => void;
  onUpdateSize: (id: string, size: RoomSize) => void;
  tokenCount?: number;
  tokenLimit?: number;
  estimatedSqft?: number;
}

const CATEGORY_ICONS: Record<RoomCategory, React.ReactNode> = {
  primary: <Home className="w-4 h-4" />,
  bedrooms: <Home className="w-4 h-4" />,
  bathrooms: <Bath className="w-4 h-4" />,
  living: <Sofa className="w-4 h-4" />,
  dining: <Utensils className="w-4 h-4" />,
  kitchen: <Utensils className="w-4 h-4" />,
  utility: <Car className="w-4 h-4" />,
  outdoor: <Trees className="w-4 h-4" />,
  flex: <Briefcase className="w-4 h-4" />,
};

const CATEGORY_LABELS: Record<RoomCategory, string> = {
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

export function RoomSelector({
  rooms,
  roomTypes,
  onAddRoom,
  onRemoveRoom,
  onUpdateSize,
  tokenCount = 0,
  tokenLimit = 77,
  estimatedSqft = 0,
}: RoomSelectorProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<RoomCategory | null>(null);

  // Group room types by category
  const roomTypesByCategory = useMemo(() => {
    const grouped: Record<RoomCategory, RoomTypeDefinition[]> = {
      primary: [],
      bedrooms: [],
      bathrooms: [],
      living: [],
      dining: [],
      kitchen: [],
      utility: [],
      outdoor: [],
      flex: [],
    };

    roomTypes.forEach((rt) => {
      const category = getRoomCategory(rt.key);
      if (category) {
        grouped[category].push(rt);
      }
    });

    return grouped;
  }, [roomTypes]);

  // Count rooms by type
  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach((r) => {
      counts[r.room_type] = (counts[r.room_type] || 0) + 1;
    });
    return counts;
  }, [rooms]);

  // Get room type definition
  const getRoomTypeDef = (key: string) => 
    roomTypes.find((rt) => rt.key === key);

  // Token usage warning
  const tokenWarning = tokenCount > tokenLimit;
  const tokenUsage = Math.min(100, (tokenCount / tokenLimit) * 100);

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-drafted-bg rounded-drafted">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="text-drafted-light">Rooms:</span>
            <span className="ml-2 font-semibold text-drafted-black">{rooms.length}</span>
          </div>
          <div className="text-sm">
            <span className="text-drafted-light">Est. Area:</span>
            <span className="ml-2 font-semibold text-drafted-black">
              {estimatedSqft.toLocaleString()} sqft
            </span>
          </div>
        </div>
        
        {/* Token Counter */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-white rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                tokenWarning ? 'bg-red-500' : 'bg-coral-500'
              }`}
              style={{ width: `${tokenUsage}%` }}
            />
          </div>
          <span className={`text-xs font-medium ${
            tokenWarning ? 'text-red-500' : 'text-drafted-gray'
          }`}>
            {tokenCount}/{tokenLimit}
          </span>
          {tokenWarning && (
            <span className="text-xs text-red-500">Over limit!</span>
          )}
        </div>
      </div>

      {/* Selected Rooms */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {rooms.map((room) => {
            const roomDef = getRoomTypeDef(room.room_type);
            if (!roomDef) return null;

            const sizeDef = roomDef.sizes.find((s) => s.key === room.size);
            const color = roomDef.colors.ui_hex || '#E5E7EB';

            return (
              <motion.div
                key={room.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 bg-white border border-drafted-border rounded-drafted group"
              >
                {/* Color indicator */}
                <div 
                  className="w-3 h-10 rounded-full"
                  style={{ backgroundColor: color }}
                />

                {/* Room info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-drafted-black">
                    {roomDef.display}
                  </div>
                  <div className="text-xs text-drafted-gray truncate">
                    {sizeDef?.user_name || room.size} 
                    {sizeDef && (
                      <span className="text-drafted-light ml-1">
                        ({sizeDef.sqft_range[0]}-{sizeDef.sqft_range[1]} sqft)
                      </span>
                    )}
                  </div>
                </div>

                {/* Size selector */}
                <div className="flex gap-1">
                  {(['S', 'M', 'L', 'XL'] as RoomSize[]).map((size) => {
                    const available = roomDef.sizes.some((s) => s.key === size);
                    if (!available) return null;
                    
                    return (
                      <button
                        key={size}
                        onClick={() => onUpdateSize(room.id, size)}
                        className={`
                          w-8 h-8 text-xs font-medium rounded transition-all
                          ${room.size === size
                            ? 'bg-drafted-black text-white'
                            : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
                          }
                        `}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => onRemoveRoom(room.id)}
                  className="w-8 h-8 flex items-center justify-center text-drafted-light hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {rooms.length === 0 && (
          <div className="text-center py-8 text-drafted-gray">
            <p>No rooms added yet.</p>
            <p className="text-sm text-drafted-light mt-1">
              Click "Add Room" to start building your floor plan.
            </p>
          </div>
        )}
      </div>

      {/* Add Room Button */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-3 border-2 border-dashed border-drafted-border rounded-drafted text-drafted-gray hover:border-coral-300 hover:text-coral-500 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Room
          <ChevronDown className={`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
        </button>

        {/* Add Room Menu */}
        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white border border-drafted-border rounded-drafted shadow-lg z-50 max-h-96 overflow-y-auto"
            >
              {(Object.keys(ROOM_CATEGORIES) as RoomCategory[]).map((category) => {
                const categoryRooms = roomTypesByCategory[category];
                if (categoryRooms.length === 0) return null;

                const isExpanded = expandedCategory === category;

                return (
                  <div key={category} className="border-b border-drafted-border last:border-0">
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-drafted-bg transition-colors"
                    >
                      {CATEGORY_ICONS[category]}
                      <span className="font-medium text-drafted-black flex-1 text-left">
                        {CATEGORY_LABELS[category]}
                      </span>
                      <span className="text-xs text-drafted-light">
                        {categoryRooms.length} types
                      </span>
                      <ChevronDown className={`w-4 h-4 text-drafted-gray transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3 space-y-1">
                            {categoryRooms.map((rt) => {
                              const count = roomCounts[rt.key] || 0;
                              const color = rt.colors.ui_hex || '#E5E7EB';

                              return (
                                <div
                                  key={rt.key}
                                  className="flex items-center gap-2 p-2 rounded hover:bg-drafted-bg"
                                >
                                  <div 
                                    className="w-2 h-6 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="flex-1 text-sm text-drafted-black">
                                    {rt.display}
                                  </span>
                                  {count > 0 && (
                                    <span className="text-xs text-drafted-light">
                                      ({count} added)
                                    </span>
                                  )}
                                  <div className="flex gap-1">
                                    {rt.sizes.map((size) => (
                                      <button
                                        key={size.key}
                                        onClick={() => {
                                          onAddRoom(rt.key, size.key);
                                        }}
                                        title={`${size.user_name}\n${size.sqft_range[0]}-${size.sqft_range[1]} sqft`}
                                        className="w-7 h-7 text-xs font-medium bg-drafted-bg hover:bg-coral-100 hover:text-coral-600 rounded transition-all"
                                      >
                                        {size.key}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Add Presets */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-drafted-light py-1">Quick add:</span>
        <button
          onClick={() => onAddRoom('bedroom', 'M')}
          className="text-xs px-2 py-1 bg-drafted-bg hover:bg-coral-100 hover:text-coral-600 rounded transition-colors"
        >
          + Bedroom
        </button>
        <button
          onClick={() => onAddRoom('bathroom', 'S')}
          className="text-xs px-2 py-1 bg-drafted-bg hover:bg-coral-100 hover:text-coral-600 rounded transition-colors"
        >
          + Bathroom
        </button>
        <button
          onClick={() => onAddRoom('office', 'M')}
          className="text-xs px-2 py-1 bg-drafted-bg hover:bg-coral-100 hover:text-coral-600 rounded transition-colors"
        >
          + Office
        </button>
        <button
          onClick={() => onAddRoom('garage', 'M')}
          className="text-xs px-2 py-1 bg-drafted-bg hover:bg-coral-100 hover:text-coral-600 rounded transition-colors"
        >
          + Garage
        </button>
      </div>
    </div>
  );
}






