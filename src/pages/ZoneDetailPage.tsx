import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Pencil, Leaf, AlertTriangle, Droplets } from 'lucide-react';
import { useZone } from '../hooks/useZones';
import { useZones } from '../hooks/useZones';
import { ZoneFormModal } from '../components/zones/ZoneFormModal';
import { supabase } from '../lib/supabaseClient';

const ZoneDetailPage = () => {
  const { zoneId } = useParams<{ zoneId: string }>();
  const navigate = useNavigate();
  const { data: zone, isLoading: zoneLoading } = useZone(zoneId);
  const { updateZone, isUpdating } = useZones(zone?.site_id);
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: batches } = useQuery({
    queryKey: ['zone-batches', zoneId],
    queryFn: async () => {
      const { data } = await supabase
        .from('batches')
        .select('*')
        .eq('zone_id', zoneId!)
        .eq('status', 'active')
        .order('planted_date', { ascending: false });
      return data || [];
    },
    enabled: !!zoneId,
  });

  const { data: losses } = useQuery({
    queryKey: ['zone-losses', zoneId],
    queryFn: async () => {
      const { data } = await supabase
        .from('loss_events')
        .select('*')
        .eq('zone_id', zoneId!)
        .order('event_date', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!zoneId,
  });

  const { data: treatments } = useQuery({
    queryKey: ['zone-treatments', zoneId],
    queryFn: async () => {
      const { data } = await supabase
        .from('fungicide_applications')
        .select('*')
        .eq('zone_id', zoneId!)
        .order('applied_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!zoneId,
  });

  if (zoneLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-40 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Zone not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary-600 hover:underline text-sm">
          Go back
        </button>
      </div>
    );
  }

  const handleEdit = async (data: {
    name: string;
    zone_type: string;
    description: string;
    aliases: string[];
    area_sqft?: number;
  }) => {
    await updateZone({ zoneId: zone.zone_id, updates: data });
    setShowEditModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-primary-500" />
              <h1 className="text-xl font-bold text-gray-900">{zone.name}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {zone.zone_type.replace(/_/g, ' ')}
              </span>
            </div>
            {zone.description && (
              <p className="text-sm text-gray-500 mt-1">{zone.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Pencil size={14} /> Edit
        </button>
      </div>

      {zone.aliases && zone.aliases.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Voice aliases:</span>
          {zone.aliases.map((alias, i) => (
            <span key={i} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded">
              {alias}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Leaf size={16} className="text-primary-500" />
            <h2 className="font-semibold text-gray-900">Active Batches</h2>
            <span className="text-xs text-gray-400">({batches?.length || 0})</span>
          </div>
          {batches && batches.length > 0 ? (
            <div className="space-y-2">
              {batches.map((b: Record<string, unknown>) => (
                <div key={b.id as string} className="p-2 bg-primary-50 rounded-lg">
                  <div className="font-medium text-sm text-gray-900">
                    {b.crop_name as string} {b.variety ? `- ${b.variety}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {b.plant_count ? `${b.plant_count} plants` : ''}
                    {b.expected_total_value ? ` | $${Number(b.expected_total_value).toFixed(0)} value` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No active batches</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-error-500" />
            <h2 className="font-semibold text-gray-900">Recent Losses</h2>
            <span className="text-xs text-gray-400">({losses?.length || 0})</span>
          </div>
          {losses && losses.length > 0 ? (
            <div className="space-y-2">
              {losses.map((l: Record<string, unknown>) => (
                <div key={l.id as string} className="p-2 bg-error-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900 capitalize">
                      {(l.loss_type as string || '').replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      l.severity === 'catastrophic' ? 'bg-error-200 text-error-800' :
                      l.severity === 'major' ? 'bg-error-100 text-error-700' :
                      l.severity === 'moderate' ? 'bg-warning-100 text-warning-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {l.severity as string}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {l.estimated_value_lost ? `$${Number(l.estimated_value_lost).toFixed(0)} lost` : ''}
                    {l.event_date ? ` | ${l.event_date}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No loss events</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Droplets size={16} className="text-secondary-500" />
            <h2 className="font-semibold text-gray-900">Treatments</h2>
            <span className="text-xs text-gray-400">({treatments?.length || 0})</span>
          </div>
          {treatments && treatments.length > 0 ? (
            <div className="space-y-2">
              {treatments.map((t: Record<string, unknown>) => (
                <div key={t.id as string} className="p-2 bg-secondary-50 rounded-lg">
                  <div className="font-medium text-sm text-gray-900">
                    {t.product_name as string || 'Unknown product'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    {t.method && <span>{t.method as string}</span>}
                    {t.treatment_effective !== null && (
                      <span className={t.treatment_effective ? 'text-primary-600' : 'text-error-600'}>
                        {t.treatment_effective ? 'Effective' : 'Ineffective'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No treatments</p>
          )}
        </div>
      </div>

      <ZoneFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleEdit}
        zone={zone}
        isLoading={isUpdating}
      />
    </div>
  );
};

export default ZoneDetailPage;
