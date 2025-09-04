# Please Provide SubmissionEditPage.tsx

To debug the indoor humidity issue, I need to examine the content of:
`src/pages/SubmissionEditPage.tsx`

This file is currently in the restricted files list, but it's critical for understanding how the form values are being collected and passed to the updateSubmission function.

Specifically, I need to see:
1. How the indoor_temperature and indoor_humidity form fields are defined
2. How the form values are collected when the "Save" button is clicked
3. How these values are passed to the updateSubmission function
4. How this differs from the "Complete" action

Once I can see this code, I can identify why indoor_humidity is being overwritten with the indoor_temperature value.