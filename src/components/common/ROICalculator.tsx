import { useState, useEffect } from 'react';
import { Check, Share2, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabaseClient';
import { ROITierResult, ROICalculatorInputs, ROICalculation } from '../../lib/types';
import Input from './Input';
import Button from './Button';
import { v4 as uuidv4 } from 'uuid';

const ROICalculator = () => {
  const [inputs, setInputs] = useState<ROICalculatorInputs>({
    facilitySquareFeet: 10000,
    annualProduction: 1875000,
    wastePercent: 15,
    downtimeDays: 5
  });

  const [results, setResults] = useState<ROITierResult[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('roi');

    if (shareToken) {
      loadSharedCalculation(shareToken);
    }
  }, []);

  useEffect(() => {
    if (hasCalculated && inputs.facilitySquareFeet > 0 && inputs.annualProduction > 0) {
      calculateROI();
    }
  }, [inputs, hasCalculated]);

  const loadSharedCalculation = async (shareToken: string) => {
    try {
      const { data, error } = await supabase
        .from('roi_calculations')
        .select('*')
        .eq('share_token', shareToken)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setInputs({
          facilitySquareFeet: Number(data.facility_sqft),
          annualProduction: Number(data.annual_production),
          wastePercent: Number(data.waste_percent),
          downtimeDays: Number(data.downtime_days)
        });
        setHasCalculated(true);
        toast.info('Loaded shared calculation');
      }
    } catch (error) {
      console.error('Error loading shared calculation:', error);
      toast.error('Failed to load shared calculation');
    }
  };

  const calculateDevices = (sqft: number, tier: 'basic' | 'pro' | 'max'): number => {
    if (tier === 'basic') {
      return Math.max(1, Math.ceil(sqft / 2000));
    } else if (tier === 'pro') {
      const min = sqft / 2000 * 0.6045;
      const max = (sqft / 10000) * 9;
      return Math.max(1, Math.ceil((min + max) / 2));
    } else {
      return Math.max(1, Math.ceil((sqft / 10000) * 9));
    }
  };

  const calculateROI = () => {
    const { facilitySquareFeet, annualProduction, wastePercent, downtimeDays } = inputs;

    const wasteReduction = (annualProduction * (wastePercent / 100)) * 0.25;
    const operationalSavings = (annualProduction / 365) * downtimeDays * 0.5;
    const totalReturn = wasteReduction + operationalSavings;

    const tiers: Array<{ name: string; tier: 'basic' | 'pro' | 'max'; price: number; features: string[] }> = [
      {
        name: 'Basic',
        tier: 'basic',
        price: 2999,
        features: [
          'Software licensing',
          'Alerts and notifications',
          'On-site and remote admin support',
          'Automated analytics and reporting',
          '1-year sensor dishes included'
        ]
      },
      {
        name: 'Pro',
        tier: 'pro',
        price: 2750,
        features: [
          'All Basic tier features',
          'Discounted intervention chemicals',
          'Access to partner network',
          'Priority support response',
          'Advanced analytics dashboard'
        ]
      },
      {
        name: 'Max',
        tier: 'max',
        price: 2399,
        features: [
          'All Pro tier features',
          '50% discount on GasX gasifier',
          'Real-time mold prevention',
          'Dedicated account manager',
          'Custom integration support'
        ]
      }
    ];

    const calculatedResults: ROITierResult[] = tiers.map(({ name, tier, price, features }) => {
      const deviceCount = calculateDevices(facilitySquareFeet, tier);
      const annualInvestment = deviceCount * price;
      const netBenefit = totalReturn - annualInvestment;
      const roiPercentage = (netBenefit / annualInvestment) * 100;

      return {
        tierName: name,
        deviceCount,
        annualInvestment,
        wasteReduction,
        operationalSavings,
        totalReturn,
        netBenefit,
        roiPercentage,
        features
      };
    });

    setResults(calculatedResults);
  };

  const handleInputChange = (field: keyof ROICalculatorInputs, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => ({ ...prev, [field]: numValue }));
  };

  const handleCalculate = () => {
    if (inputs.facilitySquareFeet <= 0 || inputs.annualProduction <= 0) {
      toast.error('Please enter valid positive numbers for all fields');
      return;
    }
    setHasCalculated(true);
    calculateROI();
  };

  const handleShare = async () => {
    if (!hasCalculated || results.length === 0) {
      toast.error('Please calculate ROI first');
      return;
    }

    setIsSharing(true);
    try {
      const shareToken = uuidv4();

      const calculationData: Partial<ROICalculation> = {
        share_token: shareToken,
        facility_sqft: inputs.facilitySquareFeet,
        annual_production: inputs.annualProduction,
        waste_percent: inputs.wastePercent,
        downtime_days: inputs.downtimeDays,
        basic_devices: results[0].deviceCount,
        pro_devices: results[1].deviceCount,
        max_devices: results[2].deviceCount,
        basic_roi: results[0].roiPercentage,
        pro_roi: results[1].roiPercentage,
        max_roi: results[2].roiPercentage
      };

      const { error } = await supabase
        .from('roi_calculations')
        .insert([calculationData]);

      if (error) throw error;

      const shareUrl = `${window.location.origin}${window.location.pathname}?roi=${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);

      toast.success('Share link copied to clipboard!');
    } catch (error) {
      console.error('Error sharing calculation:', error);
      toast.error('Failed to create share link');
    } finally {
      setIsSharing(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const bestROI = results.length > 0 ? Math.max(...results.map(r => r.roiPercentage)) : 0;

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Calculate Your Facility's ROI</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="Facility Square Feet"
            type="number"
            value={inputs.facilitySquareFeet || ''}
            onChange={(e) => handleInputChange('facilitySquareFeet', e.target.value)}
            placeholder="10000"
            min="0"
          />
          <Input
            label="Annual Production Value"
            type="number"
            value={inputs.annualProduction || ''}
            onChange={(e) => handleInputChange('annualProduction', e.target.value)}
            placeholder="1875000"
            min="0"
          />
          <Input
            label="Estimated Waste %"
            type="number"
            value={inputs.wastePercent || ''}
            onChange={(e) => handleInputChange('wastePercent', e.target.value)}
            placeholder="15"
            min="0"
            max="100"
          />
          <Input
            label="Annual Downtime Days"
            type="number"
            value={inputs.downtimeDays || ''}
            onChange={(e) => handleInputChange('downtimeDays', e.target.value)}
            placeholder="5"
            min="0"
            max="365"
          />
        </div>
        <div className="flex gap-3 mt-4">
          <Button
            onClick={handleCalculate}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Calculate ROI
          </Button>
          {hasCalculated && results.length > 0 && (
            <Button
              onClick={handleShare}
              disabled={isSharing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {isSharing ? 'Sharing...' : 'Share Results'}
            </Button>
          )}
        </div>
      </div>

      {hasCalculated && results.length > 0 && (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            {results.map((result, index) => {
              const isBest = result.roiPercentage === bestROI;
              return (
                <div
                  key={result.tierName}
                  className={`relative bg-white rounded-lg shadow-lg overflow-hidden transition-transform hover:scale-105 ${
                    isBest ? 'ring-4 ring-green-500' : 'border border-gray-200'
                  }`}
                >
                  {isBest && (
                    <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                      BEST ROI
                    </div>
                  )}
                  <div className={`p-6 ${isBest ? 'bg-gradient-to-br from-green-50 to-green-100' : 'bg-gray-50'}`}>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{result.tierName} Tier</h3>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-4xl font-bold text-gray-900">{result.deviceCount}</span>
                      <span className="text-lg text-gray-600">devices</span>
                    </div>
                    <p className="text-sm text-gray-600">@ {formatCurrency(result.annualInvestment / result.deviceCount)}/device/year</p>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">Annual Investment</span>
                        <span className="text-lg font-bold text-gray-900">{formatCurrency(result.annualInvestment)}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: '100%' }} />
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Waste Reduction (25%)</span>
                        <span className="font-semibold text-green-600">{formatCurrency(result.wasteReduction)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Operational Savings</span>
                        <span className="font-semibold text-green-600">{formatCurrency(result.operationalSavings)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-sm font-semibold text-gray-800">Total Return</span>
                        <span className="text-lg font-bold text-green-600">{formatCurrency(result.totalReturn)}</span>
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg ${isBest ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-gray-800">Net Benefit</span>
                        <span className="text-xl font-bold text-green-700">{formatCurrency(result.netBenefit)}</span>
                      </div>
                      <div className="flex items-baseline gap-2 justify-center mt-3">
                        <span className="text-5xl font-bold text-green-700">{result.roiPercentage.toFixed(1)}%</span>
                      </div>
                      <p className="text-center text-xs text-gray-600 mt-1">Return on Investment</p>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">What's Included:</p>
                      {result.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-gray-700">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center py-6">
            <div className="inline-flex items-center gap-2 text-gray-600">
              <Zap className="w-5 h-5 text-yellow-500" />
              <span className="text-lg font-medium">Peace of Mind:</span>
              <span className="text-lg font-bold text-gray-900">Priceless</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ROICalculator;
