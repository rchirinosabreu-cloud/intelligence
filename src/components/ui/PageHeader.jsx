import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  breadcrumbs = [],
  children,
  className
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

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Icon className="w-8 h-8" strokeWidth={1.5} />
              </div>
            )}
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
              {title}
            </h1>
          </div>
          {subtitle && (
            <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>

        {/* Controls / Actions */}
        {children && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
