import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Droplets,
  MapPin,
  Mic,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ValueDashboardPage = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['value-dashboard-stats'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [batchRes, lossRes, treatmentRes, zoneRes, voiceRes] = await Promise.all([
        supabase
          .from('batches')
          .select('expected_total_value')
          .eq('status', 'active'),
        supabase
          .from('loss_events')
          .select('estimated_value_lost')
          .gte('event_date', thirtyDaysAgo),
        supabase
          .from('fungicide_applications')
          .select('total_cost')
          .gte('applied_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('zones')
          .select('zone_id')
          .neq('status', 'archived'),
        supabase
          .from('voice_logs')
          .select('id, confirmed')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const batchValue = (batchRes.data || []).reduce(
        (sum, b) => sum + (Number(b.expected_total_value) || 0),
        0
      );
      const lossValue = (lossRes.data || []).reduce(
        (sum, l) => sum + (Number(l.estimated_value_lost) || 0),
        0
      );
      const treatmentCost = (treatmentRes.data || []).reduce(
        (sum, t) => sum + (Number(t.total_cost) || 0),
        0
      );
      const zoneCount = zoneRes.data?.length || 0;
      const voiceLogs = voiceRes.data || [];
      const voiceCount = voiceLogs.length;
      const confirmedCount = voiceLogs.filter((v) => v.confirmed).length;
      const confirmRate = voiceCount > 0 ? Math.round((confirmedCount / voiceCount) * 100) : 0;

      return { batchValue, lossValue, treatmentCost, zoneCount, voiceCount, confirmRate };
    },
    staleTime: 2 * 60 * 1000,
  });

  const statCards = [
    {
      label: 'Active Batch Value',
      value: stats ? `$${stats.batchValue.toLocaleString()}` : '--',
      icon: DollarSign,
      color: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Losses (30d)',
      value: stats ? `$${stats.lossValue.toLocaleString()}` : '--',
      icon: AlertTriangle,
      color: 'text-error-600 bg-error-50',
    },
    {
      label: 'Treatment Spend (30d)',
      value: stats ? `$${stats.treatmentCost.toLocaleString()}` : '--',
      icon: Droplets,
      color: 'text-secondary-600 bg-secondary-50',
    },
    {
      label: 'Active Zones',
      value: stats?.zoneCount.toString() || '--',
      icon: MapPin,
      color: 'text-accent-600 bg-accent-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={22} className="text-primary-600" />
          <h1 className="text-xl font-bold text-gray-900">Business Value</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {isLoading ? (
                  <span className="inline-block w-16 h-6 bg-gray-200 rounded animate-pulse" />
                ) : (
                  card.value
                )}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Mic size={18} className="text-primary-500" />
              <h2 className="font-semibold text-gray-900">Voice Commands</h2>
            </div>
            <Link
              to="/value/activity"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {isLoading ? '--' : stats?.voiceCount || 0}
              </p>
              <p className="text-sm text-gray-500">Commands (30d)</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {isLoading ? '--' : `${stats?.confirmRate || 0}%`}
              </p>
              <p className="text-sm text-gray-500">Confirmation Rate</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Mic size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">"Log 200 grape tomatoes in Zone 1"</p>
                <p className="text-xs text-gray-500">Creates a batch record with voice</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Mic size={16} className="text-error-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">"Record mold loss in the back corner"</p>
                <p className="text-xs text-gray-500">Logs a loss event linked to alerts</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Mic size={16} className="text-secondary-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">"Applied Serenade to Zone 2"</p>
                <p className="text-xs text-gray-500">Records treatment with efficacy tracking</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValueDashboardPage;
