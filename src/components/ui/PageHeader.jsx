import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from '@/components/ui/icons';
import { Link } from 'react-router-dom';

const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  breadcrumbs = [],
  children,
  className,
  layout = 'responsive'
}) => {
  return (
    <header className={cn("pt-8 pb-6 space-y-4", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="hover:text-indigo-600 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
              {index < breadcrumbs.length - 1 && (
                <ChevronRight className="w-3 h-3" />
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className={cn(
        "flex flex-col justify-between gap-6",
        layout === 'stacked' ? "items-stretch" : "2xl:flex-row 2xl:items-end"
      )}>
        <div className="flex-1 min-w-0">
          <h1 className="break-words text-2xl font-bold leading-tight text-slate-900 dark:text-white sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>

        {/* Controls / Actions */}
        {children && (
          <div className={cn(
            "min-w-0",
            layout === 'stacked'
              ? "w-full"
              : "flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          )}>
            {children}
          </div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
