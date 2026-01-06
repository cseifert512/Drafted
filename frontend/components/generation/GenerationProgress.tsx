'use client';

import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';

interface GenerationProgressProps {
  total: number;
  completed: number;
  failed: number;
  isComplete: boolean;
}

export function GenerationProgress({ 
  total, 
  completed, 
  failed, 
  isComplete 
}: GenerationProgressProps) {
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  const successful = completed;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card-drafted p-8 text-center"
    >
      {/* Animated icon */}
      <div className="flex justify-center mb-6">
        {isComplete ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <CheckCircle2 className="w-16 h-16 text-green-500" />
          </motion.div>
        ) : (
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 rounded-full border-4 border-coral-100 border-t-coral-500"
            />
            <Sparkles className="w-6 h-6 text-coral-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
        )}
      </div>

      {/* Status text */}
      <h3 className="text-xl font-serif font-bold text-drafted-black mb-2">
        {isComplete 
          ? 'Generation Complete!' 
          : 'Generating Floor Plans...'}
      </h3>
      
      <p className="text-drafted-gray mb-6">
        {isComplete 
          ? `Successfully generated ${successful} of ${total} plans`
          : `Creating diverse layouts with AI...`}
      </p>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-2 bg-drafted-border rounded-full overflow-hidden mb-3">
          <motion.div
            className="h-full bg-coral-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Counter */}
        <div className="flex justify-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-drafted-gray">{successful} generated</span>
          </div>
          {failed > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-coral-500" />
              <span className="text-drafted-gray">{failed} failed</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress dots */}
      {!isComplete && (
        <div className="flex justify-center gap-1.5 mt-6">
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < completed 
                  ? 'bg-green-500' 
                  : i < completed + failed 
                    ? 'bg-coral-400'
                    : 'bg-drafted-border'
              }`}
              initial={{ scale: 0.5, opacity: 0.5 }}
              animate={{ 
                scale: i === completed + failed ? [1, 1.2, 1] : 1,
                opacity: 1 
              }}
              transition={{ 
                scale: { repeat: i === completed + failed ? Infinity : 0, duration: 0.5 }
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
