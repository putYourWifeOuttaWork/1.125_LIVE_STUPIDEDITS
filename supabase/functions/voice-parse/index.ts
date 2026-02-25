import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are a voice command parser for an agricultural facility monitoring platform called GasX InVivo.
Parse the user's spoken command into a structured JSON action.

Action types:
- LOG_BATCH: User wants to log a new batch of crops (crop_name, variety, plant_count, zone mention)
- LOG_LOSS: User wants to record a loss event (loss_type, severity, description, estimated_units_lost, zone mention)
- LOG_TREATMENT: User wants to record a fungicide/treatment application (product_name, method, zone mention)
- ACKNOWLEDGE_ALERT: User wants to acknowledge an alert (alert description, action_taken, loss_prevented)
- CREATE_ZONE: User wants to create a new zone (zone_name, zone_type)
- QUERY: User is asking a question about their data (query_type, parameters)

For each action, extract:
- action_type: one of the above
- confidence: 0-1 how confident you are in the parse
- zone_name: the spoken zone name if any (null if none mentioned)
- data: structured data object specific to the action type

For QUERY actions, query_type can be: zone_status, facility_summary, alert_summary, mgi_status, batch_status, loss_summary, treatment_history

If the transcript contains multiple commands, return an array of actions.

Available zones for this site (match spoken text to these):
{ZONES}

Recent alerts (last 24h):
{ALERTS}

User's current page context: {PAGE_CONTEXT}

Return ONLY valid JSON. No explanations.
Example: {"actions": [{"action_type": "LOG_BATCH", "confidence": 0.92, "zone_name": "zone 1", "data": {"crop_name": "tomatoes", "variety": "grape", "plant_count": 500}}]}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transcript, context } = await req.json();
    if (!transcript) {
      return new Response(
        JSON.stringify({ error: "Missing transcript" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const siteId = context?.site_id;
    let zonesText = "No zones available";
    let alertsText = "No recent alerts";

    if (siteId) {
      const { data: zones } = await supabase
        .from("zones")
        .select("zone_id, name, aliases, zone_type")
        .eq("site_id", siteId)
        .eq("status", "active");

      if (zones && zones.length > 0) {
        zonesText = zones
          .map(
            (z: { name: string; aliases: string[]; zone_type: string }) =>
              `${z.name} (type: ${z.zone_type}, aliases: ${(z.aliases || []).join(", ")})`
          )
          .join("\n");
      }

      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: alerts } = await supabase
        .from("device_alerts")
        .select("alert_id, alert_type, severity, message, created_at")
        .gte("created_at", twentyFourHoursAgo)
        .limit(10);

      if (alerts && alerts.length > 0) {
        alertsText = alerts
          .map(
            (a: { alert_type: string; severity: string; message: string }) =>
              `${a.alert_type} (${a.severity}): ${a.message}`
          )
          .join("\n");
      }
    }

    const systemPrompt = SYSTEM_PROMPT.replace("{ZONES}", zonesText)
      .replace("{ALERTS}", alertsText)
      .replace("{PAGE_CONTEXT}", context?.page_context || "unknown");

    const { data: secret } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "ANTHROPIC_API_KEY")
      .maybeSingle();

    if (!secret?.value) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": secret.value,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-20250414",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: transcript }],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({ error: "NLU parse failed", details: errText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText =
      anthropicData.content?.[0]?.text || '{"actions": []}';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { actions: [], raw: rawText };
    }

    if (siteId && parsed.actions) {
      const { data: zones } = await supabase
        .from("zones")
        .select("zone_id, name, aliases")
        .eq("site_id", siteId)
        .eq("status", "active");

      for (const action of parsed.actions) {
        if (action.zone_name && zones) {
          const spoken = action.zone_name.toLowerCase().trim();
          const match = zones.find(
            (z: { name: string; aliases: string[] }) =>
              z.name.toLowerCase() === spoken ||
              (z.aliases || []).some(
                (a: string) => a.toLowerCase() === spoken
              )
          );
          if (match) {
            action.zone_id = match.zone_id;
            action.zone_resolved = true;
          } else {
            action.zone_resolved = false;
          }
        }
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
