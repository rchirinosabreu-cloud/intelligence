import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Clock, User, Briefcase } from 'lucide-react';

const MissionControlDrawer = ({ isOpen, onClose, member, projects = [] }) => {
  if (!member) return null;

  const memberProjects = projects.filter(p => p.assigneeId === member.id);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[70]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-[80] overflow-hidden border-l border-slate-200 dark:border-zinc-800"
          >
            {/* Pixel Header */}
            <div className="p-6 bg-[#fdf2f8] dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 flex items-center justify-center p-2 shadow-sm">
                   {/* We could use PixelAvatar here too */}
                   <User className="w-8 h-8 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100 uppercase tracking-tight">{member.name}</h2>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{member.role}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-8 overflow-y-auto h-[calc(100%-120px)] custom-scrollbar">

              {/* Proyectos Importantes Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Target className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">Proyectos Importantes</h3>
                </div>

                <div className="space-y-3">
                  {memberProjects.length === 0 ? (
                    <div className="p-4 rounded-2xl border-2 border-dashed border-slate-100 dark:border-zinc-800 text-center">
                      <p className="text-xs text-slate-400 font-medium italic">No hay proyectos críticos asignados hoy.</p>
                    </div>
                  ) : (
                    memberProjects.map((project) => (
                      <div key={project.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{project.client?.name || 'Cliente'}</span>
                          {project.dueDate && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Clock className="w-3 h-3" />
                              {new Date(project.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {project.title}
                        </h4>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* General Activity */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Briefcase className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">Estado de Tráfico</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                      <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{member.currentTasks?.length || 0}</div>
                      <div className="text-[10px] font-bold text-emerald-700/60 dark:text-emerald-500/60 uppercase">Pendientes</div>
                   </div>
                   <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
                      <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">100%</div>
                      <div className="text-[10px] font-bold text-indigo-700/60 dark:text-indigo-500/60 uppercase">Enfoque</div>
                   </div>
                </div>
              </section>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MissionControlDrawer;
