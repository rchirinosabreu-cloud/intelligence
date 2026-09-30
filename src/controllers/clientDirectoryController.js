import prisma from '../lib/prisma.js';
import {
    createDirectoryClient,
    listClientDirectory,
    updateDirectoryClient
} from '../services/clientDirectoryService.js';

// El directorio de clientes de Financiero: la ficha completa de cada cliente, con el
// permiso de Financiero (30 de septiembre de 2026).

const respond = (res, error, fallbackCode, fallbackMessage) => {
    console.error(`[Client directory API] ${fallbackCode}:`, error?.response?.data || error?.message || error);
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
        error: statusCode >= 500 ? fallbackCode : (error?.code || fallbackCode),
        message: statusCode >= 500 ? fallbackMessage : error.message
    });
};

export const listClientDirectoryHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    try {
        return res.json({ clients: await listClientDirectory(prismaClient, { q: req.query?.q }) });
    } catch (error) {
        return respond(res, error, 'CLIENT_DIRECTORY_FAILED', 'No fue posible cargar el directorio de clientes.');
    }
};

export const createDirectoryClientHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    try {
        const client = await createDirectoryClient(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: `Cliente «${client.name}» creado.`, client });
    } catch (error) {
        return respond(res, error, 'CLIENT_CREATE_FAILED', 'No fue posible crear el cliente.');
    }
};

export const updateDirectoryClientHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    try {
        const client = await updateDirectoryClient(prismaClient, req.params.id, req.body || {}, req.user);
        return res.json({ message: 'Ficha del cliente actualizada.', client });
    } catch (error) {
        return respond(res, error, 'CLIENT_UPDATE_FAILED', 'No fue posible guardar la ficha del cliente.');
    }
};
