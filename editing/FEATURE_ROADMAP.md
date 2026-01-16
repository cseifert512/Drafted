# Floorplan Editing Feature Roadmap

**Date:** January 14, 2026  
**Goal:** Build an engaging, intuitive editing experience that keeps users coming back while generation is being optimized.

---

## 📊 Feature Priority Ranking

| Rank | Feature | Impact | Effort | Status |
|------|---------|--------|--------|--------|
| **1** | Smart Suggestions | 🔥🔥🔥 | Medium | 🔲 To Do |
| **2** | Magnetic Snapping Visual Feedback | 🔥🔥🔥 | Low-Medium | 🔲 To Do |
| **3** | Design Themes | 🔥🔥 | Low | 🔲 To Do |
| **4** | Favorites & Collections | 🔥🔥 | Medium | 🔲 To Do |
| **5** | Gamification | 🔥 | Medium | 🔲 To Do |

**Deprioritized:** Room Flow Visualization (save for Pro/Expert mode later)

---

## 📅 Suggested Implementation Order

| Time Block | PR | Rationale |
|------------|-----|-----------|
| Morning | PR #2: Magnetic Snapping | Quick win - backend exists, just need visual polish |
| Late Morning | PR #3: Design Themes | Simple, sets aesthetic foundation |
| Afternoon | PR #1: Smart Suggestions | Core differentiator, more complex |
| Evening | PR #4: Favorites & Collections | Standard CRUD, good end-of-day task |
| Later | PR #5: Gamification | Polish layer, can wait |

---

## PR #1: Smart Suggestions Panel

**Priority:** P0  
**Effort:** ~4-6 hours  
**Status:** 🔲 To Do

### Goal
When a user selects a room, show contextual suggestions that help them improve their layout.

### User Story
> As a user, when I select my kitchen, I see suggestions like "Open to living room?" or "Add pantry nearby?" that I can apply with one click.

### Technical Approach

#### 1. Create Suggestions Engine (`lib/editor/suggestionsEngine.ts`)

```typescript
interface Suggestion {
  id: string;
  type: 'add_room' | 'resize' | 'connect' | 'swap';
  title: string;
  description: string;
  icon: string;
  action: () => void;
  confidence: number; // 0-1, higher = more relevant
}

interface SuggestionRule {
  trigger: (room: EditorRoom, context: SuggestionContext) => boolean;
  generate: (room: EditorRoom, context: SuggestionContext) => Suggestion | null;
}

const SUGGESTION_RULES: SuggestionRule[] = [
  // Kitchen lacks pantry
  {
    trigger: (room, ctx) => 
      room.roomType === 'kitchen' && 
      !ctx.rooms.some(r => r.roomType === 'pantry'),
    generate: (room, ctx) => ({
      id: 'add-pantry',
      type: 'add_room',
      title: 'Add Pantry',
      description: 'Kitchens typically benefit from pantry storage',
      icon: 'package',
      confidence: 0.85,
      action: () => ctx.addRoomNear(room, 'pantry', 'S'),
    }),
  },
  
  // Bedroom too small
  {
    trigger: (room, ctx) => 
      room.roomType === 'bedroom' && 
      room.areaSqft < 100,
    generate: (room) => ({
      id: 'resize-bedroom',
      type: 'resize',
      title: 'Enlarge Bedroom',
      description: `This bedroom is quite small (${room.areaSqft} sqft)`,
      icon: 'maximize',
      confidence: 0.7,
      action: () => { /* resize logic */ },
    }),
  },
  
  // Primary suite missing walk-in closet
  {
    trigger: (room, ctx) => 
      room.roomType === 'primary_bedroom' &&
      !ctx.adjacentRooms.some(r => r.roomType === 'primary_closet'),
    generate: () => ({
      id: 'add-walkin',
      type: 'add_room',
      title: 'Add Walk-in Closet',
      description: 'Primary suites typically include a closet',
      icon: 'shirt',
      confidence: 0.9,
      action: () => { /* add closet adjacent */ },
    }),
  },
];
```

#### 2. Suggestions Panel Component (`components/editor/SuggestionsPanel.tsx`)
- Appears below/beside the RoomPropertiesPanel when room selected
- Animated entry with `framer-motion`
- Max 3 suggestions shown (sorted by confidence)
- Each suggestion is a clickable card with icon + description

#### UI Mockup
```
┌─────────────────────────────────────┐
│ 💡 Suggestions for Kitchen          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 📦 Add Pantry                   │ │
│ │ Kitchens benefit from storage   │ │
│ │                        [Apply]  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🚪 Open to Living Room          │ │
│ │ Create open-concept flow        │ │
│ │                        [Apply]  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Files to Create/Modify
- [ ] `lib/editor/suggestionsEngine.ts` (NEW)
- [ ] `components/editor/SuggestionsPanel.tsx` (NEW)
- [ ] `components/editor/SuggestionCard.tsx` (NEW)
- [ ] `components/editor/FloorPlanEditor.tsx` (integrate panel)
- [ ] `hooks/useFloorPlanEditor.ts` (add suggestion state)

### Acceptance Criteria
- [ ] Selecting a room shows relevant suggestions
- [ ] Clicking "Apply" executes the action
- [ ] Suggestions update when layout changes
- [ ] At least 8-10 suggestion rules implemented
- [ ] Smooth animations on panel show/hide

---

## PR #2: Magnetic Snapping Visual Feedback

**Priority:** P0  
**Effort:** ~2-3 hours  
**Status:** 🔲 To Do

### Goal
Make the existing spring-network system **visible and satisfying** to use.

### User Story
> As a user, when I drag a room near another room, I see alignment guides and feel the room "snap" into place with visual feedback.

### Technical Approach

> **Note:** Backend already exists in `editorUtils.ts` via `applySpringNetwork()`. This PR adds the visual layer.

#### 1. Snap Guides Component (`components/editor/SnapGuides.tsx`)

```typescript
interface SnapGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
  strength: 'strong' | 'weak';
}

function SnapGuides({ guides, viewport }: Props) {
  return (
    <g className="snap-guides">
      {guides.map((guide, i) => (
        <line
          key={i}
          x1={guide.type === 'vertical' ? guide.position : guide.start}
          y1={guide.type === 'horizontal' ? guide.position : guide.start}
          x2={guide.type === 'vertical' ? guide.position : guide.end}
          y2={guide.type === 'horizontal' ? guide.position : guide.end}
          stroke={guide.strength === 'strong' ? '#f97316' : '#fdba74'}
          strokeWidth={guide.strength === 'strong' ? 2 : 1}
          strokeDasharray={guide.strength === 'strong' ? 'none' : '4,4'}
        />
      ))}
    </g>
  );
}
```

#### 2. Snap Detection (`lib/editor/snapDetection.ts`)

```typescript
const SNAP_THRESHOLD = 12; // pixels

function detectSnapGuides(
  draggedRoom: EditorRoom,
  allRooms: EditorRoom[],
  threshold: number = SNAP_THRESHOLD
): SnapGuide[] {
  const guides: SnapGuide[] = [];
  const dragBounds = draggedRoom.bounds;
  
  for (const other of allRooms) {
    if (other.id === draggedRoom.id) continue;
    
    // Check edge alignments (left, right, top, bottom)
    // Add guides when edges are within threshold
  }
  
  return guides;
}
```

#### 3. Visual Enhancements
- Snap pulse animation: scale 1.0 → 1.02 → 1.0 over 150ms
- Ghost preview while dragging (opacity: 0.3)
- Subtle glow on snapped edges

### Files to Create/Modify
- [ ] `components/editor/SnapGuides.tsx` (NEW)
- [ ] `lib/editor/snapDetection.ts` (NEW)
- [ ] `components/editor/EditorCanvas.tsx` (add guides layer)
- [ ] `components/editor/RoomPolygon.tsx` (add snap animation)
- [ ] `app/globals.css` (snap pulse keyframes)

### Acceptance Criteria
- [ ] Alignment guides appear when dragging near other rooms
- [ ] Strong guides (close) vs weak guides (approaching)
- [ ] Visual pulse when snap occurs
- [ ] Guides disappear when drag ends
- [ ] Performance stays smooth (<16ms frame time)

---

## PR #3: Design Themes (Quick Presets)

**Priority:** P1  
**Effort:** ~1-2 hours  
**Status:** 🔲 To Do

### Goal
Let users apply aesthetic presets that influence how floor plans are staged/rendered.

### User Story
> As a user, I can select "Modern Farmhouse" theme, and my staged renders reflect that aesthetic.

### Technical Approach

#### Theme Definitions (`lib/themes.ts`)

```typescript
interface DesignTheme {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  promptModifiers: {
    materials: string;
    furniture: string;
    lighting: string;
    colors: string;
  };
  uiAccent: string;
}

export const DESIGN_THEMES: DesignTheme[] = [
  {
    id: 'modern-farmhouse',
    name: 'Modern Farmhouse',
    description: 'Warm wood tones, shiplap details, cozy textiles',
    thumbnail: '/themes/modern-farmhouse.jpg',
    promptModifiers: {
      materials: 'light oak hardwood floors, white shiplap walls',
      furniture: 'farmhouse style furniture, natural wood tables',
      lighting: 'warm natural light, pendant fixtures',
      colors: 'cream, sage green, warm white',
    },
    uiAccent: '#8B7355',
  },
  {
    id: 'mid-century',
    name: 'Mid-Century Modern',
    description: 'Clean lines, organic curves, retro palette',
    promptModifiers: {
      materials: 'walnut floors, teak furniture',
      furniture: 'mid-century modern, Eames-style chairs',
      lighting: 'warm ambient, sputnik chandeliers',
      colors: 'mustard, teal, burnt orange accents',
    },
    uiAccent: '#C67B47',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean, uncluttered, monochromatic',
    promptModifiers: {
      materials: 'polished concrete, white oak',
      furniture: 'minimal modern furniture, low-profile',
      lighting: 'bright natural light, recessed fixtures',
      colors: 'white, gray, black accents',
    },
    uiAccent: '#6B7280',
  },
  {
    id: 'coastal',
    name: 'Coastal',
    description: 'Light, airy, beach-inspired',
    promptModifiers: {
      materials: 'whitewashed wood floors, natural fiber rugs',
      furniture: 'wicker, rattan, linen upholstery',
      lighting: 'bright coastal light, natural textures',
      colors: 'white, sand, ocean blue accents',
    },
    uiAccent: '#0891B2',
  },
];
```

### Files to Create/Modify
- [ ] `lib/themes.ts` (NEW)
- [ ] `components/editor/ThemeSelector.tsx` (NEW)
- [ ] `components/drafted/DraftedGenerationForm.tsx` (add theme picker)
- [ ] Backend: Modify prompt construction to include theme modifiers

### Acceptance Criteria
- [ ] 4-5 themes available at launch
- [ ] Theme selection persists across generations
- [ ] Theme influences Gemini staging output
- [ ] Visual indicator of selected theme

---

## PR #4: Favorites & Collections

**Priority:** P1  
**Effort:** ~3-4 hours  
**Status:** 🔲 To Do

### Goal
Let users save floor plans and organize them into collections for later reference.

### User Story
> As a user, I can heart a floor plan to save it, and create collections like "Beach House Ideas" to organize my saved plans.

### Technical Approach

#### Data Model (`lib/favorites.ts`)

```typescript
interface SavedPlan {
  id: string;
  plan: DraftedPlan;
  savedAt: number;
  collectionIds: string[];
  notes?: string;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  planIds: string[];
  coverPlanId?: string;
}

// localStorage keys
const FAVORITES_KEY = 'drafted_favorites';
const COLLECTIONS_KEY = 'drafted_collections';
```

#### Favorites Context (`contexts/FavoritesContext.tsx`)

```typescript
interface FavoritesContextValue {
  favorites: SavedPlan[];
  collections: Collection[];
  isFavorite: (planId: string) => boolean;
  toggleFavorite: (plan: DraftedPlan) => void;
  addToCollection: (planId: string, collectionId: string) => void;
  createCollection: (name: string) => Collection;
  deleteCollection: (id: string) => void;
}
```

### Files to Create/Modify
- [ ] `lib/favorites.ts` (NEW)
- [ ] `contexts/FavoritesContext.tsx` (NEW)
- [ ] `components/favorites/FavoriteButton.tsx` (NEW)
- [ ] `components/favorites/FavoritesDrawer.tsx` (NEW)
- [ ] `components/favorites/CollectionGrid.tsx` (NEW)
- [ ] `components/drafted/SVGFloorPlanCard.tsx` (add heart button)
- [ ] `app/layout.tsx` (add FavoritesProvider)

### Acceptance Criteria
- [ ] Heart button on every plan card
- [ ] Favorites persist across sessions (localStorage)
- [ ] Can create/rename/delete collections
- [ ] Can add plan to multiple collections
- [ ] "Favorites" accessible from header

---

## PR #5: Gamification (Design Score + Achievements)

**Priority:** P2  
**Effort:** ~3-4 hours  
**Status:** 🔲 To Do

### Goal
Add light gamification to make editing feel rewarding and encourage exploration.

### User Story
> As a user, I see a "Design Score" that improves as I optimize my layout, and I unlock achievements for milestones.

### Technical Approach

#### Scoring Engine (`lib/editor/scoringEngine.ts`)

```typescript
interface DesignScore {
  total: number; // 0-100
  breakdown: {
    efficiency: number;    // Livable space vs circulation
    flow: number;          // Room connectivity quality  
    proportions: number;   // Room size appropriateness
    completeness: number;  // Has expected rooms
  };
  tips: string[];
}

function calculateDesignScore(rooms: EditorRoom[]): DesignScore {
  // Efficiency: Total room area / bounding box area
  // Flow: Connected rooms that should be connected
  // Proportions: Rooms within typical size ranges
  // Completeness: Has bathroom, bedroom, kitchen, etc.
}
```

#### Achievements (`lib/achievements.ts`)

```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: UserStats) => boolean;
  unlockedAt?: number;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-plan',
    name: 'Architect in Training',
    description: 'Generate your first floor plan',
    icon: '🏠',
    condition: (stats) => stats.plansGenerated >= 1,
  },
  {
    id: 'perfect-score',
    name: 'Perfectionist',
    description: 'Achieve a 100 Design Score',
    icon: '⭐',
    condition: (stats) => stats.maxScore >= 100,
  },
  {
    id: 'open-concept',
    name: 'Open Concept Master',
    description: 'Create a plan where kitchen, dining, and living connect',
    icon: '🚪',
    condition: (stats) => stats.openConceptPlans >= 1,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Generate 10 plans in one session',
    icon: '⚡',
    condition: (stats) => stats.sessionPlans >= 10,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Save 25 plans to favorites',
    icon: '💎',
    condition: (stats) => stats.totalFavorites >= 25,
  },
];
```

### Files to Create/Modify
- [ ] `lib/editor/scoringEngine.ts` (NEW)
- [ ] `lib/achievements.ts` (NEW)
- [ ] `contexts/GamificationContext.tsx` (NEW)
- [ ] `components/gamification/DesignScoreWidget.tsx` (NEW)
- [ ] `components/gamification/AchievementToast.tsx` (NEW)
- [ ] `components/gamification/AchievementsPanel.tsx` (NEW)

### Acceptance Criteria
- [ ] Design Score visible during editing
- [ ] Score updates in real-time as layout changes
- [ ] At least 8 achievements defined
- [ ] Achievement unlock shows celebratory animation
- [ ] Achievements persist in localStorage

---

## Notes & Decisions

### Why Room Flow Was Deprioritized
- Educational feature, not actionable
- Most users aren't architects
- High effort, lower engagement payoff
- Save for "Pro/Expert mode" later

### Key Technical Insight
The magnetic snapping backend already exists in `editorUtils.ts` via `applySpringNetwork()`. PR #2 only needs to add visual feedback on top of this existing infrastructure.

### Aesthetic Direction
- Canvas: Soft blueprint-style grid
- Selection states: Coral glow with soft shadows
- Animations: Spring physics (framer-motion)
- Typography: Serif headings, mono for measurements
- Micro-interactions: Room polygons "breathe" on hover

---

*Last Updated: January 14, 2026*

