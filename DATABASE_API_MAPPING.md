# Database Table to API Endpoint Mapping

**Last Updated:** 2025-11-07
**Version:** 1.0.0

This document provides a comprehensive mapping of all database tables to their corresponding API endpoints and usage patterns in the application.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Entity Tables](#core-entity-tables)
3. [Device/Observation Tables](#deviceobservation-tables)
4. [Session & Workflow Tables](#session--workflow-tables)
5. [Access Control Tables](#access-control-tables)
6. [Audit & Archive Tables](#audit--archive-tables)
7. [Reporting Tables](#reporting-tables)
8. [Views & Computed Tables](#views--computed-tables)
9. [RPC Functions](#rpc-functions)
10. [Usage Examples](#usage-examples)

---

## Overview

All API endpoints are centralized in `src/lib/api.ts` and use the `withRetry()` wrapper for automatic retry logic, error handling, and logging. The API layer provides a consistent interface for all database operations with built-in:

- Automatic retry with exponential backoff
- Auth error detection and handling
- Network error handling
- Performance logging
- Offline detection

---

## Core Entity Tables

### 1. pilot_programs

**Purpose:** Primary entity representing research pilot programs

**Endpoints:**
- `fetchPilotPrograms()` - Get all programs accessible to current user
- `fetchPilotProgramById(programId)` - Get single program
- `fetchPilotProgramsByCompanyId(companyId)` - Get programs for a company
- `fetchPilotProgramsWithProgress()` - Get programs with progress metrics (from view)

**Key Fields:**
- `program_id` (uuid) - Primary key
- `company_id` (uuid) - Owning company
- `name`, `description` - Program details
- `start_date`, `end_date` - Timeline
- `is_active` (boolean) - Active status
- `phases` (jsonb) - Array of program phases
- `status` (enum) - Program status

**Used In:**
- `src/pages/PilotProgramsPage.tsx`
- `src/hooks/usePilotPrograms.ts`
- `src/stores/pilotProgramStore.ts`

---

### 2. sites

**Purpose:** Physical locations where observations are conducted

**Endpoints:**
- `fetchSitesByProgramId(programId)` - Get sites for a program
- `fetchSiteById(siteId)` - Get single site

**Key Fields:**
- `site_id` (uuid) - Primary key
- `program_id` (uuid) - Parent program
- `name`, `description`, `location` - Site details
- `site_type` (enum) - 'Petri', 'Gasifier', or 'Both'
- `is_active` (boolean)
- `petri_defaults` (jsonb[]) - Template defaults for petri dishes
- `gasifier_defaults` (jsonb[]) - Template defaults for gasifiers
- `submission_defaults` (jsonb) - Environmental defaults
- `square_footage`, `cubic_footage` - Dimensions
- `has_dead_zones`, `num_regularly_opened_ports` - Airflow properties

**Used In:**
- `src/pages/SitesPage.tsx`
- `src/hooks/useSites.ts`
- `src/components/sites/*`

---

### 3. submissions

**Purpose:** Parent record for a set of observations at a specific point in time

**Endpoints:**
- `fetchSubmissionById(submissionId)` - Get single submission
- `fetchSubmissionsBySiteId(siteId)` - Get submissions for a site (via RPC)
- `fetchSubmissionsByProgramId(programId)` - Get submissions for a program

**Key Fields:**
- `submission_id` (uuid) - Primary key
- `site_id`, `program_id` (uuid) - Relationships
- `global_submission_id` (integer) - User-friendly ID
- `created_by` (uuid) - User who created
- `temperature`, `humidity` - Environmental conditions
- `indoor_temperature`, `indoor_humidity` - Indoor conditions
- `airflow` (enum) - 'Open' or 'Closed'
- `odor_distance` (enum) - Odor detection range
- `weather` (enum) - 'Clear', 'Cloudy', 'Rain'
- `notes` (text)

**Used In:**
- `src/pages/SubmissionsPage.tsx`
- `src/pages/NewSubmissionPage.tsx`
- `src/pages/SubmissionEditPage.tsx`
- `src/hooks/useSubmissions.ts`

---

### 4. companies

**Purpose:** Organizations that own pilot programs

**Endpoints:**
- `fetchCompanies()` - Get all companies
- `fetchCompanyById(companyId)` - Get single company

**Key Fields:**
- `company_id` (uuid) - Primary key
- `name`, `description` - Company details
- `is_active` (boolean)
- `created_at` (timestamptz)

**Used In:**
- `src/pages/CompanyManagementPage.tsx`
- `src/hooks/useCompanies.ts`
- `src/components/companies/*`

---

### 5. users

**Purpose:** Extended user information (supplements Supabase auth.users)

**Endpoints:**
- `fetchUserById(userId)` - Get single user profile
- `fetchUsersByCompanyId(companyId)` - Get users for a company
- `fetchUsersByProgramId(programId)` - Get users with program access

**Key Fields:**
- `id` (uuid) - Primary key (matches auth.users.id)
- `email` (text)
- `full_name` (text)
- `company_id` (uuid)
- `is_active` (boolean) - Can user log in?
- `is_company_admin` (boolean)
- `created_at` (timestamptz)

**Used In:**
- `src/pages/UserProfilePage.tsx`
- `src/hooks/useUserProfile.ts`
- `src/stores/authStore.ts`

---

## Device/Observation Tables

### 6. petri_observations

**Purpose:** Individual petri dish observations (tracks physical petri dish devices)

**Endpoints:**
- `fetchPetriObservationsBySubmissionId(submissionId)` - Get petris for a submission
- `fetchPetriObservationsBySiteId(siteId)` - Get all petri observations at a site
- `fetchPetriObservationById(observationId)` - Get single petri observation

**Key Fields:**
- `observation_id` (uuid) - Primary key
- `submission_id`, `site_id` (uuid) - Relationships
- `petri_code` (text) - User-defined identifier
- `image_url` (text) - Path to image in Supabase Storage
- `plant_type` (enum)
- `fungicide_used` (enum) - 'Yes' or 'No'
- `surrounding_water_schedule` (enum)
- `placement` (enum) - DirectionalPlacement
- `placement_dynamics` (enum) - PetriPlacementDynamics
- `notes` (text)
- `order_index` (integer) - Display order
- `outdoor_temperature`, `outdoor_humidity` (numeric)

**Split Image Fields:**
- `is_image_split` (boolean)
- `is_split_source` (boolean)
- `split_processed` (boolean)
- `main_petri_id` (uuid) - FK to main record
- `phase_observation_settings` (jsonb)

**Program Phase Fields:**
- `daysInThisProgramPhase` (numeric)
- `todays_day_of_phase` (numeric)

**Used In:**
- `src/pages/SubmissionEditPage.tsx`
- `src/components/submissions/PetriForm.tsx`
- Direct Supabase queries (no dedicated hook yet)

---

### 7. gasifier_observations

**Purpose:** Individual gasifier observations (tracks physical gasifier devices)

**Endpoints:**
- `fetchGasifierObservationsBySubmissionId(submissionId)` - Get gasifiers for a submission
- `fetchGasifierObservationsBySiteId(siteId)` - Get all gasifier observations at a site
- `fetchGasifierObservationById(observationId)` - Get single gasifier observation

**Key Fields:**
- `observation_id` (uuid) - Primary key
- `submission_id`, `site_id` (uuid) - Relationships
- `gasifier_code` (text) - User-defined identifier
- `image_url` (text)
- `chemical_type` (enum) - Type of chemical used
- `measure` (text) - Measurement value
- `anomaly` (boolean) - Unusual observations
- `placement_height` (enum) - 'High', 'Medium', 'Low'
- `directional_placement` (enum)
- `placement_strategy` (enum)
- `notes` (text)
- `order_index` (integer)
- `footage_from_origin_x`, `footage_from_origin_y` (numeric) - Spatial coordinates
- `outdoor_temperature`, `outdoor_humidity` (numeric)

**Program Phase Fields:**
- `daysInThisProgramPhase` (numeric)
- `todays_day_of_phase` (numeric)

**Used In:**
- `src/pages/SubmissionEditPage.tsx`
- `src/components/submissions/GasifierForm.tsx`
- Direct Supabase queries (no dedicated hook yet)

---

## Session & Workflow Tables

### 8. submission_sessions

**Purpose:** Tracks lifecycle of a submission from creation to completion

**Endpoints:**
- `fetchActiveSessions()` - Get active sessions for current user (via RPC)
- `fetchSessionBySubmissionId(submissionId)` - Get session for a submission

**RPC Functions (in sessionManager.ts):**
- `createSubmissionSession()` - Create new session
- `completeSubmissionSession()` - Finalize session
- `cancelSubmissionSession()` - Cancel and cleanup
- `updateSessionActivity()` - Update last activity time
- `shareSubmissionSession()` - Add users to session
- `claimSubmissionSession()` - Claim unclaimed session

**Key Fields:**
- `session_id` (uuid) - Primary key
- `submission_id` (uuid) - One-to-one with submission
- `site_id`, `program_id` (uuid)
- `opened_by_user_id` (uuid) - Creator
- `session_status` (enum) - Lifecycle status
- `session_start_time`, `last_activity_time` (timestamptz)
- `expected_petri_count`, `expected_gasifier_count` (integer)
- `completed_petri_count`, `completed_gasifier_count` (integer)
- `percentage_complete` (numeric)
- `shared_with_user_ids` (uuid[]) - Collaborators
- `is_unclaimed` (boolean)

**Session Status Values:**
- `In-Progress` - Active
- `Completed` - Finalized
- `Cancelled` - Cancelled
- `Expired` - Past deadline
- `Expired-Complete` - Expired but complete
- `Expired-Incomplete` - Expired and incomplete

**Used In:**
- `src/lib/sessionManager.ts`
- `src/stores/sessionStore.ts`
- `src/components/submissions/ActiveSessionsDrawer.tsx`

---

## Access Control Tables

### 9. program_access

**Purpose:** Junction table defining user permissions for programs

**Endpoints:**
- `fetchUserAccessForProgram(programId, userId)` - Get user's access level
- `fetchUsersByProgramId(programId)` - Get users with program access (includes users data)

**Key Fields:**
- `access_id` (uuid) - Primary key
- `user_id`, `program_id` (uuid) - Relationships
- `access_level` (enum) - Permission level

**Access Levels:**
- `Admin` - Full control
- `Edit` - Create and edit
- `Respond` - View and comment
- `ReadOnly` - View only

**Used In:**
- `src/hooks/useUserRole.ts`
- `src/components/users/ProgramUsersModal.tsx`

---

## Audit & Archive Tables

### 10. pilot_program_history_staging

**Purpose:** Audit log for all changes to programs, sites, and submissions

**Endpoints:**
- `fetchAuditLogByProgramId(programId)` - Get audit log for program
- `fetchAuditLogBySiteId(siteId)` - Get audit log for site
- `fetchAuditLogByUserId(userId)` - Get audit log for user

**Key Fields:**
- `history_id` (uuid) - Primary key
- `program_id`, `site_id`, `submission_id` (uuid) - Optional entity references
- `update_type` (enum) - Type of change
- `changed_by_user_id` (uuid)
- `changed_at` (timestamptz)
- `before_data`, `after_data` (jsonb) - Change tracking
- `change_description` (text)

**Used In:**
- `src/pages/AuditLogPage.tsx`
- `src/pages/UserAuditPage.tsx`
- `src/hooks/useAuditLog.ts`

---

### 11. split_petri_images_archive

**Purpose:** Archive of original images from split processing

**No dedicated endpoints** - Managed automatically by Edge Functions

**Key Fields:**
- `id` (uuid) - Primary key
- `original_image_url` (text)
- `main_petri_observation_id` (uuid)
- `split_pair_id` (text)
- `session_id` (text)
- `archived_at` (timestamptz)
- `processed_by_user_id` (uuid)

**Used In:**
- `supabase/functions/process_split_petris.ts`

---

## Reporting Tables

### 12. custom_reports

**Purpose:** User-defined custom report configurations

**Endpoints:**
- `fetchCustomReportsByCompanyId(companyId)` - Get reports for company
- `fetchCustomReportsByProgramId(programId)` - Get reports for program
- `getReportMetadata()` - Get available report entities/fields (via RPC)
- `executeCustomReport(config, limit, offset)` - Execute report query (via RPC)

**Key Fields:**
- `report_id` (uuid) - Primary key
- `name`, `description` (text)
- `created_by_user_id`, `company_id`, `program_id` (uuid)
- `configuration` (jsonb) - Report definition
- `created_at`, `updated_at` (timestamptz)

**RPC Functions:**
- `get_available_report_metadata()` - Returns metadata about reportable entities
- `execute_custom_report_query()` - Executes dynamic report queries

**Report Entities:**
- submissions
- petri_observations
- gasifier_observations
- sites
- pilot_programs

**Used In:**
- No UI implemented yet (future feature)

---

## Views & Computed Tables

### 13. pilot_programs_with_progress

**Purpose:** View that adds progress metrics to pilot programs

**Endpoint:**
- `fetchPilotProgramsWithProgress()` - Get programs with computed metrics

**Additional Fields (computed):**
- `days_count_this_program` (integer)
- `day_x_of_program` (integer)
- `phase_progress` (numeric)

**Used In:**
- `src/hooks/usePilotPrograms.ts`
- RPC function `create_submission_session()` uses this for phase day fields

---

## RPC Functions

These are PostgreSQL functions called via `supabase.rpc()`:

### Session Management
- `create_submission_session(programId, siteId, submissionData, gasifierTemplates, petriTemplates)`
- `complete_submission_session(sessionId)`
- `cancel_submission_session(sessionId)`
- `update_submission_session_activity(sessionId)`
- `share_submission_session(sessionId, userIds, action)`
- `claim_submission_session(sessionId)`
- `get_active_sessions_with_details()`

### Site Management
- `fetch_submissions_for_site(siteId)` - Used by `fetchSubmissionsBySiteId()`
- `update_site_template_defaults(siteId, submissionDefaults, petriDefaults, gasifierDefaults)`

### Reporting
- `get_available_report_metadata()` - Used by `getReportMetadata()`
- `execute_custom_report_query(reportConfig, limit, offset)` - Used by `executeCustomReport()`
- `get_current_program_phase_info(programId)` - Get phase information

### Utility
- `update_site_petri_count(siteId)` - Update unique petri count
- `get_submission_unique_petri_count(submissionId)` - Get unique petri count

---

## Usage Examples

### Example 1: Fetch Device Data for a Submission

```typescript
import {
  fetchPetriObservationsBySubmissionId,
  fetchGasifierObservationsBySubmissionId
} from '../lib/api';

const loadDeviceData = async (submissionId: string) => {
  // Fetch petri dish observations
  const { data: petris, error: petriError } =
    await fetchPetriObservationsBySubmissionId(submissionId);

  // Fetch gasifier observations
  const { data: gasifiers, error: gasifierError } =
    await fetchGasifierObservationsBySubmissionId(submissionId);

  if (petriError || gasifierError) {
    console.error('Error loading device data:', { petriError, gasifierError });
    return;
  }

  console.log(`Loaded ${petris?.length} petri dishes and ${gasifiers?.length} gasifiers`);
};
```

### Example 2: Fetch Site with All Device History

```typescript
import {
  fetchSiteById,
  fetchPetriObservationsBySiteId,
  fetchGasifierObservationsBySiteId
} from '../lib/api';

const loadSiteWithHistory = async (siteId: string) => {
  // Fetch site details
  const { data: site } = await fetchSiteById(siteId);

  // Fetch all petri observations at this site
  const { data: petriHistory } = await fetchPetriObservationsBySiteId(siteId);

  // Fetch all gasifier observations at this site
  const { data: gasifierHistory } = await fetchGasifierObservationsBySiteId(siteId);

  return {
    site,
    petriHistory,
    gasifierHistory,
    totalDeviceObservations: (petriHistory?.length || 0) + (gasifierHistory?.length || 0)
  };
};
```

### Example 3: Fetch User Access and Permissions

```typescript
import {
  fetchUserAccessForProgram,
  fetchUsersByProgramId
} from '../lib/api';

const checkUserPermissions = async (programId: string, userId: string) => {
  // Get specific user's access level
  const { data: access } = await fetchUserAccessForProgram(programId, userId);

  if (!access) {
    console.log('User does not have access to this program');
    return null;
  }

  console.log(`User has ${access.access_level} access`);

  // Get all users with access to the program
  const { data: allUsers } = await fetchUsersByProgramId(programId);
  console.log(`${allUsers?.length} users have access to this program`);

  return {
    userAccess: access,
    allUsers
  };
};
```

### Example 4: Fetch Audit Trail

```typescript
import { fetchAuditLogByProgramId } from '../lib/api';

const loadAuditTrail = async (programId: string) => {
  const { data: auditLog, error } = await fetchAuditLogByProgramId(programId);

  if (error) {
    console.error('Error loading audit log:', error);
    return;
  }

  // Group by event type
  const eventsByType = auditLog?.reduce((acc, entry) => {
    acc[entry.update_type] = (acc[entry.update_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Audit log summary:', eventsByType);
};
```

### Example 5: Execute Custom Report

```typescript
import { getReportMetadata, executeCustomReport } from '../lib/api';

const generateDeviceReport = async () => {
  // Get available report metadata
  const { data: metadata } = await getReportMetadata();
  console.log('Available report entities:', metadata);

  // Execute a custom report for petri observations
  const reportConfig = {
    entity: 'petri_observations',
    dimensions: ['petri_code'],
    metrics: [
      {
        function: 'AVG',
        field: 'growth_index'
      }
    ],
    filters: [
      {
        field: 'fungicide_used',
        operator: '=',
        value: 'Yes'
      }
    ]
  };

  const { data: reportResults } = await executeCustomReport(reportConfig);
  console.log('Report results:', reportResults);
};
```

---

## Summary Table

| Table | Primary Endpoint Pattern | Device Data? | RPC Functions? |
|-------|-------------------------|--------------|----------------|
| pilot_programs | `fetchPilotProgram*()` | No | No |
| sites | `fetchSite*()` | No | Yes (templates) |
| submissions | `fetchSubmission*()` | No | Yes (for site) |
| companies | `fetchCompan*()` | No | No |
| users | `fetchUser*()` | No | No |
| **petri_observations** | `fetchPetriObservation*()` | **YES** | No |
| **gasifier_observations** | `fetchGasifierObservation*()` | **YES** | No |
| submission_sessions | `fetchSession*()` | No | Yes (management) |
| program_access | `fetchUserAccess*()` | No | No |
| pilot_program_history_staging | `fetchAuditLog*()` | No | No |
| split_petri_images_archive | None | No | No (auto) |
| custom_reports | `fetch/executeCustomReport*()` | No | Yes (execute) |
| pilot_programs_with_progress | `fetchPilotProgramsWithProgress()` | No | No (view) |

---

## Next Steps for Development

1. **Create Custom Hooks** - Consider creating dedicated hooks for:
   - `useDeviceObservations()` - For petri and gasifier data
   - `useAuditLog()` - For audit trail data
   - `useCustomReports()` - For reporting features

2. **Implement Batch Operations** - Add endpoints for:
   - Bulk device observation updates
   - Batch device creation

3. **Add Analytics Endpoints** - Create specialized queries for:
   - Device performance metrics over time
   - Site-level device aggregations
   - Program-wide device statistics

4. **Enhance Reporting** - Build UI for:
   - Custom report builder
   - Scheduled reports
   - Report sharing

---

**End of Mapping Document**
