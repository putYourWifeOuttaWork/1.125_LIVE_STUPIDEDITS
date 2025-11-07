# GRMTek Sporeless Pilot Program - Development Context

**Last Updated:** 2025-11-07
**Version:** 0.1.0
**Status:** Production

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Critical Development Rules](#critical-development-rules)
3. [Architecture](#architecture)
4. [Data Models & Database](#data-models--database)
5. [Application Flow](#application-flow)
6. [UI/UX Guidelines](#uiux-guidelines)
7. [Key Features & Business Logic](#key-features--business-logic)
8. [Code Organization & Patterns](#code-organization--patterns)
9. [Session Management System](#session-management-system)
10. [Offline-First Architecture](#offline-first-architecture)
11. [Split Petri Image Processing](#split-petri-image-processing)
12. [Edge Functions](#edge-functions)
13. [State Management](#state-management)
14. [Testing & Quality](#testing--quality)
15. [Deployment & CI/CD](#deployment--cicd)
16. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
17. [Decision Log](#decision-log)

---

## Project Overview

### Purpose
A production-ready field operations platform for capturing, analyzing, and managing petri dish and gasifier observations in agricultural/horticultural settings. Designed for field workers collecting data in variable connectivity environments.

### Core Value Proposition
- **Offline-First**: Full functionality even without internet connection
- **Data Integrity**: Multiple validation layers ensure no data loss
- **Field-Optimized**: Interface designed for rapid data entry with minimal friction
- **Analytics-Ready**: Data architecture optimized for deep reporting and insights

### Target Users
- **Field Workers**: Primary data collectors (often in remote locations)
- **Site Admins**: Oversee specific site operations
- **Program Admins**: Manage entire pilot programs
- **Company Admins**: Oversee multiple programs across organization

### Tech Stack
- **Frontend**: React 18.2, TypeScript 5.4, Vite 5.1
- **Styling**: Tailwind CSS 3.4
- **State Management**: Zustand 4.5, React Query (TanStack) 5.80
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Offline Storage**: IndexedDB (via `idb` 8.0)
- **Forms**: Formik 2.4, Yup 1.4
- **Data Visualization**: Chart.js 4.4 (planned migration to D3)
- **Icons**: Lucide React 0.344
- **Date Handling**: date-fns 3.6

---

## Critical Development Rules

### 🚨 PROTECTED CODE AREAS

#### SubmissionEditPage.tsx
**Location:** `src/pages/SubmissionEditPage.tsx`

**Rule:** NEVER modify this file without explicit discussion with the user first.

**Why:** This is the core data entry page used in production. Any changes could disrupt active field operations. The page handles complex state management, offline sync, split image processing, and session lifecycle management.

**Process:**
1. Discuss proposed changes with user
2. Get explicit approval
3. Document the change reason
4. Implement with comprehensive testing

### 🎨 Design Guidelines

#### Color Restrictions
- **NEVER use purple, indigo, or violet hues** unless explicitly requested
- Use neutral tones, blues, greens, or professional colors suited to the application's purpose
- Current color scheme emphasizes professional, agricultural aesthetic

#### Design Philosophy
- Beautiful but PRECISE - every pixel matters
- Keep UI/UX beautiful but DON'T change anything without concrete discussion
- Field-user confidence is paramount - UI should be crystal clear about next actions
- Progressive disclosure for complex features
- Consistent 8px spacing system
- Sufficient contrast ratios (WCAG AA minimum)

### 📝 Code Modification Rules

1. **ALWAYS prefer editing existing files** - Never create new files unless absolutely necessary
2. **Complete the entire job** - Double check for syntax errors, type errors, missing imports
3. **No half-measures** - If fixing something, fix it completely
4. **Data integrity first** - Always prioritize data safety over feature velocity
5. **Consultative approach** - Ask questions when requirements are unclear

### 🗄️ Database Rules

1. **Data safety is the highest priority** - Users must NEVER lose data
2. **NEVER use destructive operations** without multiple safeguards (DROP, DELETE on data tables)
3. **ALWAYS enable RLS** for every new table
4. **RLS must be restrictive** - Start locked down, then add minimum necessary policies
5. **Migration format is non-negotiable** - Must include detailed markdown summary
6. **Use `maybeSingle()` not `single()`** for queries that might return 0 or 1 row

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Pages & Components                        │ │
│  │  - Authentication  - Programs  - Sites  - Submissions  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              State Management Layer                    │ │
│  │  - Zustand Stores  - React Query  - Session Store     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Business Logic Layer                      │ │
│  │  - Hooks  - Utils  - API Clients  - Session Manager   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Offline Storage Layer                     │ │
│  │  - IndexedDB  - Sync Manager  - Offline Storage       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL Database (with RLS)                        │ │
│  │  - pilot_programs  - sites  - submissions              │ │
│  │  - petri_observations  - gasifier_observations         │ │
│  │  - submission_sessions  - users  - companies           │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Storage (Images)                                      │ │
│  │  - observations/{site_id}/{observation_id}.jpg         │ │
│  │  - split-archives/{session_id}/{image_id}.jpg          │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Edge Functions                                        │ │
│  │  - auto_create_daily_sessions                          │ │
│  │  - process_split_petris                                │ │
│  │  - trigger_split_processing                            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Auth                                                  │ │
│  │  - Email/Password  - RLS Policies  - User Metadata    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│              External Services (Future)                      │
│  - Python Image Splitting Service                           │
│  - Weather API (OpenWeatherMap integration planned)         │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
/project
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Shared components (Button, Card, Modal, etc.)
│   │   ├── companies/       # Company management components
│   │   ├── dashboard/       # Dashboard/analytics components
│   │   ├── forms/           # Form components
│   │   ├── layouts/         # Layout components (AppLayout)
│   │   ├── pilotPrograms/   # Pilot program components
│   │   ├── profile/         # User profile components
│   │   ├── routing/         # Routing components (ProtectedRoute)
│   │   ├── sites/           # Site management components
│   │   ├── submissions/     # Submission/observation components
│   │   └── users/           # User management components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Core libraries and utilities
│   │   ├── api.ts           # API client functions
│   │   ├── constants.ts     # Application constants
│   │   ├── errors.ts        # Error definitions
│   │   ├── queryClient.ts   # React Query configuration
│   │   ├── sessionManager.ts # Session lifecycle management
│   │   ├── supabaseClient.ts # Supabase client setup
│   │   └── types.ts         # TypeScript type definitions
│   ├── pages/               # Page components (routable)
│   ├── stores/              # Zustand state stores
│   │   ├── authStore.ts     # Authentication state
│   │   ├── pilotProgramStore.ts # Program selection state
│   │   └── sessionStore.ts  # Active sessions state
│   ├── types/               # Additional TypeScript types
│   ├── utils/               # Utility functions
│   │   ├── helpers.ts       # General helper functions
│   │   ├── logger.ts        # Logging utility
│   │   ├── offlineStorage.ts # IndexedDB operations
│   │   ├── submissionUtils.ts # Submission-specific utilities
│   │   └── syncManager.ts   # Offline sync orchestration
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── supabase/
│   ├── functions/           # Edge Functions
│   └── migrations/          # Database migrations (timestamped)
├── public/                  # Static assets
└── [config files]           # Various configuration files
```

### Component Architecture Principles

1. **Single Responsibility**: Each component has one clear purpose
2. **Composition over Inheritance**: Build complex UIs from simple components
3. **Separation of Concerns**:
   - Presentation components (dumb/stateless)
   - Container components (smart/stateful)
   - Page components (route-level)
4. **File Size Management**: Keep files under 300 lines where possible
5. **Type Safety**: Full TypeScript coverage, no `any` types in new code

---

## Data Models & Database

### Core Tables

#### pilot_programs
Primary entity representing a research pilot program.

**Key Fields:**
- `program_id` (uuid, PK)
- `name` (text) - Program name
- `company_id` (uuid, FK) - Owning company
- `description` (text)
- `start_date` (date)
- `end_date` (date)
- `is_active` (boolean)
- `phases` (jsonb) - Array of phase definitions
- `created_by` (uuid, FK)

**Phases Structure:**
```typescript
{
  phase_number: number;
  phase_type: 'control' | 'experimental';
  label: string;
  start_date: string;
  end_date: string;
  notes?: string;
}
```

#### sites
Physical locations where observations are conducted.

**Key Fields:**
- `site_id` (uuid, PK)
- `program_id` (uuid, FK)
- `name` (text)
- `description` (text)
- `location` (text)
- `site_type` ('Petri' | 'Gasifier' | 'Both')
- `is_active` (boolean)
- `petri_defaults` (jsonb[]) - Template defaults for petri observations
- `gasifier_defaults` (jsonb[]) - Template defaults for gasifier observations
- `submission_defaults` (jsonb) - Default submission values
- Site properties: square_footage, cubic_footage, ventilation details, etc.

**Template Defaults:**
Stored as JSONB arrays, pre-populate observation forms to ensure consistency.

#### submissions
Parent record for a set of observations (petri + gasifier) at a specific point in time.

**Key Fields:**
- `submission_id` (uuid, PK)
- `site_id` (uuid, FK)
- `program_id` (uuid, FK)
- `global_submission_id` (integer, auto-increment) - User-friendly ID
- `created_at` (timestamptz)
- `created_by` (uuid, FK)
- `temperature` (numeric) - Outdoor temp
- `humidity` (numeric) - Outdoor humidity
- `indoor_temperature` (numeric)
- `indoor_humidity_new` (numeric)
- `airflow` ('Open' | 'Closed')
- `odor_distance` (text)
- `weather` ('Clear' | 'Cloudy' | 'Rain')
- `notes` (text)

#### petri_observations
Individual petri dish observations.

**Key Fields:**
- `observation_id` (uuid, PK)
- `submission_id` (uuid, FK)
- `petri_code` (text) - User-defined identifier
- `image_url` (text) - Path to image in Supabase Storage
- `plant_type` (text) - Type of produce/plant
- `fungicide_used` ('Yes' | 'No')
- `surrounding_water_schedule` (text)
- `placement` (DirectionalPlacement)
- `placement_dynamics` (PetriPlacementDynamics)
- `notes` (text)
- `order_index` (integer) - Display order
- `outdoor_temperature` (numeric)
- `outdoor_humidity` (numeric)

**Split Image Fields:**
- `is_image_split` (boolean) - True if part of split image workflow
- `is_split_source` (boolean) - True if this is the main record that receives the original image
- `split_processed` (boolean) - True if splitting has been completed
- `main_petri_id` (uuid) - FK to the main/source record (for child records)
- `phase_observation_settings` (jsonb) - Metadata about split pairing

#### gasifier_observations
Individual gasifier observations.

**Key Fields:**
- `observation_id` (uuid, PK)
- `submission_id` (uuid, FK)
- `gasifier_code` (text)
- `image_url` (text)
- `chemical_type` (ChemicalType)
- `measure` (text) - Measurement value
- `anomaly` (text) - Any unusual observations
- `placement_height` ('High' | 'Medium' | 'Low')
- `directional_placement` (DirectionalPlacement)
- `placement_strategy` (PlacementStrategy)
- `notes` (text)
- `order_index` (integer)
- `footage_from_origin_x` (numeric) - X coordinate for mapping
- `footage_from_origin_y` (numeric) - Y coordinate for mapping
- `outdoor_temperature` (numeric)
- `outdoor_humidity` (numeric)

#### submission_sessions
Tracks the lifecycle of a submission from creation to completion.

**Key Fields:**
- `session_id` (uuid, PK)
- `submission_id` (uuid, FK, unique)
- `site_id` (uuid, FK)
- `program_id` (uuid, FK)
- `opened_by_user_id` (uuid, FK) - User who created/claimed session
- `session_status` (SessionStatus)
- `session_start_time` (timestamptz)
- `last_activity_time` (timestamptz)
- `expected_petri_count` (integer)
- `expected_gasifier_count` (integer)
- `completed_petri_count` (integer)
- `completed_gasifier_count` (integer)
- `percentage_complete` (numeric, computed)
- `shared_with_user_ids` (uuid[]) - Users who have access to this session
- `is_unclaimed` (boolean) - True if session was created by auto-process and needs claiming

**Session Status Values:**
- `In-Progress` - Actively being worked on
- `Completed` - All observations complete, session finalized
- `Cancelled` - Session was cancelled, associated submission deleted
- `Expired` - Past midnight deadline but left in progress
- `Expired-Complete` - Expired but was 100% complete
- `Expired-Incomplete` - Expired and incomplete

**Session Rules:**
- Sessions MUST be completed by 11:59:59 PM on the day they were started
- After expiration, sessions become read-only
- Only one active session per submission
- Sessions can be shared with multiple users for collaboration

#### users
Extended user information (supplements Supabase auth.users).

**Key Fields:**
- `id` (uuid, PK, matches auth.users.id)
- `email` (text)
- `full_name` (text)
- `company_id` (uuid, FK)
- `is_active` (boolean) - Can user log in?
- `is_company_admin` (boolean)
- `created_at` (timestamptz)

#### companies
Organizations that own pilot programs.

**Key Fields:**
- `company_id` (uuid, PK)
- `name` (text)
- `description` (text)
- `is_active` (boolean)
- `created_at` (timestamptz)

#### program_access
Junction table defining user permissions for programs.

**Key Fields:**
- `access_id` (uuid, PK)
- `user_id` (uuid, FK)
- `program_id` (uuid, FK)
- `access_level` ('Admin' | 'Edit' | 'Respond' | 'ReadOnly')

**Access Levels:**
- `Admin` - Full control, can manage users, modify program structure
- `Edit` - Can create and edit submissions, manage sites
- `Respond` - Can only view and comment
- `ReadOnly` - Can only view data

#### pilot_program_history_staging
Audit log for all changes to programs, sites, and submissions.

**Key Fields:**
- `history_id` (uuid, PK)
- `program_id` (uuid, FK)
- `site_id` (uuid, FK, optional)
- `submission_id` (uuid, FK, optional)
- `update_type` (HistoryEventType)
- `changed_by_user_id` (uuid, FK)
- `changed_at` (timestamptz)
- `before_data` (jsonb)
- `after_data` (jsonb)
- `change_description` (text)

### Row Level Security (RLS)

Every table has RLS enabled. General pattern:

**SELECT Policies:**
```sql
-- Users can view data for programs they have access to
CREATE POLICY "Users can view accessible programs"
ON pilot_programs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM program_access
    WHERE program_access.program_id = pilot_programs.program_id
    AND program_access.user_id = auth.uid()
  )
);
```

**INSERT Policies:**
```sql
-- Users with Edit or Admin access can create records
CREATE POLICY "Users can create submissions"
ON submissions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM program_access
    WHERE program_access.program_id = submissions.program_id
    AND program_access.user_id = auth.uid()
    AND program_access.access_level IN ('Admin', 'Edit')
  )
);
```

**UPDATE Policies:**
```sql
-- Users can update their own submissions or shared sessions
CREATE POLICY "Users can update submissions"
ON submissions FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE submission_sessions.submission_id = submissions.submission_id
    AND auth.uid() = ANY(submission_sessions.shared_with_user_ids)
  )
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE submission_sessions.submission_id = submissions.submission_id
    AND auth.uid() = ANY(submission_sessions.shared_with_user_ids)
  )
);
```

**DELETE Policies:**
```sql
-- Only admins can delete
CREATE POLICY "Admins can delete programs"
ON pilot_programs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM program_access
    WHERE program_access.program_id = pilot_programs.program_id
    AND program_access.user_id = auth.uid()
    AND program_access.access_level = 'Admin'
  )
);
```

### Database Functions

Key Supabase RPC functions:

- `create_submission_session` - Initializes a new submission session
- `complete_submission_session` - Finalizes a session
- `cancel_submission_session` - Cancels and cleans up a session
- `update_submission_session_activity` - Updates last activity timestamp
- `share_submission_session` - Adds users to shared_with_user_ids
- `claim_submission_session` - Claims an unclaimed session
- `get_active_sessions_with_details` - Retrieves all active sessions for user
- `get_submission_with_creator` - Fetches submission with creator details

---

## Application Flow

### Authentication Flow

```
┌─────────────┐
│ Login Page  │
└──────┬──────┘
       │
       ├─→ Email/Password → Supabase Auth
       │                          │
       │                          ↓
       │                   ┌──────────────┐
       │                   │ Auth Success │
       │                   └──────┬───────┘
       │                          │
       │                          ↓
       │                   Check user.is_active
       │                          │
       │                ┌─────────┴─────────┐
       │                │                   │
       │           is_active=true      is_active=false
       │                │                   │
       │                ↓                   ↓
       │           Home Page        Deactivated Page
       │
       └─→ Forgot Password → Email Link → Reset Password Page
```

### Data Collection Flow

```
┌──────────────────┐
│ Home Page        │
│ - View Programs  │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Programs Page    │
│ - Select Program │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Sites Page       │
│ - Select Site    │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────┐
│ Submissions Page         │
│ - View past submissions  │
│ - Create new submission  │
└────────┬─────────────────┘
         │
         ↓
┌──────────────────────────┐
│ New Submission Page      │
│ - Enter environmental    │
│   conditions             │
│ - Submit                 │
└────────┬─────────────────┘
         │
         ↓
┌──────────────────────────┐
│ Submission Edit Page     │
│ - Add petri observations │
│ - Add gasifier obs.      │
│ - Upload images          │
│ - Save progress          │
│ - Complete submission    │
└────────┬─────────────────┘
         │
         ↓
┌──────────────────────────┐
│ Back to Submissions Page │
│ - View completed sub.    │
└──────────────────────────┘
```

### Session Lifecycle

```
                    Create New Submission
                            │
                            ↓
                 ┌──────────────────────┐
                 │ Create Session       │
                 │ Status: In-Progress  │
                 │ Timer: Starts Now    │
                 └──────────┬───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ↓             ↓             ↓
         [Add Petri]   [Add Gasifier] [Save Progress]
              │             │             │
              └─────────────┼─────────────┘
                            │
                            ↓
                    Update Activity Time
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ↓             ↓             ↓
        [Share Session] [Save More] [Cancel Session]
              │             │             │
              │             │             ↓
              │             │      ┌──────────────┐
              │             │      │ Status:      │
              │             │      │ Cancelled    │
              │             │      │ (Submission  │
              │             │      │  Deleted)    │
              │             │      └──────────────┘
              │             │
              └─────────────┼─────────────┐
                            │             │
                            ↓             │
                   All Complete?          │
                            │             │
                    ┌───────┴────────┐    │
                    │                │    │
                   Yes               No   │
                    │                │    │
                    ↓                │    │
            [Complete Session]       │    │
                    │                │    │
                    ↓                │    │
          ┌──────────────────┐      │    │
          │ Status: Completed│      │    │
          └──────────────────┘      │    │
                                    │    │
                                    ↓    │
                              Check Time │
                                    │    │
                        ┌───────────┴───┐│
                        │               ││
                   Before 11:59PM   After 11:59PM
                        │               ││
                        ↓               ↓│
                  Keep Working    ┌──────────────────┐
                        │         │ Status: Expired- │
                        │         │ Complete/        │
                        │         │ Incomplete       │
                        │         └──────────────────┘
                        │
                        └──────────────┘
```

---

## UI/UX Guidelines

### Design System

#### Colors
**Primary Palette:**
- Primary: Blue tones (for CTAs, active states)
- Secondary: Complementary blues/greens
- Accent: Warm tones for highlights
- Success: Green (#10B981)
- Warning: Amber/Yellow (#F59E0B)
- Error/Danger: Red (#EF4444)
- Neutral: Gray scale (#111827 to #F9FAFB)

**NEVER:** Purple, Indigo, Violet (unless explicitly requested)

#### Typography
- **Font Family**: System font stack (San Francisco, Segoe UI, Roboto, etc.)
- **Line Height**:
  - Body text: 150%
  - Headings: 120%
- **Font Weights**: 3 maximum (Regular 400, Medium 500, Bold 700)
- **Scale**: Use consistent scale (e.g., 12px, 14px, 16px, 18px, 24px, 32px)

#### Spacing
- **System**: 8px base unit
- **Common Values**: 8px, 16px, 24px, 32px, 48px, 64px
- **Component Padding**: Typically 16px or 24px
- **Section Spacing**: 32px or 48px

#### Components

**Button Variants:**
- `primary` - Main actions (blue background)
- `secondary` - Secondary actions (outlined)
- `danger` - Destructive actions (red)
- `outline` - Alternative actions
- `ghost` - Subtle actions

**Card:**
Standard container with subtle shadow, rounded corners (8px)

**Modal:**
Centered overlay, max-width constrained, backdrop blur

**Input:**
Consistent height (40px), clear focus states, proper error styling

### Responsive Design

**Breakpoints:**
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Strategy:**
- Mobile-first approach
- Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`)
- Test on real devices
- Ensure touch targets are at least 44x44px

### Loading States

**Patterns:**
- Skeleton loaders for content (using `SkeletonLoader` component)
- Spinner for actions (button `isLoading` state)
- Full-screen loader for route transitions (`LoadingScreen`)

### Error States

**Approach:**
- Inline validation errors (form fields)
- Toast notifications for user actions (react-toastify)
- Error boundary for unexpected errors
- Clear, actionable error messages (never just "Error")

### Empty States

**Guidelines:**
- Descriptive message explaining why empty
- Clear call-to-action to populate
- Appropriate icon
- Example: "No submissions yet. Create your first submission to get started."

### Accessibility

**Requirements:**
- Semantic HTML
- ARIA labels where needed
- Keyboard navigation support
- Focus visible indicators
- Sufficient color contrast
- Screen reader friendly

---

## Key Features & Business Logic

### Pilot Programs

**Phases:**
Programs are divided into time-based phases (control vs. experimental). Each phase has:
- Start and end dates
- Phase type (control/experimental)
- Label for identification
- Optional notes

**Phase Tracking:**
- Submissions automatically tagged with current phase
- Phase progress displayed in UI
- Historical data segmented by phase for analysis

### Sites

**Templates:**
Sites define default values for observations to ensure consistency:
- **Petri Defaults**: Array of petri templates (code, placement, fungicide, etc.)
- **Gasifier Defaults**: Array of gasifier templates (code, chemical type, placement, etc.)
- **Submission Defaults**: Default environmental values

**Purpose:**
Templates streamline data entry and reduce errors. Field workers can quickly create observations that match site standards.

### Submissions

**Hierarchy:**
```
Submission (parent)
├── Environmental Data (temp, humidity, weather, airflow, odor)
├── Petri Observations (array)
│   ├── Petri 1
│   ├── Petri 2
│   └── ...
└── Gasifier Observations (array)
    ├── Gasifier 1
    ├── Gasifier 2
    └── ...
```

**Validation Rules:**
- Environmental data required before creating submission
- Each observation must have an image
- Petri code/Gasifier code must be unique within submission
- Temperature and humidity must be numeric
- All required fields must be completed before marking complete

**Global Submission ID:**
Auto-incrementing integer for user-friendly identification. Format: `#1`, `#2`, `#3`, etc.

### Observations

**Petri Dishes:**
Track fungal growth on produce samples. Key data points:
- Image of petri dish
- Plant/produce type
- Fungicide usage
- Watering schedule
- Physical placement
- Notes

**Gasifiers:**
Track chemical dispersal devices. Key data points:
- Image of gasifier
- Chemical type (Geraniol, CLO2, etc.)
- Measurement value
- Placement strategy
- Height and directional placement
- Spatial coordinates (for mapping)
- Anomalies
- Notes

### Split Petri Image Processing

**Problem Solved:**
Field workers often photograph two petri dishes in a single image for efficiency. Manual splitting is time-consuming.

**Solution:**
Automated workflow to detect, split, and assign images:

1. **Template Definition**: Site admin marks petri template as split-enabled
2. **Record Creation**: System creates:
   - 1 main/source record (receives original image)
   - 2 child records (will receive split images)
3. **Image Upload**: User uploads single image to main record
4. **Detection**: Edge function detects split-enabled images
5. **Processing**: External Python service splits image
6. **Assignment**: Split images assigned to child records
7. **Archive**: Original image archived in `split-archives` table

**Database Fields:**
- `is_image_split`: Boolean flag
- `is_split_source`: True for main record
- `main_petri_id`: FK to main record (for children)
- `split_processed`: True when splitting complete
- `phase_observation_settings`: Metadata (codes, positions, pair ID)

### User Roles & Permissions

**Company Admin:**
- Manage company users
- Create/manage all pilot programs in company
- Full access to all company data

**Program Admin:**
- Manage program users and their access levels
- Modify program structure (phases, sites)
- View all program data
- Delete submissions/observations

**Edit Access:**
- Create and edit submissions
- Manage sites within program
- Cannot manage users or program structure

**Respond Access:**
- View data
- Add comments/notes
- Cannot modify data

**ReadOnly:**
- View-only access
- Cannot modify anything

### Audit Logging

**Tracked Events:**
- Program creation/modification
- Site creation/modification
- Submission creation/modification/deletion
- User access changes
- Phase changes

**Data Captured:**
- Event type
- User who made change
- Timestamp
- Before/after data (JSONB)
- Change description

**Access:**
- Program-level audit log (all changes in program)
- Site-level audit log (all changes for specific site)
- User-level audit log (all changes by specific user)

---

## Code Organization & Patterns

### File Naming Conventions

- **Components**: PascalCase (`Button.tsx`, `SubmissionCard.tsx`)
- **Hooks**: camelCase with "use" prefix (`useUserRole.ts`, `useSubmissions.ts`)
- **Utils**: camelCase (`helpers.ts`, `logger.ts`)
- **Stores**: camelCase with "Store" suffix (`authStore.ts`, `sessionStore.ts`)
- **Types**: camelCase (`types.ts`, `session.ts`)

### Import Organization

**Order:**
1. React imports
2. Third-party libraries
3. Internal imports (hooks, components, utils)
4. Types
5. Styles (if any)

**Example:**
```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import Button from '../components/common/Button';
import { Submission, PetriObservation } from '../lib/types';
```

### Component Patterns

**Functional Components Only:**
```typescript
const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2 }) => {
  // Component logic
  return (
    <div>
      {/* JSX */}
    </div>
  );
};

export default MyComponent;
```

**Props Interface:**
```typescript
interface MyComponentProps {
  id: string;
  name: string;
  onAction?: () => void;
  isLoading?: boolean;
}
```

**Ref Forwarding (when needed):**
```typescript
const FormComponent = React.forwardRef<FormRef, FormProps>((props, ref) => {
  React.useImperativeHandle(ref, () => ({
    getData: () => { /* ... */ },
    validate: () => { /* ... */ }
  }));

  return <form>{/* ... */}</form>;
});
```

### Custom Hooks

**Pattern:**
```typescript
export const useCustomHook = (param: string) => {
  const [state, setState] = useState<StateType>(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Effect logic
  }, [param]);

  const doSomething = async () => {
    setLoading(true);
    try {
      // Async operation
      setState(newValue);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { state, loading, error, doSomething };
};
```

### State Management

**When to use what:**
- **Local State** (`useState`): Component-specific, temporary state
- **Zustand Store**: Global app state (auth, selected program/site, sessions)
- **React Query**: Server state (data fetching, caching, sync)
- **IndexedDB**: Offline data persistence

**Zustand Pattern:**
```typescript
interface StoreState {
  value: string;
  setValue: (value: string) => void;
  // More state and actions
}

export const useMyStore = create<StoreState>((set) => ({
  value: '',
  setValue: (value) => set({ value }),
}));
```

### Error Handling

**Async Function Pattern:**
```typescript
try {
  logger.debug('Starting operation', { context });
  const result = await someAsyncOperation();
  logger.debug('Operation successful', result);
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed:', error);
  toast.error('User-friendly error message');
  return { success: false, error };
}
```

**Error Boundaries:**
Top-level error boundary in App.tsx catches unhandled errors.

### Logging

**Logger Usage:**
```typescript
import { createLogger } from '../utils/logger';

const logger = createLogger('MyComponent');

// In component
logger.debug('Debug message', { context });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', errorObject);
```

**Log Levels:**
- `debug`: Detailed diagnostic information
- `info`: General informational messages
- `warn`: Warning messages for non-critical issues
- `error`: Error messages for failures

**Environment:**
- Development: All logs to console
- Production: Error and warn only (configurable)

---

## Session Management System

### Purpose
Track the complete lifecycle of a submission from creation to completion, enabling collaboration, timeout handling, and data integrity.

### Key Files
- `src/lib/sessionManager.ts` - Core session operations
- `src/stores/sessionStore.ts` - Session state management
- `src/types/session.ts` - TypeScript definitions

### Session Status Flow

```
                  New Submission
                       ↓
               ┌───────────────┐
               │  In-Progress  │ ← Default state
               └───────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ↓              ↓              ↓
  [Complete]     [Cancel]       [Expire]
        │              │              │
        ↓              ↓              ↓
┌──────────────┐ ┌──────────┐ ┌────────────────┐
│  Completed   │ │ Cancelled│ │ Expired-       │
│              │ │          │ │ Complete/      │
│              │ │          │ │ Incomplete     │
└──────────────┘ └──────────┘ └────────────────┘
   (Final)         (Final)        (Final)
```

### Session Functions

#### Creating a Session
```typescript
const response = await createSubmissionSession(
  siteId,
  programId,
  submissionData, // temp, humidity, weather, etc.
  petriTemplates, // from site defaults
  gasifierTemplates // from site defaults
);

if (response.success) {
  const { session, submission } = response;
  // Navigate to edit page
}
```

**What happens:**
1. Creates submission record
2. Creates session record
3. Creates observation records from templates
4. Returns session and submission data

#### Updating Activity
```typescript
await updateSessionActivity(sessionId);
```

**When to call:**
- Every time user saves progress
- Automatically tracks user engagement
- Updates `last_activity_time`

#### Completing a Session
```typescript
const result = await completeSubmissionSession(sessionId);

if (result.success) {
  // Session marked as Completed
  // Submission is finalized
}
```

**Validation:**
- All required observations must have images
- Environmental data must be complete

#### Cancelling a Session
```typescript
const success = await cancelSubmissionSession(sessionId);

if (success) {
  // Session marked as Cancelled
  // Submission and observations are DELETED
}
```

**Warning:** This is destructive. Confirm with user before calling.

#### Sharing a Session
```typescript
await shareSubmissionSession(
  sessionId,
  [userId1, userId2], // Array of user IDs
  'share' // or 'escalate'
);
```

**Effect:**
- Adds users to `shared_with_user_ids` array
- Those users can now edit the submission
- Audit log entry created

#### Claiming an Unclaimed Session
```typescript
const result = await claimSubmissionSession(sessionId);

if (result.success) {
  // Session now owned by current user
  // is_unclaimed set to false
}
```

**Use case:** Auto-created sessions (e.g., daily automation) need to be claimed by a user before editing.

### Session Expiration

**Rule:** Sessions expire at 11:59:59 PM on the day they were created.

**Checking Expiration:**
```typescript
import { isSessionExpired, calculateSessionExpiration } from '../lib/sessionManager';

if (isSessionExpired(session.session_start_time)) {
  // Session is expired
  // Show warning, prevent edits
}

const expirationTime = calculateSessionExpiration(session.session_start_time);
// Returns Date object: today at 11:59:59 PM
```

**Automatic Handling:**
- `updateSessionActivity` checks for expiration before updating
- `getSubmissionWithSession` updates status if expired
- UI shows warning 1 hour before expiration
- Expired sessions become read-only

### Active Sessions

**Fetching:**
```typescript
const sessions = await getActiveSessions();
// Returns array of ActiveSession objects
```

**Display:**
- ActiveSessionsDrawer component shows list
- Badge in app header shows count
- Click to navigate to session

**Filtering:**
- Only sessions user has access to (created by user OR shared with user)
- Excludes Cancelled, Expired sessions
- Shows In-Progress sessions

---

## Offline-First Architecture

### Philosophy
Field workers often have limited or no connectivity. The app MUST work offline and sync seamlessly when connection returns.

### Key Files
- `src/utils/offlineStorage.ts` - IndexedDB operations
- `src/utils/syncManager.ts` - Sync orchestration
- `src/hooks/useOnlineStatus.ts` - Network detection
- `src/hooks/useOfflineSession.ts` - Offline session management

### Storage Strategy

**IndexedDB Structure:**
```
Database: sporeless-offline-storage
├── Store: submissions (keyPath: submissionId)
├── Store: petriObservations (keyPath: observationId)
├── Store: gasifierObservations (keyPath: observationId)
├── Store: tempImages (keyPath: imageKey)
└── Store: syncQueue (keyPath: queueId)
```

### Offline Workflow

**Saving Data Offline:**
```typescript
import offlineStorage from '../utils/offlineStorage';

// Save submission
await offlineStorage.saveSubmissionOffline(
  submission,
  petriObservations,
  gasifierObservations
);

// Save temporary image
const imageKey = `${sessionId}_${observationId}`;
await offlineStorage.saveTempImage(imageKey, imageFile);
```

**Syncing When Online:**
```typescript
import syncManager from '../utils/syncManager';

// Check for pending submissions
const count = await syncManager.getPendingSubmissionsCount();

// Sync pending submissions
const result = await syncManager.syncPendingSubmissions();
if (result.success) {
  console.log(`Synced ${result.syncedCount} submissions`);
  console.log(`${result.pendingCount} still pending`);
}
```

**Auto-Sync:**
```typescript
// Setup auto-sync (in App.tsx)
useEffect(() => {
  const cleanup = syncManager.setupAutoSync();
  return cleanup;
}, [user]);
```

**Auto-sync triggers:**
- App comes back online (network state change)
- App visibility change (user returns to tab)
- Every 5 minutes (if online and pending submissions exist)

### Network Detection

**Hook:**
```typescript
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const MyComponent = () => {
  const isOnline = useOnlineStatus();

  return (
    <div>
      {!isOnline && <div className="offline-banner">You are offline</div>}
      {/* ... */}
    </div>
  );
};
```

**Indicators:**
- NetworkStatusIndicator component (fixed position, shows connection state)
- Toast notifications on state changes
- Disabled sync-dependent features when offline

### Image Handling

**Temporary Storage:**
When offline, images stored in IndexedDB:
```typescript
const imageKey = `${sessionId}_${observationId}`;
await offlineStorage.saveTempImage(imageKey, file);
```

**Sync:**
When online, images uploaded to Supabase Storage:
```typescript
// In sync process
const { data, error } = await supabase.storage
  .from('observations')
  .upload(path, file);
```

**Cleanup:**
After successful upload, temp image removed from IndexedDB.

### Edge Cases

**Conflict Resolution:**
Currently last-write-wins. Future: Implement conflict detection and user resolution.

**Partial Sync Failures:**
If some observations sync but others fail, those that failed remain in queue for retry.

**Stale Data:**
After extended offline period, app prompts user to refresh on reconnection.

---

## Split Petri Image Processing

### Overview
Automates the splitting of dual-petri images into individual observation records, improving field workflow efficiency.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    User Uploads Image                       │
│               (Single image, 2 petri dishes)                │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────┐
│             Main Petri Record                               │
│   - is_image_split: true                                    │
│   - is_split_source: true                                   │
│   - image_url: /observations/site_id/main_obs_id.jpg       │
│   - phase_observation_settings: { split_pair_id, codes }   │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────┐
│      Edge Function: trigger_split_processing                │
│   - Detects new images on split-enabled records            │
│   - Triggers process_split_petris function                 │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────┐
│      Edge Function: process_split_petris                    │
│   1. Downloads original image from Storage                  │
│   2. Sends to Python splitting service                      │
│   3. Receives 2 split images                                │
│   4. Uploads split images to Storage                        │
│   5. Updates child records with new image URLs             │
│   6. Archives original image                                │
│   7. Marks main record as split_processed: true            │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────┐
│               Child Records Updated                         │
│   Left Record:                                              │
│   - main_petri_id: main_obs_id                             │
│   - image_url: /observations/site_id/left_obs_id.jpg      │
│   Right Record:                                             │
│   - main_petri_id: main_obs_id                             │
│   - image_url: /observations/site_id/right_obs_id.jpg     │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────┐
│           Original Image Archived                           │
│   - Moved to split_archives table                          │
│   - Includes metadata: split_pair_id, session_id, etc.     │
└────────────────────────────────────────────────────────────┘
```

### Configuration

**Template Setup:**
```typescript
// In site petri_defaults
{
  petri_code: "P1",
  is_split_image_template: true,
  split_codes: ["P1_Left", "P1_Right"],
  // ... other defaults
}
```

**Record Creation:**
When submission session created from template:
- Main record: `petri_code: "P1"`, `is_split_source: true`
- Left record: `petri_code: "P1_Left"`, `main_petri_id: main_record_id`
- Right record: `petri_code: "P1_Right"`, `main_petri_id: main_record_id`

### UI Handling

**Filtering:**
```typescript
// In SubmissionEditPage.tsx
const filterPetriObservations = (observations) => {
  return observations.filter(obs =>
    !obs.is_image_split ||
    (obs.is_image_split && obs.is_split_source) ||
    (obs.is_image_split && !obs.main_petri_id)
  );
};
```

**Display:**
- Only show main record in UI
- Child records hidden from user
- After processing, child records get their own images

### Edge Functions

**trigger_split_processing.ts:**
- Triggered on INSERT/UPDATE to petri_observations
- Checks if record has is_split_source=true and image_url
- Calls process_split_petris function

**process_split_petris.ts:**
- Downloads original image
- Calls Python service at configured endpoint
- Handles split image upload
- Updates database records
- Archives original image
- Error handling and logging

### Database Tables

**split_petri_images_archive:**
```sql
CREATE TABLE split_petri_images_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_image_url text NOT NULL,
  main_petri_observation_id uuid NOT NULL,
  split_pair_id text,
  session_id text,
  archived_at timestamptz DEFAULT now(),
  processed_by_user_id uuid
);
```

### Future Enhancements
- In-browser image splitting (using Canvas API or WASM)
- ML-based petri dish detection and quality checks
- Automatic rotation/alignment correction

---

## Edge Functions

### Overview
Supabase Edge Functions run on Deno runtime at the edge, close to users.

### Deployed Functions

#### auto_create_daily_sessions
**Trigger:** Daily cron job (or manual invocation)
**Purpose:** Creates unclaimed sessions for sites that require daily data collection

**Logic:**
1. Query all active sites marked for auto-creation
2. For each site, check if session exists for today
3. If not, create new unclaimed session
4. Session status: `In-Progress`, `is_unclaimed: true`

**File:** `supabase/functions/auto_create_daily_sessions.ts`

#### trigger_split_processing
**Trigger:** Database trigger on petri_observations INSERT/UPDATE
**Purpose:** Detects when split-enabled images are uploaded and initiates processing

**Logic:**
1. Check if observation has `is_split_source: true` and `image_url`
2. Check if not already `split_processed: true`
3. Call `process_split_petris` function

**File:** `supabase/functions/trigger_split_processing.ts`

#### process_split_petris
**Trigger:** Called by trigger_split_processing or manually
**Purpose:** Downloads image, sends to Python service, uploads split images, updates records

**Logic:**
1. Fetch main petri observation record
2. Download original image from Storage
3. POST image to Python splitting service
4. Receive left and right images
5. Upload both images to Storage
6. Update child records with new image URLs
7. Archive original image
8. Mark main record as `split_processed: true`

**File:** `supabase/functions/process_split_petris.ts`

### Edge Function Guidelines

**CORS:**
ALWAYS include CORS headers in all responses:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Handle OPTIONS
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 200, headers: corsHeaders });
}

// Include in all responses
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
```

**Error Handling:**
Wrap entire function in try/catch:
```typescript
Deno.serve(async (req) => {
  try {
    // Function logic
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**Environment Variables:**
Automatically available:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

**Imports:**
Use `npm:` or `jsr:` specifiers:
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
```

---

## State Management

### Zustand Stores

#### authStore
**Purpose:** Global authentication state

**State:**
- `user: User | null` - Current authenticated user

**Actions:**
- `setUser(user)` - Update user state

**Usage:**
```typescript
const { user, setUser } = useAuthStore();
```

#### sessionStore
**Purpose:** Active submission sessions

**State:**
- `activeSessions: ActiveSession[]` - Sessions user has access to
- `currentSessionId: string | null` - Session currently being worked on
- `isLoading: boolean` - Loading state
- `error: string | null` - Error message
- `hasUnclaimedSessions: boolean` - Flag for unclaimed sessions
- `isSessionsDrawerOpen: boolean` - Drawer visibility

**Actions:**
- `setActiveSessions(sessions)` - Replace entire sessions array
- `addSession(session)` - Add new session
- `updateSession(sessionId, updates)` - Update specific session
- `removeSession(sessionId)` - Remove session from list
- `clearSessions()` - Clear all sessions (on logout)
- `setCurrentSessionId(id)` - Set current session
- `claimSession(sessionId)` - Claim an unclaimed session

**Usage:**
```typescript
const {
  activeSessions,
  currentSessionId,
  setCurrentSessionId,
  addSession
} = useSessionStore();
```

#### pilotProgramStore
**Purpose:** Selected program and site context

**State:**
- `selectedProgram: PilotProgram | null`
- `selectedSite: Site | null`

**Actions:**
- `setSelectedProgram(program)`
- `setSelectedSite(site)`
- `resetAll()` - Clear both selections

**Usage:**
```typescript
const { selectedProgram, selectedSite, setSelectedProgram } = usePilotProgramStore();
```

### React Query (TanStack Query)

**Configuration:**
File: `src/lib/queryClient.ts`

**Settings:**
- Stale time: 5 minutes
- Cache time: 10 minutes
- Retry: 3 times
- Retry delay: Exponential backoff

**Common Patterns:**

**Fetching:**
```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['programs'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('pilot_programs')
      .select('*');
    if (error) throw error;
    return data;
  }
});
```

**Mutations:**
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: async (newProgram) => {
    const { data, error } = await supabase
      .from('pilot_programs')
      .insert(newProgram)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    // Invalidate and refetch
    queryClient.invalidateQueries({ queryKey: ['programs'] });
  }
});
```

### Custom Hooks

Common patterns encapsulated in hooks:

**useUserRole:**
```typescript
const { role, canEditSubmission, canManageUsers } = useUserRole({ programId });
```

**useSubmissions:**
```typescript
const {
  submissions,
  loading,
  error,
  createSubmission,
  updateSubmission,
  deleteSubmission
} = useSubmissions(siteId);
```

**useOnlineStatus:**
```typescript
const isOnline = useOnlineStatus();
```

**useOfflineSession:**
```typescript
const {
  session,
  saveSession,
  isLoading,
  error
} = useOfflineSession({ sessionId, submissionId });
```

---

## Testing & Quality

### Current Testing Setup

**Framework:** Vitest 1.3
**Testing Library:** @testing-library/react 14.2
**Command:** `npm test`

### Test Files
- `src/App.test.tsx` - Basic App component tests

### Testing Strategy

**Unit Tests:**
- Utility functions
- Helper functions
- Custom hooks (using `renderHook`)

**Component Tests:**
- Individual component rendering
- User interactions
- Prop handling
- Error states

**Integration Tests:**
- Multi-component workflows
- API interactions (mocked)
- State management

**E2E Tests (Future):**
- Complete user workflows
- Offline scenarios
- Session lifecycle

### Quality Standards

**TypeScript:**
- Strict mode enabled
- No `any` types in new code
- All props and functions fully typed

**ESLint:**
- Configuration: `eslint.config.js`
- React hooks rules enforced
- No unused variables
- Consistent code style

**Code Review Checklist:**
- [ ] TypeScript types defined
- [ ] Error handling implemented
- [ ] Loading states handled
- [ ] Offline scenario considered
- [ ] RLS policies reviewed (for DB changes)
- [ ] Audit logging added (for sensitive changes)
- [ ] UI/UX matches design guidelines
- [ ] Responsive on all breakpoints
- [ ] Accessibility considered

---

## Deployment & CI/CD

### Build Process

**Command:** `npm run build`

**Steps:**
1. TypeScript compilation (`tsc`)
2. Vite build (bundles and optimizes)
3. Output to `dist/` directory

**Environment Variables:**
Required in `.env` file:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Deployment Platform

**Recommended:** Netlify or Vercel

**Configuration:**
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: Set in platform UI

**Redirects:**
File: `public/_redirects`
```
/* /index.html 200
```
This enables client-side routing.

### Supabase Deployment

**Migrations:**
Applied automatically by Supabase platform when pushed to connected branch.

**Edge Functions:**
Deployed via Supabase CLI or platform UI.

**Storage:**
Buckets created manually in Supabase dashboard:
- `observations` - Petri and gasifier images
- `split-archives` - Original images from split processing

### Rollback Procedures

**Frontend:**
Redeploy previous build via platform UI.

**Database:**
See `supabase/rollback-instructions.md` for detailed procedures.

**General Approach:**
1. Identify migration to rollback
2. Create new migration that reverses changes
3. Test in development environment
4. Apply to production

---

## Common Issues & Troubleshooting

### Issue: User Can't Log In
**Symptoms:** "Invalid credentials" error on login page

**Causes:**
1. User account deactivated (`is_active = false`)
2. Wrong email/password
3. Account doesn't exist

**Solution:**
- Check `users` table for `is_active` status
- Reset password if needed
- Verify email matches `auth.users` table

---

### Issue: Submission Not Saving
**Symptoms:** "Failed to save submission" toast

**Causes:**
1. Session expired
2. User lost access to program
3. RLS policy blocking write
4. Network timeout

**Solution:**
- Check session status in `submission_sessions` table
- Verify user's `program_access` record
- Review RLS policies for submissions
- Check browser console for detailed error

---

### Issue: Images Not Uploading
**Symptoms:** Image upload fails, observation marked invalid

**Causes:**
1. File too large (>10MB limit)
2. Storage bucket permissions
3. Network issue
4. Invalid file type

**Solution:**
- Compress image before upload
- Check Supabase Storage bucket policies
- Retry with stable connection
- Ensure file is JPEG, PNG, or WebP

---

### Issue: Offline Sync Failing
**Symptoms:** Pending submissions not syncing when back online

**Causes:**
1. Stale auth token
2. Conflicting data
3. IndexedDB quota exceeded
4. Network still unstable

**Solution:**
- Force logout/login to refresh token
- Clear IndexedDB and re-collect data
- Check browser storage quota
- Wait for stable connection, retry

---

### Issue: Split Images Not Processing
**Symptoms:** Main record uploaded but child records still show no image

**Causes:**
1. Edge function not triggered
2. Python service unavailable
3. Image format incompatible
4. Insufficient Storage permissions

**Solution:**
- Check Edge Function logs in Supabase dashboard
- Verify Python service endpoint is reachable
- Ensure image is high-quality JPEG
- Review Storage bucket RLS policies

---

### Issue: Session Expired Too Soon
**Symptoms:** Session marked expired before midnight

**Causes:**
1. Server timezone mismatch
2. User timezone confusion
3. Code bug in expiration check

**Solution:**
- All times stored in UTC in database
- Expiration calculated as 11:59:59 PM in session start timezone
- Review `calculateSessionExpiration` function in sessionManager.ts

---

### Issue: Duplicate Submissions Created
**Symptoms:** Multiple submissions with same timestamp for same site

**Causes:**
1. User double-clicked submit button
2. Retry logic triggered incorrectly
3. Sync conflict

**Solution:**
- Add debouncing to submit button
- Implement idempotency keys
- Improve conflict detection in sync logic

---

## Decision Log

### 2025-11-07: Context Documentation Created
**Decision:** Create comprehensive CONTEXT.md file
**Rationale:** Provide AI assistants and developers with complete project context
**Impact:** Faster onboarding, fewer breaking changes, better consistency

### [Date TBD]: Chart.js to D3 Migration
**Decision:** Plan to migrate from Chart.js to D3
**Rationale:** Need more customization for complex visualizations
**Status:** Planned, not yet implemented
**Impact:** Better analytics capabilities, more development complexity

### [Date TBD]: Split Image Processing Architecture
**Decision:** Use external Python service for image splitting
**Rationale:** Complex image processing better suited to Python ecosystem
**Alternatives Considered:** In-browser Canvas API, WASM
**Impact:** Additional infrastructure, improved processing quality

### [Date TBD]: Session Expiration at Midnight
**Decision:** Sessions must be completed by 11:59:59 PM same day
**Rationale:** Aligns with field workflow, prevents stale data
**Impact:** Users must plan their day accordingly, some urgency created

### [Date TBD]: Offline-First Architecture
**Decision:** Full offline capability via IndexedDB
**Rationale:** Field workers often in areas with poor connectivity
**Alternatives Considered:** Online-only, limited offline
**Impact:** Complex sync logic, but critical for user success

---

## Appendix: Quick Reference

### Common Commands
```bash
# Development
npm run dev          # Start dev server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm test             # Run tests
npm run lint         # Run ESLint

# Database
# (Use Supabase CLI or dashboard)
```

### Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Key Routes
```
/login                    - Authentication
/home                     - Dashboard
/programs                 - Pilot programs list
/programs/:id/sites       - Sites for program
/programs/:id/sites/:id   - Submissions for site
/programs/:id/sites/:id/submissions/:id/edit - Edit submission
/profile                  - User profile
/company                  - Company management (admins only)
```

### Important Types
```typescript
// User roles
type UserRole = 'Admin' | 'Edit' | 'Respond' | 'ReadOnly';

// Session status
type SessionStatus =
  | 'In-Progress'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'
  | 'Expired-Complete'
  | 'Expired-Incomplete';

// Site types
type SiteType = 'Petri' | 'Gasifier' | 'Both';

// Chemical types
type ChemicalType =
  | 'Geraniol'
  | 'CLO2'
  | 'Acetic Acid'
  | 'Citronella Blend'
  | 'Essential Oils Blend'
  | '1-MCP'
  | 'Other';
```

### Critical Files Checklist
- [ ] `src/pages/SubmissionEditPage.tsx` - Main data entry page (PROTECTED)
- [ ] `src/lib/sessionManager.ts` - Session lifecycle logic
- [ ] `src/utils/syncManager.ts` - Offline sync orchestration
- [ ] `src/lib/types.ts` - Core type definitions
- [ ] `src/lib/supabaseClient.ts` - Supabase connection

### Support Resources
- **Supabase Docs:** https://supabase.com/docs
- **React Query Docs:** https://tanstack.com/query/latest
- **Tailwind CSS Docs:** https://tailwindcss.com/docs
- **date-fns Docs:** https://date-fns.org/docs

---

**End of Context Document**

This document should be reviewed and updated regularly as the project evolves. All major decisions, architectural changes, and new features should be documented here.