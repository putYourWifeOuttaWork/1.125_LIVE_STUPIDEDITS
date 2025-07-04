-- Create a new migration file to fix the trigger with proper http_request parameters

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS trigger_split_petri_observation ON public.petri_observations;

-- Create the fixed trigger with all required parameters
CREATE TRIGGER trigger_split_petri_observation
AFTER UPDATE OF image_url ON public.petri_observations
FOR EACH ROW
WHEN (NEW.is_split_source = TRUE AND NEW.image_url IS NOT NULL AND NEW.split_processed = FALSE)
EXECUTE FUNCTION supabase_functions.http_request(
    'https://vxxsqkbkkkksmhnihlkd.supabase.co/functions/v1/process_split_petris',
    'POST',
    '{"Content-Type": "application/json"}',
    jsonb_build_object('observationId', NEW.observation_id)::text,
    5000
);

-- Add comment to trigger
COMMENT ON TRIGGER trigger_split_petri_observation ON public.petri_observations IS 'Triggers the process_split_petris edge function when an image is uploaded to a split source petri observation';