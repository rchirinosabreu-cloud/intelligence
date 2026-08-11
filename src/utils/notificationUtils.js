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

    if (type === 'TASK_COMMENT_REPLY') {
        const parsed = parseQuotedTaskMessage(message, 'Nuevo mensaje en el hilo de la tarea');
        if (parsed) return parsed;
    }

    if (type === 'TASK_MENTION') {
        const parsed = parseQuotedTaskMessage(message, 'Te han mencionado en la tarea');
        if (parsed) return parsed;
    }

    if (type === 'TASK_ASSIGNED' || type === 'TASK_UPDATED') {
        const parsed = parseColonMessage(message);
        if (parsed) return parsed;
    }

    if (type === 'TASK_RETURNED' || type === 'TASK_CORRECTED' || type === 'TASK_COMPLETED') {
        const parsed = parseColonMessage(message);
        if (parsed) return parsed;
    }

    return {
        title: cleanNotificationPreview(message, 120),
        context: '',
        body: ''
    };
};
