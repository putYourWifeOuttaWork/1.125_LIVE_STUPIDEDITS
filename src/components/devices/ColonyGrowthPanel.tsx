import { useState, useEffect, useMemo } from 'react';
import { Microscope, TrendingUp, TrendingDown, Minus, Activity, Target } from 'lucide-react';
import { format, subDays } from 'date-fns';
import Card, { CardHeader, CardContent } from '../common/Card';
import LoadingScreen from '../common/LoadingScreen';
import { supabase } from '../../lib/supabaseClient';

interface ColonyGrowthPanelProps {
  deviceId: string;
}

interface ColonyDataPoint {
  image_id: string;
  captured_at: string;
  colony_count: number | null;
  colony_count_velocity: number | null;
  avg_colony_confidence: number | null;
  mgi_score: number | null;
}

interface TrackSummary {
  total_active: number;
  total_lost: number;
  avg_growth_factor: number | null;
  max_detection_count: number;
}

const ColonyGrowthPanel = ({ deviceId }: ColonyGrowthPanelProps) => {
  const [data, setData] = useState<ColonyDataPoint[]>([]);
  const [trackSummary, setTrackSummary] = useState<TrackSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const cutoff = subDays(new Date(), 30).toISOString();

        const [imagesResult, tracksResult] = await Promise.all([
          supabase
            .from('device_images')
            .select('image_id, captured_at, colony_count, colony_count_velocity, avg_colony_confidence, mgi_score')
            .eq('device_id', deviceId)
            .eq('status', 'complete')
            .not('colony_count', 'is', null)
            .gte('captured_at', cutoff)
            .order('captured_at', { ascending: true }),
          supabase
            .from('colony_tracks')
            .select('track_id, status, growth_factor, detection_count')
            .eq('device_id', deviceId),
        ]);

        setData(imagesResult.data || []);

        if (tracksResult.data && tracksResult.data.length > 0) {
          const tracks = tracksResult.data;
          const active = tracks.filter(t => t.status === 'active');
          const lost = tracks.filter(t => t.status === 'lost');
          const growthFactors = tracks
            .map(t => t.growth_factor)
            .filter((g): g is number => g != null && g > 0);

          setTrackSummary({
            total_active: active.length,
            total_lost: lost.length,
            avg_growth_factor: growthFactors.length > 0
              ? growthFactors.reduce((a, b) => a + b, 0) / growthFactors.length
              : null,
            max_detection_count: Math.max(...tracks.map(t => t.detection_count || 0), 0),
          });
        }
      } catch (error) {
        console.error('Error fetching colony data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [deviceId]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const counts = data.map(d => d.colony_count!);
    const latest = counts[counts.length - 1];
    const first = counts[0];
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    const velocities = data
      .map(d => d.colony_count_velocity)
      .filter((v): v is number => v != null);
    const avgVelocity = velocities.length > 0
      ? velocities.reduce((a, b) => a + b, 0) / velocities.length
      : 0;

    const trend: 'increasing' | 'decreasing' | 'stable' =
      avgVelocity > 2 ? 'increasing' : avgVelocity < -2 ? 'decreasing' : 'stable';

    return { latest, first, max, min, avg, avgVelocity, trend, totalReadings: counts.length };
  }, [data]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-gray-500">
            <Microscope className="mx-auto h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm">No colony count data available yet</p>
            <p className="text-xs text-gray-400 mt-1">Colony data appears after images are processed by the find-molds model</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Latest Count"
          value={stats?.latest ?? 0}
          icon={<Microscope className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          label="Avg Growth/Wake"
          value={stats?.avgVelocity ?? 0}
          format="velocity"
          icon={
            stats?.trend === 'increasing'
              ? <TrendingUp className="w-4 h-4 text-red-500" />
              : stats?.trend === 'decreasing'
              ? <TrendingDown className="w-4 h-4 text-green-500" />
              : <Minus className="w-4 h-4 text-gray-400" />
          }
        />
        <StatCard
          label="Peak Count"
          value={stats?.max ?? 0}
          icon={<Activity className="w-4 h-4 text-orange-500" />}
        />
        <StatCard
          label="Readings"
          value={stats?.totalReadings ?? 0}
          icon={<Target className="w-4 h-4 text-teal-500" />}
        />
      </div>

      {trackSummary && (trackSummary.total_active > 0 || trackSummary.total_lost > 0) && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-700">Colony Tracking</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Active Tracks</p>
                <p className="text-lg font-bold text-teal-700">{trackSummary.total_active}</p>
              </div>
              <div>
                <p className="text-gray-500">Lost Tracks</p>
                <p className="text-lg font-bold text-gray-500">{trackSummary.total_lost}</p>
              </div>
              {trackSummary.avg_growth_factor != null && (
                <div>
                  <p className="text-gray-500">Avg Growth Factor</p>
                  <p className={`text-lg font-bold ${trackSummary.avg_growth_factor > 1.2 ? 'text-red-600' : 'text-gray-700'}`}>
                    {trackSummary.avg_growth_factor.toFixed(2)}x
                  </p>
                </div>
              )}
              <div>
                <p className="text-gray-500">Max Observations</p>
                <p className="text-lg font-bold text-gray-700">{trackSummary.max_detection_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-gray-700">Colony Count Over Time (Last 30 Days)</h3>
        </CardHeader>
        <CardContent>
          <ColonySparkline data={data} />
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  icon,
  format: fmt = 'number',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  format?: 'number' | 'velocity';
}) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs text-gray-500">{label}</span>
    </div>
    <p className="text-xl font-bold text-gray-900">
      {fmt === 'velocity'
        ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
        : Math.round(value)}
    </p>
  </div>
);

const ColonySparkline = ({ data }: { data: ColonyDataPoint[] }) => {
  if (data.length < 2) {
    return (
      <div className="text-center py-4 text-sm text-gray-400">
        Need at least 2 data points for chart
      </div>
    );
  }

  const counts = data.map(d => d.colony_count ?? 0);
  const maxCount = Math.max(...counts, 1);
  const height = 140;
  const width = 100;
  const padding = { top: 10, bottom: 24, left: 0, right: 0 };
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padding.top + chartH - ((d.colony_count ?? 0) / maxCount) * chartH,
    count: d.colony_count ?? 0,
    date: d.captured_at,
    velocity: d.colony_count_velocity,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: `${height}px` }}
      >
        <defs>
          <linearGradient id="colonyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#colonyGrad)" />
        <path d={pathD} fill="none" stroke="#0d9488" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.8" fill="#0d9488" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
        <span>{format(new Date(data[0].captured_at), 'MMM d')}</span>
        <span>{format(new Date(data[data.length - 1].captured_at), 'MMM d')}</span>
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-0.5 px-1">
        <span>Max: {maxCount}</span>
        <span>Latest: {counts[counts.length - 1]}</span>
      </div>
    </div>
  );
};

export default ColonyGrowthPanel;
