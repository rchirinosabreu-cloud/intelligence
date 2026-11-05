// La posición puede anticiparse al guardar; el estado operativo y sus fechas no.
// Retirar esta proyección vuelve a los datos actuales, sin restaurar una copia vieja.
export function projectTaskMove(tasks, move, columnOfTask) {
    if (!move) return tasks;
    const moving = tasks.find(task => String(task.id) === String(move.taskId));
    if (!moving) return tasks;
    const remaining = tasks.filter(task => task !== moving);
    const destination = remaining.filter(task => columnOfTask(task) === move.columnId);
    const before = destination[move.index];
    const insertion = before ? remaining.indexOf(before) : remaining.length;
    return [
        ...remaining.slice(0, insertion),
        { ...moving, pendingColumnId: move.columnId },
        ...remaining.slice(insertion),
    ];
}

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
