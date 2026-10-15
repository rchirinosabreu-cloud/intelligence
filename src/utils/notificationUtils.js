const decodeHtmlEntities = (text) => {
    if (!text) return '';
    return text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
};

export const cleanNotificationPreview = (content = '', maxLength = 90) => {
    const cleaned = decodeHtmlEntities(String(content))
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h1|h2|h3|ul|ol)>/gi, ' ')
        .replace(/<[^>]*>?/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^["']+/, '')
        .replace(/["']+$/, '')
        .trim();

    if (!cleaned) return '';
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength).trim()}...`;
};

const parseQuotedTaskMessage = (message, prefix) => {
    const quotedPattern = new RegExp(`^${prefix} "([^"]+)"(?::\\s*"([\\s\\S]*)"?)?$`);
    const match = message.match(quotedPattern);
    if (!match) return null;

    return {
        title: prefix,
        context: cleanNotificationPreview(match[1], 120),
        body: cleanNotificationPreview(match[2] || '', 120)
    };
};

const parseColonMessage = (message) => {
    const index = message.indexOf(':');
    if (index === -1) return null;

    return {
        title: cleanNotificationPreview(message.slice(0, index), 120),
        context: '',
        body: cleanNotificationPreview(message.slice(index + 1), 120)
    };
};

export const getNotificationDisplayParts = (notification = {}) => {
    const message = String(notification.message || '');
    const type = notification.type || '';

    if (type === 'TEAM_ANNOUNCEMENT') {
        return {
            title: 'Tienes un nuevo anuncio',
            context: '',
            body: cleanNotificationPreview(message, 120)
        };
    }

    if (type === 'ANNOUNCEMENT_GLOBAL') {
        return {
            title: 'Tienes un nuevo anuncio general',
            context: '',
            body: cleanNotificationPreview(message, 120)
        };
    }

    // Semáforo de servicios (5 de octubre de 2026): el título dice si cayó o volvió; el cuerpo, el detalle.
    if (type === 'SERVICE_HEALTH_DOWN') {
        return { title: 'Un servicio está caído', context: '', body: cleanNotificationPreview(message, 160) };
    }
    if (type === 'SERVICE_HEALTH_RECOVERED') {
        return { title: 'Un servicio volvió a funcionar', context: '', body: cleanNotificationPreview(message, 140) };
    }
    // Reporte de incidente del equipo (12 de octubre de 2026): el aviso nombra a quien reportó, nunca el contenido.
    if (type === 'SECURITY_INCIDENT_REPORTED') {
        return { title: 'Reportaron un incidente de seguridad', context: '', body: cleanNotificationPreview(message, 140) };
    }
    // El foco de la semana (10 de octubre de 2026): Bria lo dejó en un chat; el aviso lo abre.
    if (type === 'BRIA_FOCO_SEMANAL') {
        return { title: 'Tu foco de la semana está listo', context: '', body: cleanNotificationPreview(message, 140) };
    }
    // El cierre del día (14 de octubre de 2026): a las 5, Bria lo deja en un chat; el aviso lo abre.
    if (type === 'BRIA_CIERRE_DEL_DIA') {
        return { title: 'Tu cierre del día está listo', context: '', body: cleanNotificationPreview(message, 140) };
    }
    // Pedir un acceso de la bóveda (15 de octubre de 2026): se decide y se lee en el aviso encima de Bria.
    if (type === 'VAULT_ACCESS_REQUESTED') {
        return { title: 'Te piden una contraseña', context: '', body: cleanNotificationPreview(message, 140) };
    }
    if (type === 'VAULT_ACCESS_SHARED') {
        return { title: 'Te compartieron una contraseña', context: '', body: cleanNotificationPreview(message, 140) };
    }
    if (type === 'VAULT_ACCESS_DENIED') {
        return { title: 'Pedido de contraseña denegado', context: '', body: cleanNotificationPreview(message, 140) };
    }

    if (type === 'TASK_COMMENT_REPLY') {
        const parsed = parseQuotedTaskMessage(message, 'Nuevo mensaje en el hilo de la tarea');
        if (parsed) return parsed;
    }

    if (type === 'TASK_MENTION') {
        const parsed = parseQuotedTaskMessage(message, 'Te han mencionado en la tarea');
        if (parsed) return parsed;
    }

    // Colaboradores (5 de octubre de 2026): el título dice qué pasó y el cuerpo, en qué tarea.
    if (type === 'TASK_COLLABORATOR_ADDED') {
        const taskTitle = String(message || '').match(/«([^»]+)»/)?.[1];
        return {
            title: 'Te sumaron como colaborador',
            context: '',
            body: taskTitle ? cleanNotificationPreview(taskTitle, 120) : cleanNotificationPreview(message, 140)
        };
    }

    if (type === 'TASK_ASSIGNED' || type === 'TASK_UPDATED') {
        const parsed = parseColonMessage(message);
        if (parsed) return parsed;
    }

    if (type === 'TASK_RETURNED' || type === 'TASK_CORRECTED' || type === 'TASK_COMPLETED') {
        const parsed = parseColonMessage(message);
        if (parsed) return parsed;
    }

    // Publicación automática en redes (29 de septiembre de 2026): el mensaje ya viene en español.
    if (type === 'SOCIAL_PUBLICATION_PUBLISHED') {
        return { title: 'Pieza publicada en redes', context: '', body: cleanNotificationPreview(message, 140) };
    }
    if (type === 'SOCIAL_PUBLICATION_FAILED') {
        return { title: 'No se pudo publicar una pieza', context: '', body: cleanNotificationPreview(message, 160) };
    }

    return {
        title: cleanNotificationPreview(message, 120),
        context: '',
        body: ''
    };
};
