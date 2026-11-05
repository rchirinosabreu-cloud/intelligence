// Solo después de confirmar el PATCH. El tablero conserva sus relaciones normalizadas;
// el recibo de una tarea no tiene la misma forma que la lista completa.
export function applyConfirmedTaskMove(tasks, savedTask) {
    return tasks?.map(task => {
        if (String(task.id) !== String(savedTask.id)) return task;
        const confirmed = {};
        for (const key of ['status', 'sortOrder', 'completedAt', 'startedAt', 'accumulatedWorkMs', 'isReturned']) {
            if (Object.hasOwn(savedTask, key)) confirmed[key] = savedTask[key];
        }
        // El servidor cierra los relojes al pausar, devolver o realizar la tarea.
        if (['PENDIENTE', 'REALIZADA', 'DEVUELTA'].includes(savedTask.status)) confirmed.openSessions = [];
        return { ...task, ...confirmed };
    });
}
