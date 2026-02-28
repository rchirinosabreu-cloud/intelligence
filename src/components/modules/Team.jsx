import React, { useState, useEffect } from 'react';
import { Plus, MoreVertical, Edit2, UserX, UserCheck } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { cn } from '../../lib/utils';

export default function Team() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // Modal Form State
  const [name, setName] = useState('');
  const [role, setRole] = useState('Diseñador');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const roles = [
    "Director",
    "Project Manager",
    "Diseñador",
    "Copywriter",
    "Editor de Video",
    "Ejecutivo de Cuentas",
    "Otro"
  ];

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/team?includeInactive=true`);
      if (response.ok) {
        const data = await response.json();
        setTeam(data);
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
      setRole('Diseñador');
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

  const getAvatar = (member) => {
    if (member.avatarUrl) return member.avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random&color=fff&size=128`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 animate-fade-in text-white font-sans">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-light text-white mb-2 tracking-tight">Equipo</h1>
          <p className="text-zinc-400 font-light">Gestiona a los miembros de la agencia y sus roles.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center transition-colors"
        >
          <Plus size={18} className="mr-2" />
          Añadir Miembro
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {team.map((member) => (
            <div
              key={member.id}
              className={cn(
                "bg-zinc-900/50 backdrop-blur-xl border rounded-2xl p-6 relative group transition-all",
                member.isActive ? "border-zinc-800" : "border-red-900/50 opacity-60 grayscale"
              )}
            >
              {/* Dropdown Menu Toggle (Hover Actions for now to keep it simple without full Radix Dropdown) */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                <button
                  onClick={() => handleOpenModal(member)}
                  className="p-1.5 bg-zinc-800 rounded-lg hover:bg-blue-600 transition-colors text-zinc-300 hover:text-white"
                  title="Editar"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleToggleActive(member)}
                  className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white"
                  title={member.isActive ? "Desactivar" : "Reactivar"}
                >
                  {member.isActive ? <UserX size={16} className="text-red-400" /> : <UserCheck size={16} className="text-green-400" />}
                </button>
              </div>

              <div className="flex items-center space-x-4">
                <img
                  src={getAvatar(member)}
                  alt={member.name}
                  className="w-16 h-16 rounded-full border-2 border-zinc-800 object-cover"
                />
                <div>
                  <h3 className="text-lg font-medium text-white">{member.name}</h3>
                  <span className="text-sm px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-full inline-block mt-1">
                    {member.role}
                  </span>
                  {!member.isActive && (
                    <span className="text-xs text-red-400 block mt-2 font-medium uppercase tracking-wider">
                      Inactivo
                    </span>
                  )}
                </div>
              </div>
              {member.email && (
                <div className="mt-4 pt-4 border-t border-zinc-800/50">
                  <p className="text-sm text-zinc-400 truncate">{member.email}</p>
                </div>
              )}
            </div>
          ))}
          {team.length === 0 && (
            <div className="col-span-full text-center py-12 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 border-dashed">
              <p className="text-zinc-500">No hay miembros del equipo registrados.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal - Shadcn Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-light">
              {editingMember ? 'Editar Miembro' : 'Añadir Miembro'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para añadir o editar un miembro del equipo de la agencia.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              >
                {roles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Correo Electrónico (Opcional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">URL de Avatar (Opcional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
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
