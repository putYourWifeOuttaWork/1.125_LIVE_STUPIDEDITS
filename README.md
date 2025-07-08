# GRMTek Sporeless Pilot Program

A field operations platform for capturing, analyzing, and managing petri dish and gasifier observations in agricultural settings.

## Features

- User authentication and role-based access control
- Company management with admin designations
- Pilot program creation and management 
- Site creation and configuration
- Submission data collection with online/offline capabilities
- Image capture for petri dishes and gasifiers
- Split image processing for petri observations
- Collaboration with session sharing
- Audit logging for compliance

## Technical Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **State Management**: Zustand, React Query
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Data Visualization**: Chart.js (WILL CHANGE TO D3)
- **Form Handling**: Formik, Yup
- **Offline Support**: IndexedDB

## Split Petri Image Processing

The application supports a specialized workflow for split petri image processing:

1. Users can define petri templates that are flagged for image splitting
2. When creating a submission from a template, the system creates:
   - A main source record that will hold the original image
   - Two linked records (left/right) that will receive the split images
3. Users upload a single image to the main record during data collection
4. A background process (Edge Function) detects images that need to be split
5. The image is sent to a Python app for processing (splitting)
6. The Python app returns two new images (left/right sides)
7. These images are assigned to the appropriate linked records
8. The original image is archived in a separate table

This allows capturing data on two separate petri dishes with a single photo, improving field workflow efficiency.

## Project Structure

- `/src` - React application source code
- `/supabase` - Supabase migrations and edge functions
- `/public` - Static assets

## Setup Instructions

1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file with your Supabase credentials
4. Run `npm run dev` to start the development server

## Deployment

The application can be deployed to Netlify or Vercel, with Supabase handling the backend services.

## License

Proprietary - All rights reserved © 2025 GRM TEK