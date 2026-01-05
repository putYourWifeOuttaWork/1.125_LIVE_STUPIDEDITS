import { useState } from 'react';
import { ArrowRight, CheckCircle, TrendingUp, AlertTriangle, Cpu, Activity, BarChart3 } from 'lucide-react';

export default function LanderPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <PlatformSection />
      <AISection />
      <MethodologySection />
      <ROICalculatorSection />
      <CTASection />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent"></div>

      <div className="max-w-7xl mx-auto relative">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center">
            <span className="text-3xl font-bold text-white">IV</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white">InVivo</h1>
            <p className="text-emerald-400 text-sm">BY GASX</p>
          </div>
        </div>

        <h2 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Predictive Mold<br />
          Intelligence
        </h2>

        <p className="text-2xl md:text-3xl text-slate-300 mb-8">
          for Cannabis Facilities
        </p>

        <div className="inline-block px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl border-2 border-emerald-400 mb-8">
          <p className="text-xl text-white font-semibold">
            28:1 ROI — Transforming Unavoidable Loss Into New Life For Cannabis Production
          </p>
        </div>

        <p className="text-lg text-slate-400 mb-12">
          IoT-Powered Monitoring • AI Detection • Proactive Intervention
        </p>

        <div className="flex flex-wrap gap-4">
          <a href="#roi-calculator" className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition flex items-center gap-2">
            Calculate Your ROI <ArrowRight className="w-5 h-5" />
          </a>
          <a href="#platform" className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition">
            See Platform
          </a>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="py-20 px-4 bg-slate-800/50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          The Problem: A Silent Profit Killer
        </h2>
        <p className="text-xl text-slate-300 mb-12">
          Cannabis facilities face an invisible enemy that destroys margins
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-8 border border-slate-600">
            <p className="text-sm text-slate-400 mb-2">EST. ANNUAL LOSS PER 10,000 SQ FT FACILITY</p>
            <div className="text-6xl font-bold text-red-400 mb-4">$281,250</div>
            <p className="text-slate-300">Based on $225/sq ft revenue × 12.5% mold loss rate</p>

            <div className="mt-8 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">Crop Waste (10-20%)</span>
                  <span className="text-red-400 font-semibold">Primary</span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-red-500"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">Product Recalls</span>
                  <span className="text-orange-400 font-semibold">Catastrophic</span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-orange-500"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">Reputation Damage</span>
                  <span className="text-yellow-400 font-semibold">Long-term</span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full w-1/2 bg-yellow-500"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-xl font-semibold text-white mb-2">Reactive Oxygen Species (ROS)</h3>
              <p className="text-slate-300">High cost, continuous operation required, minimal impact on embedded spores</p>
            </div>

            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-xl font-semibold text-white mb-2">UV-C & HEPA Systems</h3>
              <p className="text-slate-300">Only treats airborne spores, misses surface contamination where mold grows</p>
            </div>

            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-xl font-semibold text-white mb-2">Climate Control & Bio-Security</h3>
              <p className="text-slate-300">Preventative only—no detection, no targeted intervention, no analytics</p>
            </div>

            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-xl font-semibold text-white mb-2">Manual Inspections</h3>
              <p className="text-slate-300">Humans notice mold too late—after contamination is visible and widespread</p>
            </div>
          </div>
        </div>

        <div className="bg-red-500/10 border-2 border-red-500 rounded-xl p-6">
          <p className="text-lg text-red-300">
            <strong>The gap:</strong> No solution provides early detection + precise locations + actionable intelligence + specific interventions
          </p>
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
            <span className="text-2xl font-bold text-white">IV</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white">The InVivo Solution</h2>
        </div>

        <p className="text-xl text-slate-300 mb-12">
          Comprehensive mold intelligence: Detect early. Locate precisely. Intervene proactively.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-xl p-8 border border-blue-700">
            <Cpu className="w-12 h-12 text-blue-400 mb-4" />
            <h3 className="text-2xl font-bold text-white mb-4">Monitor</h3>
            <p className="text-slate-300">
              IoT devices with petri-dish cameras capture mold growth images + environmental data across all facility zones.
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-xl p-8 border border-purple-700">
            <Activity className="w-12 h-12 text-purple-400 mb-4" />
            <h3 className="text-2xl font-bold text-white mb-4">Detect</h3>
            <p className="text-slate-300">
              Custom AI model analyzes images to determine MGI scores and detect growth before it's visible to humans.
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 rounded-xl p-8 border border-emerald-700">
            <AlertTriangle className="w-12 h-12 text-emerald-400 mb-4" />
            <h3 className="text-2xl font-bold text-white mb-4">Intervene</h3>
            <p className="text-slate-300">
              Instant alerts trigger targeted gasification—just enough to stop mold, not enough to halt operations.
            </p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
          <h3 className="text-xl text-slate-400 mb-8">THE INVIVO LOOP</h3>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <LoopStep number="1" label="Devices Wake" color="emerald" />
            <ArrowRight className="w-6 h-6 text-slate-600 hidden md:block" />
            <LoopStep number="2" label="Capture Data" color="emerald" />
            <ArrowRight className="w-6 h-6 text-slate-600 hidden md:block" />
            <LoopStep number="3" label="AI Analysis" color="emerald" />
            <ArrowRight className="w-6 h-6 text-slate-600 hidden md:block" />
            <LoopStep number="4" label="Smart Alerts" color="emerald" />
            <ArrowRight className="w-6 h-6 text-slate-600 hidden md:block" />
            <LoopStep number="5" label="Intervention" color="orange" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard value="25%+" label="Waste Reduction" />
            <StatCard value="5:1" label="ROI Per Device" />
            <StatCard value="28:1" label="ROI (3 Devices)" />
            <StatCard value="$2,999" label="Per Year/Device" />
          </div>
        </div>
      </div>
    </section>
  );
}

function LoopStep({ number, label, color }: { number: string; label: string; color: string }) {
  const colorClass = color === 'emerald' ? 'border-emerald-500 text-emerald-400' : 'border-orange-500 text-orange-400';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`w-16 h-16 rounded-full border-2 ${colorClass} flex items-center justify-center`}>
        <span className="text-2xl font-bold">{number}</span>
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-slate-900/50 rounded-xl p-6 border border-emerald-700">
      <div className="text-3xl font-bold text-emerald-400 mb-2">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}

function PlatformSection() {
  return (
    <section id="platform" className="py-20 px-4 bg-slate-800/50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <span className="text-emerald-400 text-sm font-semibold">PLATFORM OVERVIEW</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          Command Center: Real-Time Operations
        </h2>

        <p className="text-xl text-slate-300 mb-12">
          The Command Center provides GasX administrators and facility managers a single view for monitoring all customer sites in real-time.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <FeatureCard
              title="Active Alerts Panel"
              description="Critical and warning alerts with fully configurable thresholds for temperature, humidity, and MGI velocity."
            />

            <FeatureCard
              title="Session Progress Tracking"
              description="Track device wake cycles and data collection progress across all active sessions."
            />

            <FeatureCard
              title="Live Site Map"
              description="2D facility maps with color-coded temperature zones and real-time device positions."
            />

            <FeatureCard
              title="Timeline Playback"
              description="Scrub through real-time snapshots. Watch environmental conditions evolve over time."
            />

            <FeatureCard
              title="Temperature Zone Analytics"
              description="Color-coded heat maps reveal hot/cold zones. Identify HVAC issues instantly."
            />
          </div>

          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700">
            <div className="flex gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            </div>

            <div className="text-xs text-slate-500 mb-6">app.invivo.gasx.com/command-center</div>

            <div className="bg-emerald-500 text-white font-bold text-2xl p-4 rounded-lg mb-8">
              GasX InVivo
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-semibold mb-4">Active Alerts</h4>
                <div className="space-y-3">
                  <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                    <div className="text-red-400 text-xs font-bold mb-1">CRITICAL</div>
                    <div className="text-white text-sm">Temp low: 22.9°F</div>
                  </div>
                  <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-3">
                    <div className="text-yellow-400 text-xs font-bold mb-1">WARNING</div>
                    <div className="text-white text-sm">Humidity: 83%</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-4">Site Map</h4>
                <div className="bg-gradient-to-br from-red-300 via-yellow-200 to-emerald-300 rounded-lg h-48 relative">
                  <div className="absolute top-8 left-8 w-8 h-8 rounded-full bg-emerald-500 border-4 border-white"></div>
                  <div className="absolute top-16 right-12 w-8 h-8 rounded-full bg-orange-500 border-4 border-white"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-emerald-900/20 border-2 border-emerald-500 rounded-xl p-6">
          <h3 className="text-emerald-400 font-semibold mb-2">KEY CAPABILITY</h3>
          <p className="text-lg text-white">
            Replay any time or day to understand exactly what happened, where, and when mold conditions emerged, in any facility!
          </p>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-600">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-300">{description}</p>
    </div>
  );
}

function AISection() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <span className="text-purple-400 text-sm font-semibold">AI INTELLIGENCE</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
          The MGI Score: Quantifying Mold Risk
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 mb-6">
              <h3 className="text-purple-400 text-xl font-semibold mb-4">Custom InVivo Vision AI</h3>
              <p className="text-slate-300 mb-6">
                Our custom AI model analyzes petri-dish images to produce an MGI score from 0.0 to 1.0, quantifying mold presence and growth rate.
              </p>

              <div className="relative h-12 rounded-full overflow-hidden mb-2">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500"></div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-emerald-400">0.0 Clean</span>
                <span className="text-yellow-400">0.5 Moderate</span>
                <span className="text-red-400">1.0 Critical</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
                <div className="text-4xl font-bold text-purple-400 mb-2">0.5</div>
                <div className="text-sm text-slate-400">Avg MGI</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
                <div className="text-4xl font-bold text-emerald-400 mb-2">0.1</div>
                <div className="text-sm text-slate-400">Min</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
                <div className="text-4xl font-bold text-orange-400 mb-2">0.7</div>
                <div className="text-sm text-slate-400">Max</div>
              </div>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-700 rounded-xl p-6">
              <p className="text-slate-300 mb-2">
                <strong className="text-white">Gap Covered?</strong> No human can see mold as it begins, not even the most expert facility managers!
              </p>
              <p className="text-emerald-400 font-semibold">
                InVivo enables your team to proactively stop mold in its tracks!
              </p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
            <div className="text-sm text-slate-400 mb-6">Device 98A316F82928 - Image 6 of 20</div>

            <div className="bg-slate-900 rounded-xl p-8 mb-6 flex items-center justify-center">
              <div className="w-48 h-48 bg-amber-50 rounded-full flex items-center justify-center">
                <div className="space-y-2">
                  <div className="w-8 h-8 bg-emerald-600 rounded-sm mx-auto"></div>
                  <div className="w-8 h-8 bg-emerald-600 rounded-sm ml-4"></div>
                </div>
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="text-5xl font-bold text-purple-400 mb-2">26.0%</div>
              <div className="text-slate-400">MGI Score</div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <div className="text-sm text-slate-400">Temp</div>
                <div className="text-xl font-semibold text-blue-400">46°F</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Humidity</div>
                <div className="text-xl font-semibold text-cyan-400">49% RH</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Velocity</div>
                <div className="text-xl font-semibold text-emerald-400">+20/hr</div>
              </div>
            </div>

            <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4">
              <div className="text-purple-400 font-semibold mb-1">AI Insight:</div>
              <div className="text-slate-300">Early-stage growth detected. Conditions within range. Continue monitoring.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MethodologySection() {
  return (
    <section className="py-20 px-4 bg-slate-800/50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <span className="text-emerald-400 text-sm font-semibold">METHODOLOGY</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          Science First: InVivo Treats Facilities Like A Lab
        </h2>

        <div className="bg-emerald-900/20 border-2 border-emerald-500 rounded-xl p-6 mb-12">
          <p className="text-2xl text-emerald-400 italic">
            "First monitor, build a baseline, and then intervene proactively, dynamically..."
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-slate-700 rounded-xl p-8 border border-slate-600">
            <h3 className="text-2xl font-bold text-white mb-4">Phase 1: Control</h3>
            <p className="text-slate-300">
              Deploy devices and establish baseline measurements. Understand natural mold growth patterns without intervention.
            </p>
          </div>

          <div className="bg-slate-700 rounded-xl p-8 border border-slate-600">
            <h3 className="text-2xl font-bold text-white mb-4">Phase 2: Experimental</h3>
            <p className="text-slate-300">
              Introduce targeted interventions based on data. Measure impact. Optimize gasification levels.
            </p>
          </div>

          <div className="bg-slate-700 rounded-xl p-8 border border-slate-600">
            <h3 className="text-2xl font-bold text-white mb-4">Phase 3: Optimization</h3>
            <p className="text-slate-300">
              Continuous improvement. Refine thresholds, expand coverage, maximize ROI with data-driven decisions.
            </p>
          </div>
        </div>

        <div className="bg-emerald-900/20 border border-emerald-700 rounded-xl p-6">
          <h3 className="text-emerald-400 font-semibold mb-2">Result:</h3>
          <p className="text-lg text-white">
            Each customer gets a customized, scientific approach ensuring measurable ROI. Since each facility is different, InVivo recommends specific chemical and custom approaches to intervention, so facilities stop growth early.
          </p>
        </div>
      </div>
    </section>
  );
}

function ROICalculatorSection() {
  const [facilitySize, setFacilitySize] = useState('10000');
  const [annualRevenue, setAnnualRevenue] = useState('2250000');
  const [wastePercent, setWastePercent] = useState('12.5');
  const [downtimeDays, setDowntimeDays] = useState('7');

  const sqft = parseFloat(facilitySize) || 0;
  const revenue = parseFloat(annualRevenue) || 0;
  const waste = parseFloat(wastePercent) || 0;
  const downtime = parseFloat(downtimeDays) || 0;

  const devicesBasic = Math.max(1, Math.ceil(sqft / 2000));
  const theoreticalMin = Math.ceil((sqft * 1.209) / 2000);
  const theoreticalMax = Math.ceil((sqft / 10000) * 9);
  const devicesPro = Math.round((theoreticalMin + theoreticalMax) / 2);
  const devicesMax = theoreticalMax;

  const priceBasic = 2999;
  const pricePro = 2750;
  const priceMax = 2399;

  const costBasic = devicesBasic * priceBasic;
  const costPro = devicesPro * pricePro;
  const costMax = devicesMax * priceMax;

  const currentWasteLoss = revenue * (waste / 100);
  const wasteReduction = currentWasteLoss * 0.25;

  const dailyRevenue = revenue / 365;
  const remediationCost = dailyRevenue * downtime;
  const opsReduction = remediationCost * 0.5;

  const totalReturn = wasteReduction + opsReduction;

  const roiBasic = costBasic > 0 ? (totalReturn / costBasic).toFixed(1) : '0';
  const roiPro = costPro > 0 ? (totalReturn / costPro).toFixed(1) : '0';
  const roiMax = costMax > 0 ? (totalReturn / costMax).toFixed(1) : '0';

  return (
    <section id="roi-calculator" className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <span className="text-emerald-400 text-sm font-semibold">ECONOMICS</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          ROI Calculator: See Your Savings
        </h2>

        <p className="text-xl text-slate-300 mb-12">
          Calculate your facility's potential return on investment
        </p>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <h3 className="text-2xl font-bold text-white mb-6">Your Facility Details</h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Average Size of Facility (Sqft)
                </label>
                <input
                  type="number"
                  value={facilitySize}
                  onChange={(e) => setFacilitySize(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Average Yearly Production in Sales Value ($)
                </label>
                <input
                  type="number"
                  value={annualRevenue}
                  onChange={(e) => setAnnualRevenue(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Est. Annual Production Waste (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={wastePercent}
                  onChange={(e) => setWastePercent(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Days of downtime per year due to remediation efforts
                </label>
                <input
                  type="number"
                  value={downtimeDays}
                  onChange={(e) => setDowntimeDays(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 rounded-2xl p-8 border-2 border-red-500">
              <h3 className="text-lg text-red-300 mb-2">Current Annual Losses</h3>
              <div className="text-5xl font-bold text-red-400 mb-4">
                ${currentWasteLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="space-y-2 text-sm text-slate-300">
                <div>• Waste Loss: ${currentWasteLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div>• Remediation Cost: ${remediationCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 rounded-2xl p-8 border-2 border-emerald-500">
              <h3 className="text-lg text-emerald-300 mb-2">Potential Annual Savings with InVivo</h3>
              <div className="text-5xl font-bold text-emerald-400 mb-4">
                ${totalReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="space-y-2 text-sm text-slate-300">
                <div>• 25% Waste Reduction: ${wasteReduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div>• 50% Ops Cost Reduction: ${opsReduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
          <h3 className="text-2xl font-bold text-white mb-8">Your InVivo Deployment Options</h3>

          <div className="grid md:grid-cols-3 gap-6">
            <DeploymentTier
              name="Basic Coverage"
              devices={devicesBasic}
              pricePerDevice={priceBasic}
              totalCost={costBasic}
              roi={roiBasic}
              benefits={[
                'Software licensing',
                'Alerts & monitoring',
                'Administrator support',
                'Automated analytics',
                '1-year sensor dishes'
              ]}
              description="Minimum recommended devices based on sq ft coverage"
            />

            <DeploymentTier
              name="Pro Coverage"
              devices={devicesPro}
              pricePerDevice={pricePro}
              totalCost={costPro}
              roi={roiPro}
              benefits={[
                'All Basic features',
                'Discounted chemicals',
                'Partner network access',
                'Priority support'
              ]}
              description="Optimal balance of coverage and cost"
              recommended
            />

            <DeploymentTier
              name="Max Coverage"
              devices={devicesMax}
              pricePerDevice={priceMax}
              totalCost={costMax}
              roi={roiMax}
              benefits={[
                'All Pro features',
                '50% GasX gasifier discount',
                'Real-time intervention',
                'Zero downtime prevention'
              ]}
              description="Complete coverage with no gaps"
            />
          </div>
        </div>

        <div className="mt-12 text-center">
          <div className="inline-block bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-2 border-purple-500 rounded-2xl px-12 py-8">
            <div className="text-3xl font-bold text-white mb-2">Peace of Mind?</div>
            <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-purple-400">
              PRICELESS
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface DeploymentTierProps {
  name: string;
  devices: number;
  pricePerDevice: number;
  totalCost: number;
  roi: string;
  benefits: string[];
  description: string;
  recommended?: boolean;
}

function DeploymentTier({ name, devices, pricePerDevice, totalCost, roi, benefits, description, recommended }: DeploymentTierProps) {
  return (
    <div className={`relative bg-slate-700 rounded-xl p-6 border-2 ${recommended ? 'border-emerald-500' : 'border-slate-600'}`}>
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full">
          RECOMMENDED
        </div>
      )}

      <h4 className="text-xl font-bold text-white mb-2">{name}</h4>
      <p className="text-sm text-slate-400 mb-6">{description}</p>

      <div className="mb-6">
        <div className="text-4xl font-bold text-emerald-400 mb-1">{devices}</div>
        <div className="text-sm text-slate-400">Devices Required</div>
      </div>

      <div className="mb-6">
        <div className="text-2xl font-bold text-white mb-1">
          ${pricePerDevice.toLocaleString()}/year
        </div>
        <div className="text-sm text-slate-400">Per Device</div>
      </div>

      <div className="mb-6 pb-6 border-b border-slate-600">
        <div className="text-3xl font-bold text-white mb-1">
          ${totalCost.toLocaleString()}
        </div>
        <div className="text-sm text-slate-400">Total Annual Investment</div>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-5xl font-bold text-emerald-400">{roi}</span>
          <span className="text-2xl text-slate-400">:1</span>
        </div>
        <div className="text-sm text-slate-400">Return on Investment</div>
      </div>

      <div className="space-y-2">
        {benefits.map((benefit, index) => (
          <div key={index} className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-slate-300">{benefit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CTASection() {
  return (
    <section className="py-20 px-4 bg-gradient-to-br from-slate-900 via-emerald-900/20 to-slate-900">
      <div className="max-w-5xl mx-auto text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center">
            <span className="text-4xl font-bold text-white">IV</span>
          </div>
          <div className="text-left">
            <div className="text-3xl font-bold text-white">InVivo by GasX</div>
            <div className="text-emerald-400">Predictive Mold Intelligence</div>
          </div>
        </div>

        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
          That Pays for Itself
        </h2>

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <div className="text-sm text-slate-400 mb-2">In The Dirt Monitoring</div>
            <p className="text-xs text-slate-500">Cameras + sensors across zones</p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <Activity className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <div className="text-sm text-slate-400 mb-2">Early Detection Intelligence</div>
            <p className="text-xs text-slate-500">MGI model detects early growth</p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <Cpu className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <div className="text-sm text-slate-400 mb-2">Expert Service</div>
            <p className="text-xs text-slate-500">GasX admins as remote experts</p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <BarChart3 className="w-8 h-8 text-orange-400 mx-auto mb-3" />
            <div className="text-sm text-slate-400 mb-2">Proactive Intervention</div>
            <p className="text-xs text-slate-500">Targeted gasification stops mold</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-12 border-2 border-emerald-500 mb-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="text-5xl font-bold text-emerald-400 mb-2">28:1</div>
              <div className="text-sm text-slate-400">ROI (3 devices)</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-emerald-400 mb-2">$2,999</div>
              <div className="text-sm text-slate-400">Per device/year</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-emerald-400 mb-2">25%+</div>
              <div className="text-sm text-slate-400">Waste reduction</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-red-400 mb-2">$281K</div>
              <div className="text-sm text-slate-400">At Stake For The Avg. Facility</div>
            </div>
          </div>
        </div>

        <div className="text-2xl text-slate-300 mb-8">
          Stop mold before it costs you. InVivo turns invisible threats into visible savings.
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <a href="#roi-calculator" className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition flex items-center gap-2 text-lg">
            Calculate Your ROI <ArrowRight className="w-5 h-5" />
          </a>
          <a href="/" className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition text-lg">
            Access Platform
          </a>
        </div>

        <div className="mt-12 text-sm text-slate-500">
          Confidential — January 2026
        </div>
      </div>
    </section>
  );
}
