import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart4, PlusCircle, Save, Play, Filter, Calendar, RefreshCw, AlertTriangle, FileText, Download } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import Input from '../components/common/Input';
import useReports, { ReportConfiguration, ReportMetadata, ReportResult } from '../hooks/useReports';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import LoadingScreen from '../components/common/LoadingScreen';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, parse, subDays } from 'date-fns';

// D3 imports for visualization
import * as d3 from 'd3';
import { useRef } from 'react';

const ReportBuilderPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { 
    reportMetadata, 
    reports, 
    isLoading, 
    createReport, 
    executeReportQuery 
  } = useReports();
  
  // State for report configuration
  const [reportName, setReportName] = useState('New Report');
  const [reportDescription, setReportDescription] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedEntityMetadata, setSelectedEntityMetadata] = useState<ReportMetadata | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<{ function: string; field: string; label: string } | null>(null);
  const [selectedTimeField, setSelectedTimeField] = useState<string | null>(null);
  const [selectedTimeGranularity, setSelectedTimeGranularity] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('week');
  const [filters, setFilters] = useState<{
    field: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN';
    value: string | string[] | number | boolean;
  }[]>([]);
  
  // Date range filter state
  const [useTimeFilter, setUseTimeFilter] = useState(false);
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  
  // State for visualization
  const [visualizationType, setVisualizationType] = useState<'bar' | 'line' | 'table'>('bar');
  
  // State for report results
  const [reportResults, setReportResults] = useState<ReportResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const chartRef = useRef<SVGSVGElement | null>(null);
  
  // When entity changes, update available fields
  useEffect(() => {
    if (selectedEntity && reportMetadata) {
      const entityMeta = reportMetadata.find(e => e.entity === selectedEntity);
      if (entityMeta) {
        setSelectedEntityMetadata(entityMeta);
        
        // Reset selections
        setSelectedDimension(null);
        setSelectedMetric(null);
        setSelectedTimeField(null);
        setFilters([]);
        
        // Find the first timestamp field for time dimension
        const timeField = entityMeta.fields.find(f => f.type === 'timestamp' && f.roles.includes('dimension'));
        if (timeField) {
          setSelectedTimeField(timeField.name);
        }
      }
    }
  }, [selectedEntity, reportMetadata]);
  
  // Function to build report configuration
  const buildReportConfiguration = (): ReportConfiguration => {
    let config: ReportConfiguration = {
      entity: selectedEntity || 'submissions' // Default to submissions if nothing selected
    };
    
    // Add dimension
    if (selectedDimension) {
      config.dimensions = [selectedDimension];
    }
    
    // Add metric
    if (selectedMetric) {
      config.metrics = [{
        function: selectedMetric.function,
        field: selectedMetric.field
      }];
    }
    
    // Add time dimension
    if (useTimeFilter && selectedTimeField) {
      config.time_dimension = {
        field: selectedTimeField,
        granularity: selectedTimeGranularity
      };
      
      // Add date range filter
      config.filters = [
        ...(config.filters || []),
        {
          field: selectedTimeField,
          operator: '>=',
          value: format(startDate, 'yyyy-MM-dd')
        },
        {
          field: selectedTimeField,
          operator: '<=',
          value: format(endDate, 'yyyy-MM-dd')
        }
      ];
    }
    
    // Add other filters
    if (filters.length > 0) {
      config.filters = [
        ...(config.filters || []),
        ...filters
      ];
    }
    
    // Add visualization type
    config.visualization = {
      type: visualizationType
    };
    
    return config;
  };
  
  // Function to run the report
  const runReport = async () => {
    if (!selectedEntity) {
      toast.error('Please select an entity to report on');
      return;
    }
    
    try {
      setIsRunning(true);
      
      // Build the report configuration
      const config = buildReportConfiguration();
      
      // Execute the report query
      const results = await executeReportQuery(config);
      
      if (results && results.success) {
        setReportResults(results);
      } else {
        toast.error(results?.message || 'Failed to execute report query');
      }
    } catch (error) {
      console.error('Error running report:', error);
      toast.error('Error running report');
    } finally {
      setIsRunning(false);
    }
  };
  
  // Function to save the report
  const saveReport = async () => {
    if (!selectedEntity) {
      toast.error('Please select an entity to report on');
      return;
    }
    
    if (!reportName.trim()) {
      toast.error('Please enter a report name');
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Build the report configuration
      const config = buildReportConfiguration();
      
      // Save the report
      const result = await createReport(reportName, config, reportDescription);
      
      if (result) {
        toast.success('Report saved successfully');
        // Navigate to reports list or stay on page?
      }
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Error saving report');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Function to render visualization with D3
  const renderVisualization = (data: any[], type: 'bar' | 'line' | 'table') => {
    if (!chartRef.current) return;
    
    // Clear previous chart before rendering
    d3.select(chartRef.current).selectAll('*').remove();
    
    // Skip visualization if using table view
    if (type === 'table') return;
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 100, left: 60 };
    const width = Math.max(0, chartRef.current.clientWidth - margin.left - margin.right);
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(chartRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Set up scales
    const x = d3.scaleBand()
      .domain(data.map(d => String(d.dimension)))
      .range([0, width])
      .padding(0.1);
    
    // Find the metric key (assuming it's the non-dimension key)
    const metricKey = Object.keys(data[0]).find(key => key !== 'dimension');
    if (!metricKey) return;
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[metricKey]) || 0])
      .nice()
      .range([height, 0]);
    
    // Add X axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d => {
        // If this looks like a date, format it nicely
        if (typeof d === 'string' && (d.includes('-') || d.includes('+'))) {
          try {
            // Try to parse it as a date
            const date = new Date(d);
            // Check if it's a valid date
            if (!isNaN(date.getTime())) {
              // Format to "Jun 1", "Jun 8", etc.
              return format(date, 'MMM d');
            }
          } catch (error) {
            // If parsing fails, return original value
            return d;
          }
        }
        return d;
      }))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');
    
    // Add Y axis
    svg.append('g')
      .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 0 - margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text(reportName);
    
    if (type === 'bar') {
      // Create bars
      svg.selectAll('.bar')
        .data(data)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(String(d.dimension)) || 0)
        .attr('width', x.bandwidth())
        .attr('y', d => y(d[metricKey]))
        .attr('height', d => height - y(d[metricKey]))
        .attr('fill', '#4ade80');
    } else if (type === 'line') {
      // Create line
      const line = d3.line<any>()
        .x(d => (x(String(d.dimension)) || 0) + x.bandwidth() / 2)
        .y(d => y(d[metricKey]));
      
      svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#4ade80')
        .attr('stroke-width', 2)
        .attr('d', line);
      
      // Add dots
      svg.selectAll('.dot')
        .data(data)
        .enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', d => (x(String(d.dimension)) || 0) + x.bandwidth() / 2)
        .attr('cy', d => y(d[metricKey]))
        .attr('r', 4)
        .attr('fill', '#4ade80');
    }
  };
  
  // Add a useEffect hook to re-render the chart when reportResults or visualizationType changes
  useEffect(() => {
    if (chartRef.current && reportResults && reportResults.data && reportResults.data.length > 0) {
      renderVisualization(reportResults.data, visualizationType);
    } else if (chartRef.current) {
      // Clear the chart if there are no results
      d3.select(chartRef.current).selectAll('*').remove();
    }
  }, [reportResults, visualizationType]);
  
  // Function to add a new filter
  const addFilter = () => {
    if (!selectedEntityMetadata) return;
    
    // Find first filterable field
    const firstField = selectedEntityMetadata.fields.find(f => f.roles.includes('filter'));
    if (!firstField) return;
    
    setFilters([
      ...filters,
      {
        field: firstField.name,
        operator: '=',
        value: ''
      }
    ]);
  };
  
  // Function to update a filter
  const updateFilter = (index: number, field: string, value: any) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setFilters(newFilters);
  };
  
  // Function to remove a filter
  const removeFilter = (index: number) => {
    const newFilters = [...filters];
    newFilters.splice(index, 1);
    setFilters(newFilters);
  };
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Report Builder</h1>
          <p className="text-gray-600 mt-1">
            Build and save custom reports with flexible dimensions and metrics
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => navigate('/reports')}
          >
            My Reports
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Builder Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <BarChart4 className="h-5 w-5 text-primary-500 mr-2" />
                <h2 className="text-lg font-semibold">Report Configuration</h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Report Name & Description */}
                <div>
                  <Input
                    label="Report Name"
                    id="reportName"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="Enter report name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    rows={2}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Enter report description"
                  />
                </div>
                
                {/* Entity Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Report Data Source
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={selectedEntity || ''}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                  >
                    <option value="">Select a data source</option>
                    {reportMetadata.map(entity => (
                      <option key={entity.entity} value={entity.entity}>{entity.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Time Dimension */}
                {selectedEntityMetadata && (
                  <div className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center mb-2">
                      <Calendar className="h-4 w-4 text-primary-500 mr-2" />
                      <label className="text-sm font-medium text-gray-700">
                        Time Period
                      </label>
                      <div className="ml-auto">
                        <input
                          type="checkbox"
                          checked={useTimeFilter}
                          onChange={(e) => setUseTimeFilter(e.target.checked)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </div>
                    </div>
                    
                    {useTimeFilter && (
                      <div className="space-y-3 animate-fade-in">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date Field
                          </label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            value={selectedTimeField || ''}
                            onChange={(e) => setSelectedTimeField(e.target.value)}
                          >
                            <option value="">Select date field</option>
                            {selectedEntityMetadata.fields
                              .filter(f => f.type === 'timestamp' || f.type === 'date')
                              .map(field => (
                                <option key={field.name} value={field.name}>{field.label}</option>
                              ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Time Granularity
                          </label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            value={selectedTimeGranularity}
                            onChange={(e) => setSelectedTimeGranularity(e.target.value as any)}
                          >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="quarter">Quarter</option>
                            <option value="year">Year</option>
                          </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Start Date
                            </label>
                            <DatePicker
                              selected={startDate}
                              onChange={(date) => setStartDate(date || new Date())}
                              selectsStart
                              startDate={startDate}
                              endDate={endDate}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              End Date
                            </label>
                            <DatePicker
                              selected={endDate}
                              onChange={(date) => setEndDate(date || new Date())}
                              selectsEnd
                              startDate={startDate}
                              endDate={endDate}
                              minDate={startDate}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Metric Selection */}
                {selectedEntityMetadata && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Metric
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={selectedMetric ? `${selectedMetric.function}_${selectedMetric.field}` : ''}
                      onChange={(e) => {
                        const [fn, field] = e.target.value.split('_');
                        // Handle the case where field might be '*' for COUNT aggregations
                        const fieldValue = field === '*' ? undefined : field;
                        
                        // Find the matching aggregation in the metadata
                        const metric = selectedEntityMetadata.aggregations.find(agg => 
                          agg.function === fn && (agg.field === fieldValue || (!agg.field && fieldValue === undefined))
                        );
                        
                        if (metric) {
                          setSelectedMetric({
                            function: metric.function,
                            field: metric.field || '*', // Use '*' for undefined fields
                            label: metric.label
                          });
                        }
                      }}
                    >
                      <option value="">Select a metric</option>
                      {selectedEntityMetadata.aggregations.map(agg => (
                        <option 
                          key={`${agg.function}_${agg.field || '*'}`} 
                          value={`${agg.function}_${agg.field || '*'}`}
                        >
                          {agg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Visualization Type */}
                {selectedEntityMetadata && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Visualization Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className={`flex flex-col items-center justify-center p-3 rounded-md border ${
                          visualizationType === 'bar' 
                            ? 'border-primary-500 bg-primary-50 text-primary-700' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setVisualizationType('bar')}
                      >
                        <BarChart4 className="h-5 w-5 mb-1" />
                        <span className="text-xs">Bar Chart</span>
                      </button>
                      <button
                        type="button"
                        className={`flex flex-col items-center justify-center p-3 rounded-md border ${
                          visualizationType === 'line' 
                            ? 'border-primary-500 bg-primary-50 text-primary-700' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setVisualizationType('line')}
                      >
                        <svg className="h-5 w-5 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12h4l3-9 4 18 3-9h4" />
                        </svg>
                        <span className="text-xs">Line Chart</span>
                      </button>
                      <button
                        type="button"
                        className={`flex flex-col items-center justify-center p-3 rounded-md border ${
                          visualizationType === 'table' 
                            ? 'border-primary-500 bg-primary-50 text-primary-700' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setVisualizationType('table')}
                      >
                        <FileText className="h-5 w-5 mb-1" />
                        <span className="text-xs">Table View</span>
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Filters */}
                {selectedEntityMetadata && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        <Filter className="inline-block h-4 w-4 mr-1" /> 
                        Filters
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<PlusCircle size={14} />}
                        onClick={addFilter}
                        className="!py-1 !px-2"
                      >
                        Add
                      </Button>
                    </div>
                    
                    {filters.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-2">
                        No filters applied
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filters.map((filter, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            {/* Field selector */}
                            <select
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                              value={filter.field}
                              onChange={(e) => updateFilter(index, 'field', e.target.value)}
                            >
                              {selectedEntityMetadata.fields
                                .filter(f => f.roles.includes('filter'))
                                .map(field => (
                                  <option key={field.name} value={field.name}>
                                    {field.label}
                                  </option>
                                ))}
                            </select>
                            
                            {/* Operator selector */}
                            <select
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                              value={filter.operator}
                              onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                            >
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                              <option value=">">{">"}</option>
                              <option value=">=">{"≥"}</option>
                              <option value="<">{"<"}</option>
                              <option value="<=">{"≤"}</option>
                              <option value="LIKE">Contains</option>
                            </select>
                            
                            {/* Value input */}
                            <input
                              type="text"
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                              value={filter.value as string}
                              onChange={(e) => updateFilter(index, 'value', e.target.value)}
                              placeholder="Value"
                            />
                            
                            {/* Remove button */}
                            <button
                              className="text-error-500 hover:text-error-700"
                              onClick={() => removeFilter(index)}
                              title="Remove filter"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  // Reset all form states to initial values
                  setReportName('New Report');
                  setReportDescription('');
                  setSelectedEntity(null);
                  setSelectedDimension(null);
                  setSelectedMetric(null);
                  setSelectedTimeField(null);
                  setSelectedTimeGranularity('week');
                  setUseTimeFilter(false);
                  setStartDate(subDays(new Date(), 30));
                  setEndDate(new Date());
                  setFilters([]);
                  setReportResults(null);
                  
                  // Also clear the chart
                  if (chartRef.current) {
                    d3.select(chartRef.current).selectAll('*').remove();
                  }
                }}
              >
                Reset
              </Button>
              <div className="flex flex-col space-y-2">
                <Button
                  variant="primary"
                  icon={<Play size={16} />}
                  onClick={runReport}
                  isLoading={isRunning}
                  disabled={!selectedEntity}
                >
                  Run Report
                </Button>
                <Button
                  variant="outline"
                  icon={<Save size={16} />}
                  onClick={saveReport}
                  isLoading={isSaving}
                  disabled={!selectedEntity || !reportName}
                >
                  Save
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
        
        {/* Report Results Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <BarChart4 className="h-5 w-5 text-primary-500 mr-2" />
                  <h2 className="text-lg font-semibold">Report Results</h2>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    onClick={runReport}
                    isLoading={isRunning}
                    disabled={!selectedEntity}
                  >
                    Refresh
                  </Button>
                  
                  {reportResults && reportResults.data && reportResults.data.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={() => {
                        // Export to CSV
                        if (!reportResults.data) return;
                        
                        const headers = Object.keys(reportResults.data[0]);
                        const csv = [
                          headers.join(','),
                          ...reportResults.data.map(row => 
                            headers.map(header => 
                              JSON.stringify(row[header] ?? '')
                            ).join(',')
                          )
                        ].join('\n');
                        
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.setAttribute('href', url);
                        link.setAttribute('download', `${reportName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      Export CSV
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!reportResults ? (
                <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                  <BarChart4 size={48} className="text-gray-300 mb-4" />
                  <p className="text-lg font-medium">No report data</p>
                  <p className="text-sm mt-1">Configure and run your report to see results</p>
                </div>
              ) : !reportResults.success ? (
                <div className="bg-error-50 border border-error-200 rounded-lg p-4 text-error-700">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 mr-2 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Error Running Report</h3>
                      <p className="mt-1 text-sm">{reportResults.message}</p>
                    </div>
                  </div>
                </div>
              ) : reportResults.data && reportResults.data.length > 0 ? (
                <div>
                  {/* Report results count */}
                  <div className="mb-4 text-sm text-gray-500">
                    Showing {reportResults.data.length} of {reportResults.count || reportResults.data.length} results
                  </div>
                  
                  {/* Chart or table visualization */}
                  {visualizationType !== 'table' ? (
                    <div className="h-[400px] border border-gray-200 rounded-lg overflow-hidden">
                      <svg ref={chartRef} width="100%" height="100%" />
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(reportResults.data[0]).map(header => (
                              <th 
                                key={header} 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {reportResults.data.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {Object.values(row).map((value, colIndex) => (
                                <td 
                                  key={colIndex} 
                                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                                >
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Query debug section */}
                  {reportResults.query && (
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-gray-700">
                          Show Query Details
                        </summary>
                        <pre className="mt-2 text-xs text-gray-600 overflow-x-auto">
                          {reportResults.query}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-gray-500 border border-gray-200 rounded-lg">
                  <FileText size={48} className="text-gray-300 mb-4" />
                  <p className="text-lg font-medium">No data found</p>
                  <p className="text-sm mt-1">Try adjusting your report parameters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Helper components
const X = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

export default ReportBuilderPage;