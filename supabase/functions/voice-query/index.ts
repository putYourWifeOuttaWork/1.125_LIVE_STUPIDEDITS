import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { query_type, parameters, context } = await req.json();

    let result: Record<string, unknown> = {};
    let summary = "";
    const siteId = context?.site_id || parameters?.site_id;

    switch (query_type) {
      case "zone_status": {
        const zoneId = parameters?.zone_id;
        if (zoneId) {
          const { data } = await supabase.rpc("calculate_zone_current_value", {
            p_zone_id: zoneId,
          });
          result = { zone_value: data };
          summary = `Zone current value: $${data || 0}`;
        } else if (siteId) {
          const { data: zones } = await supabase
            .from("zones")
            .select("zone_id, name, status, zone_type")
            .eq("site_id", siteId)
            .eq("status", "active");
          result = { zones: zones || [] };
          summary = `${(zones || []).length} active zones found`;
        }
        break;
      }
      case "facility_summary": {
        if (siteId) {
          const { data: roi } = await supabase.rpc("calculate_facility_roi", {
            p_site_id: siteId,
            p_start: new Date(
              Date.now() - 30 * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split("T")[0],
            p_end: new Date().toISOString().split("T")[0],
          });
          result = { roi };
          summary = roi
            ? `30-day facility summary available`
            : "No facility data yet";
        }
        break;
      }
      case "alert_summary": {
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: alerts, count } = await supabase
          .from("device_alerts")
          .select("alert_id, alert_type, severity, message", {
            count: "exact",
          })
          .gte("created_at", twentyFourHoursAgo)
          .order("created_at", { ascending: false })
          .limit(5);
        result = { alerts: alerts || [], total: count || 0 };
        summary = `${count || 0} alerts in the last 24 hours`;
        break;
      }
      case "batch_status": {
        const { data: batches } = await supabase
          .from("batches")
          .select("id, crop_name, variety, status, expected_total_value, zone_id")
          .eq("status", "active")
          .limit(20);
        result = { batches: batches || [] };
        summary = `${(batches || []).length} active batches`;
        break;
      }
      case "loss_summary": {
        const thirtyDaysAgo = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: losses } = await supabase
          .from("loss_events")
          .select(
            "id, loss_type, severity, estimated_value_lost, event_date"
          )
          .gte("event_date", thirtyDaysAgo.split("T")[0])
          .order("event_date", { ascending: false });
        const totalLoss = (losses || []).reduce(
          (sum: number, l: { estimated_value_lost: number | null }) =>
            sum + (l.estimated_value_lost || 0),
          0
        );
        result = { losses: losses || [], total_value_lost: totalLoss };
        summary = `${(losses || []).length} loss events totaling $${totalLoss.toFixed(2)} in the last 30 days`;
        break;
      }
      case "treatment_history": {
        const { data: treatments } = await supabase
          .from("fungicide_applications")
          .select(
            "id, product_name, total_cost, treatment_effective, applied_at"
          )
          .order("applied_at", { ascending: false })
          .limit(10);
        result = { treatments: treatments || [] };
        summary = `${(treatments || []).length} recent treatments`;
        break;
      }
      default: {
        summary = "Unknown query type";
        result = { error: "Unknown query type" };
      }
    }

    return new Response(
      JSON.stringify({ query_type, result, summary }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
