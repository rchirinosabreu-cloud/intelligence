import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect } from 'react';
import { Plus, MoreVertical, Edit2, UserX, UserCheck, Eye } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { cn } from '../../lib/utils';

export default function Team() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const isAdmin = currentUser.role === 'ADMIN';

  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // Modal Form State
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/team?includeInactive=true`);
      if (response.ok) {
        const data = await response.json();
        setTeam(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error fetching team:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const handleOpenModal = (member = null) => {
    if (member) {
      setEditingMember(member);
      setName(member.name);
      setRole(member.role);
      setEmail(member.email || '');
      setAvatarUrl(member.avatarUrl || '');
    } else {
      setEditingMember(null);
      setName('');
      setRole('');
      setEmail('');
      setAvatarUrl('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || !role) return;

    const payload = { name, role, email, avatarUrl };
    const method = editingMember ? 'PUT' : 'POST';
    const baseUrl = getApiBaseUrl();
    const url = editingMember
      ? `${baseUrl}/api/team/${editingMember.id}`
      : `${baseUrl}/api/team`;

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchTeam();
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error("Error saving team member:", error);
    }
  };

  const handleToggleActive = async (member) => {
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/team/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !member.isActive }),
      });

      if (response.ok) {
        await fetchTeam();
      }
    } catch (error) {
      console.error("Error toggling team member status:", error);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 animate-fade-in font-sans">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white mb-2 font-sans">Equipo</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-light">
            {isAdmin ? "Gestiona a los miembros de la agencia y sus roles." : "Directorio de los miembros de la agencia."}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => handleOpenModal()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm px-4 py-2 rounded-xl flex items-center transition-colors"
          >
            <Plus size={18} className="mr-2" />
            Añadir miembro
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {team.map((member) => (
            <div
              key={member.id}
              className={cn(
                "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-6 relative group transition-all",
                member.isActive ? "" : "border-red-300 dark:border-red-800 opacity-60 grayscale"
              )}
            >
              {/* Dropdown Menu Toggle (Hover Actions for now to keep it simple without full Radix Dropdown) */}
              {isAdmin && (
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                  {member.userId && (
                    <button
                      onClick={() => navigate(`/perfil/${member.userId}`)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-primary dark:hover:bg-primary hover:text-white transition-colors text-slate-500 dark:text-slate-400"
                      title="Ver Perfil y Desempeño"
                    >
                      <Eye size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenModal(member)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-primary dark:hover:bg-primary hover:text-white transition-colors text-slate-500 dark:text-slate-400"
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleToggleActive(member)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                    title={member.isActive ? "Desactivar" : "Reactivar"}
                  >
                    {member.isActive ? <UserX size={16} className="text-red-400 hover:text-red-600 dark:hover:text-red-400" /> : <UserCheck size={16} className="text-green-400 hover:text-green-600 dark:hover:text-green-400" />}
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-4">
                <div
                  className={cn("cursor-pointer transition-transform hover:scale-105", !member.userId && "cursor-default hover:scale-100")}
                  onClick={() => member.userId && navigate(`/perfil/${member.userId}`)}
                >
                  <TeamAvatar member={member} className="w-16 h-16 text-xl" />
                </div>
                <div>
                  <h3
                    className={cn("text-lg font-semibold text-slate-900 dark:text-slate-50", member.userId && "cursor-pointer hover:text-primary transition-colors")}
                    onClick={() => member.userId && navigate(`/perfil/${member.userId}`)}
                  >
                    {member.name}
                  </h3>
                  <span className="text-sm px-2 py-0.5 bg-primary/10 text-primary rounded-full inline-block mt-1">
                    {member.role}
                  </span>
                  {!member.isActive && (
                    <span className="text-xs text-red-500 dark:text-red-400 block mt-2 font-medium uppercase tracking-wider">
                      Inactivo
                    </span>
                  )}
                </div>
              </div>
              {member.email && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                </div>
              )}
            </div>
          ))}
          {team.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed shadow-sm">
              <p className="text-zinc-500 dark:text-slate-400">No hay miembros del equipo registrados.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal - Shadcn Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              {editingMember ? 'Editar miembro' : 'Añadir miembro'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para añadir o editar un miembro del equipo de la agencia.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Nombre completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Rol</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej. Desarrollador, Diseñador, Project Manager"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Correo electrónico (opcional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">URL de avatar (opcional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Guardar
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
