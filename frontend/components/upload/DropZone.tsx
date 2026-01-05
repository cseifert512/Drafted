'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, Image, FileImage } from 'lucide-react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  maxFiles?: number;
}

export function DropZone({ 
  onFilesSelected, 
  isUploading = false,
  maxFiles = 30 
}: DropZoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesSelected(acceptedFiles);
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxFiles,
    disabled: isUploading,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div
        {...getRootProps()}
        className={`
          dropzone
          ${isDragActive ? 'active' : ''}
          ${isDragReject ? 'border-red-400 bg-red-50' : ''}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-4">
          <div className={`
            w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
            ${isDragActive ? 'bg-primary-100' : 'bg-neutral-100'}
          `}>
            {isDragActive ? (
              <FileImage className="w-8 h-8 text-primary-500" />
            ) : (
              <Upload className="w-8 h-8 text-neutral-400" />
            )}
          </div>
          
          <div>
            <p className="text-lg font-semibold text-neutral-900">
              {isDragActive 
                ? 'Drop your floor plans here' 
                : 'Drag & drop floor plans'}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              or click to browse • PNG, JPG up to {maxFiles} files
            </p>
          </div>

          {!isDragActive && (
            <button 
              type="button" 
              className="btn-secondary mt-2"
              disabled={isUploading}
            >
              <Image className="w-4 h-4 mr-2" />
              Select Images
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

