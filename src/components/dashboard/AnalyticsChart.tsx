import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';
import { format, subDays } from 'date-fns';
import Button from '../common/Button';
import { Calendar, Filter, RefreshCw } from 'lucide-react';

// Register ChartJS components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend
);

interface AnalyticsChartProps {
  programId: string | null;
  siteId: string | null;
}

// Interface for submission count data
interface SubmissionCount {
  date: string;
  count: number;
}

const AnalyticsChart = ({ programId, siteId }: AnalyticsChartProps) => {
  const [timeRange, setTimeRange] = useState<'7days' | '30days' | '90days'>('30days');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [submissionData, setSubmissionData] = useState<SubmissionCount[]>([]);
  
  // Fetch submission counts
  const fetchSubmissionCounts = async () => {
    if (!programId && !siteId) return;
    
    setIsLoading(true);
    try {
      let endDate = new Date();
      let startDate: Date;
      
      // Calculate start date based on time range
      switch (timeRange) {
        case '7days':
          startDate = subDays(endDate, 7);
          break;
        case '30days':
          startDate = subDays(endDate, 30);
          break;
        case '90days':
          startDate = subDays(endDate, 90);
          break;
        default:
          startDate = subDays(endDate, 30);
      }
      
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');
      
      // Mock submission count data for demonstration
      const mockData: SubmissionCount[] = [];
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        // Generate random count between 0 and 5
        const count = Math.floor(Math.random() * 6);
        
        mockData.push({
          date: format(currentDate, 'yyyy-MM-dd'),
          count
        });
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      setSubmissionData(mockData);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch data when dependencies change
  useEffect(() => {
    if (programId || siteId) {
      fetchSubmissionCounts();
    }
  }, [programId, siteId, timeRange]);
  
  // Format submission count data for line chart
  const submissionChartData: ChartData<'line'> = {
    labels: submissionData.map(item => format(new Date(item.date), 'MMM d')),
    datasets: [
      {
        label: 'Submissions',
        data: submissionData.map(item => item.count),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.4,
        fill: false
      }
    ]
  };
  
  // Chart options
  const submissionChartOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Submissions Over Time'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Submission Count'
        }
      }
    }
  };
  
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
          >
            Submissions
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={timeRange === '7days' ? 'primary' : 'outline'}
            size="sm"
            icon={<Calendar size={14} />}
            onClick={() => setTimeRange('7days')}
          >
            7 Days
          </Button>
          <Button
            variant={timeRange === '30days' ? 'primary' : 'outline'}
            size="sm"
            icon={<Calendar size={14} />}
            onClick={() => setTimeRange('30days')}
          >
            30 Days
          </Button>
          <Button
            variant={timeRange === '90days' ? 'primary' : 'outline'}
            size="sm"
            icon={<Calendar size={14} />}
            onClick={() => setTimeRange('90days')}
          >
            90 Days
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={fetchSubmissionCounts}
          >
            Refresh
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (programId || siteId) ? (
        <div className="h-64">
          {submissionData.length > 0 ? (
            <Line data={submissionChartData} options={submissionChartOptions} />
          ) : (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-500">No submission data available for the selected time period.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col justify-center items-center h-64 bg-gray-50 rounded-lg border border-gray-200 p-6">
          <Filter size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-600 font-medium mb-2">Select a program or site to view analytics</p>
          <p className="text-gray-500 text-sm text-center">
            Charts will display submission data based on your selection
          </p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsChart;