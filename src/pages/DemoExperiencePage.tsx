import { Activity, AlertTriangle, BarChart3, Camera, CloudRain, Leaf, LogOut, MapPin, TrendingUp, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import ROICalculator from '../components/common/ROICalculator';

const DemoExperiencePage = () => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Alert Banner */}
      <div className="bg-blue-600 text-white px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center justify-center gap-2 flex-1">
            <Zap className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm sm:text-base font-medium text-center">
              Your InVivo Admin has been alerted! In the meantime, enjoy this demo account!
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 rounded-md transition-colors text-sm font-medium flex-shrink-0"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-center mb-4">
            <Leaf className="w-16 h-16" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-center mb-4">
            Welcome to InVivo
          </h1>
          <p className="text-xl text-center text-green-50 max-w-3xl mx-auto">
            Predictive Mold Intelligence for Cannabis Facilities
          </p>
          <p className="text-lg text-center text-green-100 mt-4 max-w-2xl mx-auto">
            Achieve <span className="font-bold">28:1 ROI</span> with AI-powered environmental monitoring and proactive mold prevention
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-12">

        {/* The Problem */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">The Problem</h2>
                  <p className="text-sm text-gray-600">Cannabis facilities face significant mold challenges</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600 mb-2">10-20%</div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Crop Loss to Mold</div>
                  <p className="text-xs text-gray-600">Every growing cycle puts your harvest at risk</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600 mb-2">$281K</div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Annual Loss</div>
                  <p className="text-xs text-gray-600">For a typical 10,000 sq ft facility</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600 mb-2">Reactive</div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Traditional Approach</div>
                  <p className="text-xs text-gray-600">By the time you see mold, it's too late</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* The Solution */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Leaf className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">The InVivo Solution</h2>
                  <p className="text-sm text-gray-600">Proactive intelligence that prevents problems before they start</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                    <Camera className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">IoT Devices + AI Detection</h3>
                    <p className="text-sm text-gray-600">
                      ESP32-CAM devices capture environmental data and images at scheduled intervals.
                      Advanced AI analyzes every image for early signs of mold growth.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                    <Activity className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Real-Time Environmental Monitoring</h3>
                    <p className="text-sm text-gray-600">
                      Track temperature, humidity, and atmospheric pressure 24/7.
                      Detect dangerous conditions before they impact your crop.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-orange-100 rounded-lg flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">MGI Score: Quantified Risk</h3>
                    <p className="text-sm text-gray-600">
                      Mold Growth Index (0.0-1.0) gives you a single number to understand your risk.
                      Track velocity over time to see if conditions are improving or deteriorating.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* The InVivo Loop */}
        <section>
          <Card>
            <CardHeader>
              <h2 className="text-2xl font-bold text-gray-900">The InVivo Loop</h2>
              <p className="text-sm text-gray-600">Continuous protection, automated intervention</p>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="grid md:grid-cols-5 gap-4">
                  {[
                    { icon: Zap, title: 'Devices Wake', desc: 'Scheduled or manual triggers', color: 'blue' },
                    { icon: Camera, title: 'Capture Data', desc: 'Images + environmental readings', color: 'green' },
                    { icon: BarChart3, title: 'AI Analysis', desc: 'MGI scoring and trend detection', color: 'purple' },
                    { icon: AlertTriangle, title: 'Smart Alerts', desc: 'Threshold and velocity warnings', color: 'orange' },
                    { icon: Activity, title: 'Intervention', desc: 'Proactive action before damage', color: 'red' }
                  ].map((step, idx) => (
                    <div key={idx} className="relative">
                      <div className={`p-4 bg-${step.color}-50 border-2 border-${step.color}-200 rounded-lg text-center`}>
                        <div className={`w-12 h-12 mx-auto mb-3 bg-${step.color}-100 rounded-full flex items-center justify-center`}>
                          <step.icon className={`w-6 h-6 text-${step.color}-600`} />
                        </div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">{step.title}</div>
                        <div className="text-xs text-gray-600">{step.desc}</div>
                      </div>
                      {idx < 4 && (
                        <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 translate-x-1/2">
                          <div className="text-2xl text-gray-400">→</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Platform Features */}
        <section>
          <Card>
            <CardHeader>
              <h2 className="text-2xl font-bold text-gray-900">Platform Features</h2>
              <p className="text-sm text-gray-600">Everything you need to monitor and protect your facility</p>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-blue-100 rounded">
                      <Activity className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Command Center</h3>
                      <p className="text-xs text-gray-600">Monitor all sites and devices from a single dashboard</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-red-100 rounded">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Active Alerts</h3>
                      <p className="text-xs text-gray-600">Intelligent threshold and velocity-based notifications</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-green-100 rounded">
                      <MapPin className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Site Maps with Zones</h3>
                      <p className="text-xs text-gray-600">Visual heatmaps showing temperature and MGI by zone</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-purple-100 rounded">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Timeline Playback</h3>
                      <p className="text-xs text-gray-600">Scrub through historical data to understand patterns</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-orange-100 rounded">
                      <TrendingUp className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">MGI Trend Analysis</h3>
                      <p className="text-xs text-gray-600">See if conditions are improving or deteriorating</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-yellow-100 rounded">
                      <CloudRain className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Environmental Context</h3>
                      <p className="text-xs text-gray-600">Correlate internal conditions with external weather</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-pink-100 rounded">
                      <Camera className="w-4 h-4 text-pink-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Image Archive</h3>
                      <p className="text-xs text-gray-600">Complete visual history of every device location</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-gray-200 rounded">
                      <Zap className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Manual Wake Commands</h3>
                      <p className="text-xs text-gray-600">Check specific zones on-demand when needed</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ROI Section */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Calculate Your ROI</h2>
                  <p className="text-sm text-gray-600">See the financial impact for your facility</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ROICalculator />
            </CardContent>
          </Card>
        </section>

        {/* Service Model */}
        <section>
          <Card>
            <CardHeader>
              <h2 className="text-2xl font-bold text-gray-900">AI-Enhanced, Human-Delivered</h2>
              <p className="text-sm text-gray-600">The best of both worlds</p>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700">
                  InVivo isn't just software - it's a complete service. Your dedicated GRMTek administrator
                  monitors your facilities, interprets AI insights, and provides expert guidance when it matters most.
                </p>
                <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                  <p className="text-sm text-blue-900 font-medium mb-1">What this means for you:</p>
                  <ul className="text-xs text-blue-800 space-y-1 ml-4">
                    <li>Expert interpretation of complex environmental data</li>
                    <li>Proactive recommendations based on your specific facility</li>
                    <li>Peace of mind knowing professionals are monitoring 24/7</li>
                    <li>Direct communication channel when issues arise</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Call to Action */}
        <section>
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-8 text-center text-white">
            <h2 className="text-3xl font-bold mb-3">Ready to Get Started?</h2>
            <p className="text-lg text-green-50 mb-2">
              Your administrator will reach out soon to activate your account and get your facility protected.
            </p>
            <p className="text-sm text-green-100 mt-4">
              Questions? Contact your InVivo administrator or reach out to support@grmtek.com
            </p>
          </div>
        </section>

      </div>
    </div>
  );
};

export default DemoExperiencePage;
