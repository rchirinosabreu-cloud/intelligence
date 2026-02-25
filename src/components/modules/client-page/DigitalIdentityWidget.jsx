import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Image, Palette, Type, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';

const BrandAssetDropzone = ({ title, icon: Icon, acceptedFiles, onDrop }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFiles
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl transition-all cursor-pointer group h-32",
        isDragActive
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <input {...getInputProps()} />
      <div className={cn(
        "p-2 rounded-full mb-2 transition-colors",
        isDragActive ? "bg-indigo-100 text-indigo-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-300"
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 text-center">
        {title}
      </span>
    </div>
  );
};

const DigitalIdentityWidget = () => {
  const onDropLogos = useCallback(acceptedFiles => console.log('Logos:', acceptedFiles), []);
  const onDropColors = useCallback(acceptedFiles => console.log('Colors:', acceptedFiles), []);
  const onDropTypography = useCallback(acceptedFiles => console.log('Typography:', acceptedFiles), []);
  const onDropManual = useCallback(acceptedFiles => console.log('Manual:', acceptedFiles), []);

  return (
    <Card className="h-full flex flex-col p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-purple-500/10 rounded-lg">
           <Palette className="w-4 h-4 text-purple-500" />
        </div>
        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Identidad Digital</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1">
        <BrandAssetDropzone
          title="Logos"
          icon={Image}
          acceptedFiles={{ 'image/*': ['.png', '.jpg', '.svg', '.ai', '.eps'] }}
          onDrop={onDropLogos}
        />
        <BrandAssetDropzone
          title="Colores"
          icon={Palette}
          acceptedFiles={{ 'image/*': [], '.ase': [] }}
          onDrop={onDropColors}
        />
        <BrandAssetDropzone
          title="Tipografías"
          icon={Type}
          acceptedFiles={{ '.ttf': [], '.otf': [], '.woff': [], '.woff2': [] }}
          onDrop={onDropTypography}
        />
        <BrandAssetDropzone
          title="Manual"
          icon={BookOpen}
          acceptedFiles={{ 'application/pdf': ['.pdf'] }}
          onDrop={onDropManual}
        />
      </div>
    </Card>
  );
};

export default DigitalIdentityWidget;
