'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Sparkles, 
  Layers, 
  GitBranch, 
  BarChart3,
  Brain,
  Palette,
  Move,
  Target,
  CheckCircle,
  AlertTriangle,
  Code,
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';

export default function HowItWorks() {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="min-h-screen bg-drafted-cream">
      {/* Header */}
      <header className="bg-drafted-cream border-b border-drafted-border sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2 text-drafted-gray hover:text-drafted-black transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Analyzer
            </Link>
            <span className="font-display text-lg font-semibold text-drafted-black">
              How It Works
            </span>
            <div className="w-24" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-display font-bold text-drafted-black mb-4">
            Understanding Diversity Analysis
          </h1>
          <p className="text-lg text-drafted-gray max-w-2xl mx-auto">
            Learn how we measure variety and uniqueness in AI-generated floor plans 
            to ensure you're exploring the full design possibility space.
          </p>
        </motion.div>

        {/* Simple Explanation */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card-drafted p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-coral-100 rounded-drafted flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-coral-500" />
              </div>
              <h2 className="text-2xl font-semibold text-drafted-black">The Simple Version</h2>
            </div>

            <div className="space-y-6 text-drafted-gray">
              <p className="text-lg">
                <strong className="text-drafted-black">Imagine you asked 10 architects to design a 3-bedroom house.</strong> 
                {' '}Would you want 10 nearly identical designs, or 10 genuinely different approaches?
              </p>

              <p>
                AI can sometimes get "stuck" generating similar designs. This tool measures 
                <strong className="text-drafted-black"> how different</strong> your generated floor plans actually are from each other.
              </p>

              <div className="grid md:grid-cols-2 gap-6 my-8">
                <div className="p-6 bg-coral-50 rounded-drafted-lg border border-coral-200">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-coral-500" />
                    <span className="font-semibold text-coral-700">Low Diversity (Bad)</span>
                  </div>
                  <p className="text-sm text-coral-700">
                    All plans look similar - same room arrangements, same flow patterns. 
                    The AI isn't exploring creative alternatives.
                  </p>
                </div>

                <div className="p-6 bg-green-50 rounded-drafted-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-700">High Diversity (Good)</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Each plan takes a different approach - varied layouts, room positions, 
                    and circulation patterns. More options to choose from!
                  </p>
                </div>
              </div>

              <p>
                We give you a <strong className="text-drafted-black">diversity score from 0-100%</strong>. 
                Higher means more variety. We also show you a <strong className="text-drafted-black">scatter plot</strong> where 
                each dot is a floor plan - clustered dots mean similar designs, spread out dots mean diverse designs.
              </p>
            </div>
          </motion.div>
        </section>

        {/* What We Measure */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-semibold text-drafted-black mb-6">What We Analyze</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <FeatureCard
                icon={Palette}
                title="Room Distribution"
                description="How rooms are sized and proportioned. Are bedrooms similar sizes, or is there variety?"
              />
              <FeatureCard
                icon={Move}
                title="Circulation Patterns"
                description="How you move through the space. Linear hallways vs. open flow vs. central hubs."
              />
              <FeatureCard
                icon={Layers}
                title="Spatial Relationships"
                description="Which rooms connect to which. Kitchen next to dining? Bedrooms grouped or separated?"
              />
              <FeatureCard
                icon={Target}
                title="Overall Massing"
                description="The shape and footprint. Compact squares, L-shapes, sprawling layouts, or something unique."
              />
            </div>
          </motion.div>
        </section>

        {/* The Scatter Plot */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card-drafted p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-drafted-bg rounded-drafted flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-drafted-gray" />
              </div>
              <h2 className="text-2xl font-semibold text-drafted-black">Reading the Scatter Plot</h2>
            </div>

            <div className="space-y-4 text-drafted-gray">
              <p>
                The scatter plot is a "map" of your designs. Each dot represents one floor plan, 
                positioned based on its features.
              </p>

              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-coral-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="w-2 h-2 bg-coral-500 rounded-full" />
                  </span>
                  <span><strong className="text-drafted-black">Dots close together</strong> = Similar designs</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                  </span>
                  <span><strong className="text-drafted-black">Dots spread apart</strong> = Diverse designs</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <GitBranch className="w-3 h-3 text-blue-500" />
                  </span>
                  <span><strong className="text-drafted-black">Colored groups (clusters)</strong> = Plans that share similar characteristics</span>
                </li>
              </ul>

              <p className="mt-4">
                If all your dots are in one tight cluster, the AI is stuck in one "design mode." 
                If dots are spread across the space, you're getting genuine variety.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Technical Details (Collapsible) */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className="w-full card-drafted p-6 flex items-center justify-between hover:shadow-drafted-hover transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-drafted-bg rounded-drafted flex items-center justify-center">
                  <Code className="w-5 h-5 text-drafted-gray" />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-semibold text-drafted-black">Technical Details</h2>
                  <p className="text-sm text-drafted-gray">For developers and the technically curious</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-drafted-gray transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
            </button>

            {showTechnical && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="card-drafted p-8 mt-4 space-y-6"
              >
                <div>
                  <h3 className="font-semibold text-drafted-black mb-2 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Feature Extraction Pipeline
                  </h3>
                  <p className="text-sm text-drafted-gray mb-3">
                    Each floor plan image goes through multiple extractors:
                  </p>
                  <ul className="text-sm text-drafted-gray space-y-2 ml-6">
                    <li><strong>Color Segmentation:</strong> HSV thresholding to identify rooms by color coding</li>
                    <li><strong>Geometric Analysis:</strong> Room areas, aspect ratios, perimeter complexity</li>
                    <li><strong>Graph Topology:</strong> Room adjacency graph, connectivity metrics</li>
                    <li><strong>Circulation Analysis:</strong> Skeleton extraction, path lengths, junction points</li>
                    <li><strong>CNN Embeddings:</strong> ResNet50 features for overall pattern recognition</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-drafted-black mb-2">Dimensionality Reduction</h3>
                  <p className="text-sm text-drafted-gray">
                    The combined feature vector (~500+ dimensions) is reduced to 2D using UMAP 
                    (Uniform Manifold Approximation and Projection) for visualization. 
                    This preserves local and global structure better than PCA for this use case.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-drafted-black mb-2">Diversity Metrics</h3>
                  <ul className="text-sm text-drafted-gray space-y-2 ml-6">
                    <li><strong>Coverage Score:</strong> Convex hull area in feature space / max possible area</li>
                    <li><strong>Dispersion Score:</strong> Average pairwise distance between plans</li>
                    <li><strong>Cluster Entropy:</strong> Shannon entropy of cluster size distribution (DBSCAN clustering)</li>
                    <li><strong>Graph Diversity:</strong> Variance in topology metrics across plans</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-drafted-black mb-2">Final Score Aggregation</h3>
                  <p className="text-sm text-drafted-gray">
                    Individual metrics are normalized to [0,1] and combined using weighted harmonic mean. 
                    Harmonic mean penalizes low scores in any dimension, encouraging balanced diversity.
                  </p>
                  <pre className="mt-2 p-3 bg-drafted-bg rounded-drafted text-xs overflow-x-auto">
{`score = harmonic_mean([
  coverage * 0.25,
  dispersion * 0.30,
  cluster_entropy * 0.25,
  graph_diversity * 0.20
])`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-semibold text-drafted-black mb-2">Tech Stack</h3>
                  <div className="flex flex-wrap gap-2">
                    {['Python', 'FastAPI', 'NumPy', 'OpenCV', 'scikit-learn', 'PyTorch', 'Next.js', 'D3.js', 'TailwindCSS'].map(tech => (
                      <span key={tech} className="px-2 py-1 bg-drafted-bg rounded text-xs text-drafted-gray">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </section>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <Link href="/" className="btn-drafted-coral inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Try It Now
          </Link>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-drafted-border mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-drafted-light">
            Built for{' '}
            <a 
              href="https://drafted.ai" 
              className="text-coral-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Drafted
            </a>
            {' '}• Ensuring AI-generated designs explore the full possibility space
          </p>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="card-drafted p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 bg-drafted-bg rounded-drafted flex items-center justify-center">
          <Icon className="w-4 h-4 text-drafted-gray" />
        </div>
        <h3 className="font-semibold text-drafted-black">{title}</h3>
      </div>
      <p className="text-sm text-drafted-gray">{description}</p>
    </div>
  );
}

